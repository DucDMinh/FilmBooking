-- pgTAP: bảo mật & vận hành (layer 2 / task 02): khoá đăng nhập (AC-03), rate limit, email dùng một lần,
-- cron xoá tài khoản chưa xác nhận (trừ Facebook), RLS/quyền, hook before_user_created.
begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- R-11: 5 lần sai -> khoá 15 phút; sau 15 phút mở
-- ---------------------------------------------------------------------------
select is((select count(*) from (select public.register_login_failure('Lock@Example.com') from generate_series(1, 4)) s)::int, 4, '4 lần sai gọi được');
select is(public.is_login_locked('lock@example.com'), false, '4 lần sai: chưa khoá');
select is((select r.is_locked from public.register_login_failure('lock@example.com') r), true, 'lần sai thứ 5: is_locked true');
select is(public.is_login_locked('LOCK@example.com'), true, 'đang khoá (email không phân biệt hoa thường)');
select ok((select locked_until from public.login_attempts where email = 'lock@example.com')
          between now() + interval '14 minutes' and now() + interval '15 minutes 5 seconds', 'khoá ~15 phút');

-- Sai thêm khi đang khoá không gia hạn.
select is((select r.locked_until from public.register_login_failure('lock@example.com') r),
          (select locked_until from public.login_attempts where email = 'lock@example.com'), 'sai khi đang khoá: không gia hạn');

-- Giả lập 15 phút trôi qua (now() cố định trong transaction nên lùi mốc khoá).
update public.login_attempts set locked_until = now() - interval '1 second' where email = 'lock@example.com';
select is(public.is_login_locked('lock@example.com'), false, 'sau 15 phút: mở khoá');
select is((select r.failed_count from public.register_login_failure('lock@example.com') r), 1, 'sau khi hết khoá đếm lại từ 1');

select public.clear_login_failures('lock@example.com');
select is((select count(*) from public.login_attempts where email = 'lock@example.com')::int, 0, 'clear xoá bộ đếm');
select is(public.is_login_locked('khong-ton-tai@example.com'), false, 'email chưa từng sai: không khoá');

-- ---------------------------------------------------------------------------
-- R-08: hit_rate_limit
-- ---------------------------------------------------------------------------
select is(array(select public.hit_rate_limit('signup:ip1', interval '1 hour', 3) from generate_series(1, 5)),
          array[true, true, true, false, false], 'vượt ngưỡng 3 lượt trong cửa sổ -> false');
select is(public.hit_rate_limit('signup:ip2', interval '1 hour', 3), true, 'key khác độc lập');
update public.rate_limit_buckets set window_start = now() - interval '2 hours' where key = 'signup:ip1';
select is(public.hit_rate_limit('signup:ip1', interval '1 hour', 3), true, 'hết cửa sổ -> đếm lại');
select is((select hits from public.rate_limit_buckets where key = 'signup:ip1'), 1, 'cửa sổ mới hits = 1');

-- ---------------------------------------------------------------------------
-- R-09: email dùng một lần
-- ---------------------------------------------------------------------------
select is(public.is_disposable_email('a@Mailinator.com'), true, 'domain disposable (không phân biệt hoa thường)');
select is(public.is_disposable_email('a@gmail.com'), false, 'domain thường');
insert into public.disposable_email_domains (domain) values ('evil.test');
select is(public.is_disposable_email('x@evil.test'), true, 'thêm domain bằng INSERT, không sửa code');

-- ---------------------------------------------------------------------------
-- R-10: cron + xoá tài khoản chưa xác nhận (trừ Facebook)
-- ---------------------------------------------------------------------------
select is((select count(*) from cron.job where jobname = 'delete-unconfirmed-users' and schedule = '0 * * * *')::int, 1, 'cron job hằng giờ tồn tại');

insert into auth.users (id, email, created_at, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e001', 'old-unconfirmed@example.com', now() - interval '8 days', null),
  ('00000000-0000-0000-0000-00000000e002', 'new-unconfirmed@example.com', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-00000000e003', 'old-confirmed@example.com',   now() - interval '8 days', now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000e004', 'old-facebook@example.com',    now() - interval '8 days', null);
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('fb-123', '00000000-0000-0000-0000-00000000e004', '{"sub":"fb-123"}', 'facebook');

select is(public.delete_unconfirmed_users(), 1, 'xoá đúng 1 tài khoản');
select is((select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000e001')::int, 0, 'chưa xác nhận > 7 ngày: bị xoá');
select is((select count(*) from auth.users where id in (
  '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e003',
  '00000000-0000-0000-0000-00000000e004'))::int, 3, 'mới / đã xác nhận / Facebook: được giữ');

-- ---------------------------------------------------------------------------
-- RLS / quyền: client không đọc được bảng nhạy cảm, không gọi được hàm
-- ---------------------------------------------------------------------------
select is((select count(*) from pg_tables where schemaname = 'public'
  and tablename in ('login_attempts','rate_limit_buckets','disposable_email_domains','email_outbox','pos_api_keys','pos_api_logs')
  and rowsecurity)::int, 6, 'RLS bật trên cả 6 bảng');
select ok(not has_table_privilege('anon', 'public.pos_api_keys', 'select')
      and not has_table_privilege('authenticated', 'public.pos_api_keys', 'select'), 'anon/authenticated không SELECT pos_api_keys');
select ok(not has_table_privilege('anon', 'public.email_outbox', 'select')
      and not has_table_privilege('authenticated', 'public.email_outbox', 'select'), 'anon/authenticated không SELECT email_outbox');
select ok(not has_function_privilege('authenticated', 'public.hit_rate_limit(text, interval, integer)', 'execute')
      and not has_function_privilege('anon', 'public.register_login_failure(text)', 'execute')
      and has_function_privilege('service_role', 'public.register_login_failure(text)', 'execute'), 'hàm chỉ service_role execute');

-- ---------------------------------------------------------------------------
-- Hook before_user_created
-- ---------------------------------------------------------------------------
select ok(public.hook_before_user_created('{"user":{"email":"a@b.c","app_metadata":{"provider":"email","providers":["email"]}}}'::jsonb) ? 'error',
          'email/password không cờ (signup trực tiếp): từ chối');
select ok(not (public.hook_before_user_created('{"user":{"app_metadata":{"provider":"email","created_via":"nest"}}}'::jsonb) ? 'error')
      and not (public.hook_before_user_created('{"user":{"app_metadata":{"provider":"google"}}}'::jsonb) ? 'error')
      and not (public.hook_before_user_created('{"user":{"app_metadata":{"provider":"facebook"}}}'::jsonb) ? 'error'),
          'Nest Admin API + OAuth Google/Facebook: cho phép');

select * from finish();
rollback;
