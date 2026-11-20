-- ============================================================================
-- pgTAP Test: 066_cinema_status_schedule.test.sql
-- feature cinema-status-notice phase-1 task-01 (R-33, R-136, AC-26, AC-27)
--   * Đổi trạng thái rạp = HẸN LỊCH 7 ngày + xếp hàng email toàn bộ khách (không đổi tức thì).
--   * apply_due_cinema_status_changes: tới hạn -> đổi status, xoá lịch; đích khác OPEN -> tự huỷ suất,
--     đơn paid -> affected, KHÔNG enqueue email từng đơn.
--   * authenticated không còn quyền update cinemas.status / scheduled_*.
-- Fixture dùng id/mã riêng (…0660…, CS66x) và đếm email theo auth.users hiện có -> không phụ thuộc data demo.
-- ============================================================================
begin;
select plan(60);

create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
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
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;

-- ---------------------------------------------------------------------------
-- Fixture (owner)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0660000000a1', 'T66', 'Tỉnh Test 66');

insert into public.cinemas (id, code, name, province_id, address, hotline, status) values
  ('00000000-0000-0000-0000-0660000000c1', 'CS66A', 'Rạp Test 66A', '00000000-0000-0000-0000-0660000000a1', '66 Phố A', '1900 6666', 'OPEN'),
  ('00000000-0000-0000-0000-0660000000c2', 'CS66B', 'Rạp Test 66B', '00000000-0000-0000-0000-0660000000a1', '66 Phố B', null, 'OPEN'),
  ('00000000-0000-0000-0000-0660000000c3', 'CS66C', 'Rạp Test 66C', '00000000-0000-0000-0000-0660000000a1', '66 Phố C', null, 'COMING_SOON'),
  ('00000000-0000-0000-0000-0660000000c4', 'CS66D', 'Rạp Test 66D (lỗi)', '00000000-0000-0000-0000-0660000000a1', '66 Phố D', null, 'OPEN');

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-066000000a01', 'admin66@example.com', '{}', now()),
  ('00000000-0000-0000-0000-066000000b01', 'mgr66@example.com', '{}', now()),
  ('00000000-0000-0000-0000-066000000d01', 'khach66a@example.com', '{"full_name":"Khách 66"}', now()),
  ('00000000-0000-0000-0000-066000000d02', 'khach66b@example.com', '{}', now()),
  ('00000000-0000-0000-0000-066000000d03', 'chuaxacnhan66@example.com', '{}', null),
  ('00000000-0000-0000-0000-066000000d04', 'daxoa66@example.com', '{}', now()),
  ('00000000-0000-0000-0000-066000000d05', 'bikhoa66@example.com', '{}', now()),
  ('00000000-0000-0000-0000-066000000d06', 'hethankhoa66@example.com', '{}', now()),
  ('00000000-0000-0000-0000-066000000d07', 'Dup66@Example.com', '{}', now());
