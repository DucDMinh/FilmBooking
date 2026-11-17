-- ============================================================================
-- pgTAP: 063_order_level_qr.test.sql
-- feature-order-level-qr phase-1 task-01: một QR cho cả đơn.
--   orders.qr_token (128-bit hex, unique, backfill) + checkin_ticket soát CẢ ĐƠN trong một lần quét.
-- Requirements: R-85, R-98, R-99, R-101, R-102. Acceptance: AC-12, AC-13.
-- ============================================================================
begin;
select plan(64);

create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end;
$$;

create function public.tap_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create function public.tap_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');

insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{"full_name":"Nguyễn Văn Staff 1"}'),
  ('00000000-0000-0000-0000-000000000c02', 'staff2@example.com', '{"full_name":"Trần Thị Staff 2"}'),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com',  '{"full_name":"Khách Hàng 1"}'),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com',  '{"full_name":"Khách Hàng 2"}');
update public.profiles set full_name = 'Nguyễn Văn Staff 1' where id = '00000000-0000-0000-0000-000000000c01';
update public.profiles set full_name = 'Trần Thị Staff 2' where id = '00000000-0000-0000-0000-000000000c02';

insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000c2', 'STAFF');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-a', 'Phim Chiếu Rạp A', 120, '2026-11-01', 'T13', 'PUBLISHED');

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1 HN01', '{2D}', 6, 12);

-- Ghế A1..A6, A10, B1-B2, C1-C2, D1-D3, E1-E2 (A10 để kiểm tra xếp tự nhiên A2 trước A10).
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label)
select ('00000000-0000-0000-0000-00000000b' || lpad(row_number() over ()::text, 3, '0'))::uuid,
       '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', v.r, v.c, 'NORMAL', v.r || v.c
  from (values ('A',1),('A',2),('A',3),('A',4),('A',5),('A',6),('A',10),
               ('B',1),('B',2),('C',1),('C',2),('D',1),('D',2),('D',3),('E',1),('E',2),('F',1),('F',2)) as v(r, c);

insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '15 minutes', now() + interval '135 minutes', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() - interval '4 hours', now() - interval '2 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '5 hours', now() + interval '7 hours', '2D', 'ON_SALE');

