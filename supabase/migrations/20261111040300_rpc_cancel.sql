-- Migration: 20261111040300_rpc_cancel.sql
-- Layer 4 / Task 04: RPC huỷ suất chiếu hàng loạt + chặn đóng rạp còn suất đã bán (R-33, R-108, R-109, R-110, R-127, R-134, AC-24, AC-26)

-- 1. Cột mở rộng trên showtimes
alter table public.showtimes
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

-- 2. Cột mở rộng trên orders
alter table public.orders
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists counter_contact boolean not null default false;

-- 3. Bảng affected_order_cases (R-108, R-109, R-110, AC-24)
create table if not exists public.affected_order_cases (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  showtime_id     uuid not null references public.showtimes (id) on delete cascade,
  cinema_id       uuid not null references public.cinemas (id) on delete cascade,
  reason          text not null,
  counter_contact boolean not null default false,
  email_sent      boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (order_id)
);

create index if not exists affected_order_cases_cinema_idx on public.affected_order_cases (cinema_id, created_at desc);
create index if not exists affected_order_cases_showtime_idx on public.affected_order_cases (showtime_id);

alter table public.affected_order_cases enable row level security;
grant select on public.affected_order_cases to authenticated;

drop policy if exists affected_order_cases_select on public.affected_order_cases;
create policy affected_order_cases_select on public.affected_order_cases for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
    or (order_id in (select id from public.orders where user_id = (select auth.uid())))
  );

-- 4. RPC: preview_cancel_showtimes (R-108, AC-24)
create or replace function public.preview_cancel_showtimes(p_showtime_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_caller_admin boolean;
  v_res jsonb;
begin
  if p_showtime_ids is null or cardinality(p_showtime_ids) = 0 then
    return jsonb_build_object(
      'showtimes_count', 0,
      'paid_orders_count', 0,
      'web_paid_orders_count', 0,
      'pos_paid_orders_count', 0,
      'holding_orders_count', 0,
      'sold_seats_count', 0,
      'held_seats_count', 0,
      'total_refund_amount', 0
    );
  end if;

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

  select jsonb_build_object(
    'showtimes_count', (
      select count(distinct st.id)::int
      from public.showtimes st
      where st.id = any(p_showtime_ids)
    ),
    'paid_orders_count', (
      select count(*)::int
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status = 'paid'
    ),
    'web_paid_orders_count', (
      select count(*)::int
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status = 'paid'
        and o.channel = 'WEB'
    ),
    'pos_paid_orders_count', (
      select count(*)::int
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status = 'paid'
        and o.channel = 'POS'
    ),
    'holding_orders_count', (
      select count(*)::int
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status in ('holding', 'pending_payment')
    ),
    'sold_seats_count', (
      select count(*)::int
      from public.showtime_seat_states sss
      where sss.showtime_id = any(p_showtime_ids)
        and sss.state = 'SOLD'
    ),
    'held_seats_count', (
      select count(*)::int
      from public.showtime_seat_states sss
      where sss.showtime_id = any(p_showtime_ids)
        and sss.state = 'HELD'
        and (sss.expires_at is null or sss.expires_at > now())
    ),
    'total_refund_amount', (
      select coalesce(sum(o.total_amount), 0)::bigint
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status = 'paid'
    )
  ) into v_res;

  return v_res;
end;
$$;

-- 5. RPC: cancel_showtimes (R-108, R-109, R-110, R-127, R-134, AC-24)
create or replace function public.cancel_showtimes(
  p_showtime_ids uuid[],
  p_reason text,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  v_actor_id := coalesce(p_actor_id, auth.uid());
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

  -- 5.2 Nhả toàn bộ ghế HELD trên các suất chiếu này
  delete from public.showtime_seat_states
  where showtime_id = any(p_showtime_ids)
    and state = 'HELD';
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
$$;

-- 6. RPC: set_cinema_status (R-33, AC-26)
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
    if not public.has_cinema_role(p_cinema_id, array['MANAGER']::public.staff_role[]) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
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

-- 7. Quyền thực thi
revoke all on function public.preview_cancel_showtimes(uuid[]) from public, anon;
revoke all on function public.cancel_showtimes(uuid[], text, uuid) from public, anon;
revoke all on function public.set_cinema_status(uuid, public.cinema_status) from public, anon;

grant execute on function public.preview_cancel_showtimes(uuid[]) to authenticated;
grant execute on function public.cancel_showtimes(uuid[], text, uuid) to authenticated;
grant execute on function public.set_cinema_status(uuid, public.cinema_status) to authenticated;