-- Email trùng khác hoa/thường: profiles.email là citext unique nên gỡ profile của user đầu trước khi chèn user thứ hai.
delete from public.profiles where id = '00000000-0000-0000-0000-066000000d07';
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-066000000d08', 'dup66@example.com', '{}', now());
update auth.users set deleted_at = now() where id = '00000000-0000-0000-0000-066000000d04';
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-066000000d05';
update auth.users set banned_until = now() - interval '1 day' where id = '00000000-0000-0000-0000-066000000d06';
-- admin66 phải là Admin hoạt động TRƯỚC khi vô hiệu hoá tài khoản demo: nếu không, Admin seed trở thành Admin hoạt động duy nhất
-- và trigger auth_users_last_admin_guard_update (CR-004, 20261119100000) chặn đúng như thiết kế (FB409).
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-066000000a01', 'ADMIN');
-- Vô hiệu hoá tài khoản demo có sẵn trong DB (chỉ trong transaction này) để số người nhận kỳ vọng là hằng số.
update auth.users set email_confirmed_at = null where id::text not like '00000000-0000-0000-0000-066%';
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-066000000b01', '00000000-0000-0000-0000-0660000000c1', 'MANAGER');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-066000000e01', 'phim-test-66', 'Phim Test 66', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-066000000f01', '00000000-0000-0000-0000-0660000000c1', 'Phòng 66A', '{2D}', 2, 2),
  ('00000000-0000-0000-0000-066000000f02', '00000000-0000-0000-0000-0660000000c2', 'Phòng 66B', '{2D}', 2, 2),
  ('00000000-0000-0000-0000-066000000f03', '00000000-0000-0000-0000-0660000000c3', 'Phòng 66C', '{2D}', 2, 2);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-066000000b11', '00000000-0000-0000-0000-066000000f01', '00000000-0000-0000-0000-0660000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-066000000b12', '00000000-0000-0000-0000-066000000f01', '00000000-0000-0000-0000-0660000000c1', 'A', 2, 'NORMAL', 'A2'),
  ('00000000-0000-0000-0000-066000000b13', '00000000-0000-0000-0000-066000000f01', '00000000-0000-0000-0000-0660000000c1', 'B', 1, 'NORMAL', 'B1');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-066000000f04', '00000000-0000-0000-0000-0660000000c4', 'Phòng 66D', '{2D}', 2, 2);
-- ST1 (C1): đơn paid; ST2 (C1): đơn holding; ST3 (C2): rạp khác; ST4 (C3): rạp sẽ mở lại
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-066000000a01', '00000000-0000-0000-0000-0660000000c1', '00000000-0000-0000-0000-066000000f01',
   '00000000-0000-0000-0000-066000000e01', now() + interval '10 days', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-066000000a02', '00000000-0000-0000-0000-0660000000c1', '00000000-0000-0000-0000-066000000f01',
   '00000000-0000-0000-0000-066000000e01', now() + interval '11 days', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-066000000a03', '00000000-0000-0000-0000-0660000000c2', '00000000-0000-0000-0000-066000000f02',
   '00000000-0000-0000-0000-066000000e01', now() + interval '10 days', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-066000000a04', '00000000-0000-0000-0000-0660000000c3', '00000000-0000-0000-0000-066000000f03',
   '00000000-0000-0000-0000-066000000e01', now() + interval '10 days', '2D', 'ON_SALE'),
  -- ST5 (C1): suất ĐÃ bắt đầu 30 phút trước, có đơn paid -> job đóng rạp không được đụng
  ('00000000-0000-0000-0000-066000000a05', '00000000-0000-0000-0000-0660000000c1', '00000000-0000-0000-0000-066000000f01',
   '00000000-0000-0000-0000-066000000e01', now() - interval '30 minutes', '2D', 'ON_SALE'),
  -- ST6 (C4): rạp có trigger gây lỗi khi huỷ suất -> test cô lập lỗi
  ('00000000-0000-0000-0000-066000000a06', '00000000-0000-0000-0000-0660000000c4', '00000000-0000-0000-0000-066000000f04',
   '00000000-0000-0000-0000-066000000e01', now() + interval '10 days', '2D', 'ON_SALE');
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, booking_code, contact_email) values
  ('00000000-0000-0000-0000-066000000d51', 'WEB', '00000000-0000-0000-0000-066000000a01', '00000000-0000-0000-0000-066000000d01', 'paid', 100000, 100000, 'CS66A-WB0001', 'khach66a@example.com'),
  ('00000000-0000-0000-0000-066000000d52', 'WEB', '00000000-0000-0000-0000-066000000a02', '00000000-0000-0000-0000-066000000d02', 'holding', 100000, 100000, null, 'khach66b@example.com'),
  ('00000000-0000-0000-0000-066000000d53', 'WEB', '00000000-0000-0000-0000-066000000a05', '00000000-0000-0000-0000-066000000d01', 'paid', 100000, 100000, 'CS66A-WB0003', 'khach66a@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-066000000c51', '00000000-0000-0000-0000-066000000d51', '00000000-0000-0000-0000-066000000b11', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-066000000c52', '00000000-0000-0000-0000-066000000d52', '00000000-0000-0000-0000-066000000b12', 'A2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-066000000c53', '00000000-0000-0000-0000-066000000d53', '00000000-0000-0000-0000-066000000b13', 'B1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-066000000a01', '00000000-0000-0000-0000-066000000b11', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-066000000d51'),
  ('00000000-0000-0000-0000-066000000a02', '00000000-0000-0000-0000-066000000b12', 'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-066000000d52');

