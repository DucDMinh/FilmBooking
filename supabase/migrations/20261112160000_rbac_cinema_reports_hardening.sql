-- ============================================================================
-- Migration: 20261112160000_rbac_cinema_reports_hardening.sql
-- bug-layer34-review phase-2 task-05 (M7, R-32, AC-26, §5.3)
--   1. set_cinema_status chỉ dành cho Admin (hoặc service_role).
--      Manager không có quyền đóng/mở rạp (R-32, AC-26) -> chặn 42501 FORBIDDEN_ADMIN_REQUIRED.
--   2. Tách helper scope:
--      - public.has_cinema_scope(p_cinema_id): giữ nguyên cho check-in (STAFF + MANAGER).
--      - public.has_cinema_manager_scope(p_cinema_id): helper mới cho báo cáo (chỉ MANAGER, Admin, service_role).
--   3. 4 view v_report_* cập nhật WHERE: chỉ Admin hoặc Manager rạp đó mới thấy dữ liệu; Staff thấy 0 dòng.
--   4. 4 RPC báo cáo: kiểm tra public.has_cinema_manager_scope(p_cinema_id), chặn Staff 42501 FORBIDDEN_CINEMA_SCOPE.
--   5. Cấp quyền: revoke public/anon; grant execute/select cho authenticated, service_role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: set_cinema_status (chỉ dành cho Admin / service_role)
-- ---------------------------------------------------------------------------
create or replace function public.set_cinema_status(
  p_cinema_id uuid,
  p_status public.cinema_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_caller_admin boolean;
  v_cinema record;
  v_active_sold_showtimes uuid[];
  v_count integer;
begin
  if p_cinema_id is null or p_status is null then
    raise exception 'INVALID_ARGUMENTS: cinema_id và status là bắt buộc' using errcode = '22023';
  end if;

  select id, code, name, status into v_cinema
  from public.cinemas
  where id = p_cinema_id
  for update;

  if not found then
    raise exception 'CINEMA_NOT_FOUND: Rạp không tồn tại' using errcode = 'P0002';
  end if;

  v_is_caller_admin := (select auth.role()) = 'service_role'
    or public.is_admin()
    or (
      nullif(current_setting('request.jwt.claims', true), '') is null
      and session_user in ('postgres', 'supabase_admin')
    );

  if not v_is_caller_admin then
    raise exception 'FORBIDDEN_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  -- AC-26 (R-33): Nếu p_status in ('TEMP_CLOSED', 'CLOSED')
  if p_status in ('TEMP_CLOSED', 'CLOSED') then
    select array_agg(st.id) into v_active_sold_showtimes
    from public.showtimes st
    where st.cinema_id = p_cinema_id
      and st.starts_at > now()
      and st.status <> 'CANCELLED'
      and (
        exists (
          select 1 from public.showtime_seat_states sss
          where sss.showtime_id = st.id and sss.state = 'SOLD'
        )
        or exists (
          select 1 from public.orders o
          where o.showtime_id = st.id and o.status in ('paid', 'checked_in')
        )
      );

    v_count := coalesce(cardinality(v_active_sold_showtimes), 0);
    if v_count > 0 then
      raise exception 'CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES: Rạp còn % suất chiếu tương lai đã bán vé (%)',
        v_count,
        array_to_string(v_active_sold_showtimes, ', ')
        using errcode = '23514',
              detail = array_to_json(v_active_sold_showtimes)::text,
              hint = 'Bắt buộc huỷ các suất chiếu này qua cancel_showtimes trước khi đổi trạng thái rạp.';
    end if;
  end if;

  update public.cinemas
  set status = p_status,
      updated_at = now()
  where id = p_cinema_id;

  return jsonb_build_object(
    'success', true,
    'cinema_id', p_cinema_id,
    'status', p_status
  );
end;
$$;

revoke all on function public.set_cinema_status(uuid, public.cinema_status) from public, anon;
grant execute on function public.set_cinema_status(uuid, public.cinema_status) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Helper function: has_cinema_manager_scope (dành riêng cho báo cáo & quản lý cấp cao)
-- ---------------------------------------------------------------------------
create or replace function public.has_cinema_manager_scope(p_cinema_id uuid)
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
    or (p_cinema_id is not null and public.has_cinema_role(p_cinema_id, array['MANAGER']::public.staff_role[]))
  );
$$;

