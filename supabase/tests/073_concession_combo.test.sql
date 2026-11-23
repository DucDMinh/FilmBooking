-- ============================================================================
-- pgTAP Test: 073_concession_combo.test.sql
-- feature concession-combo (CR-018): RPC sync_order_combos + RLS order_combos_select.
-- Kiểm: tính tiền (subtotal = ghế + combo, total = subtotal - discount), chốt snapshot giá,
-- giới hạn 20/combo, combo ngừng bán, trạng thái đơn / hết hạn giữ chỗ, quyền, voucher bị gỡ khi
-- subtotal < min_order_amount, và RLS đọc order_combos. Một transaction, rollback cuối test.
-- ============================================================================
begin;
select plan(31);

-- Scaffolding test (rollback cùng transaction): tap_* tạo bởi owner không có EXECUTE mặc định cho client.
create function public.tap_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;
create function public.tap_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end; $$;
-- Đếm order_combos với quyền hiện tại (RLS áp dụng khi đang là authenticated).
create function public.tap_combo_count(p_order uuid) returns integer language plpgsql as $$
begin return (select count(*) from public.order_combos where order_id = p_order); end; $$;
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap\_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;

-- ---------------------------------------------------------------------------
-- Fixtures (owner)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000730000a1', 'T73', 'Tỉnh T73');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000730000c1', 'T731', 'Rạp T73A', '00000000-0000-0000-0000-0000730000a1', '1 Test', 15),
  ('00000000-0000-0000-0000-0000730000c2', 'T732', 'Rạp T73B', '00000000-0000-0000-0000-0000730000a1', '2 Test', 15);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000073000d01', 't73-owner@example.com', '{}'),
  ('00000000-0000-0000-0000-000073000d02', 't73-other@example.com', '{}'),
  ('00000000-0000-0000-0000-000073000d03', 't73-expired@example.com', '{}'),
  ('00000000-0000-0000-0000-000073000b01', 't73-staff-a@example.com', '{}'),
  ('00000000-0000-0000-0000-000073000b02', 't73-staff-b@example.com', '{}'),
  ('00000000-0000-0000-0000-000073000b03', 't73-manager-a@example.com', '{}');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000073000b01', '00000000-0000-0000-0000-0000730000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000073000b02', '00000000-0000-0000-0000-0000730000c2', 'STAFF'),
  ('00000000-0000-0000-0000-000073000b03', '00000000-0000-0000-0000-0000730000c1', 'MANAGER');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-0000730000e1', 'phim-t73', 'Phim T73', 120, '2026-12-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-0000730000f1', '00000000-0000-0000-0000-0000730000c1', 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-0000730000b1', '00000000-0000-0000-0000-0000730000f1', '00000000-0000-0000-0000-0000730000c1', 'A', 1, 'NORMAL', 'A1');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-000073000051', '00000000-0000-0000-0000-0000730000c1', '00000000-0000-0000-0000-0000730000f1',
   '00000000-0000-0000-0000-0000730000e1', now() + interval '5 days', '2D', 'ON_SALE');

-- Đơn chính a01: chủ d01, giữ chỗ còn hạn, 1 ghế 150.000đ. a02 hết hạn giữ, a03 đã huỷ (không cần ghế).
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-000073000a01', 'WEB', '00000000-0000-0000-0000-000073000051', '00000000-0000-0000-0000-000073000d01',
   'holding', 150000, 0, 150000, now() + interval '10 minutes', 't73a@example.com'),
  ('00000000-0000-0000-0000-000073000a02', 'WEB', '00000000-0000-0000-0000-000073000051', '00000000-0000-0000-0000-000073000d03',
   'holding', 150000, 0, 150000, now() - interval '1 minute', 't73b@example.com'),
  ('00000000-0000-0000-0000-000073000a03', 'WEB', '00000000-0000-0000-0000-000073000051', '00000000-0000-0000-0000-000073000d01',
   'cancelled', 150000, 0, 150000, null, 't73c@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-000073000a61', '00000000-0000-0000-0000-000073000a01', '00000000-0000-0000-0000-0000730000b1', 'A1', 'NORMAL', 150000);

