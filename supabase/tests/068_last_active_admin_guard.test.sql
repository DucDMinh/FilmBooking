-- ============================================================================
-- pgTAP Test: 068_last_active_admin_guard.test.sql
-- bug admin-self-lock-last-admin-guard phase-1 task-01 (CR-004, GAP-010, R-105, NFR-06),
-- migration 20261119100000_last_active_admin_guard.sql:
--   * Không thể gỡ role ADMIN / khoá (banned_until, app_metadata.locked) / xoá mềm / xoá cứng Admin hoạt động cuối cùng
--     (SQLSTATE FB409), kể cả khi Admin tự làm qua RLS (role authenticated).
--   * Còn Admin hoạt động khác -> thao tác bình thường. Admin đang bị khoá không được tính là "còn Admin".
--   * is_last_active_admin phản ánh đúng; cập nhật thường (không đổi trạng thái hoạt động) không bị chặn.
-- Fixture id riêng (…0680…); các Admin demo có sẵn bị gỡ role TRONG transaction này để số Admin là hằng số.
-- ============================================================================
begin;
select plan(38);

create function public.tap68_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function public.tap68_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
grant execute on function public.tap68_as(uuid), public.tap68_owner() to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-068000000a01', 'admin68a@example.com', '{}', now()),
  ('00000000-0000-0000-0000-068000000a02', 'admin68b@example.com', '{}', now()),
  ('00000000-0000-0000-0000-068000000d01', 'khach68@example.com', '{}', now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-068000000a01', 'ADMIN'),
  ('00000000-0000-0000-0000-068000000a02', 'ADMIN');
-- Gỡ Admin demo có sẵn (còn >= 2 Admin hoạt động nên không bị chặn) -> chỉ còn a01, a02.
delete from public.user_roles where user_id::text not like '00000000-0000-0000-0000-068%' and role = 'ADMIN';

-- 1-3. Hàm tra cứu
select is(public.is_last_active_admin('00000000-0000-0000-0000-068000000a01'), false, '1. còn 2 Admin hoạt động -> a01 không phải Admin cuối');
select is(public.is_last_active_admin('00000000-0000-0000-0000-068000000d01'), false, '2. khách thường không phải Admin cuối');
select is(public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', null, '{}'::jsonb, null, now())
  and not public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', now() + interval '1 day', '{}'::jsonb, null, now())
  and public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', now() - interval '1 day', '{}'::jsonb, null, now())
  and not public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', null, '{"locked": true}'::jsonb, null, now())
  and public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', null, '{"locked": false}'::jsonb, null, now())
  and not public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', null, '{}'::jsonb, now(), now())
  and not public.auth_account_is_active('00000000-0000-0000-0000-068000000fff', null, '{}'::jsonb, null, null), true,
  '3. auth_account_is_active: ban còn hạn / locked=true / deleted_at / CHƯA xác nhận email -> không hoạt động; ban hết hạn / locked=false -> hoạt động');

-- 4-5. Thao tác thường khi còn Admin khác
select lives_ok($$update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-068000000a01'$$,
  '4. cập nhật thường không bị chặn');
select lives_ok($$update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-068000000d01'$$,
  '5. khoá khách thường không bị chặn');

-- 6-7. Khoá a01 khi a02 còn hoạt động -> được; sau đó a02 là Admin cuối
select lives_ok($$update auth.users set banned_until = now() + interval '1 day',
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"locked": true}'::jsonb where id = '00000000-0000-0000-0000-068000000a01'$$,
  '6. khoá a01 khi còn a02 hoạt động -> được');
select is(public.is_last_active_admin('00000000-0000-0000-0000-068000000a02'), true,
  '7. a01 bị khoá -> a02 là Admin hoạt động cuối');

-- 8-11. Chặn mọi đường làm mất Admin cuối (chạy bằng owner)
select throws_ok($$delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a02' and role = 'ADMIN'$$,
  'FB409', null, '8. gỡ role ADMIN của Admin cuối bị chặn');
select throws_ok($$update public.user_roles set user_id = '00000000-0000-0000-0000-068000000d01' where user_id = '00000000-0000-0000-0000-068000000a02'$$,
  'FB409', null, '9. chuyển dòng role ADMIN của Admin cuối sang user khác bị chặn');
