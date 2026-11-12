-- pgTAP: RPC giữ/nhả/gia hạn ghế nguyên tử (layer 4 / task 01):
-- AC-06, AC-07, AC-21, AC-22, R-55, R-61..R-67, R-72, R-122..R-124, R-126.
begin;
select plan(52);

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
-- 1. Fixture (owner)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');

insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A', 15);

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',       '{}', now()),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',        '{}', now()),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com',      '{}', now()),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com',       '{}', now()),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com',       '{}', now()),
  ('00000000-0000-0000-0000-000000000d03', 'unconfirmed@example.com', '{}', null),
  ('00000000-0000-0000-0000-000000000d04', 'nodob@example.com',       '{}', now()),
  ('00000000-0000-0000-0000-000000000d05', 'underage@example.com',    '{}', now());

-- Cập nhật ngày sinh trong profiles (R-68, Defect 4)
update public.profiles
   set date_of_birth = '1995-05-15'
 where id in (
   '00000000-0000-0000-0000-000000000a01',
   '00000000-0000-0000-0000-000000000b01',
   '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d01',
   '00000000-0000-0000-0000-000000000d02'
 );

update public.profiles
   set date_of_birth = null
 where id = '00000000-0000-0000-0000-000000000d04';

update public.profiles
   set date_of_birth = (current_date - interval '10 years')::date
 where id = '00000000-0000-0000-0000-000000000d05';

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-000000000a01', 'ADMIN');

insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-test', 'Phim Test T13', 120, '2026-12-01', 'T13', 'PUBLISHED'),
  ('00000000-0000-0000-0000-00000000e002', 'phim-t18',  'Phim Test T18', 120, '2026-12-01', 'T18', 'PUBLISHED');

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'P1', '{2D}', 5, 12);

-- Hàng A: A1..A10 (NORMAL)
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1,  'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 2,  'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 3,  'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000000a104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 4,  'NORMAL', 'A4'),
  ('00000000-0000-0000-0000-00000000a105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 5,  'NORMAL', 'A5'),
  ('00000000-0000-0000-0000-00000000a106', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 6,  'NORMAL', 'A6'),
  ('00000000-0000-0000-0000-00000000a107', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 7,  'NORMAL', 'A7'),
  ('00000000-0000-0000-0000-00000000a108', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 8,  'NORMAL', 'A8'),
  ('00000000-0000-0000-0000-00000000a109', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 9,  'NORMAL', 'A9'),
  ('00000000-0000-0000-0000-00000000a110', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 10, 'NORMAL', 'A10');

-- Hàng B: B1..B3 (NORMAL), B4 AISLE, B5..B6 (NORMAL)
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 1, 'NORMAL', 'B1'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 2, 'NORMAL', 'B2'),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 3, 'NORMAL', 'B3'),
  ('00000000-0000-0000-0000-00000000b104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 4, 'AISLE',  'B4'),
  ('00000000-0000-0000-0000-00000000b105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 5, 'NORMAL', 'B5'),
  ('00000000-0000-0000-0000-00000000b106', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 6, 'NORMAL', 'B6');

-- Hàng C: C1..C4 (NORMAL), C5 (SWEETBOX, chiếm cột 5-6)
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 1, 'NORMAL',   'C1'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 2, 'NORMAL',   'C2'),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 3, 'NORMAL',   'C3'),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 4, 'NORMAL',   'C4'),
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 5, 'SWEETBOX', 'C5-C6');

