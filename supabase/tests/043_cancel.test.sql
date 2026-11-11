-- pgTAP: Huỷ suất chiếu hàng loạt + chặn đóng rạp còn suất đã bán (layer 4 / task 04)
-- R-33, R-108, R-109, R-110, R-127, R-134, AC-24, AC-26
begin;
select plan(32);

-- Helper functions
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
-- 1. Fixture Data (Owner bypass RLS)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');

insert into public.cinemas (id, code, name, province_id, address, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp CGV Vincom HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố Bà Triệu', 'OPEN'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp CGV Lotte HN02',  '00000000-0000-0000-0000-0000000000a1', '2 Phố Liễu Giai', 'OPEN');

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',  '{}', now()),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{}', now()),
  ('00000000-0000-0000-0000-000000000b02', 'mgr2@example.com',   '{}', now()),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d01', 'cust01@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d02', 'cust02@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d03', 'cust03@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d04', 'cust04@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d05', 'cust05@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d06', 'cust06@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d07', 'cust07@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d08', 'cust08@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d09', 'cust09@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d10', 'cust10@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d11', 'cust11@example.com', '{}', now()),
  ('00000000-0000-0000-0000-000000000d12', 'cust12@example.com', '{}', now());

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-000000000a01', 'ADMIN');

insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000c2', 'MANAGER');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'lat-mat-7', 'Lật Mặt 7', 120, '2026-12-01', 'T13', 'PUBLISHED');

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'Phòng 1', '{2D}', 5, 6);

-- Ghế cho Phòng 1 của HN01 (18 ghế)
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 3, 'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000000b104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 4, 'NORMAL', 'A4'),
  ('00000000-0000-0000-0000-00000000b105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 5, 'NORMAL', 'A5'),
  ('00000000-0000-0000-0000-00000000b106', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 6, 'NORMAL', 'A6'),
  ('00000000-0000-0000-0000-00000000b107', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 1, 'NORMAL', 'B1'),
  ('00000000-0000-0000-0000-00000000b108', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 2, 'NORMAL', 'B2'),
  ('00000000-0000-0000-0000-00000000b109', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 3, 'NORMAL', 'B3'),
  ('00000000-0000-0000-0000-00000000b110', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 4, 'NORMAL', 'B4'),
  ('00000000-0000-0000-0000-00000000b111', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 5, 'NORMAL', 'B5'),
  ('00000000-0000-0000-0000-00000000b112', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 6, 'NORMAL', 'B6'),
  ('00000000-0000-0000-0000-00000000b113', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 1, 'NORMAL', 'C1'),
  ('00000000-0000-0000-0000-00000000b114', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 2, 'NORMAL', 'C2'),
  ('00000000-0000-0000-0000-00000000b115', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 3, 'NORMAL', 'C3'),
  ('00000000-0000-0000-0000-00000000b116', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 4, 'NORMAL', 'C4'),
  ('00000000-0000-0000-0000-00000000b117', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 5, 'NORMAL', 'C5'),
  ('00000000-0000-0000-0000-00000000b118', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 6, 'NORMAL', 'C6');

-- Ghế cho Phòng 1 của HN02 (1 ghế)
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 1, 'NORMAL', 'A1');

-- Suất chiếu:
-- Showtime 1 (HN01): Suất chính test AC-24
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '2 hours', '2D', 'ON_SALE'),
-- Showtime 2, 3, 4 (HN01): 3 suất tương lai test AC-26 (được xếp lịch cách nhau)
  ('00000000-0000-0000-0000-00000000a402', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '6 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a403', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '10 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a404', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   now() + interval '14 hours', '2D', 'ON_SALE'),
-- Showtime 5 (HN02): Suất của HN02 test phân quyền
  ('00000000-0000-0000-0000-00000000a405', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e001',
   now() + interval '2 hours', '2D', 'ON_SALE');

