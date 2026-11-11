-- ============================================================================
-- Migration: 20261111040400_rpc_checkin_reports.sql
-- Layer 4 / Task 05: RPC checkin_ticket + Views & RPCs báo cáo MVP
-- Requirements: R-97, R-98, R-99, R-101, R-102, R-112, R-113, R-116, R-132
-- Acceptance Criteria: AC-12, AC-13
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper function: has_cinema_scope
-- ---------------------------------------------------------------------------
create or replace function public.has_cinema_scope(p_cinema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select auth.role()) = 'service_role'
    or (nullif(current_setting('request.jwt.claims', true), '') is null and (select session_user) in ('postgres', 'supabase_admin'))
    or public.is_admin()
    or public.has_cinema_role(p_cinema_id, array['STAFF', 'MANAGER']::public.staff_role[])
  );
$$;

revoke all on function public.has_cinema_scope(uuid) from public, anon;
grant execute on function public.has_cinema_scope(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RPC checkin_ticket
-- Kiểm rạp trước (AC-13, R-102); vé đã dùng -> USED (AC-12, R-98);
-- suất huỷ/affected -> CANCELLED/AFFECTED; cửa sổ hợp lệ tới giờ chiếu + thời lượng;
-- ghi checkin_logs mọi lượt.
-- ---------------------------------------------------------------------------
create or replace function public.checkin_ticket(
  p_token_or_code text,
  p_cinema_id uuid,
  p_staff_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_cleaned text;
  v_ticket record;
  v_first_staff_name text;
  v_now timestamptz := clock_timestamp();
  v_showtime_end timestamptz;
begin
  -- 2.1. Phân quyền caller: caller phải có quyền tại rạp quét (p_cinema_id) hoặc là admin/service_role
  if not public.has_cinema_scope(p_cinema_id) then
    raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
  end if;

  -- Chống giả mạo p_staff_id (Non-Repudiation):
  -- Khi caller là authenticated thông thường (auth.uid() is not null và không phải admin/service_role):
  -- - Nếu truyền p_staff_id khác auth.uid() -> chặn ngay lập tức với mã 42501
  -- - Cưỡng chế v_staff_id := auth.uid()
  -- Chỉ khi gọi từ service_role/postgres (auth.uid() is null) hoặc caller là public.is_admin() mới cho phép dùng p_staff_id truyền vào
  if auth.uid() is not null and not public.is_admin() then
    if p_staff_id is not null and p_staff_id <> auth.uid() then
      raise exception 'FORBIDDEN_STAFF_SPOOFING' using errcode = '42501';
    end if;
    v_staff_id := auth.uid();
  else
    v_staff_id := coalesce(p_staff_id, auth.uid());
  end if;
  v_cleaned := trim(coalesce(p_token_or_code, ''));

  if v_cleaned = '' then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      null, p_cinema_id, null, null, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'code', 'EMPTY_CODE',
      'message', 'Mã vé hoặc token không được để trống'
    );
  end if;

  -- 2.2. Tìm vé theo qr_token, booking_code hoặc ticket_id
  select
    t.id as ticket_id,
    t.order_id,
    t.order_seat_id,
    t.showtime_id,
    t.cinema_id as ticket_cinema_id,
    t.qr_token,
    t.checked_in_at,
    t.checked_in_by,
    o.id as ord_id,
    o.status as order_status,
    o.booking_code,
    o.channel,
    o.total_amount,
    s.id as showtime_id_ref,
    s.cinema_id as showtime_cinema_id,
    s.room_id,
    s.movie_id,
    s.starts_at,
    s.ends_at,
    s.status as showtime_status,
    m.title_vi as movie_title,
    m.duration_minutes,
    c.code as cinema_code,
    c.name as cinema_name,
    c.address as cinema_address,
    r.name as room_name,
    os.seat_label,
    os.seat_type
  into v_ticket
  from public.tickets t
  join public.orders o on o.id = t.order_id
  join public.showtimes s on s.id = t.showtime_id
  join public.cinemas c on c.id = s.cinema_id
  join public.rooms r on r.id = s.room_id
  join public.movies m on m.id = s.movie_id
  join public.order_seats os on os.id = t.order_seat_id
  where (t.qr_token = lower(v_cleaned)
     or o.booking_code = upper(v_cleaned)
     or t.id::text = lower(v_cleaned))
  order by (case when t.checked_in_at is null then 0 else 1 end), t.created_at asc, t.id asc
  limit 1
  for update of t;

  if not found then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      null, p_cinema_id, null, null, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'code', 'TICKET_NOT_FOUND',
      'message', 'Không tìm thấy vé tương ứng'
    );
  end if;

  -- 2.3. Thứ tự kiểm tra:
  -- BƯỚC 1: Kiểm rạp trước (AC-13, R-99, R-102)
  -- Sai rạp chỉ trả về tên + địa chỉ rạp đúng, KHÔNG lộ PII (tên khách, ghế...)
  if v_ticket.showtime_cinema_id <> p_cinema_id then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'WRONG_CINEMA', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'WRONG_CINEMA',
      'result', 'WRONG_CINEMA',
      'message', 'Vé thuộc rạp khác',
      'correct_cinema_id', v_ticket.showtime_cinema_id,
      'correct_cinema_code', v_ticket.cinema_code,
      'correct_cinema_name', v_ticket.cinema_name,
      'correct_cinema_address', v_ticket.cinema_address
    );
  end if;

  -- BƯỚC 2: Kiểm suất huỷ / đơn affected / vé bị huỷ (R-101)
  if v_ticket.showtime_status = 'CANCELLED'
     or v_ticket.order_status in ('affected', 'cancelled', 'refunded_manual', 'exchanged') then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'AFFECTED', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'CANCELLED',
      'result', 'AFFECTED',
      'message', 'Suất chiếu hoặc đơn vé đã bị huỷ / ảnh hưởng',
      'order_status', v_ticket.order_status,
      'showtime_status', v_ticket.showtime_status
    );
  end if;

  -- BƯỚC 3: Kiểm vé đã dùng (AC-12, R-98)
  if v_ticket.checked_in_at is not null then
    select coalesce(p.full_name, 'Nhân viên')
    into v_first_staff_name
    from public.profiles p
    where p.id = v_ticket.checked_in_by;

    if v_first_staff_name is null then
      v_first_staff_name := 'Nhân viên';
    end if;

    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'ALREADY_USED', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'USED',
      'result', 'ALREADY_USED',
      'message', 'Vé đã được sử dụng',
      'checked_in_at', v_ticket.checked_in_at,
      'checked_in_by_name', v_first_staff_name,
      'staff_name', v_first_staff_name
    );
  end if;

  -- BƯỚC 4: Kiểm cửa sổ thời gian soát vé (R-99, R-102, #11)
  -- Hết hạn: quá starts_at + duration_minutes
  v_showtime_end := v_ticket.starts_at + make_interval(mins => coalesce(v_ticket.duration_minutes, 120));
  if v_now > v_showtime_end then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'OUTSIDE_WINDOW', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'EXPIRED',
      'result', 'OUTSIDE_WINDOW',
      'message', 'Suất chiếu đã kết thúc (quá thời lượng phim)',
      'starts_at', v_ticket.starts_at,
      'expired_at', v_showtime_end
    );
  end if;

  -- Quá sớm: trước starts_at - 30 minutes
  if v_now < (v_ticket.starts_at - interval '30 minutes') then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'OUTSIDE_WINDOW', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'TOO_EARLY',
      'result', 'OUTSIDE_WINDOW',
      'message', 'Chưa đến giờ soát vé (chỉ mở trước giờ chiếu 30 phút)',
      'starts_at', v_ticket.starts_at
    );
  end if;

  -- BƯỚC 5: Kiểm trạng thái đơn hàng (phải là paid hoặc checked_in)
  if v_ticket.order_status not in ('paid', 'checked_in') then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'message', 'Đơn hàng chưa được thanh toán thành công',
      'order_status', v_ticket.order_status
    );
  end if;

  -- BƯỚC 6: Hợp lệ -> Check-in thành công
  update public.tickets
  set checked_in_at = v_now,
      checked_in_by = v_staff_id
  where id = v_ticket.ticket_id;

  if v_ticket.order_status = 'paid' then
    update public.orders
    set status = 'checked_in'
    where id = v_ticket.order_id;
  end if;

  insert into public.checkin_logs (
    ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
  ) values (
    v_ticket.ticket_id, p_cinema_id, v_ticket.showtime_cinema_id, v_ticket.showtime_id, 'SUCCESS', v_staff_id, v_now
  );

  return jsonb_build_object(
    'status', 'OK',
    'result', 'SUCCESS',
    'message', 'Soát vé thành công',
    'ticket_id', v_ticket.ticket_id,
    'order_id', v_ticket.order_id,
    'booking_code', v_ticket.booking_code,
    'movie_title', v_ticket.movie_title,
    'cinema_name', v_ticket.cinema_name,
    'room_name', v_ticket.room_name,
    'seat_label', v_ticket.seat_label,
    'seat_type', v_ticket.seat_type,
    'starts_at', v_ticket.starts_at,
    'checked_in_at', v_now
  );