-- Giá mặc định toàn chuỗi cho 2D (NORMAL 90.000, SWEETBOX 180.000)
insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount) values
  ('CHAIN', 'NORMAL',   '2D', 'NORMAL',  'AFTER_17',  90000),
  ('CHAIN', 'NORMAL',   '2D', 'NORMAL',  'BEFORE_17', 80000),
  ('CHAIN', 'NORMAL',   '2D', 'WEEKEND', 'AFTER_17', 100000),
  ('CHAIN', 'NORMAL',   '2D', 'WEEKEND', 'BEFORE_17', 90000),
  ('CHAIN', 'NORMAL',   '2D', 'HOLIDAY', 'AFTER_17', 120000),
  ('CHAIN', 'NORMAL',   '2D', 'HOLIDAY', 'BEFORE_17',110000),
  ('CHAIN', 'SWEETBOX', '2D', 'NORMAL',  'AFTER_17', 180000),
  ('CHAIN', 'SWEETBOX', '2D', 'NORMAL',  'BEFORE_17',160000),
  ('CHAIN', 'SWEETBOX', '2D', 'WEEKEND', 'AFTER_17', 200000),
  ('CHAIN', 'SWEETBOX', '2D', 'WEEKEND', 'BEFORE_17',180000),
  ('CHAIN', 'SWEETBOX', '2D', 'HOLIDAY', 'AFTER_17', 240000),
  ('CHAIN', 'SWEETBOX', '2D', 'HOLIDAY', 'BEFORE_17',220000);

-- Các suất chiếu thử nghiệm:
-- 1. st1: suất mở bán tương lai (sau 6 tiếng, phim T13)
-- 2. st2: suất qua mốc cutoff online (starts_at = now() + 10 phút, cutoff = 15 phút)
-- 3. st3: suất đã qua giờ chiếu + duration (5 tiếng trước)
-- 4. st4: suất bị CANCELLED
-- 5. st5: suất bị CLOSED
-- 6. st18: suất tương lai cho phim T18 (Defect 4)
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', now() + interval '6 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', now() + interval '10 minutes', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', now() - interval '5 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-000000005004', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', now() + interval '10 hours', '2D', 'CANCELLED'),
  ('00000000-0000-0000-0000-000000005005', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', now() + interval '15 hours', '2D', 'CLOSED'),
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e002', now() + interval '24 hours', '2D', 'ON_SALE');

-- ---------------------------------------------------------------------------
-- 2. Test Input Validation & Auth (R-05, AC-01)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005001'::uuid, '{}'::uuid[])$$,
  '22023',
  null,
  'Chưa chọn ghế -> lỗi SEAT_REQUIRED'
);

select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005001'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a101']::uuid[])$$,
  '22023',
  null,
  'Danh sách ghế trùng lặp -> lỗi DUPLICATE_SEATS'
);

-- Khách chưa xác nhận email trên Web -> chặn (R-05, AC-01)
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005001'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB', '00000000-0000-0000-0000-000000000d03'::uuid)$$,
  '42501',
  null,
  'Web: Khách chưa xác nhận email -> lỗi EMAIL_NOT_CONFIRMED'
);

-- Web thiếu user_id
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005001'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB', null::uuid)$$,
  '42501',
  null,
  'Web: Thiếu user_id -> lỗi AUTH_REQUIRED'
);

-- ---------------------------------------------------------------------------
-- 3. Test Giới hạn số ghế (R-65)
-- ---------------------------------------------------------------------------
-- 9 ghế thường -> vượt quá 8
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array[
        '00000000-0000-0000-0000-00000000a101',
        '00000000-0000-0000-0000-00000000a102',
        '00000000-0000-0000-0000-00000000a103',
        '00000000-0000-0000-0000-00000000a104',
        '00000000-0000-0000-0000-00000000a105',
        '00000000-0000-0000-0000-00000000a106',
        '00000000-0000-0000-0000-00000000a107',
        '00000000-0000-0000-0000-00000000a108',
        '00000000-0000-0000-0000-00000000a109'
      ]::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Chọn 9 ghế thường -> lỗi HOLD_LIMIT'
);

