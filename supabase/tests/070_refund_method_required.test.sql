-- ============================================================================
-- pgTAP Test: 070_refund_method_required.test.sql
-- bug refund-method-required phase-1 task-01 (CR-005, GAP-009, R-110, AC-25),
-- migration 20261120100000_refund_method_required.sql:
--   * affected_order_actions có refund_method (tập cố định) + refunded_at (date).
--   * REFUNDED_MANUAL mới ghi BẮT BUỘC đủ phương thức + ngày hoàn (CHECK 23514), kể cả khi Staff ghi qua RLS.
--   * Dữ liệu REFUNDED_MANUAL cũ (không có 2 cột) vẫn tồn tại/đọc được: CHECK mới là NOT VALID, không backfill.
-- Fixture id riêng (…0700…), rạp mã T70.
-- ============================================================================
begin;
select plan(14);

create function public.tap70_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;
create function public.tap70_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end; $$;
grant execute on function public.tap70_as(uuid), public.tap70_owner() to anon, authenticated;

-- Fixture (owner, bypass RLS)
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0700000000a1', 'T70', 'Tỉnh kiểm thử 070');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0700000000c1', 'T70', 'Rạp T70', '00000000-0000-0000-0000-0700000000a1', '1 Phố T');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-070000000c01', 'staff70@example.com', '{}'),
  ('00000000-0000-0000-0000-070000000d01', 'khach70@example.com', '{}');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-070000000c01', '00000000-0000-0000-0000-0700000000c1', 'STAFF');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-07000000e001', 'phim-070', 'Phim 070', 100, '2026-11-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-07000000f101', '00000000-0000-0000-0000-0700000000c1', 'Phòng T70', 2, 2);
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status) values
  ('00000000-0000-0000-0000-07000000a501', '00000000-0000-0000-0000-0700000000c1', '00000000-0000-0000-0000-07000000f101',
   '00000000-0000-0000-0000-07000000e001', now() + interval '2 days', now() + interval '2 days 2 hours', '2D', 'ON_SALE');
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, booking_code) values
  ('00000000-0000-0000-0000-070a00000001', 'WEB', '00000000-0000-0000-0000-07000000a501', '00000000-0000-0000-0000-070000000d01', 'affected', 100000, 0, 100000, 'T70-AAA001'),
  ('00000000-0000-0000-0000-070a00000002', 'WEB', '00000000-0000-0000-0000-07000000a501', '00000000-0000-0000-0000-070000000d01', 'affected', 100000, 0, 100000, 'T70-AAA002'),
  ('00000000-0000-0000-0000-070a00000003', 'WEB', '00000000-0000-0000-0000-07000000a501', '00000000-0000-0000-0000-070000000d01', 'affected', 100000, 0, 100000, 'T70-AAA003'),
  ('00000000-0000-0000-0000-070a00000004', 'WEB', '00000000-0000-0000-0000-07000000a501', '00000000-0000-0000-0000-070000000d01', 'affected', 100000, 0, 100000, 'T70-AAA004');

-- 1-2. Cột mới
select has_column('public', 'affected_order_actions', 'refund_method', '1. có cột refund_method');
select col_type_is('public', 'affected_order_actions', 'refunded_at', 'date', '2. refunded_at kiểu date');

-- 3. CHECK đầy đủ tồn tại và là NOT VALID (không quét/phá dữ liệu cũ)
select is(
  (select convalidated from pg_constraint
    where conrelid = 'public.affected_order_actions'::regclass and conname = 'affected_order_actions_refunded_manual_full_ck'),
  false, '3. CHECK refunded_manual_full là NOT VALID (dữ liệu cũ giữ nguyên)');

-- 4-6. Thiếu / sai -> 23514 (owner)
select throws_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount, refunded_at)
  values ('00000000-0000-0000-0000-070a00000001', 'REFUNDED_MANUAL', 'CK-0701', 100000, current_date)$$,
  '23514', null, '4. REFUNDED_MANUAL thiếu refund_method bị từ chối');
select throws_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount, refund_method)
  values ('00000000-0000-0000-0000-070a00000001', 'REFUNDED_MANUAL', 'CK-0701', 100000, 'CASH')$$,
  '23514', null, '5. REFUNDED_MANUAL thiếu refunded_at bị từ chối');
select throws_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount, refund_method, refunded_at)
  values ('00000000-0000-0000-0000-070a00000001', 'REFUNDED_MANUAL', 'CK-0701', 100000, 'PAYPAL', current_date)$$,
  '23514', null, '6. refund_method ngoài tập cố định bị từ chối');

-- 7. Hợp lệ (owner) -> ghi được, đơn sang refunded_manual
select lives_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount, refund_method, refunded_at)
  values ('00000000-0000-0000-0000-070a00000001', 'REFUNDED_MANUAL', 'CK-0701', 100000, 'E_WALLET', '2026-11-18')$$,
  '7. REFUNDED_MANUAL đủ phương thức + ngày hoàn ghi được');
select is(
  (select refund_method || '|' || refunded_at::text from public.affected_order_actions
    where order_id = '00000000-0000-0000-0000-070a00000001'),
  'E_WALLET|2026-11-18', '8. phương thức + ngày hoàn được lưu đúng');

-- 9-11. Staff rạp mình ghi qua RLS (cần GRANT INSERT cột mới)
select public.tap70_as('00000000-0000-0000-0000-070000000c01');
select throws_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount)
  values ('00000000-0000-0000-0000-070a00000002', 'REFUNDED_MANUAL', 'CK-0702', 100000)$$,
  '23514', null, '9. Staff ghi hoàn thủ công thiếu phương thức/ngày bị từ chối');
select lives_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount, refund_method, refunded_at)
  values ('00000000-0000-0000-0000-070a00000002', 'REFUNDED_MANUAL', 'CK-0702', 100000, 'BANK_TRANSFER', current_date)$$,
  '10. Staff rạp mình ghi hoàn thủ công đủ trường qua RLS');
select public.tap70_owner();
select is(
  (select status::text from public.orders where id = '00000000-0000-0000-0000-070a00000002'),
  'refunded_manual', '11. đơn chuyển refunded_manual sau khi Staff ghi');

-- 12-14. Dữ liệu cũ: mô phỏng dòng REFUNDED_MANUAL trước migration (tạm gỡ CHECK mới rồi gắn lại NOT VALID)
alter table public.affected_order_actions drop constraint affected_order_actions_refunded_manual_full_ck;
insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount)
  values ('00000000-0000-0000-0000-070a00000003', 'REFUNDED_MANUAL', 'CK-LEGACY', 100000);
alter table public.affected_order_actions
  add constraint affected_order_actions_refunded_manual_full_ck
  check (action <> 'REFUNDED_MANUAL' or (refund_method is not null and refunded_at is not null)) not valid;
select is(
  (select refund_method is null and refunded_at is null from public.affected_order_actions where refund_reference = 'CK-LEGACY'),
  true, '12. dòng REFUNDED_MANUAL cũ vẫn đọc được với phương thức/ngày = null (không bịa giá trị)');
select is(
  (select convalidated from pg_constraint
    where conrelid = 'public.affected_order_actions'::regclass and conname = 'affected_order_actions_refunded_manual_full_ck'),
  false, '13. gắn lại CHECK NOT VALID khi đã có dữ liệu cũ không lỗi');
select throws_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount)
  values ('00000000-0000-0000-0000-070a00000004', 'REFUNDED_MANUAL', 'CK-NEW', 100000)$$,
  '23514', null, '14. hàng mới vẫn bị CHECK dù đã có dữ liệu cũ');

select * from finish();
rollback;