-- ---------------------------------------------------------------------------
-- Dữ liệu đơn hàng cho Showtime 1 (AC-24):
-- 10 đơn WEB paid (cust01..cust10) có email
-- 1 đơn POS paid không email
-- 1 đơn holding (cust11)
-- ---------------------------------------------------------------------------
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, booking_code, contact_email) values
  ('00000000-0000-0000-0000-500000000001', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 100000, 'HN01-WB0001', 'cust01@example.com'),
  ('00000000-0000-0000-0000-500000000002', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d02', 'paid', 100000, 100000, 'HN01-WB0002', 'cust02@example.com'),
  ('00000000-0000-0000-0000-500000000003', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d03', 'paid', 100000, 100000, 'HN01-WB0003', 'cust03@example.com'),
  ('00000000-0000-0000-0000-500000000004', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d04', 'paid', 100000, 100000, 'HN01-WB0004', 'cust04@example.com'),
  ('00000000-0000-0000-0000-500000000005', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d05', 'paid', 100000, 100000, 'HN01-WB0005', 'cust05@example.com'),
  ('00000000-0000-0000-0000-500000000006', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d06', 'paid', 100000, 100000, 'HN01-WB0006', 'cust06@example.com'),
  ('00000000-0000-0000-0000-500000000007', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d07', 'paid', 100000, 100000, 'HN01-WB0007', 'cust07@example.com'),
  ('00000000-0000-0000-0000-500000000008', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d08', 'paid', 100000, 100000, 'HN01-WB0008', 'cust08@example.com'),
  ('00000000-0000-0000-0000-500000000009', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d09', 'paid', 100000, 100000, 'HN01-WB0009', 'cust09@example.com'),
  ('00000000-0000-0000-0000-500000000010', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d10', 'paid', 100000, 100000, 'HN01-WB0010', 'cust10@example.com'),
  -- 1 đơn POS paid (không email)
  ('00000000-0000-0000-0000-500000000011', 'POS', '00000000-0000-0000-0000-00000000a401', null, 'paid', 100000, 100000, 'HN01-PS0011', null),
  -- 1 đơn holding (chưa thanh toán)
  ('00000000-0000-0000-0000-500000000012', 'WEB', '00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-000000000d11', 'holding', 100000, 100000, null, 'cust11@example.com');

-- order_seats cho 12 đơn
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000001', '00000000-0000-0000-0000-500000000001', '00000000-0000-0000-0000-00000000b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000002', '00000000-0000-0000-0000-500000000002', '00000000-0000-0000-0000-00000000b102', 'A2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000003', '00000000-0000-0000-0000-500000000003', '00000000-0000-0000-0000-00000000b103', 'A3', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000004', '00000000-0000-0000-0000-500000000004', '00000000-0000-0000-0000-00000000b104', 'A4', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000005', '00000000-0000-0000-0000-500000000005', '00000000-0000-0000-0000-00000000b105', 'A5', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000006', '00000000-0000-0000-0000-500000000006', '00000000-0000-0000-0000-00000000b106', 'A6', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000007', '00000000-0000-0000-0000-500000000007', '00000000-0000-0000-0000-00000000b107', 'B1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000008', '00000000-0000-0000-0000-500000000008', '00000000-0000-0000-0000-00000000b108', 'B2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000009', '00000000-0000-0000-0000-500000000009', '00000000-0000-0000-0000-00000000b109', 'B3', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000010', '00000000-0000-0000-0000-500000000010', '00000000-0000-0000-0000-00000000b110', 'B4', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000011', '00000000-0000-0000-0000-500000000011', '00000000-0000-0000-0000-00000000b111', 'B5', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000012', '00000000-0000-0000-0000-500000000012', '00000000-0000-0000-0000-00000000b112', 'B6', 'NORMAL', 100000);

-- showtime_seat_states: 11 SOLD, 1 HELD
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b101', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000001'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b102', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000002'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b103', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000003'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b104', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000004'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b105', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000005'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b106', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000006'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b107', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000007'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b108', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000008'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b109', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000009'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b110', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000010'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b111', 'SOLD', 'POS', null, '00000000-0000-0000-0000-500000000011'),
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000b112', 'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-500000000012');

-- tickets cho 11 đơn paid
insert into public.tickets (order_id, order_seat_id, showtime_id)
select o.id, os.id, o.showtime_id
from public.orders o
join public.order_seats os on os.order_id = o.id
where o.showtime_id = '00000000-0000-0000-0000-00000000a401'
  and o.status = 'paid';

-- Dữ liệu vé bán cho 3 suất tương lai của HN01 (Showtime 2, 3, 4) để test AC-26:
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, booking_code, contact_email) values
  ('00000000-0000-0000-0000-500000000201', 'WEB', '00000000-0000-0000-0000-00000000a402', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 100000, 'HN01-WB0201', 'cust01@example.com'),
  ('00000000-0000-0000-0000-500000000202', 'WEB', '00000000-0000-0000-0000-00000000a403', '00000000-0000-0000-0000-000000000d02', 'paid', 100000, 100000, 'HN01-WB0202', 'cust02@example.com'),
  ('00000000-0000-0000-0000-500000000203', 'WEB', '00000000-0000-0000-0000-00000000a404', '00000000-0000-0000-0000-000000000d03', 'paid', 100000, 100000, 'HN01-WB0203', 'cust03@example.com');

insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-600000000201', '00000000-0000-0000-0000-500000000201', '00000000-0000-0000-0000-00000000b113', 'C1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000202', '00000000-0000-0000-0000-500000000202', '00000000-0000-0000-0000-00000000b114', 'C2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-600000000203', '00000000-0000-0000-0000-500000000203', '00000000-0000-0000-0000-00000000b115', 'C3', 'NORMAL', 100000);

insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a402', '00000000-0000-0000-0000-00000000b113', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000201'),
  ('00000000-0000-0000-0000-00000000a403', '00000000-0000-0000-0000-00000000b114', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000202'),
  ('00000000-0000-0000-0000-00000000a404', '00000000-0000-0000-0000-00000000b115', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-500000000203');

-- ---------------------------------------------------------------------------
-- 2. Test preview_cancel_showtimes (AC-24, R-108)
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-000000000b01'); -- Manager HN01

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'showtimes_count')::int,
  1,
  'preview: showtimes_count = 1'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'paid_orders_count')::int,
  11,
  'preview: paid_orders_count = 11 (10 WEB + 1 POS)'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'web_paid_orders_count')::int,
  10,
  'preview: web_paid_orders_count = 10'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'pos_paid_orders_count')::int,
  1,
  'preview: pos_paid_orders_count = 1'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'holding_orders_count')::int,
  1,
  'preview: holding_orders_count = 1'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'sold_seats_count')::int,
  11,
  'preview: sold_seats_count = 11'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'held_seats_count')::int,
  1,
  'preview: held_seats_count = 1'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])->>'total_refund_amount')::bigint,
  1100000::bigint,
  'preview: total_refund_amount = 1,100,000 VND'
);

