-- Layer 4 / task 01: RPC nguyên tử giữ/nhả/gia hạn ghế (web + POS) + dọn hold hết hạn
-- (R-55, R-61..R-67, R-72, R-122..R-124, AC-06, AC-07, AC-21, AC-22).
-- Chỉ thêm bảng idempotency cho POS + các hàm RPC SECURITY DEFINER + 1 cron job
-- -> additive, KHÔNG phải HIGH_RISK_MIGRATION (không DROP, không đổi kiểu cột, không backfill).

-- ============================================================================
-- 1. Bảng phụ trợ: pos_requests (R-126: POS idempotent theo requestId)
-- ============================================================================
create table if not exists public.pos_requests (
  request_id  text primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists pos_requests_order_id_idx on public.pos_requests (order_id);

alter table public.pos_requests enable row level security;
revoke all on public.pos_requests from anon, authenticated;
grant select on public.pos_requests to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'pos_requests' and policyname = 'pos_requests_select'
  ) then
    create policy pos_requests_select on public.pos_requests for select to authenticated
      using ((select public.is_admin()) or (select public.can_view_order(order_id)));
  end if;
end;
$$;

-- ============================================================================
-- 2. Hàm helper sinh booking_code khớp regex: ^[A-Z0-9]{2,10}-[A-Z0-9]{6}$ (đồng nhất với task 02)
-- ============================================================================
create or replace function public.generate_booking_code(p_cinema_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_code  text;
  v_rand  text;
  i       integer;
begin
  if p_cinema_code is null or length(btrim(p_cinema_code)) = 0 then
    raise exception 'Mã rạp không hợp lệ để sinh mã đặt vé' using errcode = '23514';
  end if;

  loop
    v_rand := '';
    for i in 1..6 loop
      v_rand := v_rand || substr(v_chars, floor(random() * 36 + 1)::integer, 1);
    end loop;
    v_code := upper(btrim(p_cinema_code)) || '-' || v_rand;
    exit when not exists (select 1 from public.orders where booking_code = v_code);
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generate_booking_code(text) from public, anon;
grant execute on function public.generate_booking_code(text) to authenticated, service_role;

-- ============================================================================
-- 3. RPC hold_seats: giữ ghế nguyên tử (Web + POS)
-- ============================================================================
create or replace function public.hold_seats(
  p_showtime_id   uuid,
  p_seat_ids      uuid[],
  p_channel       text default 'WEB',
  p_user_id       uuid default auth.uid(),
  p_request_id    text default null
)
returns table (
  order_id        uuid,
  booking_code    text,
  hold_expires_at timestamptz,
  subtotal_amount integer,
  discount_amount integer,
  total_amount    integer,
  seat_count      integer
)
language plpgsql
security definer
set search_path = ''
as $$
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

  -- 3.13 Kênh Web: huỷ đơn holding cũ của khách trên toàn chuỗi (R-64)
  if v_channel = 'WEB' and v_user_id is not null then
    select array_agg(o.id) into v_old_order_ids
      from public.orders o
     where o.user_id = v_user_id
       and o.status = 'holding';

    if v_old_order_ids is not null and cardinality(v_old_order_ids) > 0 then
      delete from public.showtime_seat_states sss
       where sss.order_id = any(v_old_order_ids);

      update public.orders o
         set status = 'cancelled'
       where o.id = any(v_old_order_ids)
         and o.status = 'holding';
    end if;
  end if;

  -- 3.14 Dọn hold hết hạn của suất này (AC-07): hold quá hạn coi như trống
  select array_agg(distinct sss.order_id) into v_expired_order_ids
    from public.showtime_seat_states sss
   where sss.showtime_id = p_showtime_id
     and sss.state = 'HELD'
     and sss.expires_at <= now();

  delete from public.showtime_seat_states sss
   where sss.showtime_id = p_showtime_id
     and sss.state = 'HELD'
     and sss.expires_at <= now();

  if v_expired_order_ids is not null and cardinality(v_expired_order_ids) > 0 then
    update public.orders o
       set status = 'expired'
     where o.id = any(v_expired_order_ids)
       and o.status = 'holding';
  end if;

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
  -- Với kênh POS: khách hàng tại quầy không gán user_id của nhân viên POS để tránh vi phạm orders_one_holding_per_user_key
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

  -- 3.22 Cập nhật trạng thái giữ ghế (showtime_seat_states) - có order by pq.seat_id (Defect 3)
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
$$;

revoke all on function public.hold_seats(uuid, uuid[], text, uuid, text) from public, anon;
grant execute on function public.hold_seats(uuid, uuid[], text, uuid, text) to authenticated, service_role;

-- ============================================================================
-- 4. RPC release_seats: nhả ghế đang giữ của đơn (chủ đơn / nhân sự / admin)
-- ============================================================================
create or replace function public.release_seats(
  p_order_id uuid,
  p_actor_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_actor uuid;
begin
  select o.id, o.status, o.user_id, o.cinema_id, o.channel
    into v_order
    from public.orders o
   where o.id = p_order_id;

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
$$;
revoke all on function public.release_seats(uuid, uuid) from public, anon;
grant execute on function public.release_seats(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 5. RPC extend_pos_hold: gia hạn giữ ghế cho đơn POS (R-124)
-- ============================================================================
create or replace function public.extend_pos_hold(
  p_order_id       uuid,
  p_extra_minutes  integer default 5
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order          record;
  v_extra          integer;
  v_new_expires_at timestamptz;
begin
  select o.id, o.status, o.channel, o.hold_expires_at, o.cinema_id
    into v_order
    from public.orders o
   where o.id = p_order_id;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND: Đơn hàng không tồn tại' using errcode = '23503';
  end if;

  if v_order.channel <> 'POS' then
    raise exception 'POS_ONLY: Chỉ đơn POS mới được gia hạn giữ ghế' using errcode = '23514';
  end if;

  -- Phân quyền: chỉ nhân sự rạp, admin, hoặc service_role
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or (auth.uid() is not null and exists (
          select 1 from public.user_roles ur
           where ur.user_id = auth.uid() and ur.role = 'ADMIN'
       ))
    or (auth.uid() is not null and exists (
          select 1 from public.staff_assignments sa
           where sa.user_id = auth.uid()
             and sa.cinema_id = v_order.cinema_id
             and sa.role in ('STAFF', 'MANAGER')
       ))
  ) then
    raise exception 'PERMISSION_DENIED: Chỉ nhân sự rạp mới được gia hạn đơn POS' using errcode = '42501';
  end if;

  if v_order.status <> 'holding' then
    raise exception 'ORDER_NOT_HOLDING: Đơn không ở trạng thái holding' using errcode = '23514';
  end if;

  if v_order.hold_expires_at <= now() then
    raise exception 'HOLD_EXPIRED: Đơn giữ ghế đã hết hạn' using errcode = '23514';
  end if;

  v_extra := coalesce(p_extra_minutes, 5);
  if v_extra <= 0 then
    raise exception 'INVALID_MINUTES: Số phút gia hạn phải lớn hơn 0' using errcode = '22023';
  end if;

  v_new_expires_at := v_order.hold_expires_at + make_interval(mins => v_extra);

  update public.orders
     set hold_expires_at = v_new_expires_at
   where id = p_order_id;

  update public.showtime_seat_states
     set expires_at = v_new_expires_at
   where order_id = p_order_id
     and state = 'HELD';

  return v_new_expires_at;
end;
$$;
revoke all on function public.extend_pos_hold(uuid, integer) from public, anon;
grant execute on function public.extend_pos_hold(uuid, integer) to authenticated, service_role;

-- ============================================================================
-- 6. RPC expire_overdue_holds: dọn hold quá hạn (pg_cron chạy mỗi phút)
-- ============================================================================
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
  -- Lấy danh sách đơn holding đã quá hạn
  select array_agg(id) into v_expired_order_ids
    from public.orders
   where status = 'holding'
     and hold_expires_at <= now();

  -- Xoá ghế HELD quá hạn
  delete from public.showtime_seat_states
   where state = 'HELD'
     and expires_at <= now();

  -- Cập nhật đơn holding quá hạn sang expired
  if v_expired_order_ids is not null and cardinality(v_expired_order_ids) > 0 then
    update public.orders o
       set status = 'expired'
     where id = any(v_expired_order_ids)
       and status = 'holding';
    v_count := cardinality(v_expired_order_ids);
  end if;

  return v_count;
end;
$$;
revoke all on function public.expire_overdue_holds() from public, anon, authenticated;
grant execute on function public.expire_overdue_holds() to service_role;

-- ============================================================================
-- 7. Đăng ký pg_cron chạy mỗi phút (idempotent)
-- ============================================================================
do $block$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'expire-overdue-holds') then
      perform cron.unschedule('expire-overdue-holds');
    end if;
    perform cron.schedule('expire-overdue-holds', '* * * * *', 'select public.expire_overdue_holds()');
  end if;
end;
$block$;
