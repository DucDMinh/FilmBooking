-- pgTAP: bảng đặt vé (layer 3 / task 02).
-- Kiểm: RLS bật, UNIQUE chống bán trùng (NFR-04), AC-16/AC-17 cách ly đơn/vé/thanh toán,
-- seat_status_public (Realtime, NFR-05), bảo vệ suất đã bán (R-54), R-81, máy trạng thái §8.5,
-- Staff ghi kết quả đơn affected rạp mình (#6), snapshot suất.
begin;
select plan(59);

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
  ('00000000-0000-0000-0000-00000000e002', 'phim-b', 'Phim B', 100, '2026-12-01', 'P',   'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1', '{2D,3D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000c1', 'Phòng 2', '{2D}', 5, 6),
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'Phòng 1', '{2D}', 5, 6);
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-05 19:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e001', '2026-12-05 19:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e001', '2026-12-06 10:00:00+07', '2D');
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'A', 3, 'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000000b105', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 1, 'NORMAL', 'B1'),
  ('00000000-0000-0000-0000-00000000b106', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 2, 'NORMAL', 'B2'),
  ('00000000-0000-0000-0000-00000000b107', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'B', 3, 'NORMAL', 'B3'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000c2', 'A', 1, 'NORMAL', 'A1');

-- Đơn: O1 paid cust1 (S1), O2 paid cust2 (S2), O3 holding cust2 (S1), O4/O7 affected cust1 (S1),
-- O5 affected cust2 (S2), O6 holding cust1 (S4, suất chưa bán)
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, booking_code) values
  ('00000000-0000-0000-0000-5a0000000001', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'paid', 100000, 100000, 'HN01-ABC234'),
  ('00000000-0000-0000-0000-5a0000000002', 'WEB', '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-000000000d02', 'paid', 100000, 100000, 'HN02-XYZ789'),
  ('00000000-0000-0000-0000-5a0000000003', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d02', 'holding', 100000, 100000, null),
  ('00000000-0000-0000-0000-5a0000000004', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'affected', 100000, 100000, null),
  ('00000000-0000-0000-0000-5a0000000005', 'WEB', '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-000000000d02', 'affected', 100000, 100000, null),
  ('00000000-0000-0000-0000-5a0000000006', 'WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d01', 'holding', 100000, 100000, null),
  ('00000000-0000-0000-0000-5a0000000007', 'WEB', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-000000000d01', 'affected', 100000, 100000, null);
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-00000000b102', 'A3', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-00000000b201', 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b102', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-5a0000000001'),
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b105', 'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-5a0000000003'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000b201', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-5a0000000002');
insert into public.tickets (id, order_id, order_seat_id, showtime_id) values
  ('00000000-0000-0000-0000-7a0000000001', '00000000-0000-0000-0000-5a0000000001', '00000000-0000-0000-0000-6a0000000001', '00000000-0000-0000-0000-00000000a501'),
  ('00000000-0000-0000-0000-7a0000000002', '00000000-0000-0000-0000-5a0000000002', '00000000-0000-0000-0000-6a0000000002', '00000000-0000-0000-0000-00000000a502');
insert into public.payments (id, order_id, order_code, amount, status) values
  ('00000000-0000-0000-0000-8a0000000001', '00000000-0000-0000-0000-5a0000000001', 1001, 100000, 'PAID'),
  ('00000000-0000-0000-0000-8a0000000002', '00000000-0000-0000-0000-5a0000000002', 1002, 100000, 'PAID');
insert into public.checkin_logs (scanner_cinema_id, result) values
  ('00000000-0000-0000-0000-0000000000c1', 'INVALID');

-- ---------------------------------------------------------------------------
-- 1. RLS + UNIQUE chống bán trùng (3)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
      and relname in ('vouchers','orders','order_seats','showtime_seat_states','seat_status_public','tickets',
                      'payments','payment_events','voucher_redemptions','affected_order_actions','checkin_logs')),
  11, 'cả 11 bảng đặt vé bật RLS');
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.showtime_seat_states'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (showtime_id, seat_id)'),
  1, 'UNIQUE (showtime_id, seat_id) tồn tại (NFR-04)');
select throws_ok($$
  insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b102','HELD','POS',now() + interval '5 minutes',
   '00000000-0000-0000-0000-5a0000000003')$$,
  '23505', null, 'giữ trùng ghế cùng suất bị chặn bởi unique (web/POS)');

