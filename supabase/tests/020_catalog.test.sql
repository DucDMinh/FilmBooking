-- pgTAP: danh mục phim & lịch chiếu (layer 2 / task 01).
-- Kiểm: RLS bật, AC-14 chống chồng giờ, Manager chỉ ghi rạp mình, Sweetbox 2 ô + unique ô,
-- khoá ghế, audit (R-107), storage policy.
begin;
select plan(75);

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
create function public.tap_rows(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
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
-- Fixture (owner, bypass RLS)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',  '{}'),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000b02', 'mgr2@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com',  '{}'),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com',  '{}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000a01', 'ADMIN');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000c2', 'MANAGER');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-a', 'Phim A', 120, '2026-12-01', 'T13', 'PUBLISHED'),
  ('00000000-0000-0000-0000-00000000e002', 'phim-nhap', 'Phim nháp', 90, '2026-12-01', 'P', 'DRAFT');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'Phòng 2', '{2D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'Phòng 1', '{2D}', 5, 6);
-- Suất 19:00 -> 21:15 (120 phút + 15 dọn phòng mặc định) phòng 1 HN01 (ICT = UTC+7)
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001',
   '2026-12-05 19:00:00+07', '2D');
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'SWEETBOX', 'A1'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 3, 'NORMAL',   'A3'),
  ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 4, 'AISLE',    null),
  ('00000000-0000-0000-0000-00000000b104', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 5, 'BROKEN',   'A5');

-- ---------------------------------------------------------------------------
-- 1. RLS bật (2)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
      and relname in ('movies','rooms','seats','showtimes','showtime_seat_locks')),
  5, 'cả 5 bảng catalog bật RLS');
select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace and t.tgname like '%\_audit' and not t.tgisinternal
      and c.relname in ('movies','rooms','seats','showtimes','showtime_seat_locks')),
  5, 'cả 5 bảng catalog có audit trigger');

-- ---------------------------------------------------------------------------
-- 2. AC-14 chống chồng giờ (7)
-- ---------------------------------------------------------------------------
select is(
  (select ends_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'),
  '2026-12-05 21:15:00+07'::timestamptz, 'ends_at = start + 120 phút phim + 15 dọn phòng');

select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f101',
   '00000000-0000-0000-0000-00000000e001','2026-12-05 21:00:00+07','2D')$$,
  '23P01', null, 'AC-14: 21:00 phòng 1 HN01 bị chặn chồng giờ');
select lives_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000f201',
   '00000000-0000-0000-0000-00000000e001','2026-12-05 21:00:00+07','2D')$$,
  'AC-14: 21:00 phòng 1 HN02 được phép');
select lives_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f101',
   '00000000-0000-0000-0000-00000000e001','2026-12-05 21:15:00+07','2D')$$,
  'suất bắt đầu đúng lúc suất trước kết thúc được phép ([) nửa mở)');
select lives_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f102',
   '00000000-0000-0000-0000-00000000e001','2026-12-05 19:00:00+07','2D')$$,
  'phòng 2 cùng rạp cùng giờ được phép');
update public.showtimes set status = 'CANCELLED' where id = '00000000-0000-0000-0000-00000000a501';
select lives_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f101',
   '00000000-0000-0000-0000-00000000e001','2026-12-05 17:00:00+07','2D')$$,
  'suất CANCELLED nhả phòng');
select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f102',
   '00000000-0000-0000-0000-00000000e001','2026-12-06 19:00:00+07','3D')$$,
  '23514', null, 'phòng không hỗ trợ 3D bị từ chối');

-- ---------------------------------------------------------------------------
-- 3. Ghế: Sweetbox 2 ô + unique ô (7)
-- ---------------------------------------------------------------------------
select is((select col_span::int from public.seats where id = '00000000-0000-0000-0000-00000000b101'),
  2, 'Sweetbox lưu 1 dòng chiếm 2 ô (col_span = 2)');
select is((select col_span::int from public.seats where id = '00000000-0000-0000-0000-00000000b102'),
  1, 'ghế thường chiếm 1 ô');