-- Oa 3 ghế (insert A10, A2, A1), Ob 2 ghế (booking_code), Oc 2 ghế (QR cũ theo ghế),
-- Od 3 ghế đã soát D1 từ trước (đơn legacy 'checked_in'), Oe 2 ghế (sai rạp),
-- Of đơn affected, Og suất quá sớm, Oh suất đã kết thúc, Oi paid nhưng không có vé.
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, booking_code) values
  ('00000000-0000-0000-0000-5a0000000001', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 300000, 0, 300000, 'HN01-QRA001'),
  ('00000000-0000-0000-0000-5a0000000002', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d02', 'paid', 200000, 0, 200000, 'HN01-QRB002'),
  ('00000000-0000-0000-0000-5a0000000003', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 200000, 0, 200000, 'HN01-QRC003'),
  ('00000000-0000-0000-0000-5a0000000004', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d02', 'checked_in', 300000, 0, 300000, 'HN01-QRD004'),
  ('00000000-0000-0000-0000-5a0000000005', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 200000, 0, 200000, 'HN01-QRE005'),
  ('00000000-0000-0000-0000-5a0000000006', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'affected', 100000, 0, 100000, 'HN01-QRF006'),
  ('00000000-0000-0000-0000-5a0000000007', 'WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 0, 100000, 'HN01-QRG007'),
  ('00000000-0000-0000-0000-5a0000000008', 'WEB', '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 0, 100000, 'HN01-QRH008'),
  ('00000000-0000-0000-0000-5a0000000009', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 0, 0, 0, 'HN01-QRI009'),
  ('00000000-0000-0000-0000-5a0000000010', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d02', 'checked_in', 200000, 0, 200000, 'HN01-QRJ010');

-- order_seats: id 6a..NN; seat_id lấy theo nhãn trong phòng.
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount)
select v.id::uuid, v.order_id::uuid, s.id, s.label, 'NORMAL', 100000
  from (values
    ('00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-5a0000000001', 'A10'),
    ('00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-5a0000000001', 'A2'),
    ('00000000-0000-0000-0000-6a0000000003', '00000000-0000-0000-0000-5a0000000001', 'A1'),
    ('00000000-0000-0000-0000-6a0000000004', '00000000-0000-0000-0000-5a0000000002', 'B1'),
    ('00000000-0000-0000-0000-6a0000000005', '00000000-0000-0000-0000-5a0000000002', 'B2'),
    ('00000000-0000-0000-0000-6a0000000006', '00000000-0000-0000-0000-5a0000000003', 'C1'),
    ('00000000-0000-0000-0000-6a0000000007', '00000000-0000-0000-0000-5a0000000003', 'C2'),
    ('00000000-0000-0000-0000-6a0000000008', '00000000-0000-0000-0000-5a0000000004', 'D1'),
    ('00000000-0000-0000-0000-6a0000000009', '00000000-0000-0000-0000-5a0000000004', 'D2'),
    ('00000000-0000-0000-0000-6a0000000010', '00000000-0000-0000-0000-5a0000000004', 'D3'),
    ('00000000-0000-0000-0000-6a0000000011', '00000000-0000-0000-0000-5a0000000005', 'E1'),
    ('00000000-0000-0000-0000-6a0000000012', '00000000-0000-0000-0000-5a0000000005', 'E2'),
    ('00000000-0000-0000-0000-6a0000000013', '00000000-0000-0000-0000-5a0000000006', 'A3'),
    ('00000000-0000-0000-0000-6a0000000014', '00000000-0000-0000-0000-5a0000000007', 'A4'),
    ('00000000-0000-0000-0000-6a0000000015', '00000000-0000-0000-0000-5a0000000008', 'A5'),
    ('00000000-0000-0000-0000-6a0000000016', '00000000-0000-0000-0000-5a0000000010', 'F1'),
    ('00000000-0000-0000-0000-6a0000000017', '00000000-0000-0000-0000-5a0000000010', 'F2')
  ) as v(id, order_id, label)
  join public.seats s on s.label = v.label and s.room_id = '00000000-0000-0000-0000-00000000f101';

-- tickets: qr_token vé biết trước cho test QR cũ theo ghế; D1 đã soát từ trước bởi Staff 2.
insert into public.tickets (id, order_id, order_seat_id, showtime_id, qr_token, checked_in_at, checked_in_by)
select v.id::uuid, v.order_id::uuid, v.order_seat_id::uuid, v.showtime_id::uuid, v.qr, v.at, v.by_user::uuid
  from (values
    ('00000000-0000-0000-0000-7a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-00000000a501', 'a0000000000000000000000000000001', null::timestamptz, null::text),
    ('00000000-0000-0000-0000-7a0000000002', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-00000000a501', 'a0000000000000000000000000000002', null, null),
    ('00000000-0000-0000-0000-7a0000000003', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-6a0000000003', '00000000-0000-0000-0000-00000000a501', 'a0000000000000000000000000000003', null, null),
    ('00000000-0000-0000-0000-7a0000000004', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-6a0000000004', '00000000-0000-0000-0000-00000000a501', 'b0000000000000000000000000000004', null, null),
    ('00000000-0000-0000-0000-7a0000000005', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-6a0000000005', '00000000-0000-0000-0000-00000000a501', 'b0000000000000000000000000000005', null, null),
    ('00000000-0000-0000-0000-7a0000000006', '00000000-0000-0000-0000-5a0000000003', '00000000-0000-0000-0000-6a0000000006', '00000000-0000-0000-0000-00000000a501', 'c0000000000000000000000000000006', null, null),
    ('00000000-0000-0000-0000-7a0000000007', '00000000-0000-0000-0000-5a0000000003', '00000000-0000-0000-0000-6a0000000007', '00000000-0000-0000-0000-00000000a501', 'c0000000000000000000000000000007', null, null),
    ('00000000-0000-0000-0000-7a0000000008', '00000000-0000-0000-0000-5a0000000004', '00000000-0000-0000-0000-6a0000000008', '00000000-0000-0000-0000-00000000a501', 'd0000000000000000000000000000008', now() - interval '10 minutes', '00000000-0000-0000-0000-000000000c02'),
    ('00000000-0000-0000-0000-7a0000000009', '00000000-0000-0000-0000-5a0000000004', '00000000-0000-0000-0000-6a0000000009', '00000000-0000-0000-0000-00000000a501', 'd0000000000000000000000000000009', null, null),
    ('00000000-0000-0000-0000-7a0000000010', '00000000-0000-0000-0000-5a0000000004', '00000000-0000-0000-0000-6a0000000010', '00000000-0000-0000-0000-00000000a501', 'd0000000000000000000000000000010', null, null),
    ('00000000-0000-0000-0000-7a0000000011', '00000000-0000-0000-0000-5a0000000005', '00000000-0000-0000-0000-6a0000000011', '00000000-0000-0000-0000-00000000a501', 'e0000000000000000000000000000011', null, null),
    ('00000000-0000-0000-0000-7a0000000012', '00000000-0000-0000-0000-5a0000000005', '00000000-0000-0000-0000-6a0000000012', '00000000-0000-0000-0000-00000000a501', 'e0000000000000000000000000000012', null, null),
    ('00000000-0000-0000-0000-7a0000000013', '00000000-0000-0000-0000-5a0000000006', '00000000-0000-0000-0000-6a0000000013', '00000000-0000-0000-0000-00000000a501', 'f0000000000000000000000000000013', null, null),
    ('00000000-0000-0000-0000-7a0000000014', '00000000-0000-0000-0000-5a0000000007', '00000000-0000-0000-0000-6a0000000014', '00000000-0000-0000-0000-00000000a504', '10000000000000000000000000000014', null, null),
    ('00000000-0000-0000-0000-7a0000000015', '00000000-0000-0000-0000-5a0000000008', '00000000-0000-0000-0000-6a0000000015', '00000000-0000-0000-0000-00000000a502', '20000000000000000000000000000015', null, null),
    ('00000000-0000-0000-0000-7a0000000016', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-6a0000000016', '00000000-0000-0000-0000-00000000a501', '30000000000000000000000000000016', now() - interval '20 minutes', '00000000-0000-0000-0000-000000000c02'),
    ('00000000-0000-0000-0000-7a0000000017', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-6a0000000017', '00000000-0000-0000-0000-00000000a501', '30000000000000000000000000000017', null, null)
  ) as v(id, order_id, order_seat_id, showtime_id, qr, at, by_user);

-- Ánh xạ qr_token đơn ra bảng tạm để dùng trong test (không in token ra ngoài).
create temp table tap_oq as select id as order_id, qr_token, booking_code from public.orders;
grant select on tap_oq to public;
create temp table tap_scan (k text, j jsonb);
grant all on tap_scan to public;

-- ---------------------------------------------------------------------------
-- (h) Schema / backfill / định dạng orders.qr_token
-- ---------------------------------------------------------------------------
select has_column('public', 'orders', 'qr_token', 'orders có cột qr_token');
select col_not_null('public', 'orders', 'qr_token', 'orders.qr_token NOT NULL');
select ok(
  (select count(*) > 0 and count(*) = count(distinct qr_token) from public.orders),
  'TOÀN BỘ đơn hiện có (cả đơn cũ đã backfill lẫn fixture) có qr_token duy nhất');
select ok(
  (select bool_and(qr_token ~ '^[0-9a-f]{32}$') from public.orders),
  'TOÀN BỘ orders.qr_token (cả đơn cũ backfill) là 128-bit hex ngẫu nhiên, không PII');
select ok(
  (select bool_and(qr_token ~ '^[0-9a-f]{32}$') from public.tickets),
  'tickets.qr_token vẫn 128-bit hex (giữ nguyên cho QR cũ theo ghế)');
select throws_ok(
  $$insert into public.orders (channel, showtime_id, user_id, status, qr_token)
    values ('WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid',
            (select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000002'))$$,
  '23505', null, 'orders.qr_token unique: trùng bị chặn');
select throws_ok(
  $$insert into public.orders (channel, showtime_id, user_id, status, qr_token)
    values ('WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 'NOT-HEX')$$,
  '23514', null, 'orders.qr_token sai định dạng bị chặn');
select throws_ok(
  $$update public.orders set qr_token = repeat('a', 32) where id = '00000000-0000-0000-0000-5a0000000001'$$,
  '23514', 'Không được đổi qr_token của đơn', 'orders.qr_token bất biến: UPDATE đổi token bị chặn (F5)');
select lives_ok(
  $$update public.orders set qr_token = qr_token where id = '00000000-0000-0000-0000-5a0000000001'$$,
  'UPDATE giữ nguyên qr_token không bị chặn');
select isnt(
  (select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000001'),
  (select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000002'),
  'hai đơn mới có qr_token mặc định khác nhau');

-- ---------------------------------------------------------------------------
-- (a) Đơn 3 ghế: quét orders.qr_token một lần -> soát cả đơn
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01');
insert into tap_scan (k, j)
  select 'a', public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000001'),
                               '00000000-0000-0000-0000-0000000000c1') ;

select is((select j->>'status' from tap_scan where k = 'a'), 'OK', '(a) quét QR đơn: status OK');
select is((select j->>'result' from tap_scan where k = 'a'), 'SUCCESS', '(a) result SUCCESS');
select is((select j->'seats' from tap_scan where k = 'a'), '["A1","A2","A10"]'::jsonb,
  '(a) seats đủ 3 nhãn, xếp tự nhiên (A2 trước A10)');
select is((select (j->>'seat_count')::int from tap_scan where k = 'a'), 3, '(a) seat_count = 3');
select is((select j->>'booking_code' from tap_scan where k = 'a'), 'HN01-QRA001', '(a) trả booking_code');
select is((select j->>'order_id' from tap_scan where k = 'a'), '00000000-0000-0000-0000-5a0000000001', '(a) trả order_id');
select ok(
  (select j ? 'movie_title' and j ? 'cinema_name' and j ? 'room_name' and j ? 'starts_at' and j ? 'checked_in_at' from tap_scan where k = 'a'),
  '(a) có đủ movie_title, cinema_name, room_name, starts_at, checked_in_at');
select ok(
  (select not (j ? 'ticket_id') and not (j ? 'seat_label') and not (j ? 'seat_type') from tap_scan where k = 'a'),
  '(a) bỏ ticket_id / seat_label / seat_type');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000001' and checked_in_at is not null),
  3::bigint, '(a) cả 3 vé của đơn có checked_in_at');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000001'
     and checked_in_by = '00000000-0000-0000-0000-000000000c01'),
  3::bigint, '(a) cả 3 vé có checked_in_by = staff quét');
select is(
  (select status::text from public.orders where id = '00000000-0000-0000-0000-5a0000000001'),
  'checked_in', '(a) đơn chuyển checked_in');
select is(
  (select count(*) from public.checkin_logs where result = 'SUCCESS'
     and ticket_id in (select id from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000001')),
  1::bigint, '(a) đúng 1 dòng checkin_logs SUCCESS cho cả đơn (R-101)');
select is(
  (select ticket_id from public.checkin_logs where result = 'SUCCESS'
     and ticket_id in (select id from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000001')),
  '00000000-0000-0000-0000-7a0000000001'::uuid, '(a) log ghi vé đại diện = vé đầu của đơn');

-- ---------------------------------------------------------------------------
-- (b) Quét lại -> USED kèm thời điểm + người soát lần đầu (AC-12)
-- ---------------------------------------------------------------------------
insert into tap_scan (k, j)
  select 'b', public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000001'),
                               '00000000-0000-0000-0000-0000000000c1') ;
select is((select j->>'status' from tap_scan where k = 'b'), 'USED', '(b) quét lại: USED');
select is((select j->>'staff_name' from tap_scan where k = 'b'), 'Nguyễn Văn Staff 1', '(b) trả tên người soát lần đầu');
select ok(
  (select (j->>'checked_in_at')::timestamptz = (select min(checked_in_at) from public.tickets
                                                  where order_id = '00000000-0000-0000-0000-5a0000000001') from tap_scan where k = 'b'),
  '(b) trả đúng thời điểm soát lần đầu');
select is(
  (select count(*) from public.checkin_logs where result = 'ALREADY_USED'
     and ticket_id = '00000000-0000-0000-0000-7a0000000001'),
  1::bigint, '(b) ghi checkin_logs ALREADY_USED');

-- ---------------------------------------------------------------------------
-- (c) Nhập booking_code -> soát cả đơn
-- ---------------------------------------------------------------------------
select is(
  (select public.checkin_ticket('HN01-QRB002', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'OK', '(c) nhập booking_code: OK');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000002' and checked_in_at is not null),
  2::bigint, '(c) cả 2 vé của đơn được soát');
select is(
  (select public.checkin_ticket('hn01-qrb002', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'USED', '(c) quét lại bằng booking_code viết thường: USED');

-- ---------------------------------------------------------------------------
-- (d) QR cũ theo ghế (tickets.qr_token) -> soát cả đơn
-- ---------------------------------------------------------------------------
insert into tap_scan (k, j)
  select 'd', public.checkin_ticket('c0000000000000000000000000000007', '00000000-0000-0000-0000-0000000000c1');
select is((select j->>'status' from tap_scan where k = 'd'), 'OK', '(d) QR cũ theo ghế: OK');
select is((select j->'seats' from tap_scan where k = 'd'), '["C1","C2"]'::jsonb, '(d) trả đủ ghế cả đơn');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000003' and checked_in_at is not null),
  2::bigint, '(d) cả 2 vé của đơn được soát dù chỉ quét QR 1 ghế');

-- ---------------------------------------------------------------------------
-- (e) Đơn đã soát 1 ghế từ trước (legacy): soát 2 ghế còn lại, không ghi đè lần cũ
-- ---------------------------------------------------------------------------
insert into tap_scan (k, j)
  select 'e', public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000004'),
                               '00000000-0000-0000-0000-0000000000c1') ;
select is((select j->>'status' from tap_scan where k = 'e'), 'OK', '(e) đơn soát dở: OK');
select is((select (j->>'seat_count')::int from tap_scan where k = 'e'), 3, '(e) seat_count tính cả ghế đã soát từ trước');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000004' and checked_in_at is not null),
  3::bigint, '(e) cả 3 vé có checked_in_at');
select ok(
  (select checked_in_at = now() - interval '10 minutes' and checked_in_by = '00000000-0000-0000-0000-000000000c02'
     from public.tickets where id = '00000000-0000-0000-0000-7a0000000008'),
  '(e) vé đã soát từ trước KHÔNG bị ghi đè checked_in_at/checked_in_by');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000004'
     and checked_in_by = '00000000-0000-0000-0000-000000000c01'),
  2::bigint, '(e) 2 vé còn lại ghi checked_in_by = staff quét');
select is(
  (select public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000004'),
                                '00000000-0000-0000-0000-0000000000c1')->>'staff_name'),
  'Trần Thị Staff 2', '(e) quét lại: USED trả người soát đầu tiên (vé soát từ trước)');

-- (e2) QR ghế ĐÃ soát khi đơn còn ghế chưa soát -> soát nốt phần còn lại, giữ nguyên lần soát cũ (F7)
select is(
  (select public.checkin_ticket('30000000000000000000000000000016', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'OK', '(e2) quét QR của ghế đã soát khi đơn còn ghế chưa soát: soát nốt (OK)');
select ok(
  (select count(*) = 2 and bool_and(checked_in_at is not null) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000010')
  and (select checked_in_at = now() - interval '20 minutes' and checked_in_by = '00000000-0000-0000-0000-000000000c02'
         from public.tickets where id = '00000000-0000-0000-0000-7a0000000016'),
  '(e2) vé còn lại được soát, vé đã soát cũ giữ nguyên checked_in_at/checked_in_by');

-- ---------------------------------------------------------------------------
-- (f) Sai rạp: chỉ trả rạp đúng, KHÔNG lộ ghế / tên khách (AC-13, R-102)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c02'); -- Staff HN02
insert into tap_scan (k, j)
  select 'f', public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000005'),
                               '00000000-0000-0000-0000-0000000000c2') ;
select is((select j->>'status' from tap_scan where k = 'f'), 'WRONG_CINEMA', '(f) sai rạp: WRONG_CINEMA');
select is((select j->>'correct_cinema_code' from tap_scan where k = 'f'), 'HN01', '(f) trả mã rạp đúng');
select ok(
  (select not (j ? 'seats') and not (j ? 'seat_count') and not (j ? 'seat_label') and not (j ? 'booking_code')
          and not (j ? 'order_id') and not (j ? 'movie_title') from tap_scan where k = 'f'),
  '(f) không lộ ghế / mã đặt vé / phim khi sai rạp');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000005' and checked_in_at is not null),
  0::bigint, '(f) sai rạp không soát vé nào');
select is(
  (select count(*) from public.checkin_logs where result = 'WRONG_CINEMA'
     and ticket_id = '00000000-0000-0000-0000-7a0000000011'),
  1::bigint, '(f) ghi checkin_logs WRONG_CINEMA');
select is(
  (select public.checkin_ticket('HN01-QRE005', '00000000-0000-0000-0000-0000000000c2')->>'status'),
  'WRONG_CINEMA', '(f) nhập booking_code sai rạp cũng WRONG_CINEMA');

-- ---------------------------------------------------------------------------
-- (g) Token không tồn tại -> INVALID
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01');
select is(
  (select public.checkin_ticket('ffffffffffffffffffffffffffffffff', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'INVALID', '(g) token không tồn tại: INVALID');
select is(
  (select public.checkin_ticket('00000000-0000-0000-0000-7a0000000011', '00000000-0000-0000-0000-0000000000c1')->>'code'),
  'TICKET_NOT_FOUND', '(g) nhập UUID của vé (tickets.id) không còn là credential: INVALID TICKET_NOT_FOUND (F4)');
select is(
  (select public.checkin_ticket('', '00000000-0000-0000-0000-0000000000c1')->>'code'),
  'EMPTY_CODE', '(g) mã rỗng: INVALID EMPTY_CODE');

-- ---------------------------------------------------------------------------
-- Các nhánh giữ nguyên hành vi khi quét bằng QR ĐƠN
-- ---------------------------------------------------------------------------
select is(
  (select public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000006'),
                                '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'CANCELLED', 'đơn affected quét bằng QR đơn: CANCELLED');
select is(
  (select public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000007'),
                                '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'TOO_EARLY', 'chưa tới giờ: TOO_EARLY');
select is(
  (select public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000008'),
                                '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'EXPIRED', 'suất đã kết thúc: EXPIRED');
select is(
  (select count(*) from public.tickets where order_id in ('00000000-0000-0000-0000-5a0000000006',
     '00000000-0000-0000-0000-5a0000000007', '00000000-0000-0000-0000-5a0000000008') and checked_in_at is not null),
  0::bigint, 'các nhánh từ chối không soát vé nào');
select is(
  (select public.checkin_ticket((select qr_token from tap_oq where order_id = '00000000-0000-0000-0000-5a0000000009'),
                                '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'INVALID', 'đơn paid nhưng không có vé: INVALID, không báo USED nhầm');

-- ---------------------------------------------------------------------------
-- Bảo vệ orders.qr_token qua RLS/grant (credential)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000d01'); -- chủ đơn Oa
select is(
  (select count(*) from public.orders where id = '00000000-0000-0000-0000-5a0000000001' and qr_token ~ '^[0-9a-f]{32}$'),
  1::bigint, 'chủ đơn đọc được qr_token đơn của mình');
select public.tap_as('00000000-0000-0000-0000-000000000d02'); -- khách khác
select is(
  (select count(*) from public.orders where id = '00000000-0000-0000-0000-5a0000000001'),
  0::bigint, 'khách khác không đọc được qr_token đơn người khác');
select throws_ok(
  $$update public.orders set qr_token = repeat('0', 32) where id = '00000000-0000-0000-0000-5a0000000002'$$,
  '42501', null, 'khách không đổi được qr_token (không có quyền UPDATE)');
select public.tap_anon();
select throws_ok(
  $$select qr_token from public.orders$$,
  '42501', null, 'anon không đọc được orders.qr_token');
select public.tap_as('00000000-0000-0000-0000-000000000c02'); -- staff HN02
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000000000c1'),
  0::bigint, 'staff rạp khác không đọc được qr_token đơn rạp HN01');
select public.tap_as('00000000-0000-0000-0000-000000000c01'); -- staff HN01
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000000000c1'),
  10::bigint, 'staff rạp HN01 đọc được đơn rạp mình (tương đương tickets.qr_token hiện tại)');

-- checkin_logs không lưu token / không có cột token
select public.tap_owner();
-- F2: audit_logs KHÔNG chứa qr_token (đổi trạng thái 1 đơn rồi kiểm cả snapshot insert/update của orders + tickets)
update public.orders set status = 'affected' where id = '00000000-0000-0000-0000-5a0000000008';
select ok(
  (select count(*) > 0 from public.audit_logs where table_name = 'orders' and record_id = '00000000-0000-0000-0000-5a0000000008'
      and action = 'UPDATE'),
  'F2: đổi trạng thái đơn có ghi audit_logs UPDATE');
select is(
  (select count(*) from public.audit_logs
    where table_name in ('orders', 'tickets') and record_id like '00000000-0000-0000-0000-_a%'
      and (coalesce(before_data, '{}'::jsonb) ? 'qr_token' or coalesce(after_data, '{}'::jsonb) ? 'qr_token')),
  0::bigint, 'F2: audit_logs của orders/tickets không có khoá qr_token trong before/after');
select is(
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'checkin_logs' and column_name like '%token%'),
  0::bigint, 'checkin_logs không có cột token');

select * from finish();
rollback;