-- ---------------------------------------------------------------------------
-- 2. AC-17: khách A không thấy dữ liệu khách B (7)
-- ---------------------------------------------------------------------------
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select tap_as('00000000-0000-0000-0000-000000000d01');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000001'$$), 1, 'AC-17: khách 1 thấy đơn của mình');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'AC-17: khách 1 không thấy đơn khách 2');
select is(tap_rows($$select 1 from public.tickets where id = '00000000-0000-0000-0000-7a0000000002'$$), 0, 'AC-17: khách 1 không thấy vé khách 2');
select is(tap_rows($$select 1 from public.payments where id = '00000000-0000-0000-0000-8a0000000002'$$), 0, 'AC-17: khách 1 không thấy thanh toán khách 2');
select is(tap_rows($$select 1 from public.tickets where id = '00000000-0000-0000-0000-7a0000000001'$$), 1, 'khách 1 thấy vé của mình');
select is(tap_rows($$select 1 from public.order_seats where id = '00000000-0000-0000-0000-6a0000000002'$$), 0, 'AC-17: khách 1 không thấy ghế đơn khách 2');
select tap_as('00000000-0000-0000-0000-000000000d02');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000001'$$), 0, 'AC-17: khách 2 không thấy đơn khách 1');

-- ---------------------------------------------------------------------------
-- 3. AC-16: nhân sự rạp này không thấy đơn/thanh toán rạp khác (9)
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-000000000b01');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000001'$$), 1, 'Manager HN01 thấy đơn HN01');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'AC-16: Manager HN01 không thấy đơn HN02');
select is(tap_rows($$select 1 from public.payments where id = '00000000-0000-0000-0000-8a0000000002'$$), 0, 'AC-16: Manager HN01 không thấy thanh toán HN02');
select tap_as('00000000-0000-0000-0000-000000000c01');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000002'$$), 0, 'AC-16: Staff HN01 không thấy đơn HN02');
select is(tap_rows($$select 1 from public.payments where id = '00000000-0000-0000-0000-8a0000000002'$$), 0, 'AC-16: Staff HN01 không thấy thanh toán HN02');
select is(tap_rows($$select 1 from public.payments where id = '00000000-0000-0000-0000-8a0000000001'$$), 1, 'Staff HN01 tra cứu được thanh toán HN01 (R-103)');
select tap_as('00000000-0000-0000-0000-000000000b02');
select is(tap_rows($$select 1 from public.orders where id = '00000000-0000-0000-0000-5a0000000001'$$), 0, 'Manager HN02 không thấy đơn HN01');
select is(tap_rows($$select 1 from public.payments where id = '00000000-0000-0000-0000-8a0000000002'$$), 1, 'Manager HN02 thấy thanh toán HN02');
select tap_as('00000000-0000-0000-0000-000000000a01');
select is(tap_rows($$select 1 from public.orders where id in ('00000000-0000-0000-0000-5a0000000001','00000000-0000-0000-0000-5a0000000002')$$), 2, 'Admin thấy đơn mọi rạp');

-- ---------------------------------------------------------------------------
-- 4. Realtime: seat_status_public (8)
-- ---------------------------------------------------------------------------
select tap_owner();
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seat_status_public'),
  1, 'seat_status_public nằm trong publication supabase_realtime');
select tap_anon();
select is(tap_rows($$select 1 from public.seat_status_public$$), 3, 'anon đọc được trạng thái ghế công khai');
select tap_owner();
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'seat_status_public' and column_name in ('user_id', 'order_id')),
  0, 'NFR-05: seat_status_public không có user_id/order_id');
select tap_anon();
select throws_ok($$select 1 from public.showtime_seat_states$$, '42501', null, 'anon không đọc được showtime_seat_states');
select throws_ok($$select 1 from public.orders$$, '42501', null, 'anon không đọc được orders');
select tap_owner();
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b106', 'HELD', 'POS', now() + interval '10 minutes', '00000000-0000-0000-0000-5a0000000003');
select is((select count(*)::int from public.seat_status_public), 4, 'insert state phản ánh sang bảng công khai cùng transaction');
update public.showtime_seat_states set state = 'SOLD', expires_at = null
  where seat_id = '00000000-0000-0000-0000-00000000b106';
select is((select state::text from public.seat_status_public where seat_id = '00000000-0000-0000-0000-00000000b106'),
  'SOLD', 'update state phản ánh sang bảng công khai');
delete from public.showtime_seat_states where seat_id = '00000000-0000-0000-0000-00000000b106';
select is((select count(*)::int from public.seat_status_public), 3, 'delete state phản ánh sang bảng công khai');

-- ---------------------------------------------------------------------------
-- 5. R-54: bảo vệ suất đã bán (8)
-- ---------------------------------------------------------------------------
select throws_ok($$update public.showtimes set starts_at = '2026-12-05 22:00:00+07'
  where id = '00000000-0000-0000-0000-00000000a501'$$, '23514', null, 'R-54: không đổi giờ suất đã bán');