-- 7 ghế thường + 1 Sweetbox (tổng 9 chỗ) -> vượt 8
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array[
        '00000000-0000-0000-0000-00000000a101',
        '00000000-0000-0000-0000-00000000a102',
        '00000000-0000-0000-0000-00000000a103',
        '00000000-0000-0000-0000-00000000a104',
        '00000000-0000-0000-0000-00000000a105',
        '00000000-0000-0000-0000-00000000a106',
        '00000000-0000-0000-0000-00000000a107',
        '00000000-0000-0000-0000-00000000c105'
      ]::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Chọn 7 ghế thường + 1 Sweetbox (9 chỗ) -> lỗi HOLD_LIMIT'
);

-- Chọn lối đi -> lỗi INVALID_SEATS
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000b104']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '22023',
  null,
  'Chọn lối đi (AISLE) -> lỗi INVALID_SEATS'
);

-- ---------------------------------------------------------------------------
-- 4. Test Trạng thái Suất chiếu & Mốc Cutoff (R-67, Quyết định #11)
-- ---------------------------------------------------------------------------
-- Suất CANCELLED
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005004'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB', '00000000-0000-0000-0000-000000000d01'::uuid)$$,
  '23514',
  null,
  'Suất CANCELLED -> lỗi SHOWTIME_CANCELLED'
);

-- Suất CLOSED
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005005'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB', '00000000-0000-0000-0000-000000000d01'::uuid)$$,
  '23514',
  null,
  'Suất CLOSED -> lỗi SALES_CLOSED'
);

-- Web: sau mốc cutoff 15 phút (suất 2 cách 10 phút) -> lỗi SALES_CLOSED
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005002'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB', '00000000-0000-0000-0000-000000000d01'::uuid)$$,
  '23514',
  null,
  'Web sau mốc cutoff 15 phút -> lỗi SALES_CLOSED'
);

-- POS: cùng thời điểm suất 2 vẫn giữ được (R-67 chỉ chặn Web; gọi bởi staff1)
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005002'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'POS', '00000000-0000-0000-0000-000000000c01'::uuid)$$,
  'POS sau mốc cutoff online vẫn giữ được'
);

-- POS: quá giờ kết thúc phim -> lỗi SALES_CLOSED
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005003'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'POS', '00000000-0000-0000-0000-000000000c01'::uuid)$$,
  '23514',
  null,
  'POS sau giờ kết thúc phim -> lỗi SALES_CLOSED'
);

-- ---------------------------------------------------------------------------
-- 5. Test Quy tắc không để ghế lẻ (ORPHAN_SEAT — R-66)
-- ---------------------------------------------------------------------------
-- Hàng A có 10 ghế (A1..A10).
-- Trường hợp 1: Chọn A2, A3 -> để lại A1 trơ trọi cạnh tường (biên) -> ORPHAN_SEAT
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a103']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Chọn A2-A3 để trống A1 cạnh tường -> lỗi ORPHAN_SEAT'
);

-- Trường hợp 2: Chọn A1, A3 -> để lại A2 ở giữa 2 ghế đã chọn -> ORPHAN_SEAT
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a103']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Chọn A1, A3 để trống A2 ở giữa -> lỗi ORPHAN_SEAT'
);

-- Trường hợp 3: Hàng B có B1, B2, B3 rồi đến B4 là AISLE.
-- Chọn B2 -> để lại B1 cạnh tường và B3 cạnh lối đi -> ORPHAN_SEAT
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000b102']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Chọn B2 để trống B1 và B3 cạnh AISLE -> lỗi ORPHAN_SEAT'
);

-- Trường hợp 4: Chọn hợp lệ A1, A2 (còn lại A3..A10 là 8 ghế trống liền kề) -> HỢP LỆ!
select lives_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  'Chọn A1, A2 hợp lệ không tạo ghế lẻ'
);

-- ---------------------------------------------------------------------------
-- 6. Test Giữ trùng ghế SEAT_TAKEN & Khách khác không giữ được (AC-06, AC-21)
-- ---------------------------------------------------------------------------
-- Cust2 cố giữ A2 (Cust1 đang HELD còn hạn) -> SEAT_TAKEN
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a103']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d02'::uuid
    )$$,
  '23514',
  null,
  'Ghế A2 đang HELD -> Cust2 bị lỗi SEAT_TAKEN'
);

