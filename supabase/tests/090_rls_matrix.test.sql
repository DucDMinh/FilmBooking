-- pgTAP: ma trận RLS theo rạp & dữ liệu khách (layer 8 / task 02; AC-16, AC-17, NFR-05, NFR-17).
-- (1) Cấu trúc: mọi bảng public bật RLS; bảng không có policy thì client không có quyền SELECT.
-- (2) Hành vi: Manager/Staff HN01 không đọc/ghi dữ liệu HN02; khách A không thấy dữ liệu khách B; anon không thấy dữ liệu vận hành.
-- Bảng tàn dư POS (nợ có chủ đích sau spec 2.0.0) vẫn nằm trong kiểm tra cấu trúc nhưng không có ca POS.
begin;
select plan(46);

create function public.tap_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;
create function public.tap_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end; $$;
create function public.tap_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end; $$;
-- Chạy câu lệnh, trả số dòng bị ảnh hưởng; thiếu GRANT cũng tính là 0 dòng (không ghi được).
create function public.tap_rows(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return 0;
end; $$;
-- Đếm dòng của 1 bảng với quyền hiện tại; -1 nếu bị từ chối quyền (cũng là "không đọc được").
create function public.tap_count(p_table text, p_where text default 'true') returns integer language plpgsql as $$
declare n integer;
begin
  execute format('select count(*) from public.%I where %s', p_table, p_where) into n;
  return n;
exception when insufficient_privilege then return -1;
end; $$;
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap\_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;

-- ---------------------------------------------------------------------------
-- 1. CẤU TRÚC: không còn bảng public nào thiếu RLS
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ',' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'mọi bảng public đều bật RLS');

-- Bảng bật RLS mà không có policy = deny-all cho client; buộc thêm: client cũng không có GRANT SELECT
-- (đặc quyền thừa sẽ lộ ngay nếu ai đó thêm policy sai về sau).
select is(
  (select coalesce(string_agg(c.relname, ',' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))),
  '', 'bảng RLS không có policy thì anon/authenticated không có quyền SELECT');

-- Không policy ghi (INSERT/UPDATE/DELETE/ALL) nào áp cho anon hoặc PUBLIC.
select is(
  (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polcmd <> 'r'
     and (p.polroles = '{0}'::oid[] or p.polroles @> array[(select oid from pg_roles where rolname = 'anon')])),
  0, 'không policy ghi nào áp cho anon/public');

-- ---------------------------------------------------------------------------
-- Fixture (owner, bypass RLS)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000b02', 'mgr2@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000c02', 'staff2@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d01', 'custa@example.com',  '{"full_name":"Khách A"}'),
  ('00000000-0000-0000-0000-000000000d02', 'custb@example.com',  '{"full_name":"Khách B"}');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000c2', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000c2', 'STAFF');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-a', 'Phim A', 100, '2026-11-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng HN01', 2, 2),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'Phòng HN02', 2, 2);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 2, 'NORMAL', 'A2');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', now() + interval '2 days', now() + interval '2 days 2 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e001', now() + interval '2 days', now() + interval '2 days 2 hours', '2D', 'ON_SALE');
-- Mỗi rạp: 1 đơn affected (để ghi được affected_order_actions) (khách A ở HN01, khách B ở HN02) + vé + thanh toán + sự kiện + log soát + hành động affected.
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, booking_code) values
  ('00000000-0000-0000-0000-5a0000000001', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'affected', 100000, 0, 100000, 'HN01-RLS001'),
  ('00000000-0000-0000-0000-5a0000000002', 'WEB', '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-000000000d02', 'affected', 100000, 0, 100000, 'HN02-RLS002');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-00000000b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-00000000b201', 'A1', 'NORMAL', 100000);
insert into public.tickets (id, order_id, order_seat_id, showtime_id, qr_token) values
  ('00000000-0000-0000-0000-7a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-00000000a501', '11111111111111111111111111111111'),
  ('00000000-0000-0000-0000-7a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-00000000a502', '22222222222222222222222222222222');
insert into public.payments (id, order_id, cinema_id, order_code, amount, status) values
  ('00000000-0000-0000-0000-8a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-0000000000c1', 900001, 100000, 'PAID'),
  ('00000000-0000-0000-0000-8a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-0000000000c2', 900002, 100000, 'PAID');