select throws_ok($$update public.showtimes set ends_at = '2026-12-05 23:00:00+07'
  where id = '00000000-0000-0000-0000-00000000a501'$$, '23514', null, 'R-54: không đổi giờ kết thúc suất đã bán');
select throws_ok($$update public.showtimes set room_id = '00000000-0000-0000-0000-00000000f102'
  where id = '00000000-0000-0000-0000-00000000a501'$$, '23514', null, 'R-54: không đổi phòng suất đã bán');
select throws_ok($$update public.showtimes set movie_id = '00000000-0000-0000-0000-00000000e002'
  where id = '00000000-0000-0000-0000-00000000a501'$$, '23514', null, 'R-54: không đổi phim suất đã bán');
select throws_ok($$delete from public.showtimes where id = '00000000-0000-0000-0000-00000000a501'$$,
  '23514', null, 'R-54: không xoá suất đã bán');
select lives_ok($$update public.showtimes set status = 'CLOSED' where id = '00000000-0000-0000-0000-00000000a501'$$,
  'suất đã bán vẫn đóng bán được');
select lives_ok($$update public.showtimes set status = 'CANCELLED' where id = '00000000-0000-0000-0000-00000000a501'$$,
  'suất đã bán vẫn huỷ suất được (R-108)');
update public.showtimes set status = 'ON_SALE' where id = '00000000-0000-0000-0000-00000000a501';
select lives_ok($$update public.showtimes set starts_at = '2026-12-06 11:00:00+07'
  where id = '00000000-0000-0000-0000-00000000a504'$$, 'suất chỉ có đơn holding vẫn đổi giờ được');

-- ---------------------------------------------------------------------------
-- 6. R-81, snapshot (2)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name in ('payments', 'payment_events', 'orders')
      and column_name ~* '(card|pan|cvv|bank|account)'),
  0, 'R-81: không có cột thẻ/tài khoản ngân hàng');
update public.movies set status = 'ARCHIVED' where id = '00000000-0000-0000-0000-00000000e001';
select tap_as('00000000-0000-0000-0000-000000000d01');
select is(
  (select movie_title || '|' || cinema_code || '|' || room_name from public.orders
    where id = '00000000-0000-0000-0000-5a0000000001'),
  'Phim A|HN01|Phòng 1', 'snapshot suất giữ nguyên, khách vẫn xem được khi phim bị archive');

-- ---------------------------------------------------------------------------
-- 7. Máy trạng thái §8.5, ghi trực tiếp, qr_token (6)
-- ---------------------------------------------------------------------------
select tap_owner();
select throws_ok($$update public.orders set status = 'holding' where id = '00000000-0000-0000-0000-5a0000000001'$$,
  '23514', null, 'paid -> holding bị chặn');
select lives_ok($$update public.orders set status = 'pending_payment' where id = '00000000-0000-0000-0000-5a0000000003'$$,
  'holding -> pending_payment hợp lệ');
select throws_ok($$insert into public.orders (channel, showtime_id, user_id, status, booking_code)
  values ('WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d02', 'holding', 'HN02-ABC234')$$,
  '23514', null, 'mã đặt vé sai mã rạp của suất bị từ chối');
insert into public.orders (id, channel, showtime_id, user_id, status)
  values ('00000000-0000-0000-0000-5a0000000099', 'WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d02', 'cancelled');
select lives_ok($$update public.orders set status = 'paid' where id = '00000000-0000-0000-0000-5a0000000099'$$,
  'tiền về cho đơn cancelled chuyển paid thành công (§8.5, quyết định 9/10/17)');
select tap_as('00000000-0000-0000-0000-000000000d01');
select throws_ok($$insert into public.orders (channel, showtime_id, user_id, status)
  values ('WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d01', 'paid')$$,
  '42501', null, 'khách không insert orders trực tiếp');
select tap_owner();
select ok((select qr_token ~ '^[0-9a-f]{32}$' from public.tickets where id = '00000000-0000-0000-0000-7a0000000001'),
  'qr_token 128-bit hex ngẫu nhiên, không PII');

