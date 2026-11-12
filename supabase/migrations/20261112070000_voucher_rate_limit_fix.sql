-- bug-layer34-review K5 (P0-06): rate limit nhập voucher (R-95) không hoạt động.
--
-- Nguyên nhân: apply_voucher ghi bộ đếm (hit_rate_limit) rồi mọi nhánh lỗi nghiệp vụ `raise exception`
-- => exception rollback cả transaction của RPC, kể cả lần tăng bộ đếm. Chỉ lần áp THÀNH CÔNG mới được
-- đếm, dò mã sai là vô hạn. Ngưỡng cũng lệch spec (code 5 lần/10 phút, R-95 là 10 lần/phút/khách).
--
-- Sửa:
--   * apply_voucher_core: toàn bộ logic nghiệp vụ cũ (vẫn `raise` khi lỗi), BỎ bước rate limit. Chỉ wrapper gọi.
--   * apply_voucher (wrapper, giữ chữ ký/grant/SECURITY DEFINER/search_path):
--       1. ghi bộ đếm 10 lần / 1 phút / khách NGOÀI khối bắt lỗi => bền;
--       2. gọi core trong khối BEGIN..EXCEPTION: lỗi nghiệp vụ (P0001, mã chữ hoa) được trả dưới dạng
--          jsonb {"ok": false, "error_code": "<MÃ>"} thay vì raise => transaction commit, bộ đếm được giữ.
--          Phần ghi dở của core (nếu có) tự rollback theo subtransaction.
--       3. thành công trả jsonb cũ + "ok": true.
--       Lỗi phân quyền (FORBIDDEN 42501) và lỗi hệ thống vẫn `raise` như cũ.
--   Vượt ngưỡng trả {"ok": false, "error_code": "RATE_LIMITED"} (kể cả khi mã đúng).
-- Phía gọi (API) phải đọc `ok`/`error_code` rồi tự ánh xạ sang HTTP (RATE_LIMITED -> 429).

-- ============================================================================
-- 1. apply_voucher_core: logic nghiệp vụ (sao y bản cũ, bỏ bước rate limit)
-- ============================================================================
create function public.apply_voucher_core(
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
$$;

-- Chỉ apply_voucher (owner postgres, SECURITY DEFINER) được gọi core; client không gọi trực tiếp.
revoke all on function public.apply_voucher_core(uuid, text) from public, anon, authenticated, service_role;

-- ============================================================================
-- 2. apply_voucher: wrapper đếm lượt bền + trả lỗi nghiệp vụ có cấu trúc
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
  v_uid       uuid;
  v_order_uid uuid;
  v_rate_key  text;
  v_result    jsonb;
  v_error     text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    select o.user_id into v_order_uid from public.orders o where o.id = p_order_id;
  end if;

  -- R-95: tối đa 10 lần nhập / 1 phút / khách. Ghi NGOÀI khối EXCEPTION bên dưới
  -- nên lần thử sai vẫn được commit cùng kết quả lỗi có cấu trúc.
  v_rate_key := 'voucher_apply:' || coalesce(v_uid::text, v_order_uid::text, p_order_id::text, 'anonymous');
  if not public.hit_rate_limit(v_rate_key, interval '1 minute', 10) then
    return jsonb_build_object('ok', false, 'error_code', 'RATE_LIMITED');
  end if;

  begin
    v_result := public.apply_voucher_core(p_order_id, p_code);
    return v_result || jsonb_build_object('ok', true);
  exception
    when sqlstate 'P0001' then
      -- Chỉ mã nghiệp vụ (chữ hoa/số/gạch dưới) mới chuyển thành kết quả; P0001 lạ vẫn raise.
      v_error := sqlerrm;
      if v_error !~ '^[A-Z][A-Z0-9_]*$' then
        raise;
      end if;
      return jsonb_build_object('ok', false, 'error_code', v_error);
  end;
end;
$$;

-- Giữ nguyên grant hiện có của apply_voucher (migration 20261111040200); create or replace không đổi ACL.
