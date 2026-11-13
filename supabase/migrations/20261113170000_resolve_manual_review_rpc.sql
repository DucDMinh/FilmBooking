-- ============================================================================
-- Migration: 20261113170000_resolve_manual_review_rpc.sql
-- bug-layer5-review phase-1 task-02 (C1 K5-2, R-104, SPECIFICATIONS.md:311)
-- 1. Helper has_role(text) nếu chưa có.
-- 2. RPC resolve_manual_review nguyên tử (SECURITY DEFINER):
--    - Chỉ gán manual_review_resolved_at = clock_timestamp().
--    - Giữ nguyên status 'needs_manual_review' (kết thúc, không đổi sang 'paid').
--    - Không sửa showtime_seat_states; không insert affected_order_actions.
--    - Ghi audit log với action: 'UPDATE' và action_detail: 'RESOLVE_MANUAL_REVIEW'.
--    - Chỉ Manager của rạp hoặc Admin mới có quyền thực thi (42501 FORBIDDEN_SCOPE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper function: has_role (hỗ trợ kiểm tra user_roles của caller)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role::text = p_role
    )
  );
$$;

revoke all on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RPC: resolve_manual_review
-- ---------------------------------------------------------------------------
create or replace function public.resolve_manual_review(
  p_order_id uuid,
  p_action text,
  p_note text default null,
  p_refund_reference text default null,
  p_refunded_amount integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_order_id is null or p_action is null then
    raise exception 'INVALID_ARGUMENTS: order_id và action là bắt buộc' using errcode = '22023';
  end if;

  -- 1. Khóa đơn để xử lý nguyên tử
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 2. Kiểm tra trạng thái đơn
  if v_order.status <> 'needs_manual_review' then
    raise exception 'INVALID_ORDER_STATUS' using errcode = 'P0003';
  end if;

  if v_order.manual_review_resolved_at is not null then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0004';
  end if;

  -- 3. Kiểm tra quyền: chỉ Manager rạp mình hoặc Admin (hoặc service_role)
  if not (public.has_cinema_manager_scope(v_order.cinema_id) or public.has_role('ADMIN')) then
    raise exception 'FORBIDDEN_SCOPE' using errcode = '42501';
  end if;

  -- 4. Cập nhật manual_review_resolved_at, TUYỆT ĐỐI không đổi status sang paid theo SPECIFICATIONS.md:311
  update public.orders
  set manual_review_resolved_at = v_now
  where id = v_order.id;

  -- 5. Ghi audit log vào public.audit_logs
  insert into public.audit_logs (
    action,
    actor_id,
    cinema_id,
    table_name,
    record_id,
    after_data
  ) values (
    'UPDATE',
    coalesce(auth.uid(), v_order.user_id),
    v_order.cinema_id,
    'orders',
    v_order.id::text,
    jsonb_build_object(
      'action_detail', 'RESOLVE_MANUAL_REVIEW',
      'action', p_action,
      'note', p_note,
      'refund_reference', p_refund_reference,
      'refunded_amount', p_refunded_amount,
      'resolved_at', v_now
    )
  );

  -- 6. Trả về kết quả
  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'resolved_at', v_now
  );
end;
$$;

revoke all on function public.resolve_manual_review(uuid, text, text, text, integer) from public, anon;
grant execute on function public.resolve_manual_review(uuid, text, text, text, integer) to authenticated, service_role;
