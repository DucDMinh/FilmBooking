-- ============================================================================
-- pgTAP Test: 050_order_lifecycle.test.sql
-- bug-layer34-review phase-2 task-01 (M1a/b + M2): vòng đời đơn pending_payment.
--  (b) hold_seats §3.14 (lazy expire): pending_payment quá hạn -> expired, payment EXPIRED, voucher RELEASED, ghế trống
--  (a) expire_overdue_holds (job): tương tự
--  (c) hold_seats §3.13: khách tạo đơn mới -> đơn pending_payment còn hạn cũ bị cancelled (R-64, quyết định #9)
--  (d) unique index: 1 khách không có 2 đơn holding/pending_payment cùng lúc
-- ============================================================================
begin;
select plan(17);

create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end;
$$;
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000050000a1', 'T50', 'Tỉnh Test 50');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000050000c1', 'T501', 'Rạp T50-1', '00000000-0000-0000-0000-0000050000a1', '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000500e001', 'phim-test-50', 'Phim 50', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'P1', '{2D}', 3, 6);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000500b101', '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000500b102', '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000500b103', '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'A', 3, 'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000500b104', '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'A', 4, 'NORMAL', 'A4'),
  ('00000000-0000-0000-0000-00000500b105', '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'B', 1, 'NORMAL', 'B1'),
  ('00000000-0000-0000-0000-00000500b106', '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-0000050000c1', 'B', 2, 'NORMAL', 'B2');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-0000050000c1',
   '00000000-0000-0000-0000-00000500f101', '00000000-0000-0000-0000-00000500e001',
   now() + interval '2 days', '2D', 'ON_SALE');

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000050000d1', 'u1-50@example.com', '{}', now()),
  ('00000000-0000-0000-0000-0000050000d2', 'u2-50@example.com', '{}', now()),
  ('00000000-0000-0000-0000-0000050000d3', 'u3-50@example.com', '{}', now()),
  ('00000000-0000-0000-0000-0000050000d4', 'u4-50@example.com', '{}', now());
update public.profiles set date_of_birth = '1995-05-15'
 where id in ('00000000-0000-0000-0000-0000050000d1', '00000000-0000-0000-0000-0000050000d2',
              '00000000-0000-0000-0000-0000050000d3', '00000000-0000-0000-0000-0000050000d4');

insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount)
  select 'CHAIN', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 90000
    from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;

insert into public.vouchers (id, code, discount_type, discount_value, min_order_amount) values
  ('00000000-0000-0000-0000-0000050000f1', 'T50V', 'FIXED', 10000, 0);

-- O1 (U1) + O2 (U2): pending_payment ĐÃ quá hạn, giữ A1/A2.  O4 (U4): pending_payment CÒN hạn, giữ A3.
insert into public.orders (id, channel, showtime_id, status, user_id, subtotal_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-500000000001', 'WEB', '00000000-0000-0000-0000-00000500a501', 'pending_payment', '00000000-0000-0000-0000-0000050000d1', 100000, 100000, now() - interval '1 minute', 'u1@example.com'),
  ('00000000-0000-0000-0000-500000000002', 'WEB', '00000000-0000-0000-0000-00000500a501', 'pending_payment', '00000000-0000-0000-0000-0000050000d2', 100000, 100000, now() - interval '1 minute', 'u2@example.com'),
  ('00000000-0000-0000-0000-500000000004', 'WEB', '00000000-0000-0000-0000-00000500a501', 'pending_payment', '00000000-0000-0000-0000-0000050000d4', 100000, 100000, now() + interval '8 minutes', 'u4@example.com');
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-00000500b101', 'HELD', 'WEB', now() - interval '1 minute', '00000000-0000-0000-0000-500000000001'),
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-00000500b102', 'HELD', 'WEB', now() - interval '1 minute', '00000000-0000-0000-0000-500000000002'),
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-00000500b103', 'HELD', 'WEB', now() + interval '8 minutes', '00000000-0000-0000-0000-500000000004'),
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-00000500b104', 'HELD', 'WEB', now() + interval '8 minutes', '00000000-0000-0000-0000-500000000004');
insert into public.payments (id, order_id, cinema_id, order_code, amount, status) values
  ('00000000-0000-0000-0000-500000005001', '00000000-0000-0000-0000-500000000001', '00000000-0000-0000-0000-0000050000c1', 5000001, 100000, 'PENDING'),
  ('00000000-0000-0000-0000-500000005002', '00000000-0000-0000-0000-500000000002', '00000000-0000-0000-0000-0000050000c1', 5000002, 100000, 'PENDING'),
  ('00000000-0000-0000-0000-500000005004', '00000000-0000-0000-0000-500000000004', '00000000-0000-0000-0000-0000050000c1', 5000004, 100000, 'PENDING');
insert into public.voucher_redemptions (id, voucher_id, order_id, user_id, discount_amount, status) values
  ('00000000-0000-0000-0000-500000007001', '00000000-0000-0000-0000-0000050000f1', '00000000-0000-0000-0000-500000000001', '00000000-0000-0000-0000-0000050000d1', 10000, 'HELD'),
  ('00000000-0000-0000-0000-500000007002', '00000000-0000-0000-0000-0000050000f1', '00000000-0000-0000-0000-500000000002', '00000000-0000-0000-0000-0000050000d2', 10000, 'HELD'),
  ('00000000-0000-0000-0000-500000007004', '00000000-0000-0000-0000-0000050000f1', '00000000-0000-0000-0000-500000000004', '00000000-0000-0000-0000-0000050000d4', 10000, 'HELD');

-- O6: đơn đã paid (hold_expires_at quá khứ), ghế B2 SOLD: §3.14 và job không được đụng tới
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-500000000006', 'WEB', '00000000-0000-0000-0000-00000500a501', 'pending_payment', 100000, 100000, now() - interval '1 minute', 'u6@example.com');
update public.orders set status = 'paid', booking_code = 'T501-000006' where id = '00000000-0000-0000-0000-500000000006';
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-00000500b106', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000006');

