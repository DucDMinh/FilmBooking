-- Layer 4 / task 03: RPC voucher lõi: apply_voucher, remove_voucher, trigger hoàn/chốt lượt (R-90, R-92, R-93, R-94, R-95).
--
-- 1. apply_voucher(p_order_id, p_code):
--    - Tối đa 1 voucher/đơn (R-92, VOUCHER_ALREADY_APPLIED).
--    - Khoá hàng FOR UPDATE trên public.vouchers chống race condition khi tranh lượt dùng (NFR-04, R-93).
--    - Kiểm tra: active (VOUCHER_INVALID), valid_from/valid_to (VOUCHER_EXPIRED),
--      min_order_amount (VOUCHER_MIN_NOT_MET), total_uses_limit (VOUCHER_EXHAUSTED),
--      per_user_limit (VOUCHER_USER_LIMIT_REACHED), phim áp dụng nếu có (VOUCHER_NOT_APPLICABLE).
--    - Rate limit: 5 lần / 10 phút qua hit_rate_limit (RATE_LIMITED).
--    - Tính giảm giá: PERCENT (có trần max_discount) hoặc FIXED; không vượt subtotal.
--    - Giữ lượt qua public.voucher_redemptions (status = 'HELD').
--    - Cập nhật public.orders (voucher_id, discount_amount, total_amount).
--
-- 2. remove_voucher(p_order_id):
--    - Gỡ voucher khỏi đơn holding/pending_payment.
--    - Chuyển voucher_redemptions sang 'RELEASED', hoàn lại discount trên orders.
--
-- 3. Trigger orders_voucher_status_sync:
--    - Khi orders đổi trạng thái sang expired/cancelled: giải phóng lượt (HELD -> RELEASED).
--    - Khi orders đổi trạng thái sang paid/checked_in: chốt lượt (HELD -> CONSUMED).

-- ============================================================================
-- 1. apply_voucher
-- ============================================================================
create or replace function public.apply_voucher(
  p_order_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid;
  v_order       public.orders%rowtype;
  v_voucher     public.vouchers%rowtype;
  v_rate_key    text;
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

  -- 1. Khoá đơn để chống thao tác đồng thời trên cùng 1 đơn
  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- 2. Kiểm tra quyền của caller
  v_uid := auth.uid();
  if v_uid is not null
     and v_order.user_id is not null
     and v_order.user_id <> v_uid
     and not public.is_admin()
     and not public.has_cinema_role(v_order.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3. Trạng thái đơn phải là holding hoặc pending_payment và chưa hết hạn
  if v_order.status not in ('holding', 'pending_payment') then
    raise exception 'ORDER_NOT_HOLDING' using errcode = 'P0001';
  end if;

  if v_order.hold_expires_at is not null and v_order.hold_expires_at < now() then
    raise exception 'ORDER_EXPIRED' using errcode = 'P0001';
  end if;

  -- 4. Rate limit: tối đa 5 lần thử trong 10 phút (R-95)
  v_rate_key := 'voucher_apply:' || coalesce(v_uid::text, v_order.user_id::text, p_order_id::text);
  if not public.hit_rate_limit(v_rate_key, interval '10 minutes', 5) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- 5. Tối đa 1 voucher / đơn (R-92)
  if v_order.voucher_id is not null or exists (
    select 1
      from public.voucher_redemptions vr
     where vr.order_id = p_order_id
       and vr.status in ('HELD', 'CONSUMED')
  ) then
    raise exception 'VOUCHER_ALREADY_APPLIED' using errcode = 'P0001';
  end if;

  -- 6. Tìm voucher và khoá hàng FOR UPDATE để serialize đếm lượt (R-93 chống race condition)
  select * into v_voucher
    from public.vouchers v
   where upper(btrim(v.code::text)) = v_clean_code
     for update;

  if not found or not v_voucher.active then
    raise exception 'VOUCHER_INVALID' using errcode = 'P0001';
  end if;

  -- 7. Kiểm tra thời hạn hiệu lực
  if (v_voucher.valid_from is not null and v_voucher.valid_from > now())
     or (v_voucher.valid_to is not null and v_voucher.valid_to < now()) then
    raise exception 'VOUCHER_EXPIRED' using errcode = 'P0001';
  end if;

  -- 8. Kiểm tra phim áp dụng (nếu voucher gán theo movie_id)
  if v_voucher.movie_id is not null then
    select s.movie_id into v_movie_id
      from public.showtimes s
     where s.id = v_order.showtime_id;
    if v_movie_id is distinct from v_voucher.movie_id then
      raise exception 'VOUCHER_NOT_APPLICABLE' using errcode = 'P0001';
    end if;
  end if;

  -- 9. Kiểm tra giá trị đơn tối thiểu
  if v_order.subtotal_amount < v_voucher.min_order_amount then
    raise exception 'VOUCHER_MIN_NOT_MET' using errcode = 'P0001';
  end if;

  -- 10. Kiểm tra tổng lượt dùng (đếm các đơn đang giữ HELD hoặc đã thanh toán CONSUMED)
  if v_voucher.total_uses_limit is not null then
    select count(*) into v_total_used
      from public.voucher_redemptions vr
     where vr.voucher_id = v_voucher.id
       and vr.status in ('HELD', 'CONSUMED');

    if v_total_used >= v_voucher.total_uses_limit then
      raise exception 'VOUCHER_EXHAUSTED' using errcode = 'P0001';
    end if;
  end if;

  -- 11. Kiểm tra lượt mỗi khách
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

  -- 12. Tính số tiền giảm giá
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

  -- 13. Giữ lượt bằng voucher_redemptions
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

  -- 14. Cập nhật đơn hàng
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
$$;

-- ============================================================================
-- 2. remove_voucher
-- ============================================================================
create or replace function public.remove_voucher(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_uid is not null
     and v_order.user_id is not null
     and v_order.user_id <> v_uid
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
$$;

-- ============================================================================
-- 3. Trigger đồng bộ trạng thái voucher_redemptions khi đơn đổi trạng thái
-- ============================================================================
create or replace function public.orders_voucher_status_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    -- Đơn expired hoặc cancelled -> hoàn lại lượt đang giữ
    if new.status in ('expired', 'cancelled') then
      update public.voucher_redemptions
         set status = 'RELEASED',
             updated_at = now()
       where order_id = new.id
         and status = 'HELD';
    -- Đơn paid hoặc checked_in -> chốt lượt
    elsif new.status in ('paid', 'checked_in') then
      update public.voucher_redemptions
         set status = 'CONSUMED',
             updated_at = now()
       where order_id = new.id
         and status = 'HELD';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_voucher_status_sync on public.orders;
create trigger orders_voucher_status_sync
  after update of status on public.orders
  for each row
  execute function public.orders_voucher_status_sync();

-- ============================================================================
-- 4. Phân quyền EXECUTE
-- ============================================================================
revoke all on function public.apply_voucher(uuid, text) from public, anon;
grant execute on function public.apply_voucher(uuid, text) to authenticated, service_role;

revoke all on function public.remove_voucher(uuid) from public, anon;
grant execute on function public.remove_voucher(uuid) to authenticated, service_role;

revoke all on function public.orders_voucher_status_sync() from public, anon, authenticated;
