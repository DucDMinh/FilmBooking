-- pgTAP: Kiểm thử RPC thanh toán & bán vé (Layer 4 / task 02)
-- R-75, R-76, R-77, R-78, R-82, R-85, R-86, R-125, R-128; AC-10, AC-11.
begin;
select plan(54);

create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end;
$$;

create function public.tap_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Fixture Setup
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp Hà Nội 1', '00000000-0000-0000-0000-0000000000a1', '1 Phố Huế', 15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com', '{}');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-test-payment', 'Phim Thanh Toán', 120, '2026-12-01', 'T13', 'PUBLISHED');

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1', '{2D,3D}', 5, 6);

insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 3, 'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000000b104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 4, 'NORMAL', 'A4'),
  ('00000000-0000-0000-0000-00000000b105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 5, 'NORMAL', 'A5'),
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 1, 'NORMAL', 'C1'),
  ('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 2, 'NORMAL', 'C2'),
  ('00000000-0000-0000-0000-00000000b303', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 3, 'NORMAL', 'C3'),
  ('00000000-0000-0000-0000-00000000b304', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 4, 'NORMAL', 'C4');

insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '2 days', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '3 days', '2D', 'CANCELLED');

insert into public.vouchers (id, code, discount_type, discount_value, min_order_amount) values
  ('00000000-0000-0000-0000-000000007001', 'FREE100', 'PERCENT', 100, 0);

-- ---------------------------------------------------------------------------
-- 2. Test generate_booking_code helper
-- ---------------------------------------------------------------------------
select matches(
  public.generate_booking_code('HN01'),
  '^HN01-[0-9A-Z]{6}$',
  'generate_booking_code sinh mã chuẩn tiền tố và đúng 6 ký tự alphanumeric'
);

-- ---------------------------------------------------------------------------
-- 3. Test record_payment_event (idempotent R-75, AC-10)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.record_payment_event(123456789::bigint, 'TX_TEST_01', 100000, 'PAID', true) $$,
  'record_payment_event ghi nhận sự kiện webhook thành công'
);

select is(
  (select count(*) from public.payment_events where transaction_ref = 'TX_TEST_01'),
  1::bigint,
  'payment_events có đúng 1 dòng cho TX_TEST_01'
);

-- Gọi lặp lại cùng transaction_ref -> không ném lỗi unique, vẫn 1 dòng (idempotent)
select lives_ok(
  $$ select public.record_payment_event(123456789::bigint, 'TX_TEST_01', 100000, 'PAID', true) $$,
  'record_payment_event lặp lại không lỗi (idempotent)'
);

select is(
  (select count(*) from public.payment_events where transaction_ref = 'TX_TEST_01'),
  1::bigint,
  'payment_events vẫn giữ đúng 1 dòng sau khi gọi lặp'
);

-- ---------------------------------------------------------------------------
-- 4. Test confirm_paid luồng chuẩn + AC-10 Idempotent (3 lần gọi cùng mã)
-- ---------------------------------------------------------------------------
-- Tạo đơn 1: 1 ghế A1, total 100.000, holding
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-500000000001', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'holding', 100000, 100000, 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000001', '00000000-0000-0000-0000-500000000001',
   '00000000-0000-0000-0000-00000000b101', 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b101',
   'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000001');

-- Lần gọi 1
select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000001', 100000, 'TX_ORDER_01', 1000001))->>'status'),
  'SUCCESS',
  'confirm_paid lần 1 thành công chuyển đơn sang paid'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000001'),
  'paid'::public.order_status,
  'Trạng thái đơn hàng 1 là paid'
);

select is(
  (select state from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000001'),
  'SOLD'::public.seat_state,
  'Ghế A1 chuyển sang SOLD và expires_at = null'
);

select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-500000000001'),
  1::bigint,
  'Đã sinh đúng 1 vé tickets cho đơn 1'
);

-- Lần gọi 2 & 3 (AC-10: idempotent cùng mã giao dịch)
select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000001', 100000, 'TX_ORDER_01', 1000001))->>'status'),
  'ALREADY_PAID',
  'confirm_paid lần 2 trả về ALREADY_PAID'
);
select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000001', 100000, 'TX_ORDER_01', 1000001))->>'status'),
  'ALREADY_PAID',
  'confirm_paid lần 3 trả về ALREADY_PAID'
);

