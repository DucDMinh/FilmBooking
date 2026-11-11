-- pgTAP: bảng giá 2 cấp + ngày lễ + price_quote (layer 3 / task 01): AC-15, quyết định #19, RLS.
begin;
select plan(36);

create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
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
create function public.tap_rows(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture (owner). 2026-12-05 = Thứ bảy, 12-06 = Chủ nhật, 12-07 = Thứ hai.
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',  '{}'),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com',  '{}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000a01', 'ADMIN');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-a', 'Phim A', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'P1', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'P2', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000c1', 'P3', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000c1', 'P4', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'P1', '{2D}', 5, 6);
-- Ghế phòng P1 HN01: A1 VIP, A2 NORMAL, B1 SWEETBOX (2 ô), C1 AISLE. HN02: A1 VIP.
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'VIP'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 2, 'NORMAL'),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 1, 'SWEETBOX'),
  ('00000000-0000-0000-0000-00000000b104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 1, 'AISLE'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 1, 'VIP');
-- Suất (giờ VN):
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  -- AC-15: T7 19:00 2D HN01 và HN02
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-05 19:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e001', '2026-12-05 19:00:00+07', '2D'),
  -- biên 17:00 (T7 12-12)
  ('00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-12 17:00:00+07', '2D'),
  -- ngày lễ rơi vào Chủ nhật 12-06 20:00
  ('00000000-0000-0000-0000-00000000a506', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-06 20:00:00+07', '2D'),
  -- thứ Hai 12-07 19:00 (ngày thường) và suất 3D thứ Ba 12-08
  ('00000000-0000-0000-0000-00000000a507', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-07 19:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a508', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-08 19:00:00+07', '3D'),
  -- 00:30 VN ngày lễ 12-06 (= 17:30 UTC ngày 12-05): phải tính theo NGÀY VN
  ('00000000-0000-0000-0000-00000000a509', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-06 00:30:00+07', '2D');

-- Giá chuỗi 2D: VIP T7/CN tối 120.000, trước 17h 100.000; VIP thường tối 90.000; VIP lễ tối 150.000;
-- Sweetbox cuối tuần tối 200.000 / lễ tối 260.000 / thường tối 160.000. 3D VIP thường tối 110.000.
insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount) values
  ('CHAIN', 'VIP',      '2D', 'WEEKEND', 'AFTER_17',  120000),
  ('CHAIN', 'VIP',      '2D', 'WEEKEND', 'BEFORE_17', 100000),
  ('CHAIN', 'VIP',      '2D', 'NORMAL',  'AFTER_17',   90000),
  ('CHAIN', 'VIP',      '2D', 'HOLIDAY', 'AFTER_17',  150000),
  ('CHAIN', 'VIP',      '2D', 'HOLIDAY', 'BEFORE_17', 130000),
  ('CHAIN', 'VIP',      '3D', 'NORMAL',  'AFTER_17',  110000),
  ('CHAIN', 'SWEETBOX', '2D', 'WEEKEND', 'AFTER_17',  200000),
  ('CHAIN', 'SWEETBOX', '2D', 'HOLIDAY', 'AFTER_17',  260000),
  ('CHAIN', 'SWEETBOX', '2D', 'NORMAL',  'AFTER_17',  160000);
-- HN02 ghi đè VIP 2D cuối tuần tối = 100.000
insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount) values
  ('CINEMA', '00000000-0000-0000-0000-0000000000c2', 'VIP', '2D', 'WEEKEND', 'AFTER_17', 100000);
-- Ngày lễ 12-06 (Chủ nhật)
insert into public.holidays (holiday_date, name) values ('2026-12-06', 'Ngày lễ thử');

-- ---------------------------------------------------------------------------
-- 1. AC-15 (3)
-- ---------------------------------------------------------------------------
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a502', array['00000000-0000-0000-0000-00000000b201']::uuid[])),
          100000, 'AC-15: HN02 ghi đè -> VIP 2D T7 19:00 = 100.000');
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a501', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          120000, 'AC-15: HN01 không ghi đè -> 120.000');
-- ghi đè suất thắng ghi đè rạp/chuỗi
insert into public.price_rules (scope, showtime_id, seat_type, amount)
values ('SHOWTIME', '00000000-0000-0000-0000-00000000a501', 'VIP', 80000);
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a501', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          80000, 'ghi đè theo suất ưu tiên hơn chuỗi');

-- ---------------------------------------------------------------------------
-- 2. Biên 17:00 (2)
-- ---------------------------------------------------------------------------
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a503', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          120000, '17:00 VN thuộc sau 17h');
-- 16:59 VN (T7 12-19):
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a510', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-19 16:59:00+07', '2D');
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a510', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          100000, '16:59 VN thuộc trước 17h (T7 trước 17h)');

-- ---------------------------------------------------------------------------
-- 3. Ngày lễ ưu tiên hơn cuối tuần (3)
-- ---------------------------------------------------------------------------
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a506', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          150000, 'ngày lễ rơi Chủ nhật -> giá HOLIDAY (150.000), không phải WEEKEND');
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a509', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          130000, '00:30 VN ngày lễ: theo ngày VN (không phải UTC 12-05) -> HOLIDAY BEFORE_17');
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          90000, 'Thứ Hai tối -> ngày thường');