select throws_ok($$
  insert into public.seats (room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-0000000000c1','A',2,'NORMAL','A2')$$,
  '23P01', null, 'ghế đặt vào ô thứ 2 của Sweetbox bị chặn');
select throws_ok($$
  insert into public.seats (room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-0000000000c1','A',3,'VIP','A3x')$$,
  '23P01', null, 'ghế trùng ô bị chặn');
select throws_ok($$
  insert into public.seats (room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-0000000000c1','B',6,'SWEETBOX','B6')$$,
  '23514', null, 'Sweetbox tràn lưới (ô 2 ngoài cột cuối) bị chặn');
select lives_ok($$
  insert into public.seats (room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-0000000000c1','B',1,'NORMAL','B1'),
  ('00000000-0000-0000-0000-00000000f102','00000000-0000-0000-0000-0000000000c1','A',1,'NORMAL','A1')$$,
  'cùng ô ở hàng/phòng khác được phép');
select throws_ok($$
  insert into public.seats (room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000f101','00000000-0000-0000-0000-00000000c2c2','C',1,'NORMAL','C1')$$,
  '23503', null, 'cinema_id không khớp phòng bị FK ghép chặn');

-- ---------------------------------------------------------------------------
-- 4. RLS Manager / Staff / khách (12)
-- ---------------------------------------------------------------------------
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select lives_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f101',
   '00000000-0000-0000-0000-00000000e001','2026-12-07 10:00:00+07','2D')$$,
  'Manager HN01 tạo suất rạp mình');
select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000f201',
   '00000000-0000-0000-0000-00000000e001','2026-12-07 10:00:00+07','2D')$$,
  '42501', null, 'Manager HN01 không tạo được suất HN02 (RLS)');
select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f201',
   '00000000-0000-0000-0000-00000000e001','2026-12-08 10:00:00+07','2D')$$,
  '23503', null, 'Manager HN01 gắn phòng HN02 vào suất HN01 bị FK ghép chặn');
select throws_ok($$
  insert into public.rooms (cinema_id, name) values ('00000000-0000-0000-0000-0000000000c2', 'Phòng X')$$,
  '42501', null, 'Manager HN01 không tạo phòng HN02 (RLS)');
select lives_ok($$
  insert into public.rooms (cinema_id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Phòng 3')$$,
  'Manager HN01 tạo phòng rạp mình');
select throws_ok($$
  insert into public.movies (slug, title_vi, duration_minutes, release_date, age_rating)
  values ('phim-b', 'Phim B', 100, '2026-12-01', 'K')$$,
  '42501', null, 'Manager không ghi được phim');
select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, ends_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f101',
   '00000000-0000-0000-0000-00000000e001','2026-12-09 10:00:00+07','2026-12-09 10:30:00+07','2D')$$,
  '42501', null, 'client không tự đặt ends_at (column grant)');
select is((select count(*)::int from public.movies), 2, 'Manager thấy cả phim nháp');

select public.tap_as('00000000-0000-0000-0000-000000000c01');
select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f101',
   '00000000-0000-0000-0000-00000000e001','2026-12-10 10:00:00+07','2D')$$,
  '42501', null, 'Staff không tạo được suất');

select public.tap_as('00000000-0000-0000-0000-000000000d01');
select is((select count(*)::int from public.movies), 1, 'khách chỉ thấy phim PUBLISHED');
select public.tap_anon();
select is((select count(*)::int from public.movies), 1, 'anon chỉ thấy phim PUBLISHED');
select cmp_ok((select count(*)::int from public.showtimes), '>=', 1, 'anon đọc được suất chiếu');

-- ---------------------------------------------------------------------------
-- 5. Khoá ghế (6)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select lives_ok($$
  insert into public.showtime_seat_locks (showtime_id, seat_id, reason) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b102','GUEST')$$,
  'Manager HN01 khoá ghế suất rạp mình');
select throws_ok($$
  insert into public.showtime_seat_locks (showtime_id, seat_id) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b102')$$,
  '23505', null, 'khoá trùng ghế/suất bị chặn');
select throws_ok($$
  insert into public.showtime_seat_locks (showtime_id, seat_id) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b103')$$,
  '23514', null, 'không khoá được lối đi');
select public.tap_as('00000000-0000-0000-0000-000000000b02');
select throws_ok($$
  insert into public.showtime_seat_locks (showtime_id, seat_id) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b101')$$,
  '42501', null, 'Manager HN02 không khoá được ghế suất HN01');
select public.tap_as('00000000-0000-0000-0000-000000000d01');
select is((select count(*)::int from public.showtime_seat_locks), 1, 'khách thấy ghế bị khoá');
select throws_ok($$select locked_by from public.showtime_seat_locks$$,
  '42501', null, 'khách không đọc được locked_by');

-- ---------------------------------------------------------------------------
-- 6. Audit (R-107) (2)
-- ---------------------------------------------------------------------------
select public.tap_owner();
select is((select count(*)::int from public.audit_logs
            where table_name = 'showtime_seat_locks' and action = 'INSERT'
              and actor_id = '00000000-0000-0000-0000-000000000b01'
              and cinema_id = '00000000-0000-0000-0000-0000000000c1'),
  1, 'khoá ghế ghi audit: actor Manager + cinema_id');