insert into public.payment_events (cinema_id, order_code, event_status, signature_valid) values
  ('00000000-0000-0000-0000-0000000000c1', 900001, 'PAID', true),
  ('00000000-0000-0000-0000-0000000000c2', 900002, 'PAID', true);
insert into public.checkin_logs (ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by) values
  ('00000000-0000-0000-0000-7a0000000001', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000a501', 'INVALID', '00000000-0000-0000-0000-000000000c01'),
  ('00000000-0000-0000-0000-7a0000000002', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000a502', 'INVALID', '00000000-0000-0000-0000-000000000c02');
insert into public.affected_order_actions (order_id, action, note, performed_by) values
  ('00000000-0000-0000-0000-5a0000000001', 'EXCHANGED', 'HN01', '00000000-0000-0000-0000-000000000b01'),
  ('00000000-0000-0000-0000-5a0000000002', 'EXCHANGED', 'HN02', '00000000-0000-0000-0000-000000000b02');
insert into public.cinema_settings (cinema_id, key, value) values
  ('00000000-0000-0000-0000-0000000000c1', 'seat_hold_minutes_web', '12'),
  ('00000000-0000-0000-0000-0000000000c2', 'seat_hold_minutes_web', '12');
insert into public.consents (user_id, consent_type, version) values
  ('00000000-0000-0000-0000-000000000d01', 'PRIVACY_POLICY', 'v1'),
  ('00000000-0000-0000-0000-000000000d02', 'PRIVACY_POLICY', 'v1');
insert into public.showtime_seat_locks (showtime_id, seat_id, reason) values
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000b201', 'GUEST');

-- ---------------------------------------------------------------------------
-- 2. AC-16: Manager HN01 chỉ thấy/ghi dữ liệu HN01
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is(public.tap_count('orders', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'AC-16: Manager HN01 đọc đơn HN02 -> 0 dòng');
select is(public.tap_count('orders', $$cinema_id = '00000000-0000-0000-0000-0000000000c1'$$), 1, 'Manager HN01 vẫn đọc đơn HN01 (kiểm tra không chặn nhầm)');
select is(public.tap_count('order_seats', $$order_id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Manager HN01 đọc ghế đơn HN02 -> 0');
select is(public.tap_count('tickets', $$order_id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Manager HN01 đọc vé HN02 -> 0');
select is(public.tap_count('payments', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 đọc payments HN02 -> 0');
select is(public.tap_count('payment_events', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 đọc payment_events HN02 -> 0');
select is(public.tap_count('checkin_logs', $$scanner_cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 đọc checkin_logs HN02 -> 0');
select is(public.tap_count('affected_order_actions', $$order_id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Manager HN01 đọc affected_order_actions HN02 -> 0');
select is(public.tap_count('showtime_seat_states', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 đọc showtime_seat_states HN02 -> 0');
select is(public.tap_count('audit_logs', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 đọc audit_logs HN02 -> 0');
select is(public.tap_count('staff_assignments', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 không thấy nhân sự HN02');
select is(public.tap_count('cinema_settings', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 không đọc cấu hình HN02');
select is(public.tap_rows($$update public.showtimes set status = 'CLOSED' where id = '00000000-0000-0000-0000-00000000a502'$$), 0, 'AC-16: Manager HN01 sửa suất HN02 -> 0 dòng');
select is(public.tap_rows($$delete from public.showtimes where id = '00000000-0000-0000-0000-00000000a502'$$), 0, 'Manager HN01 xoá suất HN02 -> 0 dòng');
select is(public.tap_rows($$update public.orders set contact_phone = 'x' where id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Manager HN01 sửa đơn HN02 -> 0 dòng');
select is(public.tap_rows($$update public.cinema_settings set value = '99' where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Manager HN01 sửa cấu hình HN02 -> 0 dòng');
select is(public.tap_rows($$delete from public.showtime_seat_locks where showtime_id = '00000000-0000-0000-0000-00000000a502'$$), 0, 'Manager HN01 mở khoá ghế HN02 -> 0 dòng');
select throws_ok($$insert into public.showtime_seat_locks (showtime_id, seat_id, reason) values ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000b202', 'GUEST')$$,
  '42501', null, 'Manager HN01 khoá ghế suất HN02 -> bị chặn');
select throws_ok($$insert into public.showtimes (cinema_id, room_id, movie_id, starts_at, ends_at, format) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e001', now() + interval '5 days', now() + interval '5 days 2 hours', '2D')$$,
  '42501', null, 'Manager HN01 tạo suất cho HN02 -> bị chặn');
select throws_ok($$insert into public.affected_order_actions (order_id, action, note) values ('00000000-0000-0000-0000-5a0000000002', 'EXCHANGED', 'lậu')$$,
  '23514', null, 'Manager HN01 ghi hành động affected cho đơn HN02 -> bị chặn (trigger validate không thấy đơn qua RLS, hoặc policy 42501)');
select throws_ok($$insert into public.rooms (cinema_id, name, grid_rows, grid_cols) values ('00000000-0000-0000-0000-0000000000c2', 'lậu', 1, 1)$$,
  '42501', null, 'Manager HN01 tạo phòng HN02 -> bị chặn');

-- ---------------------------------------------------------------------------
-- 3. Staff HN01: đọc đơn rạp mình, không đọc/ghi HN02, không có quyền Manager
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000c01');
select is(public.tap_count('orders', $$cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Staff HN01 đọc đơn HN02 -> 0');
select is(public.tap_count('orders', $$cinema_id = '00000000-0000-0000-0000-0000000000c1'$$), 1, 'Staff HN01 đọc đơn HN01 -> 1');
select is(public.tap_count('tickets', $$order_id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Staff HN01 đọc vé HN02 -> 0');
select is(public.tap_count('checkin_logs', $$scanner_cinema_id = '00000000-0000-0000-0000-0000000000c2'$$), 0, 'Staff HN01 đọc checkin_logs HN02 -> 0');
select is(public.tap_rows($$update public.showtimes set status = 'CLOSED' where id = '00000000-0000-0000-0000-00000000a501'$$), 0, 'Staff (không phải Manager) sửa suất rạp mình -> 0 dòng');
select throws_ok($$insert into public.showtime_seat_locks (showtime_id, seat_id, reason) values ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b102', 'GUEST')$$,
  '42501', null, 'Staff không khoá ghế (chỉ Manager)');

-- ---------------------------------------------------------------------------
-- 4. AC-17: khách A không thấy dữ liệu khách B
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000d01');
select is(public.tap_count('orders', $$id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'AC-17: khách A đọc đơn khách B -> 0');
select is(public.tap_count('orders'), 1, 'Khách A chỉ thấy đúng 1 đơn của mình');
select is(public.tap_count('order_seats', $$order_id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'AC-17: khách A đọc ghế đơn B -> 0');
select is(public.tap_count('tickets'), 1, 'Khách A chỉ thấy 1 vé của mình');
select is(public.tap_count('tickets', $$id = '00000000-0000-0000-0000-7a0000000002'$$), 0, 'AC-17: khách A đọc vé khách B -> 0');
select is(public.tap_count('payments', $$order_id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Khách A đọc payment đơn B -> 0');
select is(public.tap_count('consents', $$user_id = '00000000-0000-0000-0000-000000000d02'$$), 0, 'Khách A đọc consent khách B -> 0');
select is(public.tap_count('profiles', $$id = '00000000-0000-0000-0000-000000000d02'$$), 0, 'Khách A đọc hồ sơ khách B -> 0');
select is(public.tap_count('staff_assignments'), 0, 'Khách không thấy bảng phân công nhân sự');
select is(public.tap_count('payment_events'), 0, 'Khách không đọc payment_events');
select is(public.tap_rows($$update public.orders set contact_phone = 'x' where id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'Khách A sửa đơn khách B -> 0 dòng');
select throws_ok($$insert into public.consents (user_id, consent_type, version) values ('00000000-0000-0000-0000-000000000d02', 'PRIVACY_POLICY', 'v2')$$,
  '42501', null, 'Khách A ghi consent thay khách B -> bị chặn');

-- ---------------------------------------------------------------------------
-- 5. Anon: không thấy dữ liệu vận hành/khách
-- ---------------------------------------------------------------------------
select public.tap_anon();
select ok(public.tap_count('orders') <= 0, 'anon đọc orders -> 0/từ chối');
select ok(public.tap_count('tickets') <= 0, 'anon đọc tickets -> 0/từ chối');
select ok(public.tap_count('payments') <= 0, 'anon đọc payments -> 0/từ chối');
select ok(public.tap_count('profiles') <= 0, 'anon đọc profiles -> 0/từ chối');

select public.tap_owner();
select * from finish();
rollback;
