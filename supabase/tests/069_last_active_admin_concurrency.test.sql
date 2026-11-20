-- ============================================================================
-- pgTAP Test: 069_last_active_admin_concurrency.test.sql
-- bug admin-self-lock-last-admin-guard phase-1 task-01 (CR-004, GAP-010), race đa phiên THẬT (dblink):
-- còn đúng 2 Admin hoạt động, hai phiên cùng làm mất tư cách của hai Admin KHÁC NHAU gần như đồng thời:
--   1) gỡ role ADMIN x gỡ role ADMIN   2) khoá (auth.users) x gỡ role   3) khoá x khoá (kiểu GoTrue updateUserById)
-- Phiên A vào hàng rào trước (giữ advisory lock tới commit), phiên B phải CHỜ rồi thấy A đã commit và bị chặn FB409
-- -> không bao giờ còn 0 Admin hoạt động. Không có hàng rào khoá thì cả hai cùng thấy "còn Admin kia" và đều thành công.
-- Dữ liệu commit thật -> tự dọn trước và sau. Admin demo có sẵn bị khoá TẠM (lưu ở tap69_saved, khôi phục khi dọn).
-- ============================================================================
begin;
select plan(10);

create extension if not exists dblink with schema extensions;

create function public.tap69_cleanup_sql() returns text language sql as $$
  select $c$
    do $d$ begin
      if to_regclass('public.tap69_saved') is not null then
        update auth.users u set banned_until = s.banned_until from public.tap69_saved s where u.id = s.user_id;
        drop table public.tap69_saved;
      end if;
    end $d$;
    delete from auth.users where id in ('00000000-0000-0000-0000-069000000a01', '00000000-0000-0000-0000-069000000a02');
    delete from public.audit_logs where table_name = 'user_roles' and record_id like '00000000-0000-0000-0000-069%';
  $c$;
$$;

create function public.tap69_setup_sql() returns text language sql as $$
  select $s$
    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-069000000a01', 'admin69a@example.com', '{}', '{}', now()),
      ('00000000-0000-0000-0000-069000000a02', 'admin69b@example.com', '{}', '{}', now());
    insert into public.user_roles (user_id, role) values
      ('00000000-0000-0000-0000-069000000a01', 'ADMIN'),
      ('00000000-0000-0000-0000-069000000a02', 'ADMIN');
    -- Khoá tạm mọi Admin hoạt động khác (demo) để chỉ còn đúng hai Admin của fixture.
    create table public.tap69_saved as
      select u.id as user_id, u.banned_until
        from public.user_roles ur join auth.users u on u.id = ur.user_id
       where ur.role = 'ADMIN' and u.id::text not like '00000000-0000-0000-0000-069%'
         and public.auth_account_is_active(u.id, u.banned_until, u.raw_app_meta_data, u.deleted_at, u.email_confirmed_at);
    update auth.users set banned_until = now() + interval '1 day' where id in (select user_id from public.tap69_saved);
  $s$;
$$;

create function public.tap69_get(p_conn text) returns text language plpgsql as $$
declare v_res text;
begin
  select t.r into v_res from extensions.dblink_get_result(p_conn) as t(r text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text);
  return 'ok:' || coalesce(v_res, '');
exception when others then
  v_res := sqlstate || ':' || left(sqlerrm, 10);
  begin
    perform 1 from extensions.dblink_get_result(p_conn) as t(r text);
  exception when others then null;
  end;
  return v_res;
end;
$$;

create function public.tap69_run() returns jsonb language plpgsql as $fn$
declare
  v_conn text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                        coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_a1 constant text := '00000000-0000-0000-0000-069000000a01';
  v_a2 constant text := '00000000-0000-0000-0000-069000000a02';
  v_lock constant text := $q$update auth.users set banned_until = now() + interval '1 day',
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"locked": true}'::jsonb where id = %L$q$;
  v_del  constant text := $q$with d as (delete from public.user_roles where user_id = %L and role = 'ADMIN' returning 1) select count(*)::text as r from d$q$;
  v_ban  constant text := $q$with d as (update auth.users set banned_until = now() + interval '1 day',
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"locked": true}'::jsonb where id = %L returning 1) select count(*)::text as r from d$q$;
  v_r1_a text := 'ok'; v_r1_b text; v_r1_busy integer; v_r1_roles text;
  v_r2_b text; v_r2_busy integer;
  v_r3_b text; v_r3_busy integer;
  v_active text;