-- ---------------------------------------------------------------------------
-- 3. Test cancel_showtimes (AC-24: Huỷ suất chiếu)
-- ---------------------------------------------------------------------------
-- Gọi cancel_showtimes từ Manager HN01
select is(
  (public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid], 'Sự cố mất điện')::jsonb->>'success')::boolean,
  true,
  'cancel_showtimes: success = true'
);

select is(
  (select count(*)::int from public.showtimes where id = '00000000-0000-0000-0000-00000000a401' and status = 'CANCELLED' and cancel_reason = 'Sự cố mất điện'),
  1,
  'AC-24: Suất chiếu chuyển status = CANCELLED và lưu cancel_reason'
);

-- Ghế HELD phải được giải phóng
select is(
  (select count(*)::int from public.showtime_seat_states where showtime_id = '00000000-0000-0000-0000-00000000a401' and state = 'HELD'),
  0,
  'AC-24: Toàn bộ ghế HELD trên suất bị huỷ đã được giải phóng'
);

-- Đơn holding chuyển sang cancelled
select is(
  (select count(*)::int from public.orders where id = '00000000-0000-0000-0000-500000000012' and status = 'cancelled'),
  1,
  'AC-24: Đơn holding trên suất bị huỷ chuyển sang status = cancelled'
);

