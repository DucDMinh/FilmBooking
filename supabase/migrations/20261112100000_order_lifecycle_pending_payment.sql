-- ============================================================================
-- 20261112100000_order_lifecycle_pending_payment.sql
-- bug-layer34-review phase-2 task-01 (M1a/b + M2): vòng đời đơn pending_payment.
--  1. expire_overdue_holds + hold_seats §3.14: pending_payment quá hạn -> expired (R-63, R-77, §8.5),
--     payment mở -> EXPIRED, voucher HELD -> RELEASED (trigger orders_voucher_status_sync).
--  2. hold_seats §3.13: tạo đơn mới huỷ cả holding lẫn pending_payment cũ của khách (R-64, quyết định #9),
--     payment mở -> CANCELLED.
--  3. Unique index một-đơn-đang-giữ-mỗi-khách phủ cả pending_payment (thay orders_one_holding_per_user_key).
-- HIGH_RISK_MIGRATION (index trên dữ liệu cũ): precheck dữ liệu trùng, fail rõ ràng. Xem task file.
-- ============================================================================

-- THỨ TỰ KHOÁ TOÀN CỤC (chống deadlock; mọi RPC ghi trạng thái đơn/ghế phải theo đúng thứ tự):
--   0) public.showtimes        (cancel_showtimes: FOR UPDATE; confirm_pos_sale: FOR SHARE sau khi khoá đơn -> xem Residual)
--   1) public.orders           (theo id tăng dần: SELECT ... ORDER BY id FOR UPDATE)
--   2) public.payments         (của các đơn đã khoá)
--   3) public.seats            (hold_seats §3.9: FOR UPDATE theo id, giữ nguyên như trước migration này)
--   4) public.showtime_seat_states (theo (showtime_id, seat_id) tăng dần)
-- Áp dụng: confirm_paid/sell_order_seats (orders -> payments -> seat_states), hold_seats (§3.8b khoá orders TRƯỚC seats),
-- expire_overdue_holds, release_seats (khoá đơn FOR UPDATE ngay đầu), cancel_showtimes (showtimes -> orders -> seat_states).
-- Residual (CÓ TỪ TRƯỚC, không đổi ở migration này; có thể gây 40P01, cần follow-up):
--   a) confirm_pos_sale khoá orders rồi showtimes FOR SHARE; hold_seats / sell_order_seats cũng lấy KEY SHARE trên showtimes
--      (FK, đọc suất) SAU khi đã khoá orders -> ngược cancel_showtimes (showtimes FOR UPDATE rồi orders).
--      Ghi chú cho task-02: mọi `showtimes ... FOR SHARE` trong confirm_paid phải đặt TRƯỚC khoá orders.
--   b) hold_seats (seats FOR UPDATE, §3.9) vs confirm_paid/sell_order_seats (insert seat_state lấy KEY SHARE trên seats qua FK
--      (seat_id, room_id)): đơn nhiều ghế, một ghế đã có dòng, một ghế chưa có dòng -> có thể deadlock.
--   c) Hai hold_seats đồng thời của cùng một khách: đơn do lời gọi thứ nhất tạo không nằm trong snapshot §3.8b của lời gọi thứ hai.

-- 3. Index (atomic trong 1 khối DO = 1 statement): khoá bảng, precheck trùng (dừng, không tự xoá/huỷ đơn),
--    tạo index mới rồi drop index cũ. ACCESS EXCLUSIVE ngay từ đầu để tránh nâng khoá giữa chừng (bảng nhỏ, áp ngoài giờ cao điểm).
do $$
declare
  v_dup record;
begin
  -- Fail nhanh thay vì treo mọi SELECT orders phía sau nếu có transaction dài giữ khoá bảng
  perform set_config('lock_timeout', '5s', true);
  lock table public.orders in access exclusive mode;

  select user_id, count(*) as n into v_dup
    from public.orders
   where status in ('holding', 'pending_payment') and user_id is not null
   group by user_id
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'MIGRATION_PRECHECK_FAILED: user % có % đơn holding/pending_payment cùng lúc; xử lý (huỷ/expire) trước khi áp migration này',
      v_dup.user_id, v_dup.n using errcode = '23505';
  end if;

  create unique index orders_one_active_hold_per_user_key on public.orders (user_id)
    where status in ('holding', 'pending_payment') and user_id is not null;
  drop index public.orders_one_holding_per_user_key;