insert into public.combos (id, name, price_amount, is_active, display_order) values
  ('00000000-0000-0000-0000-000073000c01', 'Combo T73 Solo', 69000, true, 901),
  ('00000000-0000-0000-0000-000073000c02', 'Combo T73 Đôi', 99000, true, 902),
  ('00000000-0000-0000-0000-000073000c03', 'Combo T73 Ngừng bán', 10000, false, 903);
insert into public.vouchers (id, code, discount_type, discount_value, min_order_amount, applies_to, active) values
  ('00000000-0000-0000-0000-000073000f01', 'T73MIN200K', 'FIXED', 10000, 200000, 'ORDER', true);

-- ---------------------------------------------------------------------------
-- 1. Tính tiền: subtotal = ghế + combo; total = subtotal - discount
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select is(
  (public.sync_order_combos('00000000-0000-0000-0000-000073000a01',
    '[{"combo_id":"00000000-0000-0000-0000-000073000c01","quantity":2},{"combo_id":"00000000-0000-0000-0000-000073000c02","quantity":1}]'::jsonb)
  )->>'subtotal_amount', '387000', 'subtotal = 150.000 (ghế) + 2x69.000 + 99.000 = 387.000');
select public.tap_owner();
select is((select total_amount from public.orders where id = '00000000-0000-0000-0000-000073000a01'), 387000,
  'orders.total_amount cập nhật theo server (không giảm giá)');
select is((select sum(total_price) from public.order_combos where order_id = '00000000-0000-0000-0000-000073000a01'), 237000::bigint,
  'tổng combo = 237.000 (mỗi dòng total_price = quantity x unit_price)');
select is((select combo_name from public.order_combos where order_id = '00000000-0000-0000-0000-000073000a01' and combo_id = '00000000-0000-0000-0000-000073000c02'),
  'Combo T73 Đôi', 'tên combo được chốt snapshot vào order_combos');

-- ---------------------------------------------------------------------------
-- 2. Chốt snapshot giá: đổi giá combo không đổi đơn đã sync; lần sync kế tiếp lấy giá mới
-- ---------------------------------------------------------------------------
update public.combos set price_amount = 79000 where id = '00000000-0000-0000-0000-000073000c01';
select is((select unit_price from public.order_combos where order_id = '00000000-0000-0000-0000-000073000a01' and combo_id = '00000000-0000-0000-0000-000073000c01'),
  69000, 'đổi giá combo sau khi chọn: đơn đã sync giữ đơn giá cũ 69.000');
select is((select total_amount from public.orders where id = '00000000-0000-0000-0000-000073000a01'), 387000, 'tổng đơn không đổi khi giá combo đổi');
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select is(
  (public.sync_order_combos('00000000-0000-0000-0000-000073000a01',
    '[{"combo_id":"00000000-0000-0000-0000-000073000c01","quantity":1}]'::jsonb))->>'subtotal_amount',
  '229000', 'sync kế tiếp lấy giá mới: 150.000 + 79.000 = 229.000');
select public.tap_owner();
select is((select count(*) from public.order_combos where order_id = '00000000-0000-0000-0000-000073000a01'), 1::bigint,
  'sync thay toàn bộ combo của đơn (combo Đôi bị bỏ)');

-- ---------------------------------------------------------------------------
-- 3. Giới hạn số lượng, combo ngừng bán / không tồn tại, trạng thái đơn
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-000073000c01","quantity":21}]'::jsonb)$$,
  'P0001', 'INVALID_COMBO_QUANTITY', 'quantity 21 > 20 -> INVALID_COMBO_QUANTITY');