-- 10 đơn WEB paid chuyển sang affected và counter_contact = false
select is(
  (select count(*)::int from public.orders where showtime_id = '00000000-0000-0000-0000-00000000a401' and channel = 'WEB' and status = 'affected'),
  10,
  'AC-24: Đúng 10 đơn WEB paid chuyển sang status = affected'
);

select is(
  (select count(*)::int from public.orders where showtime_id = '00000000-0000-0000-0000-00000000a401' and channel = 'WEB' and status = 'affected' and counter_contact = false),
  10,
  'AC-24: 10 đơn WEB có email có counter_contact = false'
);

-- 1 đơn POS paid chuyển sang affected và có cờ counter_contact = true
select is(
  (select count(*)::int from public.orders where id = '00000000-0000-0000-0000-500000000011' and status = 'affected' and counter_contact = true),
  1,
  'AC-24: Đơn POS paid chuyển sang affected và counter_contact = true'
);

-- Bảng affected_order_cases có đúng 11 bản ghi (10 WEB + 1 POS)
select is(
  (select count(*)::int from public.affected_order_cases where showtime_id = '00000000-0000-0000-0000-00000000a401'),
  11,
  'AC-24: Tạo đủ 11 bản ghi trong affected_order_cases'
);

select is(
  (select count(*)::int from public.affected_order_cases where showtime_id = '00000000-0000-0000-0000-00000000a401' and counter_contact = true),
  1,
  'AC-24: Bản ghi POS trong affected_order_cases có counter_contact = true'
);

-- Email outbox có đúng 10 email PENDING (kiểm tra với tap_owner vì authenticated không có quyền select email_outbox)
select tap_owner();

select is(
  (select count(*)::int from public.email_outbox where cinema_id = '00000000-0000-0000-0000-0000000000c1' and status = 'PENDING'),
  10,
  'AC-24: Đúng 10 email PENDING được enqueue vào email_outbox'
);

select is(
  (select count(*)::int from public.email_outbox where to_email is null or btrim(to_email) = ''),
  0,
  'AC-24: Không có email nào được tạo cho đơn POS không có email'
);

select tap_as('00000000-0000-0000-0000-000000000b01'); -- Trở lại Manager HN01

-- Thử gọi hold_seats vào suất chiếu đã CANCELLED -> trả lỗi SHOWTIME_CANCELLED (R-127)
select throws_ok(
  $$select * from public.hold_seats(
    '00000000-0000-0000-0000-00000000a401'::uuid,
    array['00000000-0000-0000-0000-00000000b118'::uuid],
    'WEB',
    '00000000-0000-0000-0000-000000000d12'::uuid
  )$$,
  '23514',
  null,
  'AC-24 / R-127: hold_seats từ chối suất đã huỷ với lỗi SHOWTIME_CANCELLED'
);

-- ---------------------------------------------------------------------------
-- 4. Test set_cinema_status & AC-26 (Chặn đóng rạp khi còn suất đã bán)
-- ---------------------------------------------------------------------------
-- Rạp HN01 còn 3 suất tương lai đã bán vé (Showtime 2, 3, 4)
-- Gọi set_cinema_status sang 'TEMP_CLOSED' phải bị lỗi kèm mã CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES
select throws_ok(
  $$select public.set_cinema_status('00000000-0000-0000-0000-0000000000c1'::uuid, 'TEMP_CLOSED'::public.cinema_status)$$,
  '23514',
  null,
  'AC-26: set_cinema_status chặn đóng rạp khi còn 3 suất tương lai đã bán vé'
);

-- Thử gọi sang 'CLOSED' cũng phải bị chặn
select throws_ok(
  $$select public.set_cinema_status('00000000-0000-0000-0000-0000000000c1'::uuid, 'CLOSED'::public.cinema_status)$$,
  '23514',
  null,
  'AC-26: set_cinema_status chặn CLOSED khi còn suất tương lai đã bán vé'
);