end;
$$;

-- 2 + 1. hold_seats (giữ nguyên chữ ký/SECURITY DEFINER/search_path; chỉ đổi §3.13 và §3.14)
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
  v_existing_order_id   uuid;
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
  -- 3.1 Input validation cơ bản
  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'SEAT_REQUIRED: Chưa chọn ghế' using errcode = '22023';
  end if;
  if cardinality(p_seat_ids) <> (select count(distinct x) from unnest(p_seat_ids) x) then
    raise exception 'DUPLICATE_SEATS: Danh sách ghế bị trùng' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not in ('WEB', 'POS') then
    raise exception 'INVALID_CHANNEL: Kênh đặt vé không hợp lệ' using errcode = '22023';
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

  -- 3.4 Idempotent cho POS theo request_id (R-126)
  if p_request_id is not null then
    select pr.order_id into v_existing_order_id
      from public.pos_requests pr
     where pr.request_id = p_request_id;
    if v_existing_order_id is not null then
      return query
      select
        o.id,
        o.booking_code,
        o.hold_expires_at,
        o.subtotal_amount,
        o.discount_amount,
        o.total_amount,
        (select count(*)::integer from public.order_seats os where os.order_id = o.id)
      from public.orders o
      where o.id = v_existing_order_id;
      return;
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
    c.code as cinema_code,
    c.online_cutoff_minutes,
    m.duration_minutes,
    m.age_rating
  into v_st
  from public.showtimes st
  join public.cinemas c on c.id = st.cinema_id
  join public.movies m on m.id = st.movie_id
  where st.id = p_showtime_id;

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

  -- 3.23 Lưu request_id nếu có (POS idempotent R-126)
  if p_request_id is not null then
    insert into public.pos_requests (request_id, order_id)
    values (p_request_id, v_order_id)
    on conflict (request_id) do nothing;
  end if;

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

-- 1. expire_overdue_holds (job): đơn holding/pending_payment quá hạn -> expired
create or replace function public.expire_overdue_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_order_ids uuid[];
  v_count             integer := 0;
begin
  -- Thứ tự khoá: orders (id tăng dần) -> payments -> seat_states (showtime_id, seat_id); xem đầu file.
  perform 1
     from public.orders o
    where o.status in ('holding', 'pending_payment')
      and o.hold_expires_at <= now()
    order by o.id
      for update;

  with expired as (
    update public.orders o
       set status = 'expired'
     where o.status in ('holding', 'pending_payment')
       and o.hold_expires_at <= now()
    returning o.id
  )
  select array_agg(e.id) into v_expired_order_ids from expired e;

  if v_expired_order_ids is not null and cardinality(v_expired_order_ids) > 0 then
    update public.payments
       set status = 'EXPIRED'
     where order_id = any(v_expired_order_ids)
       and status = 'PENDING';
    v_count := cardinality(v_expired_order_ids);
  end if;

  -- Xoá ghế HELD quá hạn (kể cả mồ côi) và mọi ghế của các đơn vừa expired
  delete from public.showtime_seat_states sss
   where sss.id in (select x.id from public.showtime_seat_states x
                     where (x.state = 'HELD' and x.expires_at <= now())
                        or x.order_id = any(coalesce(v_expired_order_ids, '{}'::uuid[]))
                     order by x.showtime_id, x.seat_id
                       for update);

  return v_count;
end;
$$;
revoke all on function public.expire_overdue_holds() from public, anon, authenticated;
grant execute on function public.expire_overdue_holds() to service_role;