select cmp_ok((select count(*)::int from public.audit_logs
            where table_name = 'showtimes' and actor_id = '00000000-0000-0000-0000-000000000b01'),
  '>=', 1, 'tạo suất ghi audit');

-- ---------------------------------------------------------------------------
-- 7. Storage (9)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from storage.buckets
            where id in ('posters','banners','cinema-images','avatars') and public), 4,
  '4 bucket tồn tại và public');
insert into storage.objects (bucket_id, name) values ('posters', 'phim-a.jpg');

select public.tap_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'posters'), 1, 'anon đọc poster');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('posters', 'x.jpg')$$,
  '42501', null, 'anon không upload poster');

select public.tap_as('00000000-0000-0000-0000-000000000d01');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('posters', 'x.jpg')$$,
  '42501', null, 'khách không upload poster');
select lives_ok($$insert into storage.objects (bucket_id, name)
  values ('avatars', '00000000-0000-0000-0000-000000000d01/me.png')$$, 'user ghi avatar thư mục của mình');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('avatars', '00000000-0000-0000-0000-000000000d02/me.png')$$,
  '42501', null, 'user không ghi avatar thư mục người khác');

select public.tap_as('00000000-0000-0000-0000-000000000a01');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('posters', 'phim-b.jpg')$$,
  'Admin upload poster');

select public.tap_as('00000000-0000-0000-0000-000000000b01');
select lives_ok($$insert into storage.objects (bucket_id, name)
  values ('cinema-images', '00000000-0000-0000-0000-0000000000c1/front.jpg')$$,
  'Manager HN01 upload ảnh rạp HN01');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('cinema-images', '00000000-0000-0000-0000-0000000000c2/front.jpg')$$,
  '42501', null, 'Manager HN01 không upload ảnh rạp HN02');

-- ---------------------------------------------------------------------------
-- 8. Phim DRAFT không lộ qua suất; đổi phim/phòng; tính lại ends_at; chồng giờ khi UPDATE (11)
-- ---------------------------------------------------------------------------
select public.tap_owner();
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e004', 'phim-c', 'Phim C', 100, '2026-12-01', 'K', 'PUBLISHED'),
  ('00000000-0000-0000-0000-00000000e005', 'phim-d', 'Phim D', 90, '2026-12-01', 'K', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, status) values
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000c1', 'Phòng bảo trì', 'MAINTENANCE');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a511', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f102',
   '00000000-0000-0000-0000-00000000e004', '2026-12-11 10:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a512', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f102',
   '00000000-0000-0000-0000-00000000e001', '2026-12-12 10:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a513', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f102',
   '00000000-0000-0000-0000-00000000e001', '2026-12-12 15:00:00+07', '2D');
-- phim bị gỡ về DRAFT sau khi đã có suất
update public.movies set status = 'DRAFT' where id = '00000000-0000-0000-0000-00000000e004';

select public.tap_anon();
select is((select count(*)::int from public.showtimes where id = '00000000-0000-0000-0000-00000000a511'),
  0, 'anon không thấy suất của phim DRAFT');
select is((select count(*)::int from public.showtimes where id = '00000000-0000-0000-0000-00000000a512'),
  1, 'anon thấy suất của phim PUBLISHED');
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is((select count(*)::int from public.showtimes where id = '00000000-0000-0000-0000-00000000a511'),
  1, 'Manager thấy suất của phim DRAFT');
select throws_ok($$
  insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000f102',
   '00000000-0000-0000-0000-00000000e002','2026-12-15 10:00:00+07','2D')$$,
  '23514', null, 'không tạo suất cho phim DRAFT');
select throws_ok($$update public.showtimes set movie_id = '00000000-0000-0000-0000-00000000e002'
  where id = '00000000-0000-0000-0000-00000000a512'$$,
  '23514', null, 'không đổi suất sang phim DRAFT');
select lives_ok($$update public.showtimes set starts_at = '2026-12-11 11:00:00+07'
  where id = '00000000-0000-0000-0000-00000000a511'$$,
  'vẫn sửa giờ suất cũ của phim sau này bị gỡ');
select throws_ok($$update public.showtimes set room_id = '00000000-0000-0000-0000-00000000f103'
  where id = '00000000-0000-0000-0000-00000000a512'$$,
  '23514', null, 'UPDATE room_id sang phòng bảo trì bị chặn');
