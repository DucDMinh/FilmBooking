-- ============================================================================
-- pgTAP Test: 072_tickets_seat_fk.test.sql
-- bug tickets-seat-fk phase-1 task-01 (CR-002): FK tickets.seat_id -> seats(id) ON DELETE RESTRICT (HIGH_RISK_MIGRATION).
-- Chạy trong 1 transaction (rollback), không dblink. Race confirm_paid x hold_seats nằm ở 071.
-- Lưu ý: precheck "vé mồ côi chặn migration" không mô phỏng được (FK đã tồn tại thì không tạo được vé mồ côi).
-- ============================================================================
begin;
select plan(6);

select ok(exists (select 1 from pg_constraint where conrelid = 'public.tickets'::regclass and conname = 'tickets_seat_id_fkey'
                   and contype = 'f' and confrelid = 'public.seats'::regclass and confdeltype = 'r' and convalidated),
  'FK tickets_seat_id_fkey -> seats(id) ON DELETE RESTRICT tồn tại và đã validate');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'tickets' and indexname = 'tickets_seat_id_idx'),
  'index hỗ trợ FK tickets_seat_id_idx tồn tại');

insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000720000a1', 'T72', 'Tỉnh T72');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000720000c1', 'T721', 'Rạp T72', '00000000-0000-0000-0000-0000720000a1', '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-0000720000e1', 'phim-t72', 'Phim T72', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-0000720000f1', '00000000-0000-0000-0000-0000720000c1', 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-0000720000b1', '00000000-0000-0000-0000-0000720000f1', '00000000-0000-0000-0000-0000720000c1', 'A', 1, 'NORMAL', 'A1');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-000072000051', '00000000-0000-0000-0000-0000720000c1', '00000000-0000-0000-0000-0000720000f1',
   '00000000-0000-0000-0000-0000720000e1', now() + interval '5 days', '2D', 'ON_SALE');
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
  ('00000000-0000-0000-0000-000072000a01', 'WEB', '00000000-0000-0000-0000-000072000051', 'holding', 100000, 0, 100000,
   now() + interval '10 minutes', 't72a@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-000072000a61', '00000000-0000-0000-0000-000072000a01', '00000000-0000-0000-0000-0000720000b1', 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-000072000051', '00000000-0000-0000-0000-0000720000b1', 'HELD', 'WEB',
   now() + interval '10 minutes', '00000000-0000-0000-0000-000072000a01');

select is((public.confirm_paid('00000000-0000-0000-0000-000072000a01', 100000, 'T72_TXN_1', null))->>'success', 'true',
  'confirm_paid vẫn chốt bán được khi có FK (sell_order_seats khoá seats rồi seat_states)');
select is((select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-000072000a01'), 1::bigint,
  'vé hợp lệ (ghế tồn tại) vẫn được tạo, seat_id điền bởi trigger');

-- Bỏ FK order_seats.seat_id (trong transaction, rollback cuối test) để kiểm riêng FK của tickets.
alter table public.order_seats drop constraint order_seats_seat_id_fkey;
select throws_ok($$delete from public.seats where id = '00000000-0000-0000-0000-0000720000b1'$$, '23503', null,
  'xoá ghế còn vé bị chặn (RESTRICT)');
create function pg_temp.try_delete() returns text language plpgsql as $f$ begin delete from public.seats where id = '00000000-0000-0000-0000-0000720000b1'; return 'no error'; exception when foreign_key_violation then return sqlerrm; end $f$;
select matches(
  (select m from (select pg_temp.try_delete() as m) x), 'tickets_seat_id_fkey', 'lỗi do chính FK tickets_seat_id_fkey');
select * from finish();
rollback;