-- POS cố giữ A1 -> SEAT_TAKEN (AC-21)
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[],
      'POS',
      '00000000-0000-0000-0000-000000000c01'::uuid
    )$$,
  '23514',
  null,
  'Ghế Web đang giữ -> POS cố giữ bị lỗi SEAT_TAKEN (AC-21)'
);

-- ---------------------------------------------------------------------------
-- 7. Test R-64: Khách đặt đơn mới trên Web tự huỷ đơn giữ cũ
-- ---------------------------------------------------------------------------
-- Cust1 hiện đang giữ A1, A2. Bây giờ Cust1 giữ A5, A6:
-- Đơn cũ giữ A1, A2 phải tự chuyển sang cancelled, ghế A1, A2 được giải phóng.
select lives_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a105', '00000000-0000-0000-0000-00000000a106']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  'Cust1 tạo đơn mới (A5, A6) thành công'
);

-- Kiểm tra ghế A1, A2 không còn HELD trong showtime_seat_states
select ok(
  not exists (
    select 1 from public.showtime_seat_states
     where showtime_id = '00000000-0000-0000-0000-000000005001'::uuid
       and seat_id in ('00000000-0000-0000-0000-00000000a101'::uuid, '00000000-0000-0000-0000-00000000a102'::uuid)
  ),
  'R-64: Ghế cũ A1, A2 đã được giải phóng'
);

-- Cust2 bây giờ có thể giữ A1, A2 ngay lập tức
select lives_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d02'::uuid
    )$$,
  'Cust2 giữ A1, A2 thành công sau khi Cust1 chuyển sang đơn mới'
);

-- ---------------------------------------------------------------------------
-- 8. Test Ghế bị Manager khoá (R-55)
-- ---------------------------------------------------------------------------
-- Manager khoá ghế A9
insert into public.showtime_seat_locks (showtime_id, seat_id, reason) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a109', 'GUEST');

-- Khách cố chọn A9, A10 -> SEAT_TAKEN
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a109', '00000000-0000-0000-0000-00000000a110']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Ghế A9 bị khoá -> lỗi SEAT_TAKEN'
);

-- Mở khoá A9 để dọn fixture cho các test tiếp theo
delete from public.showtime_seat_locks
 where showtime_id = '00000000-0000-0000-0000-000000005001'
   and seat_id = '00000000-0000-0000-0000-00000000a109';

-- ---------------------------------------------------------------------------
-- 9. Test Chốt giá và Bất biến giá (R-72, AC-15)
-- ---------------------------------------------------------------------------
-- Kiểm tra đơn của Cust2 (A1, A2): subtotal_amount = 2 * giá NORMAL
select is(
  (select subtotal_amount from public.orders where user_id = '00000000-0000-0000-0000-000000000d02' and status = 'holding'),
  (select sum(price_amount)::int from public.order_seats os join public.orders o on o.id = os.order_id where o.user_id = '00000000-0000-0000-0000-000000000d02' and o.status = 'holding'),
  'R-72: subtotal_amount trong orders khớp tổng price_amount trong order_seats'
);

-- Giả định rạp đổi bảng giá sau đó
update public.price_rules
   set amount = 999999
 where scope = 'CHAIN' and seat_type = 'NORMAL';

-- Giá chốt trong order_seats và orders không bị thay đổi
select is(
  (select max(price_amount) from public.order_seats os join public.orders o on o.id = os.order_id where o.user_id = '00000000-0000-0000-0000-000000000d02'),
  (select (subtotal_amount / 2)::int from public.orders where user_id = '00000000-0000-0000-0000-000000000d02' and status = 'holding'),
  'R-72: Thay đổi price_rules sau đó không làm đổi giá đã chốt trong đơn đang holding'
);

-- Trả lại giá cũ
update public.price_rules
   set amount = 90000
 where scope = 'CHAIN' and seat_type = 'NORMAL' and amount = 999999;