-- Số email kỳ vọng là HẰNG SỐ từ fixture (không tính lại bằng chính biểu thức lọc của hàm):
-- admin66, mgr66, khach66a, khach66b, hethankhoa66 (ban đã hết hạn), dup66 (2 tài khoản khác hoa/thường -> 1 địa chỉ) = 6.
-- Loại: chuaxacnhan66 (chưa xác nhận), daxoa66 (deleted_at), bikhoa66 (banned_until còn hiệu lực).
create temp table t66_expected as select 6 as n;
grant select on t66_expected to authenticated;
create temp table t66_res (label text primary key, result jsonb);
grant all on t66_res to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Hẹn lịch đóng cửa (Admin): giữ nguyên status, lịch +7 ngày, email toàn bộ khách đã xác nhận
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-066000000a01');
insert into t66_res values ('s1', public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c1', 'CLOSED'));

select is((select result->>'success' from t66_res where label = 's1'), 'true', '1. schedule_cinema_status trả success');
select is((select status::text from public.cinemas where code = 'CS66A'), 'OPEN', '2. status KHÔNG đổi tức thì');
select is((select scheduled_status::text from public.cinemas where code = 'CS66A'), 'CLOSED', '3. scheduled_status = CLOSED');
select is((select scheduled_effective_at from public.cinemas where code = 'CS66A'), now() + interval '7 days',
  '4. scheduled_effective_at = now() + đúng 7 ngày');
select is((select result->>'status' from t66_res where label = 's1'), 'OPEN', '5. kết quả trả status HIỆN TẠI (OPEN)');
select is((select result->>'scheduled_status' from t66_res where label = 's1'), 'CLOSED', '6. kết quả trả scheduled_status');
select is((select (result->>'emails_enqueued_count')::int from t66_res where label = 's1'), (select n from t66_expected),
  '7. emails_enqueued_count = số tài khoản có email đã xác nhận');

select tap_owner();
select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and cinema_id = '00000000-0000-0000-0000-0660000000c1'),
  (select n from t66_expected), '8. outbox có đúng 1 dòng CINEMA_STATUS_NOTICE / tài khoản đã xác nhận');
select is((select count(distinct lower(to_email))::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and cinema_id = '00000000-0000-0000-0000-0660000000c1'),
  (select n from t66_expected), '9. mỗi email đúng 1 dòng (dedupe)');
select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'chuaxacnhan66@example.com'),
  0, '10. tài khoản CHƯA xác nhận email không nhận thông báo');
select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'khach66a@example.com'),
  1, '11. tài khoản đã xác nhận nhận 1 email');
select is((select status::text from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'khach66a@example.com'),
  'PENDING', '12. email ở trạng thái PENDING chờ job gửi');
select ok((select payload ?& array['cinema_name', 'cinema_code', 'cinema_address', 'hotline', 'target_status', 'current_status', 'effective_at', 'customer_name']
             from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'khach66a@example.com'),
  '13. payload có đủ khoá hợp đồng');
select is((select payload->>'cinema_code' || '|' || (payload->>'target_status') || '|' || (payload->>'current_status') || '|' || (payload->>'customer_name') || '|' || (payload->>'hotline')
             from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'khach66a@example.com'),
  'CS66A|CLOSED|OPEN|Khách 66|1900 6666', '14. payload đúng giá trị (rạp, đích, hiện tại, tên khách, hotline)');
select ok((select abs(extract(epoch from (payload->>'effective_at')::timestamptz - (now() + interval '7 days'))) < 0.001
             from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'khach66a@example.com'),
  '15. payload.effective_at (ISO, mili-giây) = ngày hiệu lực');