select lives_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-000073000c01","quantity":20}]'::jsonb)$$,
  'quantity 20 (biên) được chấp nhận');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-000073000c03","quantity":1}]'::jsonb)$$,
  'P0002', 'COMBO_NOT_FOUND', 'combo ngừng bán -> COMBO_NOT_FOUND');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-0000730099ff","quantity":1}]'::jsonb)$$,
  'P0002', 'COMBO_NOT_FOUND', 'combo không tồn tại -> COMBO_NOT_FOUND');
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 1, 'lệnh lỗi rollback: combo của lần sync hợp lệ trước đó còn nguyên');
select is((select quantity from public.order_combos where order_id = '00000000-0000-0000-0000-000073000a01'), 20, 'số lượng vẫn là 20 sau các lệnh lỗi');
select public.tap_as('00000000-0000-0000-0000-000073000d03');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a02', '[]'::jsonb)$$,
  'P0001', 'HOLD_EXPIRED', 'giữ chỗ đã hết hạn -> HOLD_EXPIRED');
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a03', '[]'::jsonb)$$,
  'P0001', 'ORDER_NOT_HOLDING', 'đơn không còn holding -> ORDER_NOT_HOLDING');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a99', '[]'::jsonb)$$,
  'P0002', 'ORDER_NOT_FOUND', 'đơn không tồn tại -> ORDER_NOT_FOUND');

-- ---------------------------------------------------------------------------
-- 4. Quyền: chủ khác không gọi được
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000073000d02');
select throws_ok($$select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[]'::jsonb)$$,
  '42501', 'FORBIDDEN', 'khách khác sửa combo đơn của chủ -> FORBIDDEN');
select public.tap_owner();
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 1, 'lệnh bị từ chối không xoá combo của chủ đơn');

-- ---------------------------------------------------------------------------
-- 5. Voucher: giữ khi subtotal còn đủ min_order_amount, gỡ + RELEASED khi không đủ
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-000073000c02","quantity":1}]'::jsonb);
select is((public.apply_voucher('00000000-0000-0000-0000-000073000a01', 'T73MIN200K'))->>'ok', 'true',
  'áp voucher min 200.000 khi subtotal 249.000 (ghế 150.000 + combo 99.000)');
select is(
  (public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-000073000c02","quantity":2}]'::jsonb))->>'total_amount',
  '338000', 'đổi combo mà vẫn đủ min: voucher giữ, total = 150.000 + 198.000 - 10.000 = 338.000');
select public.tap_owner();
select is((select voucher_id from public.orders where id = '00000000-0000-0000-0000-000073000a01'),
  '00000000-0000-0000-0000-000073000f01'::uuid, 'voucher vẫn gắn với đơn');
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select is(
  (public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[]'::jsonb))->>'total_amount',
  '150000', 'bỏ hết combo: subtotal 150.000 < min 200.000 -> voucher bị gỡ, total = 150.000');
select public.tap_owner();
select is((select voucher_id from public.orders where id = '00000000-0000-0000-0000-000073000a01'), null, 'orders.voucher_id = null sau khi gỡ');
select is((select discount_amount from public.orders where id = '00000000-0000-0000-0000-000073000a01'), 0, 'discount_amount = 0 sau khi gỡ');
select is((select status::text from public.voucher_redemptions where order_id = '00000000-0000-0000-0000-000073000a01'), 'RELEASED',
  'lượt dùng voucher chuyển RELEASED (trả lại lượt)');

-- ---------------------------------------------------------------------------
-- 6. RLS order_combos_select (can_view_order)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000073000d01');
select public.sync_order_combos('00000000-0000-0000-0000-000073000a01', '[{"combo_id":"00000000-0000-0000-0000-000073000c01","quantity":1}]'::jsonb);
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 1, 'RLS: chủ đơn đọc được combo của mình');
select public.tap_as('00000000-0000-0000-0000-000073000d02');
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 0, 'RLS: khách khác đọc combo đơn người khác -> 0 dòng');
select public.tap_as('00000000-0000-0000-0000-000073000b01');
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 1, 'RLS: STAFF đúng rạp đọc được combo của đơn rạp mình');
select public.tap_as('00000000-0000-0000-0000-000073000b03');
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 1, 'RLS: MANAGER đúng rạp đọc được');
select public.tap_as('00000000-0000-0000-0000-000073000b02');
select is(public.tap_combo_count('00000000-0000-0000-0000-000073000a01'), 0, 'RLS: STAFF rạp khác -> 0 dòng');
select public.tap_owner();

select * from finish();
rollback;
