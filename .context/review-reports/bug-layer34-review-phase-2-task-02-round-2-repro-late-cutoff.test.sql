-- Reviewer repro (round 2, bổ sung) — BEGIN ... ROLLBACK, không đổi dữ liệu.
-- M1c + F3: đơn pending_payment QUÁ HẠN chưa bị job quét (dòng HELD còn) phải được coi là "tiền về muộn"
-- => áp mốc đóng bán online. Suất bắt đầu sau 10 phút, cutoff 15 => needs_manual_review, 0 vé.
-- Đối chứng: cùng điều kiện nhưng suất sau 2 ngày => SUCCESS với recovered = true.
begin;
select plan(4);

create function public.r3_id(p_kind int, p_n int) returns uuid language sql immutable as $$
  select format('00000000-0000-0000-%s-%s', lpad(p_kind::text, 4, '0'), lpad((700 + p_n)::text, 12, '0'))::uuid
$$;
insert into public.provinces (id, code, name) values (public.r3_id(9, 1), 'R72', 'Tinh R72');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  (public.r3_id(1, 1), 'R721', 'Rap R72', public.r3_id(9, 1), '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  (public.r3_id(9, 2), 'phim-r-72', 'Phim R72', 120, '2026-12-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  (public.r3_id(2, 1), public.r3_id(1, 1), 'P1', '{2D}', 3, 3),
  (public.r3_id(2, 2), public.r3_id(1, 1), 'P2', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  (public.r3_id(3, 1), public.r3_id(2, 1), public.r3_id(1, 1), 'A', 1, 'NORMAL', 'A1'),
  (public.r3_id(3, 2), public.r3_id(2, 2), public.r3_id(1, 1), 'A', 1, 'NORMAL', 'A1');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  (public.r3_id(4, 1), public.r3_id(1, 1), public.r3_id(2, 1), public.r3_id(9, 2), now() + interval '10 minutes', '2D', 'ON_SALE'),
  (public.r3_id(4, 2), public.r3_id(1, 1), public.r3_id(2, 2), public.r3_id(9, 2), now() + interval '2 days', '2D', 'ON_SALE');

-- L1: pending_payment quá hạn 1 phút, HELD còn, suất sau 10 phút (qua cutoff 15)
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email)
values (public.r3_id(5, 1), 'WEB', public.r3_id(4, 1), 'pending_payment', 100000, 100000, now() - interval '1 minute', 'l1@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r3_id(5, 1), public.r3_id(3, 1), 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
values (public.r3_id(4, 1), public.r3_id(3, 1), 'HELD', 'WEB', now() - interval '1 minute', public.r3_id(5, 1));
-- L2: như L1 nhưng suất sau 2 ngày
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email)
values (public.r3_id(5, 2), 'WEB', public.r3_id(4, 2), 'pending_payment', 100000, 100000, now() - interval '1 minute', 'l2@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r3_id(5, 2), public.r3_id(3, 2), 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
values (public.r3_id(4, 2), public.r3_id(3, 2), 'HELD', 'WEB', now() - interval '1 minute', public.r3_id(5, 2));

create temp table r3_res (k text primary key, r jsonb);
insert into r3_res values ('l1', public.confirm_paid(public.r3_id(5, 1), 100000, 'R72_TX_1', 7290001));
insert into r3_res values ('l2', public.confirm_paid(public.r3_id(5, 2), 100000, 'R72_TX_2', 7290002));

select is((select r->>'status' from r3_res where k = 'l1'), 'NEEDS_MANUAL_REVIEW',
  'L1 hold quá hạn chưa quét + qua cutoff -> coi là tiền về muộn -> needs_manual_review');
select is((select count(*)::int from public.tickets where order_id = public.r3_id(5, 1)), 0, 'L1 không vé');
select is((select r->>'status' from r3_res where k = 'l2'), 'SUCCESS', 'L2 hold quá hạn, chưa qua cutoff -> SUCCESS');
select is((select r->>'recovered' from r3_res where k = 'l2'), 'true', 'L2 đi nhánh tiền về muộn (recovered = true)');

select * from finish();
rollback;
