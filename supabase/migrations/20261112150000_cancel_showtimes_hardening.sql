-- ============================================================================
-- Migration: 20261112150000_cancel_showtimes_hardening.sql
-- bug-layer34-review phase-2 task-06 (M10c, MINOR #8; CR remove-pos: chỉ web).
--   1. Cập nhật orders_guard_transition: cho phép chuyển trạng thái 'checked_in' -> 'affected'.
--   2. preview_cancel_showtimes: tính cả đơn 'checked_in' vào paid_orders_count, web_paid_orders_count, total_refund_amount.
--   3. cancel_showtimes:
--      - Xử lý cả đơn status in ('paid', 'checked_in'): chuyển sang 'affected', lưu affected_order_cases.
--      - Email idempotent: chỉ enqueue email khi aoc.email_sent = false và chưa có trong email_outbox.
--      - Cập nhật affected_order_cases.email_sent = true sau khi enqueue.
--      - Giữ thứ tự khoá toàn cục (Global Locking Order): showtimes (FOR UPDATE) -> orders (FOR UPDATE theo ID tăng dần) -> showtime_seat_states.
--      - Giữ nguyên chữ ký, SECURITY DEFINER, search_path = '', ACL khớp 048 allowlist.
-- ============================================================================

-- 1. Cập nhật orders_guard_transition
create or replace function public.orders_guard_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_code is not null and new.booking_code not like (new.cinema_code || '-%') then
    raise exception 'Mã đặt vé phải bắt đầu bằng mã rạp' using errcode = '23514';
  end if;
  if new.channel is distinct from old.channel
     or new.showtime_id is distinct from old.showtime_id
     or new.cinema_id is distinct from old.cinema_id then
    raise exception 'Không được đổi kênh/suất/rạp của đơn' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'holding'         and new.status in ('pending_payment', 'expired', 'cancelled', 'paid', 'needs_manual_review'))
    or (old.status = 'pending_payment' and new.status in ('paid', 'cancelled', 'expired', 'needs_manual_review'))
    or (old.status in ('expired', 'cancelled') and new.status in ('paid', 'needs_manual_review'))
    or (old.status = 'paid'            and new.status in ('checked_in', 'affected'))
    or (old.status = 'checked_in'      and new.status in ('affected'))
    or (old.status = 'affected'        and new.status in ('exchanged', 'refunded_manual'))
  ) then
    raise exception 'Chuyển trạng thái đơn không hợp lệ: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.orders_guard_transition() from public, anon, authenticated;

-- 2. Cập nhật preview_cancel_showtimes
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
        and o.status in ('paid', 'checked_in')
    ),
    'web_paid_orders_count', (
      select count(*)::int
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status in ('paid', 'checked_in')
        and o.channel = 'WEB'
    ),
    'pos_paid_orders_count', (
      select count(*)::int
      from public.orders o
      where o.showtime_id = any(p_showtime_ids)
        and o.status in ('paid', 'checked_in')
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
        and o.status in ('paid', 'checked_in')
    )
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.preview_cancel_showtimes(uuid[]) from public, anon;
grant execute on function public.preview_cancel_showtimes(uuid[]) to authenticated, service_role;

-- 3. Cập nhật cancel_showtimes
create or replace function public.cancel_showtimes(
  p_showtime_ids uuid[],
  p_reason text,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- 5.1b Khoá các đơn bị ảnh hưởng (id tăng dần) TRƯỚC khi xoá seat_states (thứ tự khoá toàn cục: showtimes -> orders -> seat_states)
  perform 1 from public.orders
  where showtime_id = any(p_showtime_ids)
    and status in ('holding', 'pending_payment', 'paid', 'checked_in')
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
  order by id
  for update;

  update public.orders
  set status = 'cancelled',
      cancel_reason = p_reason,
      cancelled_at = coalesce(orders.cancelled_at, now()),
      updated_at = now()
  where showtime_id = any(p_showtime_ids)
    and status in ('holding', 'pending_payment');
  get diagnostics v_cancelled_orders = row_count;

  -- 5.4 Với các đơn paid và checked_in (cả WEB và POS) -> chuyển sang affected
  perform 1 from public.orders
  where showtime_id = any(p_showtime_ids)
    and status in ('paid', 'checked_in')
  order by id
  for update;

  update public.orders
  set status = 'affected',
      counter_contact = (channel = 'POS' and (contact_email is null or length(btrim(contact_email::text)) = 0)),
      cancel_reason = p_reason,
      cancelled_at = coalesce(orders.cancelled_at, now()),
      updated_at = now()
  where showtime_id = any(p_showtime_ids)
    and status in ('paid', 'checked_in');
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

  -- 5.6 Đồng bộ cờ email_sent nếu outbox đã có sẵn email cho đơn đó (chống out-of-sync)
  update public.affected_order_cases aoc
  set email_sent = true
  where aoc.showtime_id = any(p_showtime_ids)
    and aoc.email_sent = false
    and exists (
      select 1 from public.email_outbox eo
      where eo.kind = 'showtime_cancelled'
        and eo.payload->>'order_id' = aoc.order_id::text
    );

  -- Enqueue email IDEMPOTENT cho các đơn chưa gửi email
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
    join public.affected_order_cases aoc on aoc.order_id = o.id
    where o.showtime_id = any(p_showtime_ids)
      and o.status = 'affected'
      and aoc.email_sent = false
      and o.contact_email is not null
      and length(btrim(o.contact_email::text)) > 0
      and not exists (
        select 1 from public.email_outbox eo
        where eo.kind = 'showtime_cancelled'
          and eo.payload->>'order_id' = o.id::text
      )
    returning id, (payload->>'order_id')::uuid as order_id
  ),
  mark_sent as (
    update public.affected_order_cases aoc
    set email_sent = true
    from inserted_emails ie
    where aoc.order_id = ie.order_id
    returning aoc.id
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
