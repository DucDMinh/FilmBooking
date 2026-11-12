-- Reviewer repro (bug-layer34-review phase-2 task-03 round 1): POS bán vé cho rạp TEMP_CLOSED => vi phạm bất biến R-33/AC-26.
begin;
select plan(4);

insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-00000099a001', 'R99', 'Tinh R99');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-00000099c001', 'R991', 'Rap R99', '00000000-0000-0000-0000-00000099a001', '1 Test');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000099e001', 'phim-r99', 'Phim R99', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000099f001', '00000000-0000-0000-0000-00000099c001', 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000099b001', '00000000-0000-0000-0000-00000099f001', '00000000-0000-0000-0000-00000099c001', 'A', 1, 'NORMAL', 'A1');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000099d001', '00000000-0000-0000-0000-00000099c001', '00000000-0000-0000-0000-00000099f001',
   '00000000-0000-0000-0000-00000099e001', now() + interval '2 days', '2D', 'ON_SALE');
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at) values
  ('00000000-0000-0000-0000-990000000001', 'POS', '00000000-0000-0000-0000-00000099d001', 'holding', 100000, 0, 100000, now() + interval '10 minutes');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-990000006001', '00000000-0000-0000-0000-990000000001', '00000000-0000-0000-0000-00000099b001', 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000099d001', '00000000-0000-0000-0000-00000099b001', 'HELD', 'POS', now() + interval '10 minutes',
   '00000000-0000-0000-0000-990000000001');

-- 1. Admin tạm đóng rạp: chưa có vé bán => set_cinema_status cho phép (R-33)
select is((public.set_cinema_status('00000000-0000-0000-0000-00000099c001', 'TEMP_CLOSED'))->>'status', 'TEMP_CLOSED',
  'R-33: rạp chưa có suất tương lai đã bán => được tạm đóng');

-- 2. POS chốt bán trên rạp đã TEMP_CLOSED
create temp table r99 (r jsonb);
insert into r99 select public.confirm_pos_sale('00000000-0000-0000-0000-990000000001', 'REQ_R99');
select is((select r->>'status' from r99), 'SUCCESS', 'POS chốt bán thành công dù rạp TEMP_CLOSED');

-- 3. Trạng thái cấm bởi R-33/AC-26 xuất hiện: rạp đóng + suất tương lai không huỷ + ghế SOLD
select ok(exists (
  select 1 from public.cinemas c
  join public.showtimes st on st.cinema_id = c.id and st.starts_at > now() and st.status <> 'CANCELLED'
  join public.showtime_seat_states s on s.showtime_id = st.id and s.state = 'SOLD'
  where c.id = '00000000-0000-0000-0000-00000099c001' and c.status <> 'OPEN'),
  'Bất biến R-33 bị phá: rạp không OPEN có suất tương lai đã bán vé');

-- 4. Chính set_cinema_status giờ coi trạng thái này là không hợp lệ
select throws_like($$select public.set_cinema_status('00000000-0000-0000-0000-00000099c001', 'CLOSED')$$,
  'CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES%', 'set_cinema_status từ chối đóng rạp vì có suất đã bán (tức là POS đã tạo ra trạng thái R-33 cấm)');

select * from finish();
rollback;