select throws_ok($$update auth.users set banned_until = now() + interval '100 years' where id = '00000000-0000-0000-0000-068000000a02'$$,
  'FB409', null, '10. khoá bằng banned_until Admin cuối bị chặn');
select throws_ok($$update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"locked": true}'::jsonb where id = '00000000-0000-0000-0000-068000000a02'$$,
  'FB409', null, '11. khoá bằng app_metadata.locked Admin cuối bị chặn');
select throws_ok($$update auth.users set deleted_at = now() where id = '00000000-0000-0000-0000-068000000a02'$$,
  'FB409', null, '12. xoá mềm Admin cuối bị chặn');
select throws_ok($$delete from auth.users where id = '00000000-0000-0000-0000-068000000a02'$$,
  'FB409', null, '13. xoá hẳn (cascade user_roles) Admin cuối bị chặn');

-- 14. Admin tự gỡ chính mình qua RLS (role authenticated)
select public.tap68_as('00000000-0000-0000-0000-068000000a02');
select throws_ok($$delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a02' and role = 'ADMIN'$$,
  'FB409', null, '14. Admin cuối tự gỡ quyền qua RLS bị chặn ở DB');
select public.tap68_owner();

-- 15. Dữ liệu không đổi sau các lần bị chặn
select is((select count(*)::int from public.user_roles where role = 'ADMIN' and user_id::text like '00000000-0000-0000-0000-068%'
           and user_id = '00000000-0000-0000-0000-068000000a02')
          + (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-068000000a02' and banned_until is null and deleted_at is null
             and coalesce(raw_app_meta_data ->> 'locked', 'false') = 'false'), 2,
  '15. a02 vẫn còn role ADMIN, chưa bị khoá/xoá');

-- 16-17. Admin đang bị khoá không tính là "còn Admin": gỡ role a01 (đã khoá) được, nhưng nếu a01 mở khoá thì có hai Admin
select lives_ok($$delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a01' and role = 'ADMIN'$$,
  '16. gỡ role của Admin đã bị khoá (không làm giảm Admin hoạt động) -> được');
select is(public.is_last_active_admin('00000000-0000-0000-0000-068000000a02'), true, '17. a02 vẫn là Admin hoạt động cuối');

-- 18-22. Cấp lại a01 làm Admin + mở khoá -> thao tác bình thường lại
select lives_ok($$update auth.users set banned_until = null, raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"locked": false}'::jsonb
    where id = '00000000-0000-0000-0000-068000000a01'$$, '18. mở khoá a01 (chuyển sang hoạt động) không bị chặn');
select lives_ok($$insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-068000000a01', 'ADMIN')$$,
  '19. cấp lại role ADMIN cho a01 không bị chặn');
select is(public.is_last_active_admin('00000000-0000-0000-0000-068000000a02'), false, '20. có 2 Admin hoạt động -> a02 không còn là Admin cuối');
select lives_ok($$delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a02' and role = 'ADMIN'$$,
  '21. gỡ Admin khi còn Admin khác hoạt động -> được');
select throws_ok($$delete from auth.users where id = '00000000-0000-0000-0000-068000000a01'$$,
  'FB409', null, '22. a01 giờ là Admin cuối: xoá bị chặn');

-- 23-24. Xoá nhiều Admin trong một câu lệnh vẫn giữ lại 1
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-068000000a02', 'ADMIN');
select throws_ok($$delete from public.user_roles where role = 'ADMIN'$$, 'FB409', null,
  '23. xoá hàng loạt toàn bộ Admin trong một câu lệnh bị chặn (không còn 0 Admin)');
select is((select count(*)::int from public.user_roles where role = 'ADMIN'), 2, '24. sau khi bị chặn, cả 2 Admin còn nguyên');

-- 25-26. ACL: hàm hàng rào không gọi được từ authenticated, is_last_active_admin chỉ service_role
select is(has_function_privilege('authenticated', 'public.is_last_active_admin(uuid)', 'execute'), false,
  '25. authenticated không gọi được is_last_active_admin');