-- (b) U3 giữ A2: hold_seats dọn hold quá hạn của suất (lazy expire) gồm cả đơn pending_payment
select public.tap_as('00000000-0000-0000-0000-0000050000d3');
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000500a501'::uuid, array['00000000-0000-0000-0000-00000500b101','00000000-0000-0000-0000-00000500b102']::uuid[])$$,
  '(b) hold_seats giữ được ghế A1,A2 vừa được dọn từ đơn pending_payment quá hạn');
reset role;
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-500000000002'), 'expired', '(b) đơn pending_payment quá hạn -> expired (lazy)');
select is((select status::text from public.payments where id = '00000000-0000-0000-0000-500000005002'), 'EXPIRED', '(b) payment của đơn quá hạn -> EXPIRED');
select is((select status::text from public.voucher_redemptions where id = '00000000-0000-0000-0000-500000007002'), 'RELEASED', '(b) lượt voucher HELD -> RELEASED');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-500000000001'), 'expired', '(b) đơn quá hạn thứ hai cùng suất cũng expired');

select is((select status::text from public.payments where id = '00000000-0000-0000-0000-500000005001') || '/' ||
          (select status::text from public.voucher_redemptions where id = '00000000-0000-0000-0000-500000007001'),
          'EXPIRED/RELEASED', '(b) đơn quá hạn thứ nhất: payment EXPIRED, voucher RELEASED');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-500000000004') || '/' ||
          (select status::text from public.payments where id = '00000000-0000-0000-0000-500000005004') || '/' ||
          (select status::text from public.voucher_redemptions where id = '00000000-0000-0000-0000-500000007004'),
          'pending_payment/PENDING/HELD', '(b) âm: đơn pending_payment còn hạn của khách khác KHÔNG bị đụng');

-- (a) job: O5 (U1, hết đơn đang giữ vì O1 đã expired) pending_payment quá hạn
insert into public.orders (id, channel, showtime_id, status, user_id, subtotal_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-500000000005', 'WEB', '00000000-0000-0000-0000-00000500a501', 'pending_payment', '00000000-0000-0000-0000-0000050000d1', 100000, 100000, now() - interval '1 minute', 'u5@example.com');
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000500a501', '00000000-0000-0000-0000-00000500b105', 'HELD', 'WEB', now() - interval '1 minute', '00000000-0000-0000-0000-500000000005');
insert into public.payments (id, order_id, cinema_id, order_code, amount, status) values
  ('00000000-0000-0000-0000-500000005005', '00000000-0000-0000-0000-500000000005', '00000000-0000-0000-0000-0000050000c1', 5000005, 100000, 'PENDING');
insert into public.voucher_redemptions (id, voucher_id, order_id, user_id, discount_amount, status) values
  ('00000000-0000-0000-0000-500000007005', '00000000-0000-0000-0000-0000050000f1', '00000000-0000-0000-0000-500000000005', '00000000-0000-0000-0000-0000050000d1', 10000, 'HELD');

select is(public.expire_overdue_holds(), 1, '(a) expire_overdue_holds expire đúng 1 đơn pending_payment quá hạn (O5)');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-500000000006') || '/' ||
          (select count(*) from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000006' and state = 'SOLD'),
          'paid/1', '(a) âm: đơn paid quá hạn + ghế SOLD không bị §3.14/job đụng tới');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-500000000005'), 'expired', '(a) đơn pending_payment quá hạn -> expired');
select is((select status::text from public.payments where id = '00000000-0000-0000-0000-500000005005'), 'EXPIRED', '(a) payment -> EXPIRED');
select is((select status::text from public.voucher_redemptions where id = '00000000-0000-0000-0000-500000007005'), 'RELEASED', '(a) voucher HELD -> RELEASED');
select is((select count(*) from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-500000000005'), 0::bigint, '(a) ghế đã trống');

-- (c) U4 (đang chờ thanh toán O4, còn hạn) giữ ghế mới -> O4 bị huỷ
select public.tap_as('00000000-0000-0000-0000-0000050000d4');
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000500a501'::uuid, array['00000000-0000-0000-0000-00000500b103','00000000-0000-0000-0000-00000500b104']::uuid[])$$,
  '(c) U4 tạo đơn mới khi đang có đơn pending_payment còn hạn');
reset role;
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-500000000004'), 'cancelled', '(c) đơn pending_payment cũ -> cancelled');
select is((select status::text from public.payments where id = '00000000-0000-0000-0000-500000005004') || '/' ||
          (select status::text from public.voucher_redemptions where id = '00000000-0000-0000-0000-500000007004'),
          'CANCELLED/RELEASED', '(c) payment cũ CANCELLED, voucher cũ RELEASED');

-- (d) unique: U4 đã có 1 đơn holding; thêm pending_payment thứ hai phải bị chặn
select throws_ok(
  $$insert into public.orders (channel, showtime_id, status, user_id, subtotal_amount, total_amount, hold_expires_at, contact_email)
    values ('WEB', '00000000-0000-0000-0000-00000500a501', 'pending_payment', '00000000-0000-0000-0000-0000050000d4', 100000, 100000, now() + interval '5 minutes', 'dup@example.com')$$,
  '23505', null, '(d) 1 khách không thể có đơn holding + pending_payment cùng lúc');

select * from finish();
rollback;