-- release_seats: khoá đơn trước seat_states (R2-F1); phần còn lại giữ nguyên
CREATE OR REPLACE FUNCTION public.release_seats(p_order_id uuid, p_actor_id uuid DEFAULT auth.uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_actor uuid;
begin
  select o.id, o.status, o.user_id, o.cinema_id, o.channel
    into v_order
    from public.orders o
   where o.id = p_order_id
     for update;  -- khoá đơn TRƯỚC khi đụng seat_states (thứ tự khoá toàn cục)

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND: Đơn hàng không tồn tại' using errcode = '23503';
  end if;

  -- Kiểm tra định danh & chống giả mạo p_actor_id (Defect 1)
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is not null and p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'PERMISSION_DENIED: Không được giả mạo p_actor_id của người khác' using errcode = '42501';
    end if;
    if auth.uid() is not null then
      v_actor := auth.uid();
    else
      v_actor := p_actor_id;
    end if;
  else
    v_actor := coalesce(p_actor_id, auth.uid());
  end if;

  if v_actor is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'PERMISSION_DENIED: Thiếu định danh người thực hiện' using errcode = '42501';
  end if;

  -- Kiểm tra quyền: chủ đơn, Admin, Staff/Manager rạp của đơn, service_role
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or (v_order.user_id is not null and v_actor is not null and v_order.user_id = v_actor)
    or (v_actor is not null and exists (
          select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role = 'ADMIN'
       ))
    or (v_actor is not null and exists (
          select 1 from public.staff_assignments sa
           where sa.user_id = v_actor
             and sa.cinema_id = v_order.cinema_id
             and sa.role in ('STAFF', 'MANAGER')
       ))
  ) then
    raise exception 'PERMISSION_DENIED: Không có quyền thao tác trên đơn hàng này' using errcode = '42501';
  end if;

  if v_order.status <> 'holding' then
    raise exception 'INVALID_ORDER_STATUS: Chỉ có thể nhả ghế cho đơn đang ở trạng thái holding' using errcode = '23514';
  end if;

  -- Xoá trạng thái giữ ghế
  delete from public.showtime_seat_states
   where order_id = p_order_id
     and state = 'HELD';

  -- Huỷ đơn
  update public.orders
     set status = 'cancelled'
   where id = p_order_id;
end;
$function$;

revoke all on function public.release_seats(uuid, uuid) from public, anon;
grant execute on function public.release_seats(uuid, uuid) to authenticated, service_role;

