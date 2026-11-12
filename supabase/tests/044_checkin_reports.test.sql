-- pgTAP: Test cho RPC checkin_ticket và các báo cáo MVP (Layer 4 / Task 05)
-- Requirements: R-97, R-98, R-99, R-101, R-102, R-112, R-113, R-116, R-132
-- Acceptance Criteria: AC-12, AC-13
begin;
select plan(39);

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

-- ---------------------------------------------------------------------------
-- Fixtures (chạy dưới role postgres / tap_owner)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');

insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',  '{"full_name":"Hệ Thống Admin"}'),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{"full_name":"Quản Lý HN01"}'),
  ('00000000-0000-0000-0000-000000000b02', 'mgr2@example.com',   '{"full_name":"Quản Lý HN02"}'),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{"full_name":"Nguyễn Văn Staff 1"}'),
  ('00000000-0000-0000-0000-000000000c02', 'staff2@example.com', '{"full_name":"Trần Thị Staff 2"}'),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com',  '{"full_name":"Khách Hàng 1"}'),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com',  '{"full_name":"Khách Hàng 2"}');

update public.profiles set full_name = 'Nguyễn Văn Staff 1' where id = '00000000-0000-0000-0000-000000000c01';
update public.profiles set full_name = 'Trần Thị Staff 2' where id = '00000000-0000-0000-0000-000000000c02';

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-000000000a01', 'ADMIN');

insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000c2', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000c2', 'STAFF');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-a', 'Phim Chiếu Rạp A', 120, '2026-11-01', 'T13', 'PUBLISHED'),
  ('00000000-0000-0000-0000-00000000e002', 'phim-b', 'Phim Chiếu Rạp B', 90,  '2026-11-01', 'P',   'PUBLISHED');

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1 HN01', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'Phòng 2 HN01', '{2D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'Phòng 1 HN02', '{2D}', 5, 6);

insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 3, 'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000000b104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 4, 'NORMAL', 'A4'),
  ('00000000-0000-0000-0000-00000000b121', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000b122', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000000b123', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'A', 3, 'AISLE', 'AISLE'),
  ('00000000-0000-0000-0000-00000000b124', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'A', 4, 'BROKEN', 'A4-BROKEN'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 1, 'NORMAL', 'A1');

-- Suất chiếu:
-- s101: HN01, 15 phút nữa chiếu (trong cửa sổ -30m)
-- s102: HN01, chiếu từ 4 tiếng trước (hết hạn: starts_at + 120m đã qua)
-- s103: HN01, 15 phút nữa chiếu nhưng status = CANCELLED
-- s104: HN01, 5 tiếng nữa mới chiếu (quá sớm, trước -30m)
-- s201: HN02, 15 phút nữa chiếu
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '15 minutes', now() + interval '135 minutes', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() - interval '4 hours', now() - interval '2 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '15 minutes', now() + interval '135 minutes', '2D', 'CANCELLED'),
  ('00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '5 hours', now() + interval '7 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a505', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e002',
   now() + interval '15 minutes', now() + interval '105 minutes', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a506', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e001',
   now() + interval '20 minutes', now() + interval '140 minutes', '2D', 'ON_SALE');