revoke all on function public.has_cinema_manager_scope(uuid) from public, anon;
grant execute on function public.has_cinema_manager_scope(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Cập nhật 4 View Báo cáo (loại trừ STAFF, chỉ Admin hoặc Manager rạp)
-- ---------------------------------------------------------------------------

-- View 1: v_report_revenue_daily
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
where (public.is_admin() or public.has_cinema_manager_scope(os.cinema_id))
group by
  os.report_date,
  os.cinema_id,
  c.code,
  c.name,
  os.channel;

grant select on public.v_report_revenue_daily to authenticated, service_role;

-- View 2: v_report_showtime_sales
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
) rev on true
where (public.is_admin() or public.has_cinema_manager_scope(s.cinema_id));

grant select on public.v_report_showtime_sales to authenticated, service_role;

-- View 3: v_report_payos_reconciliation
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
where ((p.status = 'PAID' and p.amount <> o.total_amount)
   or o.status = 'needs_manual_review'
   or ((p.status = 'PAID' and o.status in ('expired', 'cancelled')) or (p.status in ('CANCELLED', 'FAILED') and o.status in ('paid', 'checked_in')))
   or (p.status = 'PENDING' and (p.created_at < now() - interval '15 minutes' or (o.hold_expires_at is not null and o.hold_expires_at < now()))))
  and (public.is_admin() or public.has_cinema_manager_scope(p.cinema_id));

grant select on public.v_report_payos_reconciliation to authenticated, service_role;

-- View 4: v_report_cancelled_showtimes
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
where (s.status = 'CANCELLED' or coalesce(aff.total_affected_orders, 0) > 0)
  and (public.is_admin() or public.has_cinema_manager_scope(s.cinema_id));

grant select on public.v_report_cancelled_showtimes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Cập nhật 4 Hàm RPC Báo cáo (kiểm tra has_cinema_manager_scope)
-- ---------------------------------------------------------------------------

-- RPC 1: report_revenue
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
    if not public.has_cinema_manager_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  else
    if not (
      (select auth.role()) = 'service_role'
      or (nullif(current_setting('request.jwt.claims', true), '') is null and (select session_user) in ('postgres', 'supabase_admin'))
      or public.is_admin()
      or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id = auth.uid() and sa.role = 'MANAGER'
      )
    ) then
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
    and (public.is_admin() or public.has_cinema_manager_scope(r.cinema_id))
  order by r.report_date desc, r.cinema_code asc, r.channel asc;
end;
$$;

revoke all on function public.report_revenue(uuid, date, date, public.order_channel) from public, anon;
grant execute on function public.report_revenue(uuid, date, date, public.order_channel) to authenticated, service_role;

-- RPC 2: report_by_movie_showtime
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
    if not public.has_cinema_manager_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  else
    if not (
      (select auth.role()) = 'service_role'
      or (nullif(current_setting('request.jwt.claims', true), '') is null and (select session_user) in ('postgres', 'supabase_admin'))
      or public.is_admin()
      or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id = auth.uid() and sa.role = 'MANAGER'
      )
    ) then
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
    and (public.is_admin() or public.has_cinema_manager_scope(v.cinema_id))
  order by v.starts_at desc, v.cinema_code asc;
end;
$$;

revoke all on function public.report_by_movie_showtime(uuid, uuid, date, date) from public, anon;
grant execute on function public.report_by_movie_showtime(uuid, uuid, date, date) to authenticated, service_role;

-- RPC 3: report_payos_reconciliation
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
    if not public.has_cinema_manager_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  else
    if not (
      (select auth.role()) = 'service_role'
      or (nullif(current_setting('request.jwt.claims', true), '') is null and (select session_user) in ('postgres', 'supabase_admin'))
      or public.is_admin()
      or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id = auth.uid() and sa.role = 'MANAGER'
      )
    ) then
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
    and (public.is_admin() or public.has_cinema_manager_scope(r.cinema_id))
  order by r.payment_created_at desc;
end;
$$;

revoke all on function public.report_payos_reconciliation(uuid) from public, anon;
grant execute on function public.report_payos_reconciliation(uuid) to authenticated, service_role;

-- RPC 4: report_cancelled_showtimes
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
    if not public.has_cinema_manager_scope(p_cinema_id) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  else
    if not (
      (select auth.role()) = 'service_role'
      or (nullif(current_setting('request.jwt.claims', true), '') is null and (select session_user) in ('postgres', 'supabase_admin'))
      or public.is_admin()
      or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id = auth.uid() and sa.role = 'MANAGER'
      )
    ) then
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
    and (public.is_admin() or public.has_cinema_manager_scope(v.cinema_id))
  order by v.starts_at desc, v.cinema_code asc;
end;
$$;

revoke all on function public.report_cancelled_showtimes(uuid, date, date) from public, anon;
grant execute on function public.report_cancelled_showtimes(uuid, date, date) to authenticated, service_role;
