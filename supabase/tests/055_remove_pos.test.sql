-- ============================================================================
-- pgTAP Test: 055_remove_pos.test.sql
-- CR remove-pos (feature-remove-pos phase-2 task-01), migration 20261112130000_remove_pos.sql:
--  * hold_seats từ chối kênh POS ngay đầu hàm (INVALID_CHANNEL, 22023), chữ ký giữ nguyên, kênh WEB vẫn giữ được ghế kể cả khi
--    truyền p_request_id (không còn phụ thuộc pos_requests).
--  * Hàm / bảng POS không còn: confirm_pos_sale, extend_pos_hold, pos_api_keys, pos_api_logs, pos_requests.
--  * purge_expired_ops_data không còn cột pos_api_logs; cron purge vẫn lên lịch.
--  * ACL hold_seats khớp 20261112100000 (authenticated + service_role; không anon).
-- ============================================================================
begin;
select plan(14);

-- Fixture: 1 rạp, 1 phòng, 2 ghế, suất ON_SALE, người dùng đã xác nhận email, bảng giá
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000055000a1', 'T55', 'Tỉnh Test 55');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000055000c1', 'T551', 'Rạp T55-1', '00000000-0000-0000-0000-0000055000a1', '1 Test');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000550e001', 'phim-test-55', 'Phim 55', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000550f101', '00000000-0000-0000-0000-0000055000c1', 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000550b101', '00000000-0000-0000-0000-00000550f101', '00000000-0000-0000-0000-0000055000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000550b102', '00000000-0000-0000-0000-00000550f101', '00000000-0000-0000-0000-0000055000c1', 'A', 2, 'NORMAL', 'A2');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000550a501', '00000000-0000-0000-0000-0000055000c1', '00000000-0000-0000-0000-00000550f101',
   '00000000-0000-0000-0000-00000550e001', now() + interval '2 days', '2D', 'ON_SALE');
insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
  select 'CINEMA', '00000000-0000-0000-0000-0000055000c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
    from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000055000d1', 'u55@example.com', '{}', now());
update public.profiles set date_of_birth = '1995-05-15' where id = '00000000-0000-0000-0000-0000055000d1';

-- 1-3. Kênh POS bị từ chối (cả khi có request_id), không tạo đơn
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000550a501'::uuid,
      array['00000000-0000-0000-0000-00000550b101']::uuid[], 'POS', '00000000-0000-0000-0000-0000055000d1'::uuid)$$,
  '22023', 'INVALID_CHANNEL: Kênh đặt vé không hợp lệ (chỉ hỗ trợ WEB)', 'hold_seats kênh POS bị từ chối');
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000550a501'::uuid,
      array['00000000-0000-0000-0000-00000550b101']::uuid[], 'POS', '00000000-0000-0000-0000-0000055000d1'::uuid, 'req-55')$$,
  '22023', 'INVALID_CHANNEL: Kênh đặt vé không hợp lệ (chỉ hỗ trợ WEB)', 'hold_seats kênh POS + request_id bị từ chối');
select is((select count(*)::int from public.orders where showtime_id = '00000000-0000-0000-0000-00000550a501'), 0,
  'kênh POS bị từ chối không tạo đơn');

-- 4. Kênh lạ vẫn INVALID_CHANNEL
select throws_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000550a501'::uuid,
      array['00000000-0000-0000-0000-00000550b101']::uuid[], 'MOBILE', '00000000-0000-0000-0000-0000055000d1'::uuid)$$,
  '22023', null, 'hold_seats kênh lạ bị từ chối');

-- 5-6. Kênh WEB vẫn giữ được ghế dù truyền p_request_id (không còn phụ thuộc pos_requests)
create temp table t55_hold as
  select * from public.hold_seats('00000000-0000-0000-0000-00000550a501'::uuid,
    array['00000000-0000-0000-0000-00000550b101']::uuid[], 'WEB', '00000000-0000-0000-0000-0000055000d1'::uuid, 'req-ignored');
grant select on t55_hold to public;
select is((select count(*)::int from t55_hold), 1, 'hold_seats WEB + p_request_id vẫn giữ ghế (1 dòng kết quả)');
select is((select o.channel::text || '/' || o.status::text from public.orders o where o.id = (select order_id from t55_hold)),
  'WEB/holding', 'đơn tạo ra là WEB/holding');

-- 7-9. Đối tượng POS không còn
select is(to_regclass('public.pos_api_keys') is null and to_regclass('public.pos_api_logs') is null
          and to_regclass('public.pos_requests') is null, true, 'bảng pos_api_keys / pos_api_logs / pos_requests đã bị gỡ');
select is(to_regprocedure('public.confirm_pos_sale(uuid,text)') is null
          and to_regprocedure('public.extend_pos_hold(uuid,integer)') is null, true, 'confirm_pos_sale / extend_pos_hold đã bị gỡ');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.prokind in ('f', 'p')
            and pg_get_functiondef(p.oid) ~* 'pos_(api_keys|api_logs|requests)'), 0, 'không hàm nào còn tham chiếu bảng POS');

-- 10-12. purge_expired_ops_data còn 2 cột, cron còn lịch
select is(pg_get_function_result('public.purge_expired_ops_data()'::regprocedure),
  'TABLE(rate_limit_buckets integer, login_attempts integer)', 'purge_expired_ops_data không còn cột pos_api_logs');
select is((select count(*)::int from cron.job where jobname = 'purge-expired-ops-data'
            and command = 'select public.purge_expired_ops_data()'), 1, 'cron purge-expired-ops-data còn lịch');
select ok(not has_function_privilege('anon', 'public.purge_expired_ops_data()', 'execute')
      and not has_function_privilege('authenticated', 'public.purge_expired_ops_data()', 'execute'),
  'purge_expired_ops_data không mở cho anon/authenticated');

-- 13-14. ACL hold_seats giữ nguyên
select ok(has_function_privilege('authenticated', 'public.hold_seats(uuid,uuid[],text,uuid,text)', 'execute')
      and has_function_privilege('service_role', 'public.hold_seats(uuid,uuid[],text,uuid,text)', 'execute'),
  'ACL hold_seats: authenticated + service_role có EXECUTE');
select ok(not has_function_privilege('anon', 'public.hold_seats(uuid,uuid[],text,uuid,text)', 'execute'),
  'ACL hold_seats: anon không EXECUTE');

select * from finish();
rollback;
