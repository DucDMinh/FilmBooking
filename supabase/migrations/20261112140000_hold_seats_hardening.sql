-- ============================================================================
-- 20261112140000_hold_seats_hardening.sql
-- bug-layer34-review phase-2 task-04 (M4 phần hold, M6; CR remove-pos: chỉ kênh WEB).
-- Chỉ CREATE OR REPLACE public.hold_seats; giữ NGUYÊN chữ ký, SECURITY DEFINER, search_path, ACL và mọi invariant của
-- 20261112130000 (§3.0 chỉ WEB, §3.9 seats FOR UPDATE, unique_violation -> SEAT_TAKEN, huỷ/expire đơn pending_payment cũ).
-- Diff so với 20261112130000 gồm 2 chỗ trong §3.5:
--   (1) đọc suất kèm khoá `showtimes FOR SHARE` (của bảng showtimes, không khoá cinemas/movies) NGAY ở bước đầu truy cập dữ liệu,
--       TRƯỚC khoá orders (§3.8b): thứ tự toàn cục showtimes FOR SHARE -> orders -> payments -> seats -> seat_states, khớp
--       confirm_paid / confirm_zero_amount. Loại trừ cancel_showtimes (FOR UPDATE showtimes): không còn đơn/hold sống trên suất CANCELLED.
--       FOR SHARE không chặn nhau nên các hold đồng thời trên cùng suất vẫn chạy song song, phân xử ở khoá seats (§3.9).
--   (2) kiểm rạp `cinemas.status = 'OPEN'` (CINEMA_NOT_OPEN) và phim `movies.status = 'PUBLISHED'` (MOVIE_NOT_PUBLISHED) (R-33);
--       cùng errcode 23514 như các kiểm tra trạng thái suất.
-- HIGH_RISK_MIGRATION: không (không DDL bảng/dữ liệu). Mức khoá: CREATE OR REPLACE chỉ khoá dòng catalog.
-- ROLLBACK: CREATE OR REPLACE lại hold_seats từ 20261112130000. Verify: pnpm db:test (056).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hold_seats(p_showtime_id uuid, p_seat_ids uuid[], p_channel text DEFAULT 'WEB'::text, p_user_id uuid DEFAULT auth.uid(), p_request_id text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, booking_code text, hold_expires_at timestamp with time zone, subtotal_amount integer, discount_amount integer, total_amount integer, seat_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_channel             public.order_channel;
  v_user_id             uuid;
  v_st                  record;
  v_confirmed           timestamptz;
  v_dob                 date;
  v_age                 integer;
  v_min_age             integer;
  v_cutoff              integer;
  v_total_capacity      integer := 0;
  v_locked_labels       text[];
  v_old_order_ids       uuid[];
  v_expired_order_ids   uuid[];
  v_taken_labels        text[];
  v_row                 text;
  v_orphan_seat_label   text;
  v_subtotal            integer := 0;
  v_web_hold_mins       integer := 10;
  v_expires_at          timestamptz;
  v_booking_code        text;
  v_order_id            uuid;
begin
  -- 3.0 CR remove-pos: chỉ còn kênh WEB; kênh POS (và mọi kênh khác) bị từ chối ngay đầu hàm, trước mọi khoá / truy cập dữ liệu
  if p_channel is distinct from 'WEB' then
    raise exception 'INVALID_CHANNEL: Kênh đặt vé không hợp lệ (chỉ hỗ trợ WEB)' using errcode = '22023';
  end if;

  -- 3.1 Input validation cơ bản
  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'SEAT_REQUIRED: Chưa chọn ghế' using errcode = '22023';
  end if;
  if cardinality(p_seat_ids) <> (select count(distinct x) from unnest(p_seat_ids) x) then
    raise exception 'DUPLICATE_SEATS: Danh sách ghế bị trùng' using errcode = '22023';
  end if;
  v_channel := p_channel::public.order_channel;

  -- 3.2 Kiểm tra định danh & chống mạo danh p_user_id (Defect 2)
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is not null and p_user_id is not null and p_user_id <> auth.uid() then
      raise exception 'PERMISSION_DENIED: Không được giữ ghế mạo danh người dùng khác' using errcode = '42501';
    end if;
    if auth.uid() is not null then
      v_user_id := auth.uid();
    else
      v_user_id := p_user_id;
    end if;
  else
    v_user_id := coalesce(p_user_id, auth.uid());
  end if;

  -- 3.3 Khách đặt vé Web bắt buộc đăng nhập và xác nhận email (R-05, AC-01)
  if v_channel = 'WEB' then
    if v_user_id is null then
      raise exception 'AUTH_REQUIRED: Bắt buộc đăng nhập để đặt vé trên web' using errcode = '42501';
    end if;
    select u.email_confirmed_at into v_confirmed from auth.users u where u.id = v_user_id;
    if v_confirmed is null then
      raise exception 'EMAIL_NOT_CONFIRMED: Tài khoản chưa xác nhận email, không thể đặt vé' using errcode = '42501';
    end if;
  end if;

  -- 3.5 Kiểm tra suất chiếu tồn tại và trạng thái
  select
    st.id,
    st.cinema_id,
    st.room_id,
    st.movie_id,
    st.starts_at,
    st.ends_at,
    st.status,
    c.status as cinema_status,
    m.status as movie_status,
    c.code as cinema_code,
    c.online_cutoff_minutes,
    m.duration_minutes,
    m.age_rating
  into v_st
  from public.showtimes st
  join public.cinemas c on c.id = st.cinema_id
  join public.movies m on m.id = st.movie_id
  where st.id = p_showtime_id
    for share of st;

  if v_st.id is null then
    raise exception 'SHOWTIME_NOT_FOUND: Suất chiếu không tồn tại' using errcode = '23503';
  end if;

  if v_st.status = 'CANCELLED' then
    raise exception 'SHOWTIME_CANCELLED: Suất chiếu đã bị huỷ' using errcode = '23514';
  elsif v_st.status = 'CLOSED' then
    raise exception 'SALES_CLOSED: Suất chiếu đã đóng bán' using errcode = '23514';
  elsif v_st.status <> 'ON_SALE' then
    raise exception 'SALES_CLOSED: Suất chiếu không mở bán' using errcode = '23514';
  end if;

  -- 3.5b Rạp phải OPEN và phim phải PUBLISHED (R-33); suất đã được khoá FOR SHARE nên trạng thái suất không đổi giữa chừng
  if v_st.cinema_status is distinct from 'OPEN' then
    raise exception 'CINEMA_NOT_OPEN: Rạp không ở trạng thái mở cửa' using errcode = '23514';
  end if;
  if v_st.movie_status is distinct from 'PUBLISHED' then
    raise exception 'MOVIE_NOT_PUBLISHED: Phim chưa/không còn mở bán vé' using errcode = '23514';
  end if;

  -- 3.6 Kiểm tra quyền kênh POS (Defect 2)
  if v_channel = 'POS' then
    if coalesce(auth.role(), '') <> 'service_role' then
      if not (
        (auth.uid() is not null and (
          public.is_admin()
          or public.has_cinema_role(v_st.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[])
        ))
        or (auth.uid() is null and v_user_id is not null and (
          exists (select 1 from public.user_roles ur where ur.user_id = v_user_id and ur.role = 'ADMIN')
          or exists (
            select 1 from public.staff_assignments sa
             where sa.user_id = v_user_id
               and sa.cinema_id = v_st.cinema_id
               and sa.role in ('STAFF', 'MANAGER')
          )
        ))
      ) then
        raise exception 'PERMISSION_DENIED: Chỉ nhân viên POS hoặc quản lý rạp mới được giữ ghế kênh POS' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 3.7 Kiểm tra mốc đóng bán (R-67: Web trước cutoff; POS cho phép tới khi kết thúc phim theo Quyết định #11)
  if v_channel = 'WEB' then
    select coalesce(
      v_st.online_cutoff_minutes,
      (select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'default_online_cutoff_minutes'),
      15
    ) into v_cutoff;
    if now() >= (v_st.starts_at - make_interval(mins => v_cutoff)) then
      raise exception 'SALES_CLOSED: Đã qua mốc đóng bán online cho suất chiếu này' using errcode = '23514';
    end if;
  elsif v_channel = 'POS' then
    if now() >= (v_st.starts_at + make_interval(mins => v_st.duration_minutes)) then
      raise exception 'SALES_CLOSED: Suất chiếu đã kết thúc, không thể giữ/bán tại quầy' using errcode = '23514';
    end if;
  end if;

  -- 3.8 Kiểm tra độ tuổi phim T13/T16/T18 cho kênh WEB (Defect 4, R-68, AC-16)
  if v_channel = 'WEB' and v_st.age_rating::text in ('T13', 'T16', 'T18') then
    select p.date_of_birth into v_dob
      from public.profiles p
     where p.id = v_user_id;

    if v_dob is null then
      raise exception 'DOB_REQUIRED: Vui lòng cập nhật ngày sinh trong hồ sơ trước khi đặt vé phim %', v_st.age_rating
        using errcode = '22023';
    end if;

    v_age := extract(year from age((v_st.starts_at at time zone 'Asia/Ho_Chi_Minh')::date, v_dob))::int;
    v_min_age := case v_st.age_rating::text
      when 'T13' then 13
      when 'T16' then 16
      when 'T18' then 18
      else 0
    end;

    if v_age < v_min_age then
      raise exception 'UNDERAGE_FOR_RATING: Khách hàng chưa đủ % tuổi để đặt vé phim %', v_min_age, v_st.age_rating
        using errcode = '23514';
    end if;
  end if;

  -- 3.8b Khoá TRƯỚC các đơn sẽ bị huỷ (§3.13) / expire (§3.14), theo id tăng dần: orders luôn được khoá trước
  --       seats và seat_states, cùng thứ tự với confirm_paid và job expire_overdue_holds (xem thứ tự khoá ở đầu file).
  perform 1
     from public.orders o
    where o.status in ('holding', 'pending_payment')
      and ((v_channel = 'WEB' and v_user_id is not null and o.user_id = v_user_id)
        or (o.showtime_id = p_showtime_id and o.hold_expires_at <= now()))
    order by o.id
      for update;

  -- 3.9 Khóa ghế theo thứ tự cố định để chống deadlock concurrency (Defect 3)
  perform 1 from public.seats s
   where s.id = any(p_seat_ids)
   order by s.id
   for update;

  -- 3.10 Kiểm tra ghế thuộc phòng chiếu và không phải lối đi / ghế hỏng
  if (
    select count(*)
      from public.seats s
     where s.room_id = v_st.room_id
       and s.id = any(p_seat_ids)
  ) <> cardinality(p_seat_ids) then
    raise exception 'INVALID_SEATS: Có ghế không thuộc phòng chiếu của suất này' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.seats s
     where s.room_id = v_st.room_id
       and s.id = any(p_seat_ids)
       and s.seat_type in ('AISLE', 'BROKEN')
  ) then
    raise exception 'INVALID_SEATS: Không thể chọn lối đi hoặc ghế hỏng' using errcode = '22023';
  end if;

  -- 3.11 Kiểm tra giới hạn số ghế <= 8 (SWEETBOX tính 2 ghế, NORMAL/VIP tính 1) (R-65, Quyết định #19)
  select sum(case when s.seat_type = 'SWEETBOX' then 2 else 1 end)
    into v_total_capacity
    from public.seats s
   where s.room_id = v_st.room_id
     and s.id = any(p_seat_ids);

  if v_total_capacity > 8 then
    raise exception 'HOLD_LIMIT: Mỗi đơn chỉ được giữ tối đa 8 ghế (SWEETBOX tính 2 ghế)' using errcode = '23514';
  end if;

  -- 3.12 Ghế không bị Manager khoá (R-55)
  select array_agg(coalesce(s.label, s.row_label || s.col_number::text))
    into v_locked_labels
    from public.showtime_seat_locks l
    join public.seats s on s.id = l.seat_id
   where l.showtime_id = p_showtime_id
     and l.seat_id = any(p_seat_ids);

  if v_locked_labels is not null and cardinality(v_locked_labels) > 0 then
    raise exception 'SEAT_TAKEN: Ghế % đang bị khoá', array_to_string(v_locked_labels, ', ')
      using errcode = '23514';
  end if;

  -- 3.13 Kênh Web: huỷ đơn holding VÀ pending_payment cũ của khách trên toàn chuỗi (R-64, quyết định #9).
  --      Đơn đã được khoá ở §3.8b (id tăng dần); ở đây khoá lại để lấy danh sách; confirm_paid đang chạy trên đơn đó sẽ thắng, đơn paid không bị đụng.
  if v_channel = 'WEB' and v_user_id is not null then
    select array_agg(x.id) into v_old_order_ids
      from (select o.id
              from public.orders o
             where o.user_id = v_user_id
               and o.status in ('holding', 'pending_payment')
             order by o.id
               for update) x;

    if v_old_order_ids is not null and cardinality(v_old_order_ids) > 0 then
      update public.orders o
         set status = 'cancelled'
       where o.id = any(v_old_order_ids)
         and o.status in ('holding', 'pending_payment');

      delete from public.showtime_seat_states sss
       where sss.id in (select x.id from public.showtime_seat_states x
                         where x.order_id = any(v_old_order_ids)
                         order by x.showtime_id, x.seat_id
                           for update);

      -- Huỷ payment link còn mở của các đơn vừa bị huỷ (voucher HELD -> RELEASED do trigger orders_voucher_status_sync)
      update public.payments p
         set status = 'CANCELLED'
       where p.order_id = any(v_old_order_ids)
         and p.status = 'PENDING'
         and exists (select 1 from public.orders o where o.id = p.order_id and o.status = 'cancelled');
    end if;
  end if;

  -- 3.14 Dọn hold hết hạn của suất này (AC-07): hold quá hạn coi như trống.
  --      Đơn holding VÀ pending_payment quá hạn -> expired (R-63, R-77, §8.5); payment mở -> EXPIRED;
  --      voucher HELD -> RELEASED qua trigger orders_voucher_status_sync.
  -- Thứ tự: UPDATE orders (đã khoá ở §3.8b) -> payments -> DELETE seat_states (theo showtime_id, seat_id).
  with expired as (
    update public.orders o
       set status = 'expired'
     where o.showtime_id = p_showtime_id
       and o.status in ('holding', 'pending_payment')
       and o.hold_expires_at <= now()
    returning o.id
  )
  select array_agg(e.id) into v_expired_order_ids from expired e;

  if v_expired_order_ids is not null and cardinality(v_expired_order_ids) > 0 then
    update public.payments p
       set status = 'EXPIRED'
     where p.order_id = any(v_expired_order_ids)
       and p.status = 'PENDING';
  end if;

  delete from public.showtime_seat_states sss
   where sss.id in (select x.id from public.showtime_seat_states x
                     where x.showtime_id = p_showtime_id
                       and ((x.state = 'HELD' and x.expires_at <= now())
                         or x.order_id = any(coalesce(v_expired_order_ids, '{}'::uuid[])))
                     order by x.showtime_id, x.seat_id
                       for update);

  -- 3.15 Kiểm tra ghế đã bị SOLD hoặc HELD còn hạn -> lỗi SEAT_TAKEN, rollback
  select array_agg(coalesce(s.label, s.row_label || s.col_number::text))
    into v_taken_labels
    from public.showtime_seat_states st
    join public.seats s on s.id = st.seat_id
   where st.showtime_id = p_showtime_id
     and st.seat_id = any(p_seat_ids)
     and (st.state = 'SOLD' or (st.state = 'HELD' and st.expires_at > now()));

  if v_taken_labels is not null and cardinality(v_taken_labels) > 0 then
    raise exception 'SEAT_TAKEN: Ghế % đã có người giữ hoặc mua', array_to_string(v_taken_labels, ', ')
      using errcode = '23514';
  end if;

  -- 3.16 Kiểm tra quy tắc không để ghế lẻ (ORPHAN_SEAT — R-66, Defect 5)
  -- Chỉ áp dụng cho kênh WEB (kênh POS được miễn trừ)
  if v_channel = 'WEB' then
    for v_row in
      select distinct s.row_label
        from public.seats s
       where s.room_id = v_st.room_id
         and s.id = any(p_seat_ids)
       order by s.row_label
    loop
      with all_row_seats as (
        select
          s.id,
          s.row_label,
          s.col_number,
          s.col_span,
          s.seat_type,
          coalesce(s.label, s.row_label || s.col_number::text) as seat_label,
          (
            s.seat_type in ('AISLE', 'BROKEN')
            or exists (
              select 1 from public.showtime_seat_locks l
               where l.showtime_id = p_showtime_id
                 and l.seat_id = s.id
            )
          ) as is_barrier,
          (
            exists (
              select 1 from public.showtime_seat_states st
               where st.showtime_id = p_showtime_id
                 and st.seat_id = s.id
                 and (st.state = 'SOLD' or (st.state = 'HELD' and st.expires_at > now()))
            )
          ) as is_occupied_before,
          (
            s.id = any(p_seat_ids)
            or exists (
              select 1 from public.showtime_seat_states st
               where st.showtime_id = p_showtime_id
                 and st.seat_id = s.id
                 and (st.state = 'SOLD' or (st.state = 'HELD' and st.expires_at > now()))
            )
          ) as is_occupied_after
        from public.seats s
        where s.room_id = v_st.room_id
          and s.row_label = v_row
        order by s.col_number
      ),
      seats_with_prev as (
        select
          ars.*,
          lag(col_number + col_span) over (order by col_number) as prev_col_end,
          lag(is_barrier) over (order by col_number) as prev_is_barrier
        from all_row_seats ars
      ),
      seats_with_seg as (
        select
          swp.*,
          sum(
            case
              when swp.is_barrier then 1
              when swp.prev_is_barrier is true then 1
              when swp.prev_col_end is not null and swp.prev_col_end <> swp.col_number then 1
              else 0
            end
          ) over (order by col_number) as seg_id
        from seats_with_prev swp
      ),
      non_barrier_segments as (
        select
          sws.*,
          sum(case when not sws.is_occupied_before then sws.col_span else 0 end) over (partition by seg_id) as seg_available_before,
          sum(sws.col_span) over (partition by seg_id) as seg_total_capacity,
          lag(sws.is_occupied_after) over (partition by seg_id order by col_number) as prev_occupied_after,
          lead(sws.is_occupied_after) over (partition by seg_id order by col_number) as next_occupied_after
        from seats_with_seg sws
        where not sws.is_barrier
      )
      select seat_label into v_orphan_seat_label
        from non_barrier_segments
       where seg_available_before > 2
         and seat_type in ('NORMAL', 'VIP')
         and not is_occupied_after
         and (prev_occupied_after is null or prev_occupied_after = true)
         and (next_occupied_after is null or next_occupied_after = true)
       limit 1;

      if v_orphan_seat_label is not null then
        raise exception 'ORPHAN_SEAT: Không được để trống 1 ghế đơn lẻ trên hàng % (ghế %)', v_row, v_orphan_seat_label
          using errcode = '23514';
      end if;
    end loop;
  end if;

  -- 3.17 Chốt giá từng ghế qua price_quote (R-72)
  select coalesce(sum(pq.amount), 0)
    into v_subtotal
    from public.price_quote(p_showtime_id, p_seat_ids) pq;

  -- 3.18 Tính thời hạn giữ ghế (Web đọc app_settings mặc định 10'; POS = 5' theo AC-22)
  if v_channel = 'WEB' then
    select coalesce(
      (s.value #>> '{}')::integer,
      10
    ) into v_web_hold_mins
    from public.app_settings s
    where s.key = 'seat_hold_minutes_web';

    v_expires_at := now() + make_interval(mins => coalesce(v_web_hold_mins, 10));
  elsif v_channel = 'POS' then
    v_expires_at := now() + interval '5 minutes';
  end if;

  -- 3.19 Sinh mã đặt vé duy nhất
  v_booking_code := public.generate_booking_code(v_st.cinema_code);

  -- 3.20 Tạo đơn hàng (status = 'holding')
  -- Với kênh POS: khách hàng tại quầy không gán user_id của nhân viên POS để tránh vi phạm orders_one_active_hold_per_user_key
  insert into public.orders (
    channel,
    cinema_id,
    showtime_id,
    user_id,
    status,
    subtotal_amount,
    discount_amount,
    total_amount,
    booking_code,
    hold_expires_at
  ) values (
    v_channel,
    v_st.cinema_id,
    p_showtime_id,
    case when v_channel = 'POS' then null else v_user_id end,
    'holding',
    v_subtotal,
    0,
    v_subtotal,
    v_booking_code,
    v_expires_at
  ) returning id into v_order_id;

  -- 3.21 Tạo chi tiết ghế của đơn (order_seats) - có order by pq.seat_id
  insert into public.order_seats (
    order_id,
    seat_id,
    seat_label,
    seat_type,
    price_amount
  )
  select
    v_order_id,
    pq.seat_id,
    coalesce(s.label, s.row_label || s.col_number::text),
    pq.seat_type,
    pq.amount
  from public.price_quote(p_showtime_id, p_seat_ids) pq
  join public.seats s on s.id = pq.seat_id
  order by pq.seat_id;

  -- 3.22 Cập nhật trạng thái giữ ghế (showtime_seat_states) - có order by pq.seat_id (Defect 3).
  --      Ghế bị phiên khác (vd confirm_paid) chen vào giữa §3.15 và đây -> unique (showtime_id, seat_id) vi phạm:
  --      trả SEAT_TAKEN (23514) như §3.15; mọi ràng buộc unique khác được ném lại nguyên trạng.
  declare
    v_violated_constraint text;
  begin
    insert into public.showtime_seat_states (
      showtime_id,
      seat_id,
      state,
      source,
      expires_at,
      order_id
    )
    select
      p_showtime_id,
      pq.seat_id,
      'HELD',
      v_channel,
      v_expires_at,
      v_order_id
    from public.price_quote(p_showtime_id, p_seat_ids) pq
    order by pq.seat_id;
  exception when unique_violation then
    get stacked diagnostics v_violated_constraint = constraint_name;
    if v_violated_constraint is distinct from 'showtime_seat_states_showtime_seat_key' then
      raise;
    end if;
    select array_agg(coalesce(s.label, s.row_label || s.col_number::text))
      into v_taken_labels
      from public.showtime_seat_states st
      join public.seats s on s.id = st.seat_id
     where st.showtime_id = p_showtime_id
       and st.seat_id = any(p_seat_ids);
    raise exception 'SEAT_TAKEN: Ghế % đã có người giữ hoặc mua', array_to_string(v_taken_labels, ', ')
      using errcode = '23514';
  end;

  -- 3.24 Trả về kết quả
  order_id        := v_order_id;
  booking_code    := v_booking_code;
  hold_expires_at := v_expires_at;
  subtotal_amount := v_subtotal;
  discount_amount := 0;
  total_amount    := v_subtotal;
  seat_count      := v_total_capacity;
  return next;
end;
$function$;

revoke all on function public.hold_seats(uuid, uuid[], text, uuid, text) from public, anon;
grant execute on function public.hold_seats(uuid, uuid[], text, uuid, text) to authenticated, service_role;