select lives_ok($$update public.showtimes set starts_at = '2026-12-12 11:00:00+07'
  where id = '00000000-0000-0000-0000-00000000a512'$$, 'đổi giờ suất');
select is((select ends_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a512'),
  '2026-12-12 13:15:00+07'::timestamptz, 'ends_at tính lại khi đổi starts_at (120+15)');
select lives_ok($$update public.showtimes set movie_id = '00000000-0000-0000-0000-00000000e005'
  where id = '00000000-0000-0000-0000-00000000a512'$$, 'đổi phim suất');
select is((select ends_at from public.showtimes where id = '00000000-0000-0000-0000-00000000a512'),
  '2026-12-12 12:45:00+07'::timestamptz, 'ends_at tính lại khi đổi movie_id (90+15)');
select throws_ok($$update public.showtimes set starts_at = '2026-12-12 12:00:00+07'
  where id = '00000000-0000-0000-0000-00000000a513'$$,
  '23P01', null, 'UPDATE dẫn tới chồng giờ bị exclusion chặn');

-- ---------------------------------------------------------------------------
-- 9. AC-16: Manager HN01 không sửa/xoá được dữ liệu HN02 (RLS trả 0 dòng, dữ liệu nguyên vẹn) (22)
-- ---------------------------------------------------------------------------
select public.tap_owner();
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 1, 'NORMAL', 'A1');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000f201',
   '00000000-0000-0000-0000-00000000e001', '2026-12-20 10:00:00+07', '2D');
insert into public.showtime_seat_locks (showtime_id, seat_id) values
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000b201');
insert into storage.objects (bucket_id, name) values
  ('cinema-images', '00000000-0000-0000-0000-0000000000c2/hall.jpg'),
  ('avatars', '00000000-0000-0000-0000-000000000d02/a.png');

select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is(public.tap_rows($$update public.showtimes set status = 'CLOSED' where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'UPDATE showtimes HN02: 0 dòng');
select is(public.tap_rows($$delete from public.showtimes where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'DELETE showtimes HN02: 0 dòng');
select is(public.tap_rows($$update public.rooms set name = 'Hack' where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'UPDATE rooms HN02: 0 dòng');
select is(public.tap_rows($$delete from public.rooms where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'DELETE rooms HN02: 0 dòng');
select is(public.tap_rows($$update public.seats set seat_type = 'VIP' where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'UPDATE seats HN02: 0 dòng');
select is(public.tap_rows($$delete from public.seats where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'DELETE seats HN02: 0 dòng');
select is(public.tap_rows($$delete from public.showtime_seat_locks where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'DELETE khoá ghế HN02: 0 dòng');
select throws_ok($$
  insert into public.seats (room_id, cinema_id, row_label, col_number, label) values
  ('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-0000000000c2','B',1,'B1')$$,
  '42501', null, 'INSERT ghế vào phòng HN02 bị RLS chặn');
select is(public.tap_rows($$update storage.objects set name = name || 'x'
  where bucket_id = 'cinema-images' and name like '00000000-0000-0000-0000-0000000000c2/%'$$),
  0, 'UPDATE ảnh rạp HN02: 0 dòng');

select public.tap_as('00000000-0000-0000-0000-000000000d01');
select is(public.tap_rows($$update storage.objects set name = name || 'x'
  where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-000000000d02/%'$$),
  0, 'UPDATE avatar người khác: 0 dòng');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '%d02/%'),
  0, 'user không liệt kê/đọc được avatar người khác');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '%d01/%'),
  1, 'user đọc được avatar của chính mình');
select public.tap_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'),
  0, 'anon không liệt kê được avatars');

select public.tap_owner();
select is((select status::text from public.showtimes where id = '00000000-0000-0000-0000-00000000a502'),
  'ON_SALE', 'suất HN02 không đổi');
select is((select name from public.rooms where id = '00000000-0000-0000-0000-00000000f201'),
  'Phòng 1', 'phòng HN02 không đổi tên và vẫn còn');
select is((select seat_type::text from public.seats where id = '00000000-0000-0000-0000-00000000b201'),
  'NORMAL', 'ghế HN02 không đổi và vẫn còn');
select is((select count(*)::int from public.showtime_seat_locks where cinema_id = '00000000-0000-0000-0000-0000000000c2'),
  1, 'khoá ghế HN02 vẫn còn');
select is((select count(*)::int from storage.objects
            where name in ('00000000-0000-0000-0000-0000000000c2/hall.jpg', '00000000-0000-0000-0000-000000000d02/a.png')),
  2, 'ảnh rạp HN02 và avatar người khác vẫn còn');

select * from finish();
rollback;