-- AC-10 verification: đúng 1 payment, đúng 1 ticket, đúng 1 email outbox
select is(
  (select count(*) from public.payments where order_id = '00000000-0000-0000-0000-500000000001'),
  1::bigint,
  'AC-10: Đúng 1 dòng thanh toán payments được tạo'
);
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-500000000001'),
  1::bigint,
  'AC-10: Đúng 1 vé tickets tồn tại (không nhân đôi)'
);
select is(
  (select count(*) from public.email_outbox where kind = 'TICKET_ISSUED' and payload->>'order_id' = '00000000-0000-0000-0000-500000000001'),
  1::bigint,
  'AC-10: Đúng 1 email TICKET_ISSUED trong outbox'
);

-- ---------------------------------------------------------------------------
-- 5. Test kiểm tra số tiền lệch (Amount Mismatch - Defect 5)
-- ---------------------------------------------------------------------------
-- Tạo đơn 2: total 100.000, holding ghế A2
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-500000000002', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'holding', 100000, 100000, 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000002', '00000000-0000-0000-0000-500000000002',
   '00000000-0000-0000-0000-00000000b102', 'A2', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b102',
   'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000002');

-- Gọi confirm_paid với số tiền lệch (50.000 thay vì 100.000)
select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000002', 50000, 'TX_MISMATCH_01', 1000002))->>'status'),
  'AMOUNT_MISMATCH',
  'confirm_paid phát hiện lệch tiền trả về AMOUNT_MISMATCH'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000002'),
  'needs_manual_review'::public.order_status,
  'Defect 5: Đơn 2 chuyển sang needs_manual_review để rạp xử lý thủ công (R-104, R-134)'
);

select is(
  (select event_status from public.payment_events where transaction_ref = 'TX_MISMATCH_01'),
  'AMOUNT_MISMATCH',
  'payment_events ghi nhận cờ AMOUNT_MISMATCH để đối soát'
);

select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-500000000002'),
  0::bigint,
  'Không sinh vé khi số tiền bị lệch'
);

select is(
  (select count(*) from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000002'),
  0::bigint,
  'Defect 5: Ghế HELD của đơn bị lệch tiền được giải phóng ngay lập tức'
);

select is(
  (select count(*) from public.email_outbox where kind = 'AMOUNT_MISMATCH_MANUAL_REVIEW' and payload->>'order_id' = '00000000-0000-0000-0000-500000000002'),
  1::bigint,
  'Defect 5: Enqueue đúng 1 email AMOUNT_MISMATCH_MANUAL_REVIEW thông báo cho khách'
);

select is(
  (select status from public.payments where order_id = '00000000-0000-0000-0000-500000000002'),
  'PENDING'::public.payment_status,
  'Defect 5: Bản ghi thanh toán được lưu trữ với trạng thái PENDING để theo dõi số tiền'
);

-- ---------------------------------------------------------------------------
-- 6. Test AC-11: Tiền về muộn khi đơn expired và ghế đã bán cho người khác
-- ---------------------------------------------------------------------------
-- Đơn 3: expired, ghế A3
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-500000000003', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'expired', 100000, 100000, 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000003', '00000000-0000-0000-0000-500000000003',
   '00000000-0000-0000-0000-00000000b103', 'A3', 'NORMAL', 100000);

-- Ghế A3 đã bị đơn khác (đơn 99) mua SOLD
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, booking_code) values
  ('00000000-0000-0000-0000-500000000099', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d02', 'paid', 100000, 100000, 'HN01-OCCUPY');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000099', '00000000-0000-0000-0000-500000000099',
   '00000000-0000-0000-0000-00000000b103', 'A3', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b103',
   'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000099');

-- Tiền đơn 3 về
select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000003', 100000, 'TX_LATE_03', 1000003))->>'status'),
  'NEEDS_MANUAL_REVIEW',
  'AC-11: Tiền về muộn khi ghế đã SOLD trả về NEEDS_MANUAL_REVIEW'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000003'),
  'needs_manual_review'::public.order_status,
  'AC-11: Đơn 3 chuyển sang needs_manual_review'
);

select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-500000000003'),
  0::bigint,
  'AC-11: KHÔNG sinh vé cho đơn needs_manual_review'
);

select is(
  (select count(*) from public.email_outbox where kind = 'LATE_PAYMENT_MANUAL_REVIEW' and payload->>'order_id' = '00000000-0000-0000-0000-500000000003'),
  1::bigint,
  'AC-11: Enqueue đúng 1 email LATE_PAYMENT_MANUAL_REVIEW hướng dẫn khách'
);