-- ---------------------------------------------------------------------------
-- 8. Staff ghi kết quả đơn affected rạp mình (#6) (7)
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-000000000c01');
select lives_ok($$insert into public.affected_order_actions (order_id, action, note)
  values ('00000000-0000-0000-0000-5a0000000004', 'EXCHANGED', 'đổi suất tại quầy')$$,
  'Staff HN01 ghi đổi suất cho đơn affected HN01');
select throws_ok($$insert into public.affected_order_actions (order_id, action, note)
  values ('00000000-0000-0000-0000-5a0000000005', 'EXCHANGED', 'x')$$,
  '42501', null, 'Staff HN01 không ghi cho đơn HN02');
select throws_ok($$insert into public.affected_order_actions (order_id, action)
  values ('00000000-0000-0000-0000-5a0000000007', 'REFUNDED_MANUAL')$$,
  '23514', null, 'hoàn thủ công thiếu mã tham chiếu/số tiền bị từ chối');
select lives_ok($$insert into public.affected_order_actions (order_id, action, refund_reference, refunded_amount)
  values ('00000000-0000-0000-0000-5a0000000007', 'REFUNDED_MANUAL', 'CK-0001', 100000)$$,
  'hoàn thủ công đủ trường');
select throws_ok($$insert into public.affected_order_actions (order_id, action)
  values ('00000000-0000-0000-0000-5a0000000001', 'EXCHANGED')$$,
  '23514', null, 'chỉ ghi cho đơn ở trạng thái affected');
select throws_ok($$update public.orders set status = 'cancelled' where id = '00000000-0000-0000-0000-5a0000000001'$$,
  '42501', null, 'Staff không UPDATE orders trực tiếp');
select tap_owner();
select is(
  (select string_agg(status::text, ',' order by id) from public.orders
    where id in ('00000000-0000-0000-0000-5a0000000004', '00000000-0000-0000-0000-5a0000000007')),
  'exchanged,refunded_manual', 'đơn chuyển exchanged / refunded_manual sau khi ghi kết quả');

-- ---------------------------------------------------------------------------
-- 9. checkin_logs, khoá ghế, ràng buộc đơn (4)
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-000000000c01');
select is(tap_rows($$select 1 from public.checkin_logs$$), 1, 'Staff thấy log quét của rạp mình');
select tap_as('00000000-0000-0000-0000-000000000b02');
select is(tap_rows($$select 1 from public.checkin_logs$$), 0, 'Manager HN02 không thấy log HN01');
select tap_owner();
insert into public.showtime_seat_locks (showtime_id, seat_id, reason) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b107', 'OTHER');
select throws_ok($$insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b107','HELD','WEB',now() + interval '5 minutes',
   '00000000-0000-0000-0000-5a0000000003')$$,
  '23514', null, 'không giữ được ghế đang bị khoá');
select throws_ok($$insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000000a501','00000000-0000-0000-0000-00000000b106','HELD','WEB',now() + interval '5 minutes',
   '00000000-0000-0000-0000-5a0000000005')$$,
  '23514', null, 'đơn khác suất không giữ ghế của suất này');

-- ---------------------------------------------------------------------------
-- 10. R-64: một đơn giữ / khách + R-55/R-62/R-29 bảo vệ khoá ghế, ghế lối đi, ẩn danh PII đơn (5)
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.orders (channel, showtime_id, user_id, status)
  values ('WEB', '00000000-0000-0000-0000-00000000a504', '00000000-0000-0000-0000-000000000d01', 'holding')$$,
  '23505', null, 'R-64: khách đã có đơn holding thì không tạo thêm holding');

-- R-55: không khoá đè lên ghế đã SOLD
select throws_ok($$insert into public.showtime_seat_locks (showtime_id, seat_id, reason)
  values ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b102', 'OTHER')$$,
  '23514', null, 'R-55: không khoá được ghế đã SOLD');

-- R-62: không giữ/bán ô AISLE hoặc BROKEN trong showtime_seat_states
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000000b199', '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'C', 1, 'AISLE', null);
select throws_ok($$insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
  values ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000b199', 'HELD', 'WEB', now() + interval '5 minutes', '00000000-0000-0000-0000-5a0000000003')$$,
  '23514', null, 'R-62: không giữ/bán được ô AISLE trong showtime_seat_states');

-- R-29: ẩn danh profile tự xoá PII trên orders (user_id, contact_email, contact_phone) nhưng vẫn giữ đơn
update public.orders set contact_email = 'cust1@example.com', contact_phone = '0912345678'
 where id = '00000000-0000-0000-0000-5a0000000001';
update public.profiles set email = null, full_name = null, phone = null
 where id = '00000000-0000-0000-0000-000000000d01';
select is(
  (select count(*)::int from public.orders where id = '00000000-0000-0000-0000-5a0000000001'
     and user_id is null and contact_email is null and contact_phone is null and total_amount = 100000),
  1, 'R-29: ẩn danh profile tự xoá PII trên orders nhưng giữ nguyên đơn cho kế toán');
select is(
  (select count(*)::int from public.tickets where order_id = '00000000-0000-0000-0000-5a0000000001'),
  1, 'R-29: vé của đơn vẫn còn sau khi ẩn danh tài khoản');

select * from finish();
rollback;