-- Huỷ cả 3 suất chiếu đó qua cancel_showtimes
select is(
  (public.cancel_showtimes(
    array[
      '00000000-0000-0000-0000-00000000a402'::uuid,
      '00000000-0000-0000-0000-00000000a403'::uuid,
      '00000000-0000-0000-0000-00000000a404'::uuid
    ],
    'Đóng cửa rạp nâng cấp hệ thống'
  )->>'cancelled_showtimes_count')::int,
  3,
  'AC-26: Huỷ hàng loạt 3 suất tương lai thành công'
);

-- Sau khi huỷ cả 3 suất -> set_cinema_status sang TEMP_CLOSED thành công
select is(
  (public.set_cinema_status('00000000-0000-0000-0000-0000000000c1'::uuid, 'TEMP_CLOSED'::public.cinema_status)->>'status'),
  'TEMP_CLOSED',
  'AC-26: Sau khi huỷ các suất đã bán, set_cinema_status thành công đổi sang TEMP_CLOSED'
);

select is(
  (select status from public.cinemas where id = '00000000-0000-0000-0000-0000000000c1'),
  'TEMP_CLOSED'::public.cinema_status,
  'AC-26: Bảng cinemas đã cập nhật status = TEMP_CLOSED'
);

-- ---------------------------------------------------------------------------
-- 5. Test Phân quyền & Validation (AC-24 #4, R-108, R-33)
-- ---------------------------------------------------------------------------
-- Staff gọi cancel_showtimes -> Bị từ chối 42501
select tap_as('00000000-0000-0000-0000-000000000c01'); -- Staff HN01
select throws_ok(
  $$select public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid], 'Staff thử huỷ')$$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Phân quyền: Staff không được gọi cancel_showtimes'
);

-- Staff gọi set_cinema_status -> Bị từ chối 42501
select throws_ok(
  $$select public.set_cinema_status('00000000-0000-0000-0000-0000000000c1'::uuid, 'OPEN'::public.cinema_status)$$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Phân quyền: Staff không được gọi set_cinema_status'
);

-- Staff gọi preview_cancel_showtimes -> Bị từ chối 42501
select throws_ok(
  $$select public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid])$$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Phân quyền: Staff không được gọi preview_cancel_showtimes'
);

-- Manager rạp khác (HN02) gọi cancel_showtimes trên suất của HN01 -> Bị từ chối 42501
select tap_as('00000000-0000-0000-0000-000000000b02'); -- Manager HN02
select throws_ok(
  $$select public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid], 'Manager khác thử huỷ')$$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Phân quyền: Manager HN02 không được huỷ suất của rạp HN01'
);

-- Manager rạp khác (HN02) gọi set_cinema_status trên rạp HN01 -> Bị từ chối 42501
select throws_ok(
  $$select public.set_cinema_status('00000000-0000-0000-0000-0000000000c1'::uuid, 'OPEN'::public.cinema_status)$$,
  '42501',
  'FORBIDDEN_CINEMA_SCOPE',
  'Phân quyền: Manager HN02 không được đổi trạng thái rạp HN01'
);

-- Validation: cancel_showtimes với lý do rỗng -> Bị lỗi P0001
select tap_as('00000000-0000-0000-0000-000000000b01'); -- Manager HN01
select throws_ok(
  $$select public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a401'::uuid], '   ')$$,
  'P0001',
  null,
  'Validation: cancel_showtimes bắt buộc có lý do'
);

-- Admin thực hiện set_cinema_status mở lại rạp HN01 thành công
select tap_as('00000000-0000-0000-0000-000000000a01'); -- Admin
select is(
  (public.set_cinema_status('00000000-0000-0000-0000-0000000000c1'::uuid, 'OPEN'::public.cinema_status)->>'status'),
  'OPEN',
  'Phân quyền: Admin đổi set_cinema_status thành công sang OPEN'
);

-- Cuối cùng, rollback toàn bộ test transaction
select * from finish();
rollback;