-- ---------------------------------------------------------------------------
-- 10. Test Hold hết hạn coi như trống & tự động thay thế (AC-07)
-- ---------------------------------------------------------------------------
-- Giả lập đơn của Cust2 bị quá hạn (lùi expires_at về quá khứ)
update public.orders
   set hold_expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-0000-0000-000000000d02' and status = 'holding';

update public.showtime_seat_states
   set expires_at = now() - interval '1 minute'
 where showtime_id = '00000000-0000-0000-0000-000000005001'
   and seat_id in ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102');

-- Bây giờ khách khác (Cust1) giữ đè lên A1, A2 -> THÀNH CÔNG (AC-07)!
select lives_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  'AC-07: Hold hết hạn coi như trống, Cust1 giữ đè thành công'
);

-- Đơn cũ của Cust2 được tự động đánh dấu expired
select is(
  (select status from public.orders where user_id = '00000000-0000-0000-0000-000000000d02' order by created_at desc limit 1),
  'expired'::public.order_status,
  'AC-07: Đơn giữ cũ đã hết hạn được chuyển sang expired'
);

-- ---------------------------------------------------------------------------
-- 11. Test release_seats (Nhả ghế chủ động) & BOLA / IDOR (Defect 1)
-- ---------------------------------------------------------------------------
-- Lấy order_id hiện tại của Cust1
create temp table _current_order as
  select id from public.orders where user_id = '00000000-0000-0000-0000-000000000d01' and status = 'holding';
grant select on _current_order to public;

-- Cust2 cố nhả đơn của Cust1 bằng UUID của chính Cust2 -> PERMISSION_DENIED
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select tap_as('00000000-0000-0000-0000-000000000d02');
select throws_ok(
  $$select public.release_seats((select id from _current_order)::uuid, '00000000-0000-0000-0000-000000000d02'::uuid)$$,
  '42501',
  null,
  'Cust2 không thể nhả đơn của Cust1'
);

-- Cust2 cố giả mạo danh tính bằng cách truyền p_actor_id = Cust1 khi đăng nhập là Cust2 (Defect 1) -> PERMISSION_DENIED
select throws_ok(
  $$select public.release_seats((select id from _current_order)::uuid, '00000000-0000-0000-0000-000000000d01'::uuid)$$,
  '42501',
  null,
  'Cust2 cố giả mạo p_actor_id của Cust1 bị chặn PERMISSION_DENIED (Defect 1)'
);

-- Cust1 tự nhả đơn của mình -> thành công
select tap_as('00000000-0000-0000-0000-000000000d01');
select lives_ok(
  $$select public.release_seats((select id from _current_order)::uuid, '00000000-0000-0000-0000-000000000d01'::uuid)$$,
  'Cust1 tự nhả đơn holding thành công'
);
select tap_owner();

-- Đơn chuyển sang cancelled và ghế A1, A2 được giải phóng
select is(
  (select status from public.orders where id = (select id from _current_order)),
  'cancelled'::public.order_status,
  'release_seats: Đơn chuyển sang status cancelled'
);

select ok(
  not exists (
    select 1 from public.showtime_seat_states
     where showtime_id = '00000000-0000-0000-0000-000000005001'::uuid
       and seat_id in ('00000000-0000-0000-0000-00000000a101'::uuid, '00000000-0000-0000-0000-00000000a102'::uuid)
  ),
  'release_seats: Ghế trong showtime_seat_states đã được xoá'
);

-- ---------------------------------------------------------------------------
-- 12. Test POS Hold, Thời hạn 5' (AC-22) & extend_pos_hold (R-124) & Phân quyền POS (Defect 2)
-- ---------------------------------------------------------------------------
-- Khách thường (Cust2) cố gọi hold_seats kênh POS -> PERMISSION_DENIED (Defect 2)
select tap_as('00000000-0000-0000-0000-000000000d02');
select throws_ok(
  $$select * from public.hold_seats(
    '00000000-0000-0000-0000-000000005001'::uuid,
    array['00000000-0000-0000-0000-00000000a107', '00000000-0000-0000-0000-00000000a108']::uuid[],
    'POS'
  )$$,
  '42501',
  null,
  'Khách thường gọi hold_seats kênh POS bị chặn PERMISSION_DENIED (Defect 2)'
);