select is(has_function_privilege('service_role', 'public.is_last_active_admin(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.guard_last_active_admin(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.auth_account_is_active(uuid, timestamptz, jsonb, timestamptz, timestamptz)', 'execute'), true,
  '26. service_role chỉ gọi được is_last_active_admin (không gọi guard_last_active_admin / auth_account_is_active)');

-- 27-38. Định nghĩa Admin hoạt động khớp cron delete_unconfirmed_users: đã xác nhận email HOẶC có identity facebook.
-- Trạng thái đầu phần này: a01, a02 là Admin đã xác nhận. Thêm a03 chưa xác nhận (không facebook) mang ADMIN, rồi chỉ giữ a01.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-068000000a03', 'admin68c@example.com', '{}', null);
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-068000000a03', 'ADMIN');
delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a02' and role = 'ADMIN';
select throws_ok($$delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a01' and role = 'ADMIN'$$,
  'FB409', null, '27. gỡ role Admin đã xác nhận duy nhất bị chặn dù còn Admin chưa xác nhận email');
select throws_ok($$update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-068000000a01'$$,
  'FB409', null, '28. khoá Admin đã xác nhận duy nhất bị chặn dù còn Admin chưa xác nhận email');
select throws_ok($$delete from auth.users where id = '00000000-0000-0000-0000-068000000a01'$$,
  'FB409', null, '29. xoá Admin đã xác nhận duy nhất bị chặn dù còn Admin chưa xác nhận email');
select ok(public.is_last_active_admin('00000000-0000-0000-0000-068000000a01')
  and not public.is_last_active_admin('00000000-0000-0000-0000-068000000a03'),
  '30. a01 là Admin cuối; a03 (chưa xác nhận, không facebook) không phải Admin hoạt động');
-- Cron THẬT delete_unconfirmed_users: a03 quá 7 ngày, chưa xác nhận, không facebook -> bị xoá, không FB409.
update auth.users set created_at = now() - interval '8 days' where id = '00000000-0000-0000-0000-068000000a03';
select lives_ok($$select public.delete_unconfirmed_users()$$, '31. cron delete_unconfirmed_users xoá được Admin chưa xác nhận (không FB409)');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-068000000a03'), 0, '32. a03 đã bị cron xoá');

-- Admin facebook không email: cron KHÔNG xoá, và được tính là Admin hoạt động.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-068000000a04', 'admin68d@example.com', '{}', null);
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('fb68', '00000000-0000-0000-0000-068000000a04', '{"sub": "fb68"}'::jsonb, 'facebook');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-068000000a04', 'ADMIN');
update auth.users set created_at = now() - interval '8 days' where id = '00000000-0000-0000-0000-068000000a04';
select is(public.is_last_active_admin('00000000-0000-0000-0000-068000000a01'), false,
  '33. Admin facebook không email được tính là Admin hoạt động (a01 không còn là Admin cuối)');
select lives_ok($$update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-068000000a01'$$,
  '34. khoá Admin đã xác nhận khi còn Admin facebook hoạt động -> được phép');
select throws_ok($$delete from auth.identities where user_id = '00000000-0000-0000-0000-068000000a04' and provider = 'facebook'$$,
  'FB409', null, '35. gỡ liên kết facebook của Admin cuối không email bị chặn');
select is((select public.delete_unconfirmed_users() * 0) + (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-068000000a04'), 1,
  '36. cron không xoá Admin facebook không email (ngoại lệ facebook)');

-- Mở khoá a01, bỏ role a04: a01 là Admin cuối; bỏ xác nhận email của a01 bị chặn, xác nhận email của Admin khác thì không.
update auth.users set banned_until = null where id = '00000000-0000-0000-0000-068000000a01';
delete from public.user_roles where user_id = '00000000-0000-0000-0000-068000000a04' and role = 'ADMIN';
select throws_ok($$update auth.users set email_confirmed_at = null where id = '00000000-0000-0000-0000-068000000a01'$$,
  'FB409', null, '37. đặt email_confirmed_at = null trên Admin cuối (không facebook) bị chặn');
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-068000000a05', 'admin68e@example.com', '{}', null);
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-068000000a05', 'ADMIN');
select lives_ok($$update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-068000000a05'$$,
  '38. xác nhận email của Admin B (inactive -> active) không bị chặn');

select * from finish();
rollback;