select ok((select not (payload ? 'schedule_cancelled') or payload->>'schedule_cancelled' = 'false'
             from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'khach66a@example.com'),
  '16. email hẹn lịch không mang cờ schedule_cancelled');

select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email in ('daxoa66@example.com', 'bikhoa66@example.com')),
  0, '16a. tài khoản đã xoá (deleted_at) hoặc đang bị khoá (banned_until còn hiệu lực) KHÔNG nhận thông báo');
select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and to_email = 'hethankhoa66@example.com'),
  1, '16b. tài khoản có banned_until đã hết hạn vẫn nhận thông báo');
select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and lower(to_email) = 'dup66@example.com'),
  1, '16c. 2 tài khoản trùng email khác hoa/thường -> đúng 1 email (dedupe lower(email))');

-- ---------------------------------------------------------------------------
-- 2. Hẹn lại: thay lịch cũ, tính lại 7 ngày, gửi lại email
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-066000000a01');
select lives_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c1', 'TEMP_CLOSED')$$, '17. hẹn lại sang TEMP_CLOSED chạy được');
select is((select scheduled_status::text from public.cinemas where code = 'CS66A'), 'TEMP_CLOSED', '18. lịch cũ bị thay bằng TEMP_CLOSED');
select tap_owner();
select is((select count(*)::int from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and cinema_id = '00000000-0000-0000-0000-0660000000c1'),
  (select n * 2 from t66_expected), '19. hẹn lại enqueue thêm 1 đợt email');

-- ---------------------------------------------------------------------------
-- 3. Hẹn đúng trạng thái hiện tại
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-066000000a01');
select throws_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c2', 'OPEN')$$, '22023', null,
  '20. cùng trạng thái hiện tại và KHÔNG có lịch -> STATUS_UNCHANGED (22023)');

insert into t66_res values ('c1', public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c1', 'OPEN'));
select is((select result->>'schedule_cancelled' from t66_res where label = 'c1'), 'true', '21. cùng trạng thái hiện tại + đang có lịch -> huỷ lịch (schedule_cancelled)');
select is((select scheduled_status::text from public.cinemas where code = 'CS66A'), null, '22. huỷ lịch: scheduled_status = null');
select is((select scheduled_effective_at from public.cinemas where code = 'CS66A'), null, '23. huỷ lịch: scheduled_effective_at = null');
select is((select status::text from public.cinemas where code = 'CS66A'), 'OPEN', '24. huỷ lịch: rạp vẫn OPEN');
select is((select (result->>'emails_enqueued_count')::int from t66_res where label = 'c1'), (select n from t66_expected),
  '25. huỷ lịch gửi email đính chính cho mọi khách');
select tap_owner();
select is((select count(*)::int from public.email_outbox
            where kind = 'CINEMA_STATUS_NOTICE' and cinema_id = '00000000-0000-0000-0000-0660000000c1'
              and payload->>'schedule_cancelled' = 'true' and payload->>'target_status' = 'TEMP_CLOSED'),
  (select n from t66_expected), '26. email đính chính mang schedule_cancelled=true + target_status của lịch bị huỷ');

-- ---------------------------------------------------------------------------
-- 4. Phân quyền / validation
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-066000000b01'); -- Manager
select throws_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c1', 'CLOSED')$$, '42501', 'FORBIDDEN_ADMIN_REQUIRED',
  '27. Manager không hẹn được lịch (chỉ Admin)');
select tap_as('00000000-0000-0000-0000-066000000a01');
select throws_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000ff', 'CLOSED')$$, 'P0002', null,
  '28. rạp không tồn tại -> P0002');
select tap_as('00000000-0000-0000-0000-066000000d01'); -- khách
select throws_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c1', 'CLOSED')$$, '42501', 'FORBIDDEN_ADMIN_REQUIRED',
  '29. khách thường không hẹn được lịch');
select throws_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000ff', 'CLOSED')$$, '42501', 'FORBIDDEN_ADMIN_REQUIRED',
  '29a. người không quyền gọi với mã rạp không tồn tại vẫn nhận 42501 (không dò được rạp có tồn tại)');