-- Khách thường (Cust2) cố mạo danh p_user_id của Cust1 trên Web -> PERMISSION_DENIED (Defect 2)
select throws_ok(
  $$select * from public.hold_seats(
    '00000000-0000-0000-0000-000000005001'::uuid,
    array['00000000-0000-0000-0000-00000000a107', '00000000-0000-0000-0000-00000000a108']::uuid[],
    'WEB',
    '00000000-0000-0000-0000-000000000d01'::uuid
  )$$,
  '42501',
  null,
  'Khách thường mạo danh p_user_id của người khác bị chặn PERMISSION_DENIED (Defect 2)'
);
select tap_owner();

-- Tạo đơn POS mới hợp lệ (gọi bởi Staff1 của rạp HN01)
create temp table _pos_order as
  select * from public.hold_seats(
    '00000000-0000-0000-0000-000000005001'::uuid,
    array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[],
    'POS',
    '00000000-0000-0000-0000-000000000c01'::uuid,
    'req-pos-001'
  );
grant select on _pos_order to public;

-- Kiểm tra thời hạn hold của POS xấp xỉ now() + 5 phút (AC-22)
select ok(
  (select hold_expires_at from _pos_order) between (now() + interval '4 minutes 50 seconds') and (now() + interval '5 minutes 10 seconds'),
  'AC-22: POS hold có thời hạn xấp xỉ now() + 5 phút'
);

-- Idempotency POS (R-126): gọi lại cùng request_id 'req-pos-001' -> trả về cùng đơn
select is(
  (select order_id from public.hold_seats(
    '00000000-0000-0000-0000-000000005001'::uuid,
    array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[],
    'POS',
    '00000000-0000-0000-0000-000000000c01'::uuid,
    'req-pos-001'
  )),
  (select order_id from _pos_order),
  'R-126: POS hold idempotent với cùng request_id trả về cùng order_id'
);

-- Khách thường cố gia hạn đơn POS -> PERMISSION_DENIED
select tap_as('00000000-0000-0000-0000-000000000d01');
select throws_ok(
  $$select public.extend_pos_hold((select order_id from _pos_order)::uuid, 5)$$,
  '42501',
  null,
  'Khách thường không được gia hạn đơn POS'
);

-- Nhân viên rạp (Staff1) gia hạn đơn POS -> thành công (R-124)
select tap_as('00000000-0000-0000-0000-000000000c01');
select lives_ok(
  $$select public.extend_pos_hold((select order_id from _pos_order)::uuid, 5)$$,
  'Staff rạp gia hạn đơn POS thành công'
);

select tap_owner();

-- Kiểm tra thời hạn mới được cộng thêm 5 phút
select ok(
  (select hold_expires_at from public.orders where id = (select order_id from _pos_order)) >= (now() + interval '9 minutes'),
  'R-124: Đơn POS được gia hạn thêm 5 phút'
);

-- Cố gia hạn đơn Web bằng extend_pos_hold -> POS_ONLY
create temp table _web_temp_order as
  select * from public.hold_seats(
    '00000000-0000-0000-0000-000000005001'::uuid,
    array['00000000-0000-0000-0000-00000000a105', '00000000-0000-0000-0000-00000000a106']::uuid[],
    'WEB',
    '00000000-0000-0000-0000-000000000d01'::uuid
  );
grant select on _web_temp_order to public;

select throws_ok(
  $$select public.extend_pos_hold((select order_id from _web_temp_order)::uuid, 5)$$,
  '23514',
  null,
  'extend_pos_hold trên đơn Web -> lỗi POS_ONLY'
);