-- ---------------------------------------------------------------------------
-- 7. Test Tiền về muộn khi đơn expired nhưng ghế CÒN TRỐNG và trước mốc đóng bán
-- ---------------------------------------------------------------------------
-- Đơn 4: expired, ghế A4 (chưa có ai giữ hay mua)
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-500000000004', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'expired', 100000, 100000, 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000004', '00000000-0000-0000-0000-500000000004',
   '00000000-0000-0000-0000-00000000b104', 'A4', 'NORMAL', 100000);

-- Tiền đơn 4 về -> tự động khôi phục
select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000004', 100000, 'TX_RECOVER_04', 1000004))->>'status'),
  'SUCCESS',
  'Tiền về muộn ghế còn trống tự động chốt SUCCESS'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000004'),
  'paid'::public.order_status,
  'Đơn 4 tự động khôi phục sang paid'
);

select is(
  (select state from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000004'),
  'SOLD'::public.seat_state,
  'Ghế A4 được chốt SOLD cho đơn 4'
);

select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-500000000004'),
  1::bigint,
  'Đã sinh vé tickets cho đơn 4 sau khi tự khôi phục'
);

-- ---------------------------------------------------------------------------
-- 8. Test mark_payment_cancelled (nhả ghế khi huỷ PayOS)
-- ---------------------------------------------------------------------------
-- Đơn 5: holding ghế A5
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount) values
  ('00000000-0000-0000-0000-500000000005', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d02', 'holding', 100000, 100000);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000005', '00000000-0000-0000-0000-500000000005',
   '00000000-0000-0000-0000-00000000b105', 'A5', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b105',
   'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000005');

select lives_ok(
  $$ select public.mark_payment_cancelled('00000000-0000-0000-0000-500000000005', 'USER_CANCEL') $$,
  'mark_payment_cancelled thực thi thành công'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000005'),
  'cancelled'::public.order_status,
  'Đơn 5 đã chuyển sang cancelled'
);

select is(
  (select count(*) from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000005'),
  0::bigint,
  'Ghế A5 đã được nhả khỏi showtime_seat_states'
);

-- ---------------------------------------------------------------------------
-- 9. Test confirm_zero_amount (R-82: đơn 0đ)
-- ---------------------------------------------------------------------------
-- Tái sử dụng ghế A5 vừa được nhả cho đơn 6 (0đ) của cust2
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, voucher_id, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-500000000006', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d02', 'holding', 100000, 100000, 0,
   '00000000-0000-0000-0000-000000007001', now() + interval '10 minutes', 'cust2@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000006', '00000000-0000-0000-0000-500000000006',
   '00000000-0000-0000-0000-00000000b105', 'A5', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b105',
   'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000006');
insert into public.voucher_redemptions (id, voucher_id, order_id, user_id, discount_amount, status) values
  ('00000000-0000-0000-0000-800000000006', '00000000-0000-0000-0000-000000007001',
   '00000000-0000-0000-0000-500000000006', '00000000-0000-0000-0000-000000000d02', 100000, 'HELD');

select is(
  (select (public.confirm_zero_amount('00000000-0000-0000-0000-500000000006'))->>'status'),
  'SUCCESS',
  'confirm_zero_amount chốt đơn 0đ thành công'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000006'),
  'paid'::public.order_status,
  'Đơn 6 chuyển sang paid'
);

select is(
  (select status from public.voucher_redemptions where order_id = '00000000-0000-0000-0000-500000000006'),
  'CONSUMED'::public.redemption_status,
  'Lượt dùng voucher chuyển sang CONSUMED'
);

-- Kiểm tra từ chối đơn > 0đ
select throws_ok(
  $$ select public.confirm_zero_amount('00000000-0000-0000-0000-500000000002') $$,
  '23514',
  null,
  'Chặn confirm_zero_amount trên đơn có số tiền > 0'
);

-- Defect 4: Kiểm tra order_code của đơn 0đ sinh từ sequence an toàn (>= 900000000000000)
select cmp_ok(
  (select order_code from public.payments where order_id = '00000000-0000-0000-0000-500000000006'),
  '>=',
  900000000000000::bigint,
  'Defect 4: confirm_zero_amount sinh order_code từ internal_payment_order_code_seq an toàn'
);

-- ---------------------------------------------------------------------------
-- 10. Test confirm_pos_sale (R-125, R-128)
-- ---------------------------------------------------------------------------
-- Setup thêm 2 ghế mới cho POS test: B1, B2 ở phòng 1 suất 1
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 1, 'NORMAL', 'B1'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 2, 'NORMAL', 'B2'),
  ('00000000-0000-0000-0000-00000000b203', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 3, 'NORMAL', 'B3');