select tap_owner();
select is((select count(*)::int from public.cinemas where code = 'CS66A' and scheduled_status is null), 1, '30. các lần bị chặn không để lại lịch');

-- ---------------------------------------------------------------------------
-- 5. Không còn đường đổi status tức thì cho authenticated; select scheduled_* vẫn được
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-066000000a01');
select throws_ok($$update public.cinemas set status = 'CLOSED' where code = 'CS66A'$$, '42501', null, '31. Admin (authenticated) update cinemas.status -> 42501');
select throws_ok($$update public.cinemas set scheduled_status = 'CLOSED', scheduled_effective_at = now() where code = 'CS66A'$$, '42501', null,
  '32. Admin (authenticated) update cinemas.scheduled_* -> 42501');
select lives_ok($$update public.cinemas set name = 'Rạp Test 66A (đổi tên)' where code = 'CS66A'$$, '33. Admin vẫn sửa được thông tin rạp (cột khác)');
select throws_ok($$insert into public.cinemas (code, name, province_id, address, scheduled_status, scheduled_effective_at)
    values ('CS66X', 'Rạp lách lịch', '00000000-0000-0000-0000-0660000000a1', 'x', 'CLOSED', now() + interval '1 day')$$,
  '42501', null, '33a. Admin INSERT rạp kèm scheduled_* -> 42501 (không lách quy tắc báo trước 7 ngày)');
select lives_ok($$insert into public.cinemas (code, name, province_id, address, status)
    values ('CS66Y', 'Rạp mới sắp mở', '00000000-0000-0000-0000-0660000000a1', 'y', 'COMING_SOON')$$,
  '33b. Admin vẫn tạo được rạp mới (kể cả status COMING_SOON)');
select tap_as('00000000-0000-0000-0000-066000000b01');
select lives_ok($$update public.cinemas set hotline = '1900 0066' where code = 'CS66A'$$, '34. Manager vẫn sửa được hotline rạp mình');
select throws_ok($$update public.cinemas set status = 'CLOSED' where code = 'CS66A'$$, '42501', null, '35. Manager update status -> 42501');
select tap_as(null, 'anon');
select lives_ok($$select scheduled_status, scheduled_effective_at from public.cinemas$$, '36. anon select được scheduled_status/scheduled_effective_at (banner trang rạp)');
select tap_owner();
select throws_ok($$update public.cinemas set scheduled_status = 'CLOSED' where code = 'CS66B'$$, '23514', null,
  '37. check: scheduled_status và scheduled_effective_at phải cùng null hoặc cùng có');

-- ---------------------------------------------------------------------------
-- 6. apply_due_cinema_status_changes
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-066000000a01');
select lives_ok($$select public.schedule_cinema_status('00000000-0000-0000-0000-0660000000c1', 'CLOSED')$$, '38. hẹn đóng cửa C1 để test job');
select tap_owner();
select is(public.apply_due_cinema_status_changes(), 0, '39. apply TRƯỚC hạn không làm gì');
select is((select status::text from public.cinemas where code = 'CS66A'), 'OPEN', '40. trước hạn: rạp vẫn OPEN');

create temp table t66_outbox_before as
  select count(*)::int as n from public.email_outbox where kind = 'showtime_cancelled';
-- Đưa lịch C1 (đóng cửa) và C3 (mở lại) tới hạn bằng superuser
update public.cinemas set scheduled_effective_at = now() - interval '1 minute' where code = 'CS66A';
update public.cinemas set scheduled_status = 'OPEN', scheduled_effective_at = now() - interval '1 minute' where code = 'CS66C';
-- C4: lịch đóng cửa tới hạn nhưng huỷ suất của rạp này luôn lỗi (trigger tạm trong transaction) -> không được kéo theo rạp khác
create function public.t66_boom() returns trigger language plpgsql as $$ begin raise exception 'T66_BOOM'; end; $$;
create trigger t66_boom before update on public.showtimes
  for each row when (new.cinema_id = '00000000-0000-0000-0000-0660000000c4') execute function public.t66_boom();