-- ---------------------------------------------------------------------------
-- 13. Test expire_overdue_holds & pg_cron
-- ---------------------------------------------------------------------------
-- Giả lập đơn POS bị quá hạn
update public.orders
   set hold_expires_at = now() - interval '10 seconds'
 where id = (select order_id from _pos_order);

update public.showtime_seat_states
   set expires_at = now() - interval '10 seconds'
 where order_id = (select order_id from _pos_order);

-- Chạy expire_overdue_holds()
select is(
  (select public.expire_overdue_holds()),
  1,
  'expire_overdue_holds dọn được đúng 1 đơn quá hạn'
);

-- Trạng thái đơn chuyển sang expired
select is(
  (select status from public.orders where id = (select order_id from _pos_order)),
  'expired'::public.order_status,
  'Đơn quá hạn đã chuyển sang status expired'
);

-- Ghế được giải phóng khỏi showtime_seat_states và seat_status_public
select ok(
  not exists (
    select 1 from public.showtime_seat_states
     where order_id = (select order_id from _pos_order)
  ),
  'Ghế của đơn quá hạn đã bị xoá khỏi showtime_seat_states'
);

select ok(
  not exists (
    select 1 from public.seat_status_public
     where showtime_id = '00000000-0000-0000-0000-000000005001'::uuid
       and seat_id in ('00000000-0000-0000-0000-00000000a101'::uuid, '00000000-0000-0000-0000-00000000a102'::uuid)
  ),
  'Ghế của đơn quá hạn đã đồng bộ xoá khỏi seat_status_public'
);

-- Kiểm tra cron job expire-overdue-holds đã đăng ký
select is(
  (select count(*)::int from cron.job where jobname = 'expire-overdue-holds' and schedule = '* * * * *'),
  1,
  'Cron job expire-overdue-holds mỗi phút tồn tại'
);

-- ---------------------------------------------------------------------------
-- 14. Test Sweetbox & Quy tắc ghế lẻ với Sweetbox
-- ---------------------------------------------------------------------------
-- Hàng C: C1..C4 (NORMAL), C5-C6 (SWEETBOX)
-- Chọn C3, C4 -> để lại C5-C6 (SWEETBOX, 2 chỗ) -> KHÔNG bị lỗi ORPHAN_SEAT vì Sweetbox là ghế đôi
select lives_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000c104']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d02'::uuid
    )$$,
  'Để lại ghế đôi SWEETBOX không bị lỗi ORPHAN_SEAT'
);

-- Dọn giữ C3, C4 của Cust2 để test quy tắc orphan seat khi chọn C3 và SWEETBOX C5
delete from public.showtime_seat_states
 where showtime_id = '00000000-0000-0000-0000-000000005001'::uuid
   and seat_id in ('00000000-0000-0000-0000-00000000c103'::uuid, '00000000-0000-0000-0000-00000000c104'::uuid);

-- Chọn C5-C6 (SWEETBOX) và C3 -> để lại C4 lẻ trơ trọi giữa C3 và C5 -> lỗi ORPHAN_SEAT
select throws_ok(
  $$select * from public.hold_seats(
      '00000000-0000-0000-0000-000000005001'::uuid,
      array['00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000c105']::uuid[],
      'WEB',
      '00000000-0000-0000-0000-000000000d01'::uuid
    )$$,
  '23514',
  null,
  'Chọn C3 và SWEETBOX C5 để lại C4 ở giữa -> lỗi ORPHAN_SEAT'
);

-- Phân quyền execute RPC: anon không được gọi
select tap_anon();
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005001'::uuid, array['00000000-0000-0000-0000-00000000a101']::uuid[])$$,
  '42501',
  null,
  'anon không được gọi hold_seats'
);
select tap_owner();