-- Đơn POS 1: giữ hợp lệ ghế B1 (source = 'POS', expires_at > now())
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount) values
  ('00000000-0000-0000-0000-500000000007', 'POS', '00000000-0000-0000-0000-00000000a501',
   'holding', 80000, 80000);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000007', '00000000-0000-0000-0000-500000000007',
   '00000000-0000-0000-0000-00000000b201', 'B1', 'NORMAL', 80000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b201',
   'HELD', 'POS', now() + interval '5 minutes', '00000000-0000-0000-0000-500000000007');

-- Xác nhận bán POS thành công
select is(
  (select (public.confirm_pos_sale('00000000-0000-0000-0000-500000000007', 'REQ_POS_001'))->>'status'),
  'SUCCESS',
  'confirm_pos_sale thành công khi ghế đang được POS giữ hợp lệ'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000007'),
  'paid'::public.order_status,
  'Đơn POS 7 chuyển sang paid'
);

select is(
  (select state from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000007'),
  'SOLD'::public.seat_state,
  'Ghế B1 chuyển sang SOLD cho đơn POS 7'
);

-- Defect 4: Kiểm tra order_code của POS sinh từ sequence an toàn (>= 900000000000000)
select cmp_ok(
  (select order_code from public.payments where order_id = '00000000-0000-0000-0000-500000000007'),
  '>=',
  900000000000000::bigint,
  'Defect 4: confirm_pos_sale sinh order_code từ internal_payment_order_code_seq an toàn'
);

-- Đơn POS 2: Ghế B2 nhưng hold đã HẾT HẠN
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount) values
  ('00000000-0000-0000-0000-500000000008', 'POS', '00000000-0000-0000-0000-00000000a501',
   'holding', 80000, 80000);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000008', '00000000-0000-0000-0000-500000000008',
   '00000000-0000-0000-0000-00000000b202', 'B2', 'NORMAL', 80000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b202',
   'HELD', 'POS', now() - interval '1 minute', '00000000-0000-0000-0000-500000000008');

select throws_ok(
  $$ select public.confirm_pos_sale('00000000-0000-0000-0000-500000000008') $$,
  '23514',
  null,
  'Từ chối bán POS khi hold đã hết hạn (R-125, R-128)'
);

-- Đơn POS 3: Ghế B3 nhưng đang bị giữ bởi nguồn WEB
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount) values
  ('00000000-0000-0000-0000-500000000009', 'POS', '00000000-0000-0000-0000-00000000a501',
   'holding', 80000, 80000);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000009', '00000000-0000-0000-0000-500000000009',
   '00000000-0000-0000-0000-00000000b203', 'B3', 'NORMAL', 80000);
-- Khách web giữ ghế B3 (khách vãng lai, user_id null để không đụng unique partial index R-64)
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount) values
  ('00000000-0000-0000-0000-500000000010', 'WEB', '00000000-0000-0000-0000-00000000a501',
   null, 'holding', 100000, 100000);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000010', '00000000-0000-0000-0000-500000000010',
   '00000000-0000-0000-0000-00000000b203', 'B3', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b203',
   'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000010');

select throws_ok(
  $$ select public.confirm_pos_sale('00000000-0000-0000-0000-500000000009') $$,
  '23514',
  null,
  'Từ chối bán POS khi ghế đang bị nguồn khác/đơn khác giữ (R-122, R-128)'
);

-- ---------------------------------------------------------------------------
-- 11. Test Defect 1: Tranh chấp ghế khi đơn đang pending_payment hoặc holding
-- (Không bị exception 23514 vỡ Webhook, chuyển mượt sang needs_manual_review)
-- ---------------------------------------------------------------------------
-- Đơn 11: pending_payment, ghế C1
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-500000000011', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'pending_payment', 100000, 100000, 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000011', '00000000-0000-0000-0000-500000000011',
   '00000000-0000-0000-0000-00000000b301', 'C1', 'NORMAL', 100000);
-- Ghế C1 bị đơn 99 chiếm giữ
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b301',
   'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000099');

select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000011', 100000, 'TX_CONFLICT_PENDING_11', 1000011))->>'status'),
  'NEEDS_MANUAL_REVIEW',
  'Defect 1: confirm_paid xử lý êm thuận xung đột ghế khi đơn ở pending_payment không vỡ 23514'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000011'),
  'needs_manual_review'::public.order_status,
  'Defect 1: Đơn 11 chuyển sang needs_manual_review thành công'
);