-- cancel_showtimes: khoá đơn trước và xoá seat_states có thứ tự (R2-F1); phần còn lại giữ nguyên
CREATE OR REPLACE FUNCTION public.cancel_showtimes(p_showtime_ids uuid[], p_reason text, p_actor_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_caller_admin boolean;
  v_actor_id uuid;
  v_st_count integer := 0;
  v_cancelled_holds integer := 0;
  v_affected_paid integer := 0;
  v_cancelled_orders integer := 0;
  v_emails_enqueued integer := 0;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'CANCEL_REASON_REQUIRED: Lý do huỷ suất không được để trống' using errcode = 'P0001';
  end if;

  if p_showtime_ids is null or cardinality(p_showtime_ids) = 0 then
    return jsonb_build_object(
      'success', true,
      'cancelled_showtimes_count', 0,
      'affected_orders_count', 0,
      'cancelled_holds_count', 0,
      'cancelled_orders_count', 0,
      'emails_enqueued_count', 0
    );
  end if;

  -- P0-08: client role không được ghi cancelled_by là người khác (giả mạo audit). service_role (uid null) truyền actor tường minh.
  if auth.uid() is not null and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'FORBIDDEN_ACTOR_SPOOFING' using errcode = '42501';
  end if;
  v_actor_id := coalesce(auth.uid(), p_actor_id);
  v_is_caller_admin := (select auth.role()) = 'service_role'
    or public.is_admin()
    or (
      nullif(current_setting('request.jwt.claims', true), '') is null
      and session_user in ('postgres', 'supabase_admin')
    );

  if not v_is_caller_admin then
    if exists (
      select 1 from public.showtimes st
      where st.id = any(p_showtime_ids)
        and not public.has_cinema_role(st.cinema_id, array['MANAGER']::public.staff_role[])
    ) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  end if;

  -- 5.1 Khoá và đổi trạng thái các suất chiếu sang CANCELLED
  perform 1 from public.showtimes where id = any(p_showtime_ids) for update;

  update public.showtimes
  set status = 'CANCELLED',
      cancel_reason = p_reason,
      cancelled_at = now(),
      cancelled_by = v_actor_id,
      updated_at = now()
  where id = any(p_showtime_ids);
  get diagnostics v_st_count = row_count;

  -- 5.1b Khoá các đơn bị ảnh hưởng (id tăng dần) TRƯỚC khi xoá seat_states (thứ tự khoá toàn cục)
  perform 1 from public.orders
  where showtime_id = any(p_showtime_ids)
    and status in ('holding', 'pending_payment', 'paid')
  order by id
  for update;

  -- 5.2 Nhả toàn bộ ghế HELD trên các suất chiếu này (khoá dòng theo (showtime_id, seat_id))
  delete from public.showtime_seat_states
  where id in (select x.id from public.showtime_seat_states x
                where x.showtime_id = any(p_showtime_ids)
                  and x.state = 'HELD'
                order by x.showtime_id, x.seat_id
                  for update);
  get diagnostics v_cancelled_holds = row_count;

  -- 5.3 Huỷ các đơn holding và pending_payment
  perform 1 from public.orders
  where showtime_id = any(p_showtime_ids)
    and status in ('holding', 'pending_payment')
  for update;

  update public.orders
  set status = 'cancelled',
      cancel_reason = p_reason,
      cancelled_at = coalesce(orders.cancelled_at, now()),
      updated_at = now()
  where showtime_id = any(p_showtime_ids)
    and status in ('holding', 'pending_payment');
  get diagnostics v_cancelled_orders = row_count;

  -- 5.4 Với các đơn paid (cả WEB và POS) -> chuyển sang affected
  perform 1 from public.orders
  where showtime_id = any(p_showtime_ids)
    and status = 'paid'
  for update;

  update public.orders
  set status = 'affected',
      counter_contact = (channel = 'POS' and (contact_email is null or length(btrim(contact_email::text)) = 0)),
      cancel_reason = p_reason,
      cancelled_at = coalesce(orders.cancelled_at, now()),
      updated_at = now()
  where showtime_id = any(p_showtime_ids)
    and status = 'paid';
  get diagnostics v_affected_paid = row_count;

  -- 5.5 Tạo bản ghi trong affected_order_cases
  insert into public.affected_order_cases (
    order_id,
    showtime_id,
    cinema_id,
    reason,
    counter_contact,
    email_sent
  )
  select
    o.id,
    o.showtime_id,
    o.cinema_id,
    p_reason,
    (o.channel = 'POS' and (o.contact_email is null or length(btrim(o.contact_email::text)) = 0)),
    false
  from public.orders o
  where o.showtime_id = any(p_showtime_ids)
    and o.status = 'affected'
  on conflict (order_id) do update
    set reason = excluded.reason,
        counter_contact = excluded.counter_contact;

  -- 5.6 Enqueue email cho các đơn có contact_email
  with inserted_emails as (
    insert into public.email_outbox (
      kind,
      to_email,
      payload,
      cinema_id,
      status
    )
    select
      'showtime_cancelled',
      btrim(o.contact_email::text),
      jsonb_build_object(
        'order_id', o.id,
        'booking_code', o.booking_code,
        'cinema_id', o.cinema_id,
        'cinema_name', o.cinema_name,
        'movie_title', o.movie_title,
        'room_name', o.room_name,
        'showtime_starts_at', o.showtime_starts_at,
        'reason', p_reason,
        'template', 'showtime_cancelled'
      ),
      o.cinema_id,
      'PENDING'::public.outbox_status
    from public.orders o
    where o.showtime_id = any(p_showtime_ids)
      and o.status = 'affected'
      and o.contact_email is not null
      and length(btrim(o.contact_email::text)) > 0
    returning id
  )
  select count(*) into v_emails_enqueued from inserted_emails;

  -- 5.7 Cập nhật tickets status nếu bảng tickets có cột status
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'status'
  ) then
    execute 'update public.tickets set status = ''cancelled'' where showtime_id = any($1)' using p_showtime_ids;
  end if;

  return jsonb_build_object(
    'success', true,
    'cancelled_showtimes_count', v_st_count,
    'affected_orders_count', v_affected_paid,
    'cancelled_holds_count', v_cancelled_holds,
    'cancelled_orders_count', v_cancelled_orders,
    'emails_enqueued_count', v_emails_enqueued
  );
end;
$function$;

revoke all on function public.cancel_showtimes(uuid[], text, uuid) from public, anon;
grant execute on function public.cancel_showtimes(uuid[], text, uuid) to authenticated, service_role;
