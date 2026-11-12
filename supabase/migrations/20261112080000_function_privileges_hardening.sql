-- ============================================================================
-- Migration: 20261112080000_function_privileges_hardening.sql
-- bug-layer34-review P0-08 (gộp K7, CRITICAL): siết EXECUTE của hàm schema public.
--
-- Vấn đề: các migration cũ chỉ `revoke ... from public, anon`, nhưng Supabase cấp sẵn
-- EXECUTE cho anon/authenticated/service_role qua default privileges (pg_default_acl) cho mọi hàm
-- postgres tạo trong schema public -> mọi user đăng nhập gọi được qua /rest/v1/rpc/...:
--   * record_payment_event / mark_payment_cancelled / confirm_pos_sale: KHÔNG kiểm người gọi
--     (ghi sự kiện thanh toán giả, huỷ đơn người khác, chốt bán POS).
--   * generate_booking_code, trigger function (guard_identity_insert, on_identity_change,
--     set_updated_at; hai hàm đầu còn mở cho cả anon qua PUBLIC): không cần client gọi.
--   * apply_voucher_core / remove_voucher: kiểm chủ đơn bỏ qua đơn user_id null.
--   * cancel_showtimes: manager giả mạo cancelled_by qua p_actor_id.
--
-- Bảng quyền đầy đủ: tasks/bug-layer34-review/phase-1-task-08.md. Nguyên tắc:
--   service_role qua API (webhook/POS/job)  -> chỉ service_role
--   trigger / helper nội bộ                  -> không client role nào
--   RPC API gọi bằng forUser(jwt) + helper RLS -> authenticated, thân hàm fail-closed
--   anon                                     -> chỉ price_quote (SECURITY INVOKER, catalog công khai)
-- Migration additive: không sửa migration đã apply; CREATE OR REPLACE giữ nguyên chữ ký/ACL.
-- ============================================================================