-- ---------------------------------------------------------------------------
-- 15. Test Độ tuổi phim T18 (Defect 4, R-68, AC-16)
-- ---------------------------------------------------------------------------
-- Khách chưa cập nhật ngày sinh (nodob) đặt phim T18 -> DOB_REQUIRED (22023)
select tap_as('00000000-0000-0000-0000-000000000d04');
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005018'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB')$$,
  '22023',
  null,
  'Khách chưa có ngày sinh đặt phim T18 bị lỗi DOB_REQUIRED (Defect 4)'
);

-- Khách 10 tuổi (underage) đặt phim T18 -> UNDERAGE_FOR_RATING (23514)
select tap_as('00000000-0000-0000-0000-000000000d05');
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005018'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB')$$,
  '23514',
  null,
  'Khách 10 tuổi đặt phim T18 bị lỗi UNDERAGE_FOR_RATING (Defect 4)'
);

-- Khách đủ tuổi (Cust1) đặt phim T18 -> lives_ok
select tap_as('00000000-0000-0000-0000-000000000d01');
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005018'::uuid, array['00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102']::uuid[], 'WEB')$$,
  'Khách đủ tuổi đặt phim T18 thành công (Defect 4)'
);
select tap_owner();

-- ---------------------------------------------------------------------------
-- 16. Test Miễn trừ ORPHAN_SEAT khi còn <= 2 ghế trống & Miễn trừ POS (Defect 5)
-- ---------------------------------------------------------------------------
-- Tạo một đơn paid trên suất 5018 để gắn ghế SOLD
insert into public.orders (id, channel, cinema_id, showtime_id, status, subtotal_amount, total_amount, booking_code)
values ('00000000-0000-0000-0000-000000007018', 'WEB', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000005018', 'paid', 540000, 540000, 'HN01-SOLD01');

-- Hàng A của suất 5018: A1, A2 đã HELD bởi Cust1. Đánh dấu A3..A8 là SOLD
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, order_id)
values
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-00000000a103', 'SOLD', 'WEB', '00000000-0000-0000-0000-000000007018'),
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-00000000a104', 'SOLD', 'WEB', '00000000-0000-0000-0000-000000007018'),
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-00000000a105', 'SOLD', 'WEB', '00000000-0000-0000-0000-000000007018'),
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-00000000a106', 'SOLD', 'WEB', '00000000-0000-0000-0000-000000007018'),
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-00000000a107', 'SOLD', 'WEB', '00000000-0000-0000-0000-000000007018'),
  ('00000000-0000-0000-0000-000000005018', '00000000-0000-0000-0000-00000000a108', 'SOLD', 'WEB', '00000000-0000-0000-0000-000000007018');

-- Bây giờ phân đoạn chỉ còn 2 ghế trống là A9 và A10 (seg_available_before = 2 <= 2).
-- Cust2 mua 1 ghế A9 (để lại A10 trơ trọi cạnh tường) -> thành công, được miễn trừ ORPHAN_SEAT!
select tap_as('00000000-0000-0000-0000-000000000d02');
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005018'::uuid, array['00000000-0000-0000-0000-00000000a109']::uuid[], 'WEB')$$,
  'Mua 1 ghế khi phân đoạn chỉ còn 2 ghế trống được miễn trừ ORPHAN_SEAT (Defect 5)'
);
select tap_owner();

-- Kênh POS (gọi bởi Staff1) được miễn trừ hoàn toàn kiểm tra ORPHAN_SEAT:
-- Trên suất 5001, hàng B còn trống B1, B2, B3. Nhân viên POS chọn B2 (để lại B1 và B3 trơ trọi) -> thành công!
select tap_as('00000000-0000-0000-0000-000000000c01');
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-000000005001'::uuid, array['00000000-0000-0000-0000-00000000b102']::uuid[], 'POS', '00000000-0000-0000-0000-000000000c01'::uuid)$$,
  'Kênh POS được miễn trừ kiểm tra ghế lẻ ORPHAN_SEAT (Defect 5)'
);
select tap_owner();

select * from finish();
rollback;
