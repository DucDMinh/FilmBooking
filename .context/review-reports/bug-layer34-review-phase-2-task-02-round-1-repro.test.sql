-- Reviewer repro (round 1) — KHÔNG phải test của dự án; chạy trong transaction + rollback.
-- Chứng minh: lượt voucher khách đã GỠ (remove_voucher => RELEASED, orders.voucher_id null, trả đủ giá)
-- bị confirm_paid hồi sinh thành CONSUMED (vượt trần), và đơn tiền-về-muộn bị chặn VOUCHER_EXHAUSTED oan.
begin;
select plan(4);

create function public.r_id(p_kind int, p_n int) returns uuid language sql immutable as $$
  select format('00000000-0000-0000-%s-%s', lpad(p_kind::text, 4, '0'), lpad((900 + p_n)::text, 12, '0'))::uuid
$$;

insert into public.provinces (id, code, name) values (public.r_id(9, 1), 'R52', 'Tinh R52');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  (public.r_id(1, 1), 'R521', 'Rap R52', public.r_id(9, 1), '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  (public.r_id(9, 2), 'phim-r-52', 'Phim R52', 120, '2026-12-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols)
values (public.r_id(2, 1), public.r_id(1, 1), 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  (public.r_id(3, 1), public.r_id(2, 1), public.r_id(1, 1), 'A', 1, 'NORMAL', 'A1'),
  (public.r_id(3, 2), public.r_id(2, 1), public.r_id(1, 1), 'A', 2, 'NORMAL', 'A2'),
  (public.r_id(3, 3), public.r_id(2, 1), public.r_id(1, 1), 'A', 3, 'NORMAL', 'A3');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status)
values (public.r_id(4, 1), public.r_id(1, 1), public.r_id(2, 1), public.r_id(9, 2), now() + interval '2 days', '2D', 'ON_SALE');

insert into public.vouchers (id, code, discount_type, discount_value, min_order_amount, total_uses_limit, per_user_limit) values
  (public.r_id(7, 1), 'R52V1', 'FIXED', 10000, 0, 1, null);

-- O1: đơn khác đã dùng hết lượt V1 (CONSUMED)
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email)
values (public.r_id(5, 1), 'WEB', public.r_id(4, 1), 'pending_payment', 100000, 100000, now() + interval '10 minutes', 'r1@example.com');
-- O2: khách đã GỠ voucher (RELEASED, orders.voucher_id null, total = subtotal), hold còn hạn
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email)
values (public.r_id(5, 2), 'WEB', public.r_id(4, 1), 'pending_payment', 100000, 100000, now() + interval '10 minutes', 'r2@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r_id(5, 2), public.r_id(3, 2), 'A2', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
values (public.r_id(4, 1), public.r_id(3, 2), 'HELD', 'WEB', now() + interval '10 minutes', public.r_id(5, 2));
-- O3: như O2 nhưng đơn đã expired (tiền về muộn), ghế còn trống
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email)
values (public.r_id(5, 3), 'WEB', public.r_id(4, 1), 'expired', 100000, 100000, now() - interval '1 minute', 'r3@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r_id(5, 3), public.r_id(3, 3), 'A3', 'NORMAL', 100000);

insert into public.voucher_redemptions (voucher_id, order_id, user_id, discount_amount, status) values
  (public.r_id(7, 1), public.r_id(5, 1), null, 10000, 'CONSUMED'),
  (public.r_id(7, 1), public.r_id(5, 2), null, 10000, 'RELEASED'),
  (public.r_id(7, 1), public.r_id(5, 3), null, 10000, 'RELEASED');

create temp table r_res (k text primary key, r jsonb);
insert into r_res values ('o2', public.confirm_paid(public.r_id(5, 2), 100000, 'R52_TX_2', 5290002));
insert into r_res values ('o3', public.confirm_paid(public.r_id(5, 3), 100000, 'R52_TX_3', 5290003));

select is((select r->>'status' from r_res where k = 'o2'), 'SUCCESS', 'O2 (voucher đã gỡ, trả đủ giá, hold còn hạn) chốt bán');
select is((select status::text from public.voucher_redemptions where order_id = public.r_id(5, 2)), 'RELEASED',
  'O2: lượt voucher đã GỠ không được hồi sinh thành CONSUMED');
select is((select count(*)::int from public.voucher_redemptions where voucher_id = public.r_id(7, 1) and status in ('HELD','CONSUMED')), 1,
  'V1 (total_uses_limit=1) không vượt trần');
select is((select r->>'status' from r_res where k = 'o3'), 'SUCCESS',
  'O3 (voucher đã gỡ, trả đủ giá, tiền về muộn, ghế trống) phải chốt bán, không bị VOUCHER_EXHAUSTED');

select * from finish();
rollback;