begin
  perform extensions.dblink_connect('t69_setup', v_conn);
  perform extensions.dblink_exec('t69_setup', public.tap69_cleanup_sql());
  perform extensions.dblink_exec('t69_setup', public.tap69_setup_sql());
  perform extensions.dblink_connect('t69_a', v_conn);
  perform extensions.dblink_connect('t69_b', v_conn);

  -- ===== Vòng 1: gỡ role a01 (A) x gỡ role a02 (B) =====
  perform extensions.dblink_exec('t69_a', 'begin');
  begin
    perform extensions.dblink_exec('t69_a', format('delete from public.user_roles where user_id = %L and role = ''ADMIN''', v_a1));
  exception when others then
    v_r1_a := sqlstate || ':' || left(sqlerrm, 10);
  end;
  perform extensions.dblink_send_query('t69_b', format(v_del, v_a2));
  perform pg_sleep(0.5);
  v_r1_busy := extensions.dblink_is_busy('t69_b');
  perform extensions.dblink_exec('t69_a', 'commit');
  v_r1_b := public.tap69_get('t69_b');
  select t.r into v_r1_roles from extensions.dblink('t69_setup',
    $q$select string_agg(right(user_id::text, 3), ',' order by user_id) from public.user_roles where user_id::text like '00000000-0000-0000-0000-069%'$q$)
    as t(r text);

  -- ===== Vòng 2: khoá a01 (A, qua auth.users) x gỡ role a02 (B). Khôi phục: cấp lại role a01 =====
  perform extensions.dblink_exec('t69_setup', format(
    'insert into public.user_roles (user_id, role) values (%L, ''ADMIN'') on conflict do nothing', v_a1));
  perform extensions.dblink_exec('t69_a', 'begin');
  perform extensions.dblink_exec('t69_a', format(v_lock, v_a1));
  perform extensions.dblink_send_query('t69_b', format(v_del, v_a2));
  perform pg_sleep(0.5);
  v_r2_busy := extensions.dblink_is_busy('t69_b');
  perform extensions.dblink_exec('t69_a', 'commit');
  v_r2_b := public.tap69_get('t69_b');

  -- ===== Vòng 3: khoá a01 (A) x khoá a02 (B), mở khoá a01 trước =====
  perform extensions.dblink_exec('t69_setup', format(
    $q$update auth.users set banned_until = null, raw_app_meta_data = raw_app_meta_data || '{"locked": false}'::jsonb where id = %L$q$, v_a1));
  perform extensions.dblink_exec('t69_a', 'begin');
  perform extensions.dblink_exec('t69_a', format(v_lock, v_a1));
  perform extensions.dblink_send_query('t69_b', format(v_ban, v_a2));
  perform pg_sleep(0.5);
  v_r3_busy := extensions.dblink_is_busy('t69_b');
  perform extensions.dblink_exec('t69_a', 'commit');
  v_r3_b := public.tap69_get('t69_b');

  select t.r into v_active from extensions.dblink('t69_setup', format(
    $q$select count(*)::text from public.user_roles ur join auth.users u on u.id = ur.user_id
        where ur.role = 'ADMIN' and ur.user_id in (%L, %L)
          and public.auth_account_is_active(u.id, u.banned_until, u.raw_app_meta_data, u.deleted_at, u.email_confirmed_at)$q$, v_a1, v_a2))
    as t(r text);

  perform extensions.dblink_exec('t69_setup', public.tap69_cleanup_sql());
  perform extensions.dblink_disconnect('t69_a');
  perform extensions.dblink_disconnect('t69_b');
  perform extensions.dblink_disconnect('t69_setup');

  return jsonb_build_object('r1_a', v_r1_a, 'r1_b', v_r1_b, 'r1_busy', v_r1_busy, 'r1_roles', v_r1_roles,
    'r2_b', v_r2_b, 'r2_busy', v_r2_busy, 'r3_b', v_r3_b, 'r3_busy', v_r3_busy, 'active', v_active);
exception when others then
  begin perform extensions.dblink_exec('t69_a', 'rollback'); exception when others then null; end;
  begin perform extensions.dblink_exec('t69_setup', public.tap69_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t69_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t69_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t69_setup'); exception when others then null; end;
  raise;
end;
$fn$;

create temp table tap69_result as select public.tap69_run() as j;
grant select on tap69_result to public;

select is((select j->>'r1_a' from tap69_result), 'ok', '1. vòng 1: phiên A gỡ role Admin a01 thành công (còn a02)');
select is((select j->>'r1_busy' from tap69_result), '1', '2. vòng 1: phiên B (gỡ role a02) bị CHỜ khoá tập Admin, không chạy song song');
select is((select j->>'r1_b' from tap69_result), 'FB409:LAST_ADMIN', '3. vòng 1: sau khi A commit, B bị chặn FB409 (a02 là Admin cuối)');
select is((select j->>'r1_roles' from tap69_result), 'a02', '4. vòng 1: kết quả cuối còn đúng role của a02');
select is((select j->>'r2_busy' from tap69_result), '1', '5. vòng 2: gỡ role a02 bị chờ khi phiên A đang khoá a01');
select is((select j->>'r2_b' from tap69_result), 'FB409:LAST_ADMIN', '6. vòng 2: khoá a01 x gỡ role a02 -> B bị chặn');
select is((select j->>'r3_busy' from tap69_result), '1', '7. vòng 3: khoá a02 bị chờ khi phiên A đang khoá a01');
select is((select j->>'r3_b' from tap69_result), 'FB409:LAST_ADMIN', '8. vòng 3: khoá x khoá -> B bị chặn');
select is((select j->>'active' from tap69_result), '1', '9. sau cả 3 vòng vẫn còn đúng 1 Admin hoạt động (không bao giờ 0)');
select is(
  (select count(*) from auth.users where id in ('00000000-0000-0000-0000-069000000a01', '00000000-0000-0000-0000-069000000a02'))
  + (select count(*) from pg_class where relname = 'tap69_saved' and relnamespace = 'public'::regnamespace),
  0::bigint, '10. fixture và bảng lưu tạm đã được dọn sạch');

select * from finish();
rollback;