end;
$$;

revoke all on function public.checkin_ticket(text, uuid, uuid) from public, anon;
grant execute on function public.checkin_ticket(text, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. View & RPC Báo cáo 1: Doanh thu theo ngày / rạp / kênh (R-112)
-- ---------------------------------------------------------------------------
create or replace view public.v_report_revenue_daily
with (security_invoker = true)
as
with order_summary as (
  select
    (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date as report_date,
    o.cinema_id,
    o.channel,
    o.id as order_id,
    o.subtotal_amount,
    o.discount_amount,
    o.total_amount,
    count(t.id) as ticket_count
  from public.orders o
  left join public.tickets t on t.order_id = o.id
  where o.status in ('paid', 'checked_in')
  group by
    (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
    o.cinema_id,
    o.channel,
    o.id,
    o.subtotal_amount,
    o.discount_amount,
    o.total_amount
)
select
  os.report_date,
  os.cinema_id,
  c.code as cinema_code,
  c.name as cinema_name,
  os.channel,
  count(distinct os.order_id)::bigint as total_orders,
  coalesce(sum(os.ticket_count), 0)::bigint as total_tickets,
  coalesce(sum(os.subtotal_amount), 0)::bigint as gross_revenue,
  coalesce(sum(os.discount_amount), 0)::bigint as total_discount,
  coalesce(sum(os.total_amount), 0)::bigint as net_revenue
from order_summary os
join public.cinemas c on c.id = os.cinema_id
group by
  os.report_date,
  os.cinema_id,
  c.code,
  c.name,
  os.channel;

create or replace function public.report_revenue(
  p_cinema_id uuid default null,
  p_from_date date default null,
  p_to_date date default null,
  p_channel public.order_channel default null
)
returns table (
  report_date date,
  cinema_id uuid,
  cinema_code text,
  cinema_name text,
  channel public.order_channel,
  total_orders bigint,
  total_tickets bigint,
  gross_revenue bigint,
  total_discount bigint,
  net_revenue bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_cinema_id is not null then
    if not public.has_cinema_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  end if;

  return query
  select
    r.report_date,
    r.cinema_id,
    r.cinema_code,
    r.cinema_name,
    r.channel,
    r.total_orders,
    r.total_tickets,
    r.gross_revenue,
    r.total_discount,
    r.net_revenue
  from public.v_report_revenue_daily r
  where (p_cinema_id is null or r.cinema_id = p_cinema_id)
    and (p_from_date is null or r.report_date >= p_from_date)
    and (p_to_date is null or r.report_date <= p_to_date)
    and (p_channel is null or r.channel = p_channel)
    and (public.is_admin() or public.has_cinema_scope(r.cinema_id))
  order by r.report_date desc, r.cinema_code asc, r.channel asc;
end;
$$;

revoke all on function public.report_revenue(uuid, date, date, public.order_channel) from public, anon;
grant execute on function public.report_revenue(uuid, date, date, public.order_channel) to authenticated, service_role;
grant select on public.v_report_revenue_daily to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. View & RPC Báo cáo 2: Doanh thu & lấp đầy theo phim / suất / rạp (R-113)
-- ---------------------------------------------------------------------------
create or replace view public.v_report_showtime_sales
with (security_invoker = true)
as
select
  s.id as showtime_id,
  s.cinema_id,
  c.code as cinema_code,
  c.name as cinema_name,
  s.movie_id,
  m.title_vi as movie_title,
  s.room_id,
  r.name as room_name,
  s.starts_at,
  s.ends_at,
  s.format,
  s.status as showtime_status,
  coalesce(cap.capacity, 0)::bigint as room_capacity,
  coalesce(sales.sold_seats, 0)::bigint as sold_seats,
  case
    when coalesce(cap.capacity, 0) > 0 then
      round((coalesce(sales.sold_seats, 0)::numeric / cap.capacity::numeric) * 100, 2)
    else 0
  end as occupancy_rate,
  coalesce(rev.net_revenue, 0)::bigint as net_revenue
from public.showtimes s
join public.cinemas c on c.id = s.cinema_id
join public.rooms r on r.id = s.room_id
join public.movies m on m.id = s.movie_id
left join lateral (
  select count(*)::bigint as capacity
  from public.seats st
  where st.room_id = s.room_id
    and st.seat_type not in ('AISLE', 'BROKEN')
) cap on true
left join lateral (
  select count(t.id)::bigint as sold_seats
  from public.tickets t
  join public.orders o on o.id = t.order_id
  where t.showtime_id = s.id and o.status in ('paid', 'checked_in')
) sales on true
left join lateral (
  select coalesce(sum(o.total_amount), 0)::bigint as net_revenue
  from public.orders o
  where o.showtime_id = s.id and o.status in ('paid', 'checked_in')
) rev on true;

create or replace function public.report_by_movie_showtime(
  p_cinema_id uuid default null,
  p_movie_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  showtime_id uuid,
  cinema_id uuid,
  cinema_code text,
  cinema_name text,
  movie_id uuid,
  movie_title text,
  room_id uuid,
  room_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  format public.screen_format,
  showtime_status public.showtime_status,
  room_capacity bigint,
  sold_seats bigint,
  occupancy_rate numeric,
  net_revenue bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_cinema_id is not null then
    if not public.has_cinema_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  end if;

  return query
  select
    v.showtime_id,
    v.cinema_id,
    v.cinema_code,
    v.cinema_name,
    v.movie_id,
    v.movie_title,
    v.room_id,
    v.room_name,
    v.starts_at,
    v.ends_at,
    v.format,
    v.showtime_status,
    v.room_capacity,
    v.sold_seats,
    v.occupancy_rate,
    v.net_revenue
  from public.v_report_showtime_sales v
  where (p_cinema_id is null or v.cinema_id = p_cinema_id)
    and (p_movie_id is null or v.movie_id = p_movie_id)
    and (p_from_date is null or (v.starts_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from_date)
    and (p_to_date is null or (v.starts_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to_date)
    and (public.is_admin() or public.has_cinema_scope(v.cinema_id))
  order by v.starts_at desc, v.cinema_code asc;
end;
$$;

revoke all on function public.report_by_movie_showtime(uuid, uuid, date, date) from public, anon;
grant execute on function public.report_by_movie_showtime(uuid, uuid, date, date) to authenticated, service_role;
grant select on public.v_report_showtime_sales to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. View & RPC Báo cáo 3: Đối soát PayOS (R-116, R-134)
-- Phát hiện đơn lệch tiền, thanh toán pending quá hạn, đơn needs_manual_review
-- ---------------------------------------------------------------------------
create or replace view public.v_report_payos_reconciliation
with (security_invoker = true)
as
select
  p.id as payment_id,
  p.order_id,
  p.cinema_id,
  c.code as cinema_code,
  c.name as cinema_name,
  p.order_code,
  p.amount as payment_amount,
  o.total_amount as order_total_amount,
  p.status as payment_status,
  o.status as order_status,
  p.transaction_ref,
  case
    when p.status = 'PAID' and p.amount <> o.total_amount then 'AMOUNT_MISMATCH'
    when o.status = 'needs_manual_review' then 'NEEDS_MANUAL_REVIEW'
    when (p.status = 'PAID' and o.status in ('expired', 'cancelled'))
      or (p.status in ('CANCELLED', 'FAILED') and o.status in ('paid', 'checked_in')) then 'STATUS_MISMATCH'
    when p.status = 'PENDING' and (p.created_at < now() - interval '15 minutes' or (o.hold_expires_at is not null and o.hold_expires_at < now())) then 'PENDING_EXPIRED'
    else 'OTHER_DISCREPANCY'
  end as discrepancy_type,
  p.created_at as payment_created_at,
  o.created_at as order_created_at
from public.payments p
join public.orders o on o.id = p.order_id
join public.cinemas c on c.id = p.cinema_id
where (p.status = 'PAID' and p.amount <> o.total_amount)
   or o.status = 'needs_manual_review'
   or ((p.status = 'PAID' and o.status in ('expired', 'cancelled')) or (p.status in ('CANCELLED', 'FAILED') and o.status in ('paid', 'checked_in')))
   or (p.status = 'PENDING' and (p.created_at < now() - interval '15 minutes' or (o.hold_expires_at is not null and o.hold_expires_at < now())));

create or replace function public.report_payos_reconciliation(
  p_cinema_id uuid default null
)
returns table (
  payment_id uuid,
  order_id uuid,
  cinema_id uuid,
  cinema_code text,
  cinema_name text,
  order_code bigint,
  payment_amount integer,
  order_total_amount integer,
  payment_status public.payment_status,
  order_status public.order_status,
  transaction_ref text,
  discrepancy_type text,
  payment_created_at timestamptz,
  order_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_cinema_id is not null then
    if not public.has_cinema_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  end if;

  return query
  select
    r.payment_id,
    r.order_id,
    r.cinema_id,
    r.cinema_code,
    r.cinema_name,
    r.order_code,
    r.payment_amount,
    r.order_total_amount,
    r.payment_status,
    r.order_status,
    r.transaction_ref,
    r.discrepancy_type,
    r.payment_created_at,
    r.order_created_at
  from public.v_report_payos_reconciliation r
  where (p_cinema_id is null or r.cinema_id = p_cinema_id)
    and (public.is_admin() or public.has_cinema_scope(r.cinema_id))
  order by r.payment_created_at desc;
end;
$$;

revoke all on function public.report_payos_reconciliation(uuid) from public, anon;
grant execute on function public.report_payos_reconciliation(uuid) to authenticated, service_role;
grant select on public.v_report_payos_reconciliation to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. View & RPC Báo cáo 4: Suất bị huỷ & đơn ảnh hưởng (MVP lát của R-119)
-- ---------------------------------------------------------------------------
create or replace view public.v_report_cancelled_showtimes
with (security_invoker = true)
as
select
  s.id as showtime_id,
  s.cinema_id,
  c.code as cinema_code,
  c.name as cinema_name,
  m.title_vi as movie_title,
  r.name as room_name,
  s.starts_at,
  s.ends_at,
  s.status as showtime_status,
  coalesce(aff.total_affected_orders, 0)::bigint as total_affected_orders,
  coalesce(aff.exchanged_orders, 0)::bigint as exchanged_orders,
  coalesce(aff.refunded_manual_orders, 0)::bigint as refunded_manual_orders,
  coalesce(aff.pending_orders, 0)::bigint as pending_orders,
  coalesce(rf.total_refunded_amount, 0)::bigint as total_refunded_amount
from public.showtimes s
join public.cinemas c on c.id = s.cinema_id
join public.rooms r on r.id = s.room_id
join public.movies m on m.id = s.movie_id
left join lateral (
  select
    count(distinct o.id) filter (where o.status in ('affected', 'exchanged', 'refunded_manual')) as total_affected_orders,
    count(distinct o.id) filter (where o.status = 'exchanged') as exchanged_orders,
    count(distinct o.id) filter (where o.status = 'refunded_manual') as refunded_manual_orders,
    count(distinct o.id) filter (where o.status = 'affected') as pending_orders
  from public.orders o
  where o.showtime_id = s.id
) aff on true
left join lateral (
  select coalesce(sum(aoa.refunded_amount), 0)::bigint as total_refunded_amount
  from public.affected_order_actions aoa
  join public.orders o on o.id = aoa.order_id
  where o.showtime_id = s.id and aoa.action = 'REFUNDED_MANUAL'
) rf on true
where s.status = 'CANCELLED' or coalesce(aff.total_affected_orders, 0) > 0;

create or replace function public.report_cancelled_showtimes(
  p_cinema_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  showtime_id uuid,
  cinema_id uuid,
  cinema_code text,
  cinema_name text,
  movie_title text,
  room_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  showtime_status public.showtime_status,
  total_affected_orders bigint,
  exchanged_orders bigint,
  refunded_manual_orders bigint,
  pending_orders bigint,
  total_refunded_amount bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_cinema_id is not null then
    if not public.has_cinema_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  end if;

  return query
  select
    v.showtime_id,
    v.cinema_id,
    v.cinema_code,
    v.cinema_name,
    v.movie_title,
    v.room_name,
    v.starts_at,
    v.ends_at,
    v.showtime_status,
    v.total_affected_orders,
    v.exchanged_orders,
    v.refunded_manual_orders,
    v.pending_orders,
    v.total_refunded_amount
  from public.v_report_cancelled_showtimes v
  where (p_cinema_id is null or v.cinema_id = p_cinema_id)
    and (p_from_date is null or (v.starts_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from_date)
    and (p_to_date is null or (v.starts_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to_date)
    and (public.is_admin() or public.has_cinema_scope(v.cinema_id))
  order by v.starts_at desc, v.cinema_code asc;
end;
$$;

revoke all on function public.report_cancelled_showtimes(uuid, date, date) from public, anon;
grant execute on function public.report_cancelled_showtimes(uuid, date, date) to authenticated, service_role;
grant select on public.v_report_cancelled_showtimes to authenticated, service_role;