-- Đơn hàng:
-- O1: HN01, s101, paid, 100k - 10k = 90k
-- O2: HN01, s101, paid, 100k - 0 = 100k
-- O3: HN01, s102, paid, 100k (expired showtime)
-- O4: HN01, s103, affected (cancelled showtime)
-- O5: HN02, s201, paid, 120k - 20k = 100k
-- O6: HN01, s104, paid, 100k (too early showtime)
-- O7: HN01, s101, needs_manual_review
-- O8: HN01, s103, exchanged (suất huỷ đã đổi suất)
-- O9: HN01, s103, refunded_manual (suất huỷ đã hoàn tiền thủ công)
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, booking_code) values
  ('00000000-0000-0000-0000-5a0000000001', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 10000, 90000, 'HN01-TKT001'),
  ('00000000-0000-0000-0000-5a0000000002', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d02', 'paid', 100000, 0, 100000, 'HN01-TKT002'),
  ('00000000-0000-0000-0000-5a0000000003', 'WEB', '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 0, 100000, 'HN01-TKT003'),
  ('00000000-0000-0000-0000-5a0000000004', 'WEB', '00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-000000000d01', 'affected', 100000, 0, 100000, 'HN01-TKT004'),
  ('00000000-0000-0000-0000-5a0000000005', 'POS', '00000000-0000-0000-0000-00000000a505', null, 'paid', 120000, 20000, 100000, 'HN02-TKT005'),
  ('00000000-0000-0000-0000-5a0000000006', 'WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 0, 100000, 'HN01-TKT006'),
  ('00000000-0000-0000-0000-5a0000000007', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d02', 'needs_manual_review', 100000, 0, 100000, 'HN01-TKT007'),
  ('00000000-0000-0000-0000-5a0000000008', 'WEB', '00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-000000000d01', 'affected', 100000, 0, 100000, 'HN01-TKT008'),
  ('00000000-0000-0000-0000-5a0000000009', 'WEB', '00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-000000000d02', 'affected', 100000, 0, 100000, 'HN01-TKT009'),
  ('00000000-0000-0000-0000-5a0000000010', 'WEB', '00000000-0000-0000-0000-00000000a506', '00000000-0000-0000-0000-000000000d01', 'paid', 200000, 0, 200000, 'HN01-MLT001');

-- order_seats:
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-00000000b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-00000000b102', 'A2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000003', '00000000-0000-0000-0000-5a0000000003', '00000000-0000-0000-0000-00000000b103', 'A3', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000004', '00000000-0000-0000-0000-5a0000000004', '00000000-0000-0000-0000-00000000b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000005', '00000000-0000-0000-0000-5a0000000005', '00000000-0000-0000-0000-00000000b201', 'A1', 'NORMAL', 120000),
  ('00000000-0000-0000-0000-6a0000000006', '00000000-0000-0000-0000-5a0000000006', '00000000-0000-0000-0000-00000000b104', 'A4', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000011', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-00000000b121', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000012', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-00000000b122', 'A2', 'NORMAL', 100000);

-- tickets:
insert into public.tickets (id, order_id, order_seat_id, showtime_id, qr_token) values
  ('00000000-0000-0000-0000-7a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-00000000a501', '11111111111111111111111111111111'),
  ('00000000-0000-0000-0000-7a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-00000000a501', '22222222222222222222222222222222'),
  ('00000000-0000-0000-0000-7a0000000003', '00000000-0000-0000-0000-5a0000000003', '00000000-0000-0000-0000-6a0000000003', '00000000-0000-0000-0000-00000000a502', '33333333333333333333333333333333'),
  ('00000000-0000-0000-0000-7a0000000004', '00000000-0000-0000-0000-5a0000000004', '00000000-0000-0000-0000-6a0000000004', '00000000-0000-0000-0000-00000000a503', '44444444444444444444444444444444'),
  ('00000000-0000-0000-0000-7a0000000005', '00000000-0000-0000-0000-5a0000000005', '00000000-0000-0000-0000-6a0000000005', '00000000-0000-0000-0000-00000000a505', '55555555555555555555555555555555'),
  ('00000000-0000-0000-0000-7a0000000006', '00000000-0000-0000-0000-5a0000000006', '00000000-0000-0000-0000-6a0000000006', '00000000-0000-0000-0000-00000000a504', '66666666666666666666666666666666'),
  ('00000000-0000-0000-0000-7a0000000011', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-6a0000000011', '00000000-0000-0000-0000-00000000a506', 'aa011111111111111111111111111111'),
  ('00000000-0000-0000-0000-7a0000000012', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-6a0000000012', '00000000-0000-0000-0000-00000000a506', 'aa022222222222222222222222222222');

-- payments:
insert into public.payments (id, order_id, cinema_id, order_code, amount, status) values
  ('00000000-0000-0000-0000-8a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-0000000000c1', 100001, 90000, 'PAID'),
  ('00000000-0000-0000-0000-8a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-0000000000c1', 100002, 80000, 'PAID'), -- lệch tiền (80k <> 100k)
  ('00000000-0000-0000-0000-8a0000000005', '00000000-0000-0000-0000-5a0000000005', '00000000-0000-0000-0000-0000000000c2', 100005, 100000, 'PAID'),
  ('00000000-0000-0000-0000-8a0000000007', '00000000-0000-0000-0000-5a0000000007', '00000000-0000-0000-0000-0000000000c1', 100007, 100000, 'PENDING'),
  ('00000000-0000-0000-0000-8a0000000010', '00000000-0000-0000-0000-5a0000000010', '00000000-0000-0000-0000-0000000000c1', 100010, 200000, 'PAID');

-- affected_order_actions (ghi nhận đổi suất cho O8 và hoàn tiền thủ công cho O9):
insert into public.affected_order_actions (order_id, action, note, performed_by) values
  ('00000000-0000-0000-0000-5a0000000008', 'EXCHANGED', 'Đổi suất tại quầy', '00000000-0000-0000-0000-000000000b01');
insert into public.affected_order_actions (order_id, action, note, refund_reference, refunded_amount, performed_by) values
  ('00000000-0000-0000-0000-5a0000000009', 'REFUNDED_MANUAL', 'Hoàn tiền suất huỷ', 'VIB999888', 100000, '00000000-0000-0000-0000-000000000b01');

-- ---------------------------------------------------------------------------
-- TEST 1: Quyền truy cập - Khách hàng thường bị chặn gọi checkin_ticket
-- ---------------------------------------------------------------------------
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select public.tap_as('00000000-0000-0000-0000-000000000d01');
select throws_ok(
  $$ select public.checkin_ticket('11111111111111111111111111111111', '00000000-0000-0000-0000-0000000000c1') $$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Khách hàng không được gọi checkin_ticket'
);

-- ---------------------------------------------------------------------------
-- TEST 1B (Finding 1): Chống giả mạo p_staff_id (Non-Repudiation)
-- Staff HN01 đăng nhập nhưng truyền p_staff_id khác auth.uid() -> chặn 42501
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01'); -- Staff HN01
select throws_ok(
  $$ select public.checkin_ticket('11111111111111111111111111111111', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000a01') $$,
  '42501',
  'FORBIDDEN_STAFF_SPOOFING',
  'Finding 1: Nhân viên không được truyền p_staff_id giả mạo tài khoản khác'
);

-- ---------------------------------------------------------------------------
-- TEST 2: Soát vé hợp lệ lần đầu (Staff HN01 soát vé T1 tại HN01)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01'); -- Staff HN01

select is(
  (select public.checkin_ticket('11111111111111111111111111111111', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'OK',
  'Checkin lần đầu trả status OK'
);

select isnt(
  (select checked_in_at from public.tickets where id = '00000000-0000-0000-0000-7a0000000001'),
  null,
  'Vé T1 được đánh dấu checked_in_at'
);

select is(
  (select status::text from public.orders where id = '00000000-0000-0000-0000-5a0000000001'),
  'checked_in',
  'Đơn O1 chuyển sang checked_in sau khi soát vé thành công'
);

select is(
  (select result::text from public.checkin_logs where ticket_id = '00000000-0000-0000-0000-7a0000000001' order by scanned_at desc limit 1),
  'SUCCESS',
  'Ghi nhận checkin_logs result = SUCCESS'
);

-- ---------------------------------------------------------------------------
-- TEST 3 (AC-12): Quét lại vé đã check-in -> USED + thời điểm + tên người soát lần đầu
-- ---------------------------------------------------------------------------
select is(
  (select public.checkin_ticket('11111111111111111111111111111111', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'USED',
  'AC-12: Quét lại vé đã soát trả status USED'
);

select is(
  (select public.checkin_ticket('11111111111111111111111111111111', '00000000-0000-0000-0000-0000000000c1')->>'checked_in_by_name'),
  'Nguyễn Văn Staff 1',
  'AC-12: Trả về đúng họ tên nhân viên đã soát lần đầu'
);

select is(
  (select count(*) from public.checkin_logs where ticket_id = '00000000-0000-0000-0000-7a0000000001' and result = 'ALREADY_USED'),
  2::bigint, -- 2 lần gọi ở trên
  'AC-12: Ghi nhận checkin_logs result = ALREADY_USED'
);

-- ---------------------------------------------------------------------------
-- TEST 4 (AC-13): Vé HN01, Staff HN02 quét tại HN02 -> WRONG_CINEMA, không PII, vé không check-in
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c02'); -- Staff HN02

select is(
  (select public.checkin_ticket('22222222222222222222222222222222', '00000000-0000-0000-0000-0000000000c2')->>'status'),
  'WRONG_CINEMA',
  'AC-13: Quét sai rạp trả status WRONG_CINEMA'
);

select is(
  (select public.checkin_ticket('22222222222222222222222222222222', '00000000-0000-0000-0000-0000000000c2')->>'correct_cinema_code'),
  'HN01',
  'AC-13: Trả về mã rạp đúng của vé'
);

select is(
  (select public.checkin_ticket('22222222222222222222222222222222', '00000000-0000-0000-0000-0000000000c2')->>'seat_label'),
  null,
  'AC-13: Không lộ thông tin ghế khi sai rạp'
);

select is(
  (select checked_in_at from public.tickets where id = '00000000-0000-0000-0000-7a0000000002'),
  null,
  'AC-13: Vé không bị đánh dấu check-in khi quét sai rạp'
);

select is(
  (select count(*) from public.checkin_logs where ticket_id = '00000000-0000-0000-0000-7a0000000002' and result = 'WRONG_CINEMA'),
  3::bigint,
  'AC-13: Ghi nhận checkin_logs result = WRONG_CINEMA'
);

-- ---------------------------------------------------------------------------
-- TEST 5: Quét vé đã hết hạn (suất chiếu đã kết thúc quá thời lượng phim) -> EXPIRED
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01'); -- Staff HN01

select is(
  (select public.checkin_ticket('33333333333333333333333333333333', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'EXPIRED',
  'Quét vé sau khi suất kết thúc trả status EXPIRED'
);

select is(
  (select checked_in_at from public.tickets where id = '00000000-0000-0000-0000-7a0000000003'),
  null,
  'Vé hết hạn không bị check-in'
);

-- ---------------------------------------------------------------------------
-- TEST 6: Quét vé quá sớm (trước giờ chiếu 30 phút) -> TOO_EARLY
-- ---------------------------------------------------------------------------
select is(
  (select public.checkin_ticket('66666666666666666666666666666666', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'TOO_EARLY',
  'Quét vé trước giờ chiếu quá 30 phút trả status TOO_EARLY'
);

-- ---------------------------------------------------------------------------
-- TEST 7: Quét vé suất bị huỷ / affected -> CANCELLED
-- ---------------------------------------------------------------------------
select is(
  (select public.checkin_ticket('44444444444444444444444444444444', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'CANCELLED',
  'Quét vé suất bị huỷ trả CANCELLED'
);

select is(
  (select count(*) from public.checkin_logs where ticket_id = '00000000-0000-0000-0000-7a0000000004' and result = 'AFFECTED'),
  1::bigint,
  'Ghi nhận checkin_logs result = AFFECTED'
);

-- ---------------------------------------------------------------------------
-- TEST 8: Quét mã không tồn tại -> INVALID
-- ---------------------------------------------------------------------------
select is(
  (select public.checkin_ticket('INVALID_QR_TOKEN_OR_CODE', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'INVALID',
  'Mã không tồn tại trả status INVALID'
);

-- ---------------------------------------------------------------------------
-- TEST 9: Báo cáo doanh thu (v_report_revenue_daily + RPC report_revenue)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000b01'); -- Manager HN01

-- View: chỉ thấy doanh thu HN01
select is(
  (select count(*) from public.v_report_revenue_daily where cinema_id = '00000000-0000-0000-0000-0000000000c2'),
  0::bigint,
  'Manager HN01 xem view doanh thu HN02 trả về 0 rows (RLS cách ly)'
);

-- RPC: gọi rạp HN02 bị chặn FORBIDDEN_CINEMA_SCOPE
select throws_ok(
  $$ select * from public.report_revenue('00000000-0000-0000-0000-0000000000c2') $$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Manager HN01 gọi report_revenue cho HN02 bị ném ngoại lệ 42501'
);

-- Admin: xem được toàn chuỗi
select public.tap_as('00000000-0000-0000-0000-000000000a01'); -- Admin
select is(
  (select count(distinct cinema_id) from public.report_revenue()),
  2::bigint,
  'Admin gọi report_revenue thấy cả 2 rạp HN01 và HN02'
);

-- ---------------------------------------------------------------------------
-- TEST 10: Báo cáo đối soát PayOS (report_payos_reconciliation)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000b01'); -- Manager HN01

select throws_ok(
  $$ select * from public.report_payos_reconciliation('00000000-0000-0000-0000-0000000000c2') $$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Manager HN01 gọi đối soát PayOS rạp HN02 bị chặn'
);

select public.tap_as('00000000-0000-0000-0000-000000000a01'); -- Admin
select ok(
  exists (select 1 from public.report_payos_reconciliation() where discrepancy_type = 'AMOUNT_MISMATCH'),
  'Báo cáo PayOS phát hiện đơn lệch tiền AMOUNT_MISMATCH'
);

select ok(
  exists (select 1 from public.report_payos_reconciliation() where discrepancy_type = 'NEEDS_MANUAL_REVIEW'),
  'Báo cáo PayOS phát hiện đơn NEEDS_MANUAL_REVIEW'
);

-- ---------------------------------------------------------------------------
-- TEST 11: Báo cáo suất bị huỷ (report_cancelled_showtimes)
-- ---------------------------------------------------------------------------
select is(
  (select total_refunded_amount from public.report_cancelled_showtimes('00000000-0000-0000-0000-0000000000c1') where showtime_id = '00000000-0000-0000-0000-00000000a503'),
  100000::bigint,
  'Báo cáo suất huỷ tính đúng tổng tiền hoàn thủ công 100.000đ'
);

select is(
  (select exchanged_orders from public.report_cancelled_showtimes('00000000-0000-0000-0000-0000000000c1') where showtime_id = '00000000-0000-0000-0000-00000000a503'),
  1::bigint,
  'Báo cáo suất huỷ tính đúng số đơn đã đổi suất (exchanged_orders = 1)'
);

-- ---------------------------------------------------------------------------
-- TEST 12: Báo cáo theo phim / suất chiếu (report_by_movie_showtime)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000b01'); -- Manager HN01

select throws_ok(
  $$ select * from public.report_by_movie_showtime('00000000-0000-0000-0000-0000000000c2') $$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Manager HN01 gọi report_by_movie_showtime cho HN02 bị chặn'
);

select ok(
  (select count(*) from public.report_by_movie_showtime('00000000-0000-0000-0000-0000000000c1')) >= 1,
  'Manager HN01 lấy được báo cáo suất chiếu rạp HN01'
);

-- ---------------------------------------------------------------------------
-- TEST 13 (Finding 2): Sức chứa phòng & Tỷ lệ lấp đầy loại trừ AISLE và BROKEN
-- Phòng f102 có 4 ô trong seats (2 NORMAL, 1 AISLE, 1 BROKEN).
-- Suất s106 bán 2 vé (đơn O10) -> capacity = 2, occupancy_rate = 100.00%
-- ---------------------------------------------------------------------------
select is(
  (select room_capacity from public.v_report_showtime_sales where showtime_id = '00000000-0000-0000-0000-00000000a506'),
  2::bigint,
  'Finding 2: Room capacity loại bỏ AISLE và BROKEN (4 ô lưới - 1 AISLE - 1 BROKEN = 2 ghế)'
);

select is(
  (select occupancy_rate from public.v_report_showtime_sales where showtime_id = '00000000-0000-0000-0000-00000000a506'),
  100.00,
  'Finding 2: Tỷ lệ lấp đầy tính đúng 100.00% khi bán 2/2 ghế hợp lệ'
);

-- ---------------------------------------------------------------------------
-- TEST 14 (Finding 3): Kiểm thử đơn hàng đa vé (2 vé/đơn O10)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01'); -- Staff HN01

-- Lần 1: Quét bằng booking_code -> Vé 1 OK, Order -> checked_in, Vé 2 vẫn null
select is(
  (select public.checkin_ticket('HN01-MLT001', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'OK',
  'Finding 3: Quét lần 1 đơn đa vé bằng booking_code trả status OK'
);

select is(
  (select status::text from public.orders where id = '00000000-0000-0000-0000-5a0000000010'),
  'checked_in',
  'Finding 3: Đơn hàng chuyển sang checked_in ngay sau vé đầu tiên'
);

select isnt(
  (select checked_in_at from public.tickets where id = '00000000-0000-0000-0000-7a0000000011'),
  null,
  'Finding 3: Vé thứ nhất đã được check-in'
);

select is(
  (select checked_in_at from public.tickets where id = '00000000-0000-0000-0000-7a0000000012'),
  null,
  'Finding 3: Vé thứ hai chưa bị check-in'
);

-- Lần 2: Quét tiếp bằng booking_code -> Nhặt đúng vé 2 chưa check-in -> status OK
select is(
  (select public.checkin_ticket('HN01-MLT001', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'OK',
  'Finding 3: Quét lần 2 đơn đa vé bằng booking_code nhặt đúng vé 2 chưa check-in, trả status OK'
);

select isnt(
  (select checked_in_at from public.tickets where id = '00000000-0000-0000-0000-7a0000000012'),
  null,
  'Finding 3: Vé thứ hai đã được check-in thành công'
);

-- Lần 3: Quét tiếp bằng booking_code -> Toàn bộ vé trong đơn đã soát hết -> USED
select is(
  (select public.checkin_ticket('HN01-MLT001', '00000000-0000-0000-0000-0000000000c1')->>'status'),
  'USED',
  'Finding 3: Quét lần 3 khi toàn bộ vé trong đơn đã check-in trả status USED'
);

rollback;
