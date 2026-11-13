-- pgTAP: cancel_stale_payment (20261113180000_cron_http_jobs.sql) - huỷ theo payment, không giết link mới của cùng đơn
begin;
select plan(14);

insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000060000a1', 'T60', 'Tỉnh Test 60');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000060000c1', 'T601', 'Rạp T60-1', '00000000-0000-0000-0000-0000060000a1', '1 Test');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000600e001', 'phim-test-60', 'Phim 60', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000600f101', '00000000-0000-0000-0000-0000060000c1', 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000600b101', '00000000-0000-0000-0000-00000600f101', '00000000-0000-0000-0000-0000060000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000600b102', '00000000-0000-0000-0000-00000600f101', '00000000-0000-0000-0000-0000060000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000600b103', '00000000-0000-0000-0000-00000600f101', '00000000-0000-0000-0000-0000060000c1', 'A', 3, 'NORMAL', 'A3');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000600a501', '00000000-0000-0000-0000-0000060000c1', '00000000-0000-0000-0000-00000600f101',
   '00000000-0000-0000-0000-00000600e001', now() + interval '2 days', '2D', 'ON_SALE');

-- 3 đơn: o1 pending_payment (A cũ + B mới), o2 pending_payment (chỉ 1 payment), o3 đã paid
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-000006000001', 'WEB', '00000000-0000-0000-0000-00000600a501', 'pending_payment', 100000, 100000, now() + interval '10 minutes', 'o1@example.com'),
  ('00000000-0000-0000-0000-000006000002', 'WEB', '00000000-0000-0000-0000-00000600a501', 'pending_payment', 100000, 100000, now() + interval '10 minutes', 'o2@example.com'),
  ('00000000-0000-0000-0000-000006000003', 'WEB', '00000000-0000-0000-0000-00000600a501', 'paid',            100000, 100000, now() + interval '10 minutes', 'o3@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-000006000001', '00000000-0000-0000-0000-00000600b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-000006000002', '00000000-0000-0000-0000-00000600b102', 'A2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-000006000003', '00000000-0000-0000-0000-00000600b103', 'A3', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000600a501', '00000000-0000-0000-0000-00000600b101', 'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-000006000001'),
  ('00000000-0000-0000-0000-00000600a501', '00000000-0000-0000-0000-00000600b102', 'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-000006000002');

insert into public.payments (id, cinema_id, order_id, order_code, amount, status, created_at) values
  ('00000000-0000-0000-0000-0000060000a0', '00000000-0000-0000-0000-0000060000c1', '00000000-0000-0000-0000-000006000001', 6001, 100000, 'PENDING', now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-0000060000b0', '00000000-0000-0000-0000-0000060000c1', '00000000-0000-0000-0000-000006000001', 6002, 100000, 'PENDING', now() - interval '5 minutes'),
  ('00000000-0000-0000-0000-0000060000c0', '00000000-0000-0000-0000-0000060000c1', '00000000-0000-0000-0000-000006000002', 6003, 100000, 'PENDING', now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-0000060000d0', '00000000-0000-0000-0000-0000060000c1', '00000000-0000-0000-0000-000006000003', 6004, 100000, 'PENDING', now() - interval '20 minutes');

-- 1. Payment A cũ (đã có B mới) -> no-op, ghế + B nguyên vẹn
select is(public.cancel_stale_payment('00000000-0000-0000-0000-0000060000a0', 'CANCELLED') ->> 'reason', 'NEWER_PAYMENT_EXISTS', 'A cũ có B mới -> SKIPPED');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-000006000001'), 'pending_payment', 'đơn o1 không bị huỷ');
select is((select status::text from public.payments where id = '00000000-0000-0000-0000-0000060000b0'), 'PENDING', 'B mới vẫn PENDING');
select is((select count(*)::int from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-000006000001'), 1, 'ghế o1 vẫn giữ');

-- 2. Payment B mới nhất -> huỷ đơn, nhả ghế
select is(public.cancel_stale_payment('00000000-0000-0000-0000-0000060000b0', 'CANCELLED') ->> 'status', 'cancelled', 'B mới nhất -> huỷ đơn');
select is((select count(*)::int from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-000006000001'), 0, 'ghế o1 được nhả');
select is(public.cancel_stale_payment('00000000-0000-0000-0000-0000060000a0', 'CANCELLED') ->> 'reason', 'PAYMENT_NOT_PENDING', 'A không còn PENDING -> SKIPPED, không lỗi');

-- 3. Payment duy nhất của o2, lý do EXPIRED -> đơn expired
select is(public.cancel_stale_payment('00000000-0000-0000-0000-0000060000c0', 'EXPIRED') ->> 'status', 'expired', 'payment duy nhất -> expired');
select is((select status::text from public.payments where id = '00000000-0000-0000-0000-0000060000c0'), 'EXPIRED', 'payment o2 EXPIRED');

-- 4. Đơn đã paid -> no-op (không raise)
select is(public.cancel_stale_payment('00000000-0000-0000-0000-0000060000d0', 'CANCELLED') ->> 'reason', 'ORDER_NOT_PENDING', 'đơn paid -> SKIPPED');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-000006000003'), 'paid', 'đơn paid giữ nguyên');

-- 5. Payment không tồn tại
select is(public.cancel_stale_payment('00000000-0000-0000-0000-0000060000ff', 'CANCELLED') ->> 'reason', 'PAYMENT_NOT_FOUND', 'payment lạ -> SKIPPED');

-- 6. ACL
select ok(not has_function_privilege('anon', 'public.cancel_stale_payment(uuid,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.cancel_stale_payment(uuid,text)', 'execute'), 'anon/authenticated không execute');
select ok(has_function_privilege('service_role', 'public.cancel_stale_payment(uuid,text)', 'execute'), 'service_role execute');

select * from finish();
rollback;
