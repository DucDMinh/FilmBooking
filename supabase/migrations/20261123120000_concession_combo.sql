-- Migration 20261123120000_concession_combo.sql
-- CR-018: Thêm chức năng đặt combo bắp nước vào đoạn thanh toán (R-58, R-69, R-72, R-100)

-- 1. Bảng public.combos (danh mục combo toàn chuỗi)
create table public.combos (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  price_amount  integer not null check (price_amount >= 0),
  image_url     text,
  is_active     boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index combos_active_display_idx on public.combos (is_active, display_order);

create trigger combos_set_updated_at before update on public.combos
  for each row execute function public.set_updated_at();

alter table public.combos enable row level security;

-- 2. Bảng public.order_combos (combo đã chọn theo đơn)
create table public.order_combos (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  combo_id    uuid not null references public.combos (id) on delete restrict,
  combo_name  text not null,
  quantity    integer not null check (quantity > 0),
  unit_price  integer not null check (unit_price >= 0),
  total_price integer not null check (total_price = quantity * unit_price),
  created_at  timestamptz not null default now(),
  unique (order_id, combo_id)
);

create index order_combos_order_id_idx on public.order_combos (order_id);
create index order_combos_combo_id_idx on public.order_combos (combo_id);

alter table public.order_combos enable row level security;

-- 3. Phân quyền & RLS
revoke all on public.combos, public.order_combos from public, anon, authenticated;

-- combos: mọi người đọc được combo đang bật; admin đọc/ghi toàn bộ
grant select on public.combos to anon, authenticated, service_role;
create policy combos_select on public.combos for select to anon, authenticated
  using (is_active = true or (select public.is_admin()));

-- order_combos: chỉ xem được nếu xem được đơn hàng tương ứng
grant select on public.order_combos to authenticated, service_role;
create policy order_combos_select on public.order_combos for select to authenticated
  using (public.can_view_order(order_id));

-- 4. Hàm sync_order_combos: cập nhật combo của đơn và tính lại tổng tiền
create or replace function public.sync_order_combos(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_order record;
  v_item jsonb;
  v_combo record;
  v_combo_id uuid;
  v_qty integer;
  v_seats_total integer := 0;
  v_combos_total integer := 0;
  v_new_subtotal integer := 0;
  v_new_discount integer := 0;
  v_new_total integer := 0;
  v_voucher record;
  v_caller uuid;
begin
  v_caller := auth.uid();

  -- 1. Khoá đơn hàng
  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 2. Kiểm quyền chủ đơn / admin
  if v_caller is not null and v_order.user_id is not null and v_order.user_id is distinct from v_caller then
    if not (public.is_admin() or public.has_cinema_role(v_order.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[])) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  -- 3. Kiểm trạng thái: chỉ được đổi khi holding và còn hạn
  if v_order.status is distinct from 'holding' then
    raise exception 'ORDER_NOT_HOLDING' using errcode = 'P0001';
  end if;

  if v_order.hold_expires_at is not null and v_order.hold_expires_at <= now() then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;

  -- 4. Xoá combo cũ
  delete from public.order_combos where order_id = p_order_id;

  -- 5. Chèn combo mới
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_combo_id := (v_item->>'combo_id')::uuid;
      v_qty := coalesce((v_item->>'quantity')::integer, 0);

      if v_qty > 0 then
        if v_qty > 20 then
          raise exception 'INVALID_COMBO_QUANTITY' using errcode = 'P0001';
        end if;

        select * into v_combo
          from public.combos
         where id = v_combo_id
           and is_active = true;

        if not found then
          raise exception 'COMBO_NOT_FOUND' using errcode = 'P0002';
        end if;

        insert into public.order_combos (
          order_id,
          combo_id,
          combo_name,
          quantity,
          unit_price,
          total_price
        ) values (
          p_order_id,
          v_combo.id,
          v_combo.name,
          v_qty,
          v_combo.price_amount,
          v_combo.price_amount * v_qty
        );
      end if;
    end loop;
  end if;

  -- 6. Tính toán lại tổng tiền
  select coalesce(sum(price_amount), 0) into v_seats_total
    from public.order_seats
   where order_id = p_order_id;

  select coalesce(sum(total_price), 0) into v_combos_total
    from public.order_combos
   where order_id = p_order_id;

  v_new_subtotal := v_seats_total + v_combos_total;

  -- 7. Tính lại voucher (nếu có)
  if v_order.voucher_id is not null then
    select * into v_voucher
      from public.vouchers
     where id = v_order.voucher_id;

    if found and v_new_subtotal >= v_voucher.min_order_amount then
      if v_voucher.discount_type = 'PERCENT' then
        v_new_discount := round((v_new_subtotal::numeric * v_voucher.discount_value::numeric) / 100.0)::integer;
        if v_voucher.max_discount is not null and v_new_discount > v_voucher.max_discount then
          v_new_discount := v_voucher.max_discount;
        end if;
      else
        v_new_discount := v_voucher.discount_value;
      end if;

      if v_new_discount > v_new_subtotal then
        v_new_discount := v_new_subtotal;
      end if;
    else
      -- Subtotal không còn đủ điều kiện min_order_amount -> gỡ voucher
      v_new_discount := 0;
      update public.voucher_redemptions
         set status = 'RELEASED'
       where order_id = p_order_id
         and status = 'HELD';
      v_order.voucher_id := null;
    end if;
  else
    v_new_discount := 0;
  end if;

  v_new_total := v_new_subtotal - v_new_discount;

  -- 8. Cập nhật orders
  update public.orders
     set subtotal_amount = v_new_subtotal,
         discount_amount = v_new_discount,
         total_amount    = v_new_total,
         voucher_id      = v_order.voucher_id,
         updated_at      = now()
   where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'subtotal_amount', v_new_subtotal,
    'combos_amount', v_combos_total,
    'discount_amount', v_new_discount,
    'total_amount', v_new_total
  );
end;
$$;

revoke all on function public.sync_order_combos(uuid, jsonb) from public, anon;
grant execute on function public.sync_order_combos(uuid, jsonb) to authenticated, service_role;

-- 5. Seed dữ liệu demo 4 combo
insert into public.combos (id, name, description, price_amount, image_url, is_active, display_order)
values
  ('c0000000-0000-0000-0000-000000000001', 'Combo Solo', '1 Bắp ngọt vừa (44oz) + 1 Nước ngọt có ga 22oz', 69000, '/images/combos/combo-solo.webp', true, 1),
  ('c0000000-0000-0000-0000-000000000002', 'Combo Couple', '1 Bắp ngọt lớn (64oz) + 2 Nước ngọt có ga 22oz', 99000, '/images/combos/combo-couple.webp', true, 2),
  ('c0000000-0000-0000-0000-000000000003', 'Bắp Phô Mai', '1 Bắp rang bơ lắc bột phô mai hảo hạng (44oz)', 49000, '/images/combos/bap-pho-mai.webp', true, 3),
  ('c0000000-0000-0000-0000-000000000004', 'Nước Ngọt 22oz', 'Coca-Cola / Sprite / Fanta mát lạnh 22oz', 29000, '/images/combos/nuoc-ngot.webp', true, 4)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_amount = excluded.price_amount,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  display_order = excluded.display_order;