select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-500000000011'),
  0::bigint,
  'Defect 1: Không sinh vé cho đơn 11'
);

select is(
  (select count(*) from public.email_outbox where kind = 'LATE_PAYMENT_MANUAL_REVIEW' and payload->>'order_id' = '00000000-0000-0000-0000-500000000011'),
  1::bigint,
  'Defect 1: Enqueue email LATE_PAYMENT_MANUAL_REVIEW cho đơn 11'
);

-- Đơn 11B: holding, ghế C2, ghế C2 cũng bị đơn khác chiếm
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-500000000014', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'holding', 100000, 100000, 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000014', '00000000-0000-0000-0000-500000000014',
   '00000000-0000-0000-0000-00000000b302', 'C2', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b302',
   'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000099');

select is(
  (select (public.confirm_paid('00000000-0000-0000-0000-500000000014', 100000, 'TX_CONFLICT_HOLDING_14', 1000014))->>'status'),
  'NEEDS_MANUAL_REVIEW',
  'Defect 1: confirm_paid xử lý êm thuận xung đột ghế khi đơn ở holding không vỡ 23514'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000014'),
  'needs_manual_review'::public.order_status,
  'Defect 1: Đơn 14 chuyển sang needs_manual_review thành công'
);

-- ---------------------------------------------------------------------------
-- 12. Test Defect 2: BOLA / IDOR trên confirm_zero_amount
-- ---------------------------------------------------------------------------
-- Tạo đơn 12 (0đ, user_id là cust1: ...0d01, ghế C3)
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-500000000012', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d01', 'holding', 100000, 100000, 0,
   now() + interval '10 minutes', 'cust1@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000012', '00000000-0000-0000-0000-500000000012',
   '00000000-0000-0000-0000-00000000b303', 'C3', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b303',
   'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000012');

-- Đóng vai cust2 (User B) gọi confirm_zero_amount trên đơn của cust1 (User A)
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select public.tap_as('00000000-0000-0000-0000-000000000d02');

select throws_ok(
  $$ select public.confirm_zero_amount('00000000-0000-0000-0000-500000000012') $$,
  '42501',
  null,
  'Defect 2: Chặn User B gọi confirm_zero_amount trên đơn của User A (chống BOLA/IDOR)'
);

-- Đóng vai chính User A gọi xác nhận đơn của mình -> thành công
select public.tap_as('00000000-0000-0000-0000-000000000d01');

select is(
  (select (public.confirm_zero_amount('00000000-0000-0000-0000-500000000012'))->>'status'),
  'SUCCESS',
  'Defect 2: User A gọi confirm_zero_amount trên đơn của chính mình thành công'
);

select is(
  (select status from public.orders where id = '00000000-0000-0000-0000-500000000012'),
  'paid'::public.order_status,
  'Defect 2: Đơn 12 chuyển sang paid khi chính chủ xác nhận'
);

-- Trở lại quyền postgres owner
select public.tap_owner();

-- ---------------------------------------------------------------------------
-- 13. Test Defect 3: confirm_pos_sale từ chối bán vé khi suất CANCELLED / không mở bán
-- ---------------------------------------------------------------------------
-- Đơn POS 13: Đặt suất chiếu CANCELLED (suất a502)
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount) values
  ('00000000-0000-0000-0000-500000000013', 'POS', '00000000-0000-0000-0000-00000000a502',
   'holding', 80000, 80000);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000013', '00000000-0000-0000-0000-500000000013',
   '00000000-0000-0000-0000-00000000b304', 'C4', 'NORMAL', 80000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000b304',
   'HELD', 'POS', now() + interval '5 minutes', '00000000-0000-0000-0000-500000000013');

select throws_ok(
  $$ select public.confirm_pos_sale('00000000-0000-0000-0000-500000000013') $$,
  '23514',
  null,
  'Defect 3: confirm_pos_sale từ chối bán vé khi suất chiếu đã bị CANCELLED (R-127, AC-24)'
);

-- Cập nhật suất sang trạng thái khác ON_SALE (CLOSED)
update public.showtimes set status = 'CLOSED' where id = '00000000-0000-0000-0000-00000000a502';

select throws_ok(
  $$ select public.confirm_pos_sale('00000000-0000-0000-0000-500000000013') $$,
  '23514',
  null,
  'Defect 3: confirm_pos_sale từ chối bán vé khi suất chiếu không ở trạng thái ON_SALE'
);

select * from finish();
rollback;
