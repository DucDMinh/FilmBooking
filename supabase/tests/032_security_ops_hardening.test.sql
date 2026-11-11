-- pgTAP: siết bảo mật & vận hành (layer 3 / task 01, follow-up review layer 2).
-- Sửa test "không gia hạn" cũ (021 chỉ chứng minh hai lần cùng now() trong transaction),
-- subdomain disposable, validate hit_rate_limit, purge định kỳ, quyền execute hàm.
begin;
select plan(25);

-- ---------------------------------------------------------------------------
-- R-11: sai khi đang khoá KHÔNG gia hạn — đặt khoá còn hạn 5 phút (khác 15 phút của lần khoá mới)
-- rồi gọi lại: nếu hàm gia hạn thì locked_until sẽ đổi.
-- ---------------------------------------------------------------------------
select public.register_login_failure('hard@example.com') from generate_series(1, 5);
update public.login_attempts set locked_until = now() + interval '5 minutes' where email = 'hard@example.com';
select is((select r.locked_until from public.register_login_failure('hard@example.com') r),
          now() + interval '5 minutes', 'đang khoá: locked_until giữ nguyên 5 phút, không bị gia hạn');
select is((select failed_count from public.login_attempts where email = 'hard@example.com'), 5,
          'đang khoá: không tăng bộ đếm');

-- ---------------------------------------------------------------------------
-- R-09: disposable khớp subdomain, lấy phần sau '@' cuối, dùng index
-- ---------------------------------------------------------------------------
select is(public.is_disposable_email('x@mail.mailinator.com'), true, 'subdomain của domain disposable bị chặn');
select is(public.is_disposable_email('x@a.b.YOPMAIL.net '), true, 'nhiều cấp subdomain, hoa thường, khoảng trắng');
select is(public.is_disposable_email('x@notmailinator.com'), false, 'hậu tố không theo ranh giới nhãn: không chặn');
select is(public.is_disposable_email('mailinator.com@gmail.com'), false, 'domain nằm ở phần local: không chặn');
select is(public.is_disposable_email('a@b@mailinator.com'), true, 'lấy phần sau @ CUỐI');
select is(public.is_disposable_email('khong-co-a-cong'), false, 'không có @: false');
select is(public.is_disposable_email('x@mailinator.com'), true, 'domain gốc vẫn bị chặn');
select has_index('public', 'disposable_email_domains', 'disposable_email_domains_lower_idx', 'có index biểu thức lower(domain)');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'disposable_email_domains'
                    and indexdef ilike '%(domain)%' and indexname like '%pkey'), 'index khoá chính citext vẫn còn');

-- ---------------------------------------------------------------------------
-- R-08: hit_rate_limit validate tham số
-- ---------------------------------------------------------------------------
select throws_ok($$select public.hit_rate_limit('k1', null, 3)$$, '22023', null, 'p_window null -> lỗi rõ');
select throws_ok($$select public.hit_rate_limit('k1', interval '0', 3)$$, '22023', null, 'p_window = 0 -> lỗi');
select throws_ok($$select public.hit_rate_limit('k1', interval '1 hour', 0)$$, '22023', null, 'p_max = 0 -> lỗi');
select throws_ok($$select public.hit_rate_limit('k1', interval '1 hour', null)$$, '22023', null, 'p_max null -> lỗi');
select is(public.hit_rate_limit('k2', interval '1 hour', 1), true, 'tham số hợp lệ vẫn hoạt động');

-- ---------------------------------------------------------------------------
-- Purge định kỳ
-- ---------------------------------------------------------------------------
select is((select count(*) from cron.job where jobname = 'purge-expired-ops-data')::int, 1, 'cron purge tồn tại');
insert into public.rate_limit_buckets (key, window_start, hits) values
  ('old', now() - interval '3 days', 1), ('fresh', now() - interval '1 hour', 1);
insert into public.login_attempts (email, failed_count, last_failed_at, locked_until) values
  ('old-free@example.com', 2, now() - interval '3 days', null),
  ('old-expired-lock@example.com', 5, now() - interval '3 days', now() - interval '2 days'),
  ('active-lock@example.com', 5, now() - interval '3 days', now() + interval '10 minutes'),
  ('recent@example.com', 2, now() - interval '1 hour', null);
insert into public.pos_api_logs (occurred_at, method, path) values
  (now() - interval '91 days', 'GET', '/old'), (now() - interval '10 days', 'GET', '/recent');
select is((select row(r.rate_limit_buckets, r.login_attempts, r.pos_api_logs)::text from public.purge_expired_ops_data() r),
          '(1,2,1)', 'purge báo đúng số dòng xoá');
select is((select count(*) from public.rate_limit_buckets where key in ('old', 'fresh'))::int, 1, 'bucket quá hạn bị xoá, bucket mới giữ');
select is((select array_agg(email::text order by email) from public.login_attempts
            where email::text in ('old-free@example.com', 'old-expired-lock@example.com', 'active-lock@example.com', 'recent@example.com')),
          array['active-lock@example.com', 'recent@example.com'], 'giữ khoá còn hạn và lỗi gần đây, xoá phần còn lại');
select is((select count(*) from public.pos_api_logs where path in ('/old', '/recent'))::int, 1, 'log POS > 90 ngày bị xoá');

-- ---------------------------------------------------------------------------
-- Quyền execute
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'),
      'hook: chỉ supabase_auth_admin execute');
select ok(not has_function_privilege('anon', 'public.delete_unconfirmed_users()', 'execute')
      and not has_function_privilege('authenticated', 'public.delete_unconfirmed_users()', 'execute'),
      'delete_unconfirmed_users: anon/authenticated không execute');
select is((select count(*) from unnest(array[
    'public.register_login_failure(text)', 'public.is_login_locked(text)', 'public.clear_login_failures(text)',
    'public.hit_rate_limit(text, interval, integer)', 'public.is_disposable_email(text)',
    'public.delete_unconfirmed_users()', 'public.purge_expired_ops_data()']) f
   where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute'))::int,
  0, 'hàm service_role/vận hành: anon + authenticated đều không execute');
select ok(has_function_privilege('service_role', 'public.hit_rate_limit(text, interval, integer)', 'execute')
      and has_function_privilege('service_role', 'public.is_disposable_email(text)', 'execute'),
      'service_role vẫn execute sau CREATE OR REPLACE (quyền được giữ)');

select * from finish();
rollback;
