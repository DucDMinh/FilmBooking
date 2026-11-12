-- pgTAP: sửa danh mục & lịch chiếu (layer 3 / task 01, follow-up review layer 2).
-- G1: tính lại ends_at suất tương lai khi đổi thời lượng phim / dọn phòng; một nguồn override dọn phòng.
-- G2 (R-33): khách chỉ thấy suất của rạp OPEN.
begin;
select plan(23);

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
-- Mốc 30 ngày tới (tương lai, không phụ thuộc ngày chạy test)
create function public.tap_base() returns timestamptz language sql stable as $$
  select date_trunc('day', now()) + interval '30 days 10 hours';
$$;

-- ---------------------------------------------------------------------------
-- Fixture (owner)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');
insert into public.cinemas (id, code, name, province_id, address, cleaning_minutes) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A', null),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B', 5);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',  '{}'),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000b02', 'mgr2@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com',  '{}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000a01', 'ADMIN');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000c2', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-1', 'Phim 1', 100, '2026-01-01', 'T13', 'PUBLISHED'),
  ('00000000-0000-0000-0000-00000000e002', 'phim-2', 'Phim 2', 100, '2026-01-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'P1', 5, 6),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'P2', 5, 6),
  ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000c1', 'P4', 5, 6),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'P1', 5, 6);
-- A: tương lai, phim 1, rạp mặc định (15). P: quá khứ. C: tương lai nhưng đã huỷ. D: rạp HN02 dọn phòng riêng 5.
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', public.tap_base(), '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e001', now() - interval '10 days', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e001', public.tap_base(), '2D', 'CANCELLED'),
  ('00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e001', public.tap_base(), '2D', 'ON_SALE');

-- ---------------------------------------------------------------------------
-- G1: một nguồn override dọn phòng = cinemas.cleaning_minutes
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.cinema_settings (cinema_id, key, value)
  values ('00000000-0000-0000-0000-0000000000c1', 'default_cleaning_minutes', '30'::jsonb)$$,
  '23514', null, 'cinema_settings không được chứa override dọn phòng (nguồn thứ hai)');
select lives_ok($$insert into public.cinema_settings (cinema_id, key, value)
  values ('00000000-0000-0000-0000-0000000000c1', 'default_online_cutoff_minutes', '30'::jsonb)$$,
  'key cấu hình khác vẫn ghi được');

-- ---------------------------------------------------------------------------
-- G1: đổi thời lượng phim -> tính lại suất tương lai (chỉ suất chưa chiếu, chưa huỷ)
-- ---------------------------------------------------------------------------
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'),
          interval '115 minutes', 'ban đầu ends_at = 100 phút phim + 15 dọn phòng');
update public.movies set duration_minutes = 110 where id = '00000000-0000-0000-0000-00000000e001';
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'),
          interval '125 minutes', 'đổi thời lượng 110: suất tương lai được tính lại');
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a502'),
          interval '115 minutes', 'suất quá khứ giữ nguyên');
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a503'),
          interval '115 minutes', 'suất đã huỷ giữ nguyên');

-- ---------------------------------------------------------------------------
-- G1: tính lại gây chồng giờ -> lỗi rõ, không bỏ qua im lặng
-- Phim 2 (100'): B1 tại base, B2 sau 120' (khoảng đệm 5')
-- ---------------------------------------------------------------------------
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a511', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000e002', public.tap_base(), '2D'),
  ('00000000-0000-0000-0000-00000000a512', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000e002', public.tap_base() + interval '120 minutes', '2D');
select throws_ok($$update public.movies set duration_minutes = 130 where id = '00000000-0000-0000-0000-00000000e002'$$,
                 '23P01', null, 'kéo dài phim làm chồng giờ -> lỗi 23P01');
select is((select duration_minutes from public.movies where id = '00000000-0000-0000-0000-00000000e002'), 100,
          'đổi thời lượng bị rollback khi gây chồng giờ');
select throws_ok($$update public.cinemas set cleaning_minutes = 30 where id = '00000000-0000-0000-0000-0000000000c1'$$,
                 '23P01', null, 'tăng thời gian dọn phòng làm chồng giờ -> lỗi 23P01');
select is((select cleaning_minutes from public.cinemas where id = '00000000-0000-0000-0000-0000000000c1'), null,
          'đổi cleaning_minutes bị rollback khi gây chồng giờ');
delete from public.showtimes where id in ('00000000-0000-0000-0000-00000000a511', '00000000-0000-0000-0000-00000000a512');

-- ---------------------------------------------------------------------------
-- G1: đổi dọn phòng của rạp / mặc định chuỗi
-- ---------------------------------------------------------------------------
update public.cinemas set cleaning_minutes = 30 where id = '00000000-0000-0000-0000-0000000000c1';
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'),
          interval '140 minutes', 'rạp đặt dọn phòng 30: suất tương lai = 110 + 30');
update public.cinemas set cleaning_minutes = null where id = '00000000-0000-0000-0000-0000000000c1';
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'),
          interval '125 minutes', 'xoá override: quay về mặc định 15');
update public.app_settings set value = '20'::jsonb where key = 'default_cleaning_minutes';
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'),
          interval '130 minutes', 'đổi mặc định chuỗi 20: rạp dùng mặc định được tính lại');
select is((select ends_at - starts_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a504'),
          interval '115 minutes', 'rạp có override riêng (5) không bị đổi theo mặc định chuỗi');

-- ---------------------------------------------------------------------------
-- G2 (R-33): showtimes_select chỉ cho khách thấy suất của rạp OPEN
-- ---------------------------------------------------------------------------
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select public.tap_anon();
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 1, 'rạp OPEN: khách thấy suất');

select public.tap_owner();
update public.cinemas set status = 'TEMP_CLOSED' where id = '00000000-0000-0000-0000-0000000000c1';

select public.tap_anon();
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 0, 'rạp TEMP_CLOSED: anon không thấy suất');
select public.tap_as('00000000-0000-0000-0000-000000000d01');
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 0, 'rạp TEMP_CLOSED: khách đăng nhập không thấy suất');
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 1, 'Manager rạp vẫn thấy suất');
select public.tap_as('00000000-0000-0000-0000-000000000c01');
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 1, 'Staff rạp vẫn thấy suất');
select public.tap_as('00000000-0000-0000-0000-000000000b02');
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 0, 'Manager rạp khác không thấy suất rạp đóng');
select public.tap_as('00000000-0000-0000-0000-000000000a01');
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 1, 'Admin thấy mọi suất');

select public.tap_owner();
update public.cinemas set status = 'CLOSED' where id = '00000000-0000-0000-0000-0000000000c1';
select public.tap_anon();
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 0, 'rạp CLOSED: anon không thấy suất');

select public.tap_owner();
update public.cinemas set status = 'OPEN' where id = '00000000-0000-0000-0000-0000000000c1';
select public.tap_anon();
select is((select count(*) from public.showtimes where id = '00000000-0000-0000-0000-00000000a501')::int, 1, 'mở lại rạp: khách thấy suất trở lại');

select public.tap_owner();
select * from finish();
rollback;
