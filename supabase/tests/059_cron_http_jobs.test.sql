-- pgTAP: 20261113180000_cron_http_jobs.sql
begin;
select plan(9);

select ok(exists(select 1 from cron.job where jobname = 'job-send-emails' and schedule = '* * * * *'), 'cron send-emails mỗi phút');
select ok(exists(select 1 from cron.job where jobname = 'job-reconcile-payos' and schedule = '*/5 * * * *'), 'cron reconcile mỗi 5 phút');
select ok(not exists(select 1 from cron.job where jobname in ('job-send-emails','job-reconcile-payos') and command ~* 'https?://'), 'lịch cron không chứa URL literal');
select ok(not has_function_privilege('authenticated', 'public.call_nest_job(text)', 'execute'), 'authenticated không gọi được call_nest_job');
select ok(not has_function_privilege('anon', 'public.call_nest_job(text)', 'execute'), 'anon không gọi được call_nest_job');
select ok(has_function_privilege('service_role', 'public.call_nest_job(text)', 'execute'), 'service_role gọi được call_nest_job');

delete from vault.secrets where name in ('api_base_url', 'job_secret');
select is(public.call_nest_job('/jobs/reconcile'), null::bigint, 'thiếu vault secret -> trả null, không lỗi');

select is(public.call_nest_job('/evil'), null::bigint, 'path không hợp lệ -> null');

select vault.create_secret('http://127.0.0.1:9', 'api_base_url');
select vault.create_secret('s3cret-test', 'job_secret');
select ok(public.call_nest_job('/jobs/reconcile') is not null, 'đủ secret -> enqueue request pg_net');

select * from finish();
rollback;