-- ---------------------------------------------------------------------------
-- 4. Sweetbox giá cặp, tổng số nguyên, định dạng (4)
-- ---------------------------------------------------------------------------
select is((select count(*) from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b103']::uuid[]))::int,
          1, 'Sweetbox trả 1 dòng');
select is((select row(seat_type, seat_count, amount)::text from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b103']::uuid[])),
          '(SWEETBOX,2,160000)', 'Sweetbox: giá cặp 160.000, tính 2 ghế');
select is((select sum(amount)::int from public.price_quote('00000000-0000-0000-0000-00000000a507',
            array['00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000b103']::uuid[])),
          250000, 'tổng VIP 90.000 + cặp 160.000 = 250.000 (số nguyên VND)');
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a508', array['00000000-0000-0000-0000-00000000b101']::uuid[])),
          110000, 'định dạng 3D dùng bảng giá 3D');

-- ---------------------------------------------------------------------------
-- 5. Lỗi đầu vào (6)
-- ---------------------------------------------------------------------------
select throws_ok($$select * from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b102']::uuid[])$$,
                 'P0002', null, 'thiếu rule giá (NORMAL) -> lỗi rõ, không bán giá 0');
select throws_ok($$select * from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b201']::uuid[])$$,
                 '22023', null, 'ghế phòng khác -> lỗi');
select throws_ok($$select * from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b104']::uuid[])$$,
                 '22023', null, 'ô lối đi không bán được');
select throws_ok($$select * from public.price_quote('00000000-0000-0000-0000-00000000a507', array['00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000b101']::uuid[])$$,
                 '22023', null, 'ghế trùng -> lỗi');
select throws_ok($$select * from public.price_quote('00000000-0000-0000-0000-00000000a507', '{}'::uuid[])$$,
                 '22023', null, 'không chọn ghế -> lỗi');
select throws_ok($$select * from public.price_quote('00000000-0000-0000-0000-0000000fffff', array['00000000-0000-0000-0000-00000000b101']::uuid[])$$,
                 '23503', null, 'suất không tồn tại -> lỗi');

-- ---------------------------------------------------------------------------
-- 6. Ràng buộc dữ liệu (4)
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount) values ('CHAIN', 'VIP', '2D', 'WEEKEND', 'AFTER_17', 1)$$,
                 '23505', null, 'trùng khoá rule CHAIN bị chặn');
select throws_ok($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount) values ('CINEMA', 'VIP', '2D', 'NORMAL', 'AFTER_17', 1)$$,
                 '23514', null, 'rule CINEMA thiếu cinema_id bị chặn');
select throws_ok($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount) values ('CHAIN', 'AISLE', '2D', 'NORMAL', 'AFTER_17', 1)$$,
                 '23514', null, 'không đặt giá cho lối đi');
select throws_ok($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount) values ('CHAIN', 'NORMAL', '2D', 'NORMAL', 'AFTER_17', -5)$$,
                 '23514', null, 'giá âm bị chặn');

-- ---------------------------------------------------------------------------
-- 7. RLS (12)
-- ---------------------------------------------------------------------------
select is((select count(*) from pg_tables where schemaname = 'public' and tablename in ('price_rules', 'holidays') and rowsecurity)::int,
          2, 'RLS bật trên price_rules + holidays');

select public.tap_anon();
select ok((select count(*) from public.price_rules) > 0 and (select count(*) from public.holidays) = 1, 'anon đọc được bảng giá và ngày lễ');
select is((select amount from public.price_quote('00000000-0000-0000-0000-00000000a502', array['00000000-0000-0000-0000-00000000b201']::uuid[])),
          100000, 'anon gọi được price_quote');
select throws_ok($$insert into public.holidays (holiday_date, name) values ('2026-12-25', 'x')$$, '42501', null, 'anon không ghi holidays');

select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is(public.tap_rows($$insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
  values ('CINEMA', '00000000-0000-0000-0000-0000000000c1', 'VIP', '2D', 'NORMAL', 'AFTER_17', 85000)$$), 1, 'Manager ghi rule CINEMA rạp mình');
select throws_ok($$insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
  values ('CINEMA', '00000000-0000-0000-0000-0000000000c2', 'VIP', '2D', 'NORMAL', 'AFTER_17', 85000)$$, '42501', null, 'Manager không ghi rule rạp khác');
select throws_ok($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount)
  values ('CHAIN', 'NORMAL', '2D', 'NORMAL', 'AFTER_17', 70000)$$, '42501', null, 'Manager không ghi rule CHAIN');
select is(public.tap_rows($$insert into public.price_rules (scope, showtime_id, seat_type, amount)
  values ('SHOWTIME', '00000000-0000-0000-0000-00000000a507', 'VIP', 70000)$$), 1, 'Manager ghi rule SHOWTIME suất rạp mình');
select throws_ok($$insert into public.holidays (holiday_date, name) values ('2026-12-25', 'x')$$, '42501', null, 'Manager không ghi ngày lễ');
select is(public.tap_rows($$update public.price_rules set amount = 86000 where scope = 'CINEMA' and cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
          0, 'Manager không sửa được rule rạp khác (0 dòng)');

select public.tap_as('00000000-0000-0000-0000-000000000a01');
select is(public.tap_rows($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount)
  values ('CHAIN', 'NORMAL', '2D', 'NORMAL', 'AFTER_17', 70000)$$), 1, 'Admin ghi rule CHAIN');
select is(public.tap_rows($$insert into public.holidays (holiday_date, name) values ('2026-12-25', 'Giáng sinh')$$), 1, 'Admin ghi ngày lễ');

select public.tap_as('00000000-0000-0000-0000-000000000d01');
select throws_ok($$insert into public.price_rules (scope, seat_type, format, day_type, time_band, amount)
  values ('CHAIN', 'NORMAL', '3D', 'NORMAL', 'AFTER_17', 1)$$, '42501', null, 'khách không ghi bảng giá');

select public.tap_owner();
select is((select cinema_id from public.price_rules where showtime_id = '00000000-0000-0000-0000-00000000a507'),
          '00000000-0000-0000-0000-0000000000c1'::uuid, 'cinema_id của rule SHOWTIME do trigger điền');

select * from finish();
rollback;