update public.cinemas set scheduled_status = 'CLOSED', scheduled_effective_at = now() - interval '1 minute' where code = 'CS66D';

select is(public.apply_due_cinema_status_changes(), 2, '41. apply sau hạn: áp dụng 2 rạp (rạp lỗi C4 không được tính)');
select ok((select status = 'OPEN' and scheduled_status = 'CLOSED' and scheduled_effective_at is not null from public.cinemas where code = 'CS66D')
          and (select status::text from public.showtimes where id = '00000000-0000-0000-0000-066000000a06') = 'ON_SALE',
  '41a. lỗi ở C4: rollback nguyên rạp đó (status, lịch, suất giữ nguyên để thử lại), các rạp khác vẫn được áp dụng');
select is((select status::text from public.cinemas where code = 'CS66A'), 'CLOSED', '42. C1 -> CLOSED');
select ok((select scheduled_status is null and scheduled_effective_at is null from public.cinemas where code = 'CS66A'), '43. C1 xoá lịch');
select is((select count(*)::int from public.showtimes where cinema_id = '00000000-0000-0000-0000-0660000000c1' and status <> 'CANCELLED' and starts_at > now()),
  0, '44. đóng cửa: mọi suất tương lai của C1 bị huỷ');
select ok((select status::text from public.showtimes where id = '00000000-0000-0000-0000-066000000a05') = 'ON_SALE'
          and (select status::text from public.orders where id = '00000000-0000-0000-0000-066000000d53') = 'paid',
  '44a. suất ĐÃ bắt đầu (starts_at <= now()) của C1 và đơn paid của nó không bị job đụng tới');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-066000000d51'), 'affected', '45. đơn paid -> affected');
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-066000000d52'), 'cancelled', '46. đơn holding -> cancelled');
select is((select count(*)::int from public.showtime_seat_states where showtime_id = '00000000-0000-0000-0000-066000000a02'),
  0, '47. ghế đang giữ được nhả');
select is((select count(*)::int from public.affected_order_cases where order_id = '00000000-0000-0000-0000-066000000d51'),
  1, '48. đơn bị ảnh hưởng có affected_order_cases cho màn "Đơn bị ảnh hưởng"');
select is((select count(*)::int from public.email_outbox where kind = 'showtime_cancelled'),
  (select n from t66_outbox_before), '49. job KHÔNG enqueue email từng đơn (showtime_cancelled)');
select is((select status::text from public.showtimes where id = '00000000-0000-0000-0000-066000000a03'), 'ON_SALE', '50. suất rạp khác không bị ảnh hưởng');
select ok((select status = 'OPEN' and scheduled_status is null from public.cinemas where code = 'CS66C')
          and (select status::text from public.showtimes where id = '00000000-0000-0000-0000-066000000a04') = 'ON_SALE',
  '51. lịch chuyển sang OPEN: rạp OPEN, xoá lịch, không huỷ suất nào');

-- ---------------------------------------------------------------------------
-- 7. Hạ tầng: RPC cũ bị gỡ, hàm nội bộ không lộ cho client
-- ---------------------------------------------------------------------------
select ok(
  to_regprocedure('public.set_cinema_status(uuid,public.cinema_status)') is null
  and not has_function_privilege('authenticated', 'public.apply_due_cinema_status_changes()', 'execute')
  and not has_function_privilege('anon', 'public.apply_due_cinema_status_changes()', 'execute')
  and not has_function_privilege('authenticated', 'public.cancel_showtimes_core(uuid[],text,uuid,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_showtimes_core(uuid[],text,uuid,boolean)', 'execute')
  and not has_function_privilege('service_role', 'public.cancel_showtimes_core(uuid[],text,uuid,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.apply_due_cinema_status_changes()', 'execute')
  and exists (select 1 from cron.job where jobname = 'apply-cinema-status-changes' and schedule = '* * * * *'),
  '52. set_cinema_status đã gỡ; apply/core không lộ cho client; pg_cron apply-cinema-status-changes mỗi phút');

select * from finish();
rollback;