-- 1. Chỉ service_role (API admin client: webhook PayOS, POS API key, job)
revoke all on function public.record_payment_event(bigint, text, integer, text, boolean, timestamptz, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_payment_event(bigint, text, integer, text, boolean, timestamptz, uuid, uuid)
  to service_role;

revoke all on function public.mark_payment_cancelled(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_cancelled(uuid, text) to service_role;

revoke all on function public.confirm_pos_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_pos_sale(uuid, text) to service_role;

-- generate_booking_code chỉ được gọi từ trong hàm definer (hold_seats/confirm_paid/confirm_pos_sale)
revoke all on function public.generate_booking_code(text) from public, anon, authenticated;
grant execute on function public.generate_booking_code(text) to service_role;

-- 2. Trigger function: EXECUTE chỉ kiểm tra lúc CREATE TRIGGER, client không cần
revoke all on function public.guard_identity_insert() from public, anon, authenticated;
revoke all on function public.on_identity_change() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- 3. Sequence mã đơn nội bộ: chỉ dùng trong hàm definer, client không được đốt
revoke all on sequence public.internal_payment_order_code_seq from public, anon, authenticated;
grant usage, select on sequence public.internal_payment_order_code_seq to service_role;

-- 4. Hàm giữ authenticated nhưng thân hàm thiếu kiểm quyền: CREATE OR REPLACE từ định nghĩa live

CREATE OR REPLACE FUNCTION public.apply_voucher_core(p_order_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid         uuid;
  v_order       public.orders%rowtype;
  v_voucher     public.vouchers%rowtype;
  v_movie_id    uuid;
  v_total_used  integer;
  v_user_used   integer;
  v_discount    integer;
  v_total       integer;
  v_clean_code  text;
begin
  if p_order_id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_clean_code := upper(btrim(coalesce(p_code, '')));
  if v_clean_code = '' then
    raise exception 'VOUCHER_INVALID' using errcode = 'P0001';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_uid := auth.uid();
  -- P0-08: fail-closed cho client role. Trước đây `v_order.user_id is not null` khiến đơn không chủ
  -- (POS không khách / user đã xoá) cho MỌI user đăng nhập thao tác. Nay: không phải chủ đơn ->
  -- chỉ Admin hoặc Staff/Manager đúng rạp của đơn. service_role / owner (uid null, role khác authenticated) giữ nguyên.
  if (v_uid is not null or coalesce(auth.role(), '') = 'authenticated')
     and (v_uid is null or v_order.user_id is distinct from v_uid)
     and not public.is_admin()
     and not public.has_cinema_role(v_order.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_order.status not in ('holding', 'pending_payment') then
    raise exception 'ORDER_NOT_HOLDING' using errcode = 'P0001';
  end if;

  if v_order.hold_expires_at is not null and v_order.hold_expires_at < now() then
    raise exception 'ORDER_EXPIRED' using errcode = 'P0001';
  end if;

  -- Tối đa 1 voucher / đơn (R-92)
  if v_order.voucher_id is not null or exists (
    select 1
      from public.voucher_redemptions vr
     where vr.order_id = p_order_id
       and vr.status in ('HELD', 'CONSUMED')
  ) then
    raise exception 'VOUCHER_ALREADY_APPLIED' using errcode = 'P0001';
  end if;

  -- Tìm voucher và khoá hàng FOR UPDATE để serialize đếm lượt (R-93)
  select * into v_voucher
    from public.vouchers v
   where upper(btrim(v.code::text)) = v_clean_code
     for update;

  if not found or not v_voucher.active then
    raise exception 'VOUCHER_INVALID' using errcode = 'P0001';
  end if;

  if (v_voucher.valid_from is not null and v_voucher.valid_from > now())
     or (v_voucher.valid_to is not null and v_voucher.valid_to < now()) then
    raise exception 'VOUCHER_EXPIRED' using errcode = 'P0001';
  end if;

  if v_voucher.movie_id is not null then
    select s.movie_id into v_movie_id
      from public.showtimes s
     where s.id = v_order.showtime_id;
    if v_movie_id is distinct from v_voucher.movie_id then
      raise exception 'VOUCHER_NOT_APPLICABLE' using errcode = 'P0001';
    end if;
  end if;

  if v_order.subtotal_amount < v_voucher.min_order_amount then
    raise exception 'VOUCHER_MIN_NOT_MET' using errcode = 'P0001';
  end if;

  if v_voucher.total_uses_limit is not null then
    select count(*) into v_total_used
      from public.voucher_redemptions vr
     where vr.voucher_id = v_voucher.id
       and vr.status in ('HELD', 'CONSUMED');

    if v_total_used >= v_voucher.total_uses_limit then
      raise exception 'VOUCHER_EXHAUSTED' using errcode = 'P0001';
    end if;
  end if;

  if v_voucher.per_user_limit is not null and v_order.user_id is not null then
    select count(*) into v_user_used
      from public.voucher_redemptions vr
     where vr.voucher_id = v_voucher.id
       and vr.user_id = v_order.user_id
       and vr.status in ('HELD', 'CONSUMED');

    if v_user_used >= v_voucher.per_user_limit then
      raise exception 'VOUCHER_USER_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if v_voucher.discount_type = 'PERCENT' then
    v_discount := round((v_order.subtotal_amount::numeric * v_voucher.discount_value::numeric) / 100.0)::integer;
    if v_voucher.max_discount is not null and v_discount > v_voucher.max_discount then
      v_discount := v_voucher.max_discount;
    end if;
  else
    v_discount := v_voucher.discount_value;
  end if;

  if v_discount > v_order.subtotal_amount then
    v_discount := v_order.subtotal_amount;
  end if;
  if v_discount < 0 then
    v_discount := 0;
  end if;

  v_total := v_order.subtotal_amount - v_discount;

  insert into public.voucher_redemptions (
    voucher_id, order_id, user_id, discount_amount, status
  ) values (
    v_voucher.id, p_order_id, v_order.user_id, v_discount, 'HELD'
  )
  on conflict (order_id) do update set
    voucher_id = excluded.voucher_id,
    user_id = excluded.user_id,
    discount_amount = excluded.discount_amount,
    status = 'HELD',
    updated_at = now();

  update public.orders
     set voucher_id = v_voucher.id,
         discount_amount = v_discount,
         total_amount = v_total,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'voucher_id', v_voucher.id,
    'code', v_voucher.code::text,
    'subtotal_amount', v_order.subtotal_amount,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'subtotal_vnd', v_order.subtotal_amount,
    'discount_vnd', v_discount,
    'final_vnd', v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_voucher(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid;
  v_order public.orders%rowtype;
begin
  if p_order_id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_uid := auth.uid();
  -- P0-08: fail-closed cho client role. Trước đây `v_order.user_id is not null` khiến đơn không chủ
  -- (POS không khách / user đã xoá) cho MỌI user đăng nhập thao tác. Nay: không phải chủ đơn ->
  -- chỉ Admin hoặc Staff/Manager đúng rạp của đơn. service_role / owner (uid null, role khác authenticated) giữ nguyên.
  if (v_uid is not null or coalesce(auth.role(), '') = 'authenticated')
     and (v_uid is null or v_order.user_id is distinct from v_uid)
     and not public.is_admin()
     and not public.has_cinema_role(v_order.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_order.status not in ('holding', 'pending_payment') then
    raise exception 'ORDER_NOT_HOLDING' using errcode = 'P0001';
  end if;

  -- Giải phóng lượt giữ
  update public.voucher_redemptions
     set status = 'RELEASED',
         updated_at = now()
   where order_id = p_order_id
     and status = 'HELD';

  -- Cập nhật đơn
  update public.orders
     set voucher_id = null,
         discount_amount = 0,
         total_amount = subtotal_amount,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'voucher_id', null,
    'code', null,
    'subtotal_amount', v_order.subtotal_amount,
    'discount_amount', 0,
    'total_amount', v_order.subtotal_amount,
    'subtotal_vnd', v_order.subtotal_amount,
    'discount_vnd', 0,
    'final_vnd', v_order.subtotal_amount
  );
end;
$function$;

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
$function$;

-- 5. Default privileges: hàm postgres tạo SAU này không tự mở EXECUTE.
-- PUBLIC là default tích hợp (không có dòng per-schema) nên phải revoke ở mức global (không IN SCHEMA);
-- anon/authenticated là entry per-schema của Supabase nên revoke IN SCHEMA public.
-- service_role giữ default (API admin client). Hệ quả: migration sau muốn client gọi hàm phải GRANT tường minh
-- và thêm hàm đó vào allowlist trong supabase/tests/048_function_privileges.test.sql.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
