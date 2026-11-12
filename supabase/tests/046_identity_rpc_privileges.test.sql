-- ============================================================================
-- pgTAP Test: 046_identity_rpc_privileges.test.sql
-- bug-layer34-review K1 + K3: RPC identity / check_oauth_collision chỉ service_role
-- gọi được; thân hàm fail-closed khi không có danh tính; không thao tác user khác.
-- ============================================================================

begin;
select plan(26);

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
create function public.tap_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
-- Owner (postgres) nhưng mang claims của một JWT: mô phỏng ngữ cảnh gọi trực tiếp thân hàm
create function public.tap_owner_with_claims(p_claims text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', p_claims, true);
  perform set_config('role', 'postgres', true);
end;
$$;

-- Fixture (owner)
set local app.allow_identity_link = 'true';
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a101', 'priv_a@test.local', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), now()),
  ('00000000-0000-0000-0000-00000000a102', 'priv_b@test.local', null, now(), now());
insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at) values
  (gen_random_uuid(), 'email', '00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a101',
   '{"sub":"00000000-0000-0000-0000-00000000a101","email":"priv_a@test.local"}'::jsonb, now(), now()),
  (gen_random_uuid(), 'google', 'g_priv_b_1', '00000000-0000-0000-0000-00000000a102',
   '{"sub":"g_priv_b_1","email":"priv_b@test.local"}'::jsonb, now(), now()),
  (gen_random_uuid(), 'facebook', 'fb_priv_b_1', '00000000-0000-0000-0000-00000000a102',
   '{"sub":"fb_priv_b_1"}'::jsonb, now(), now());
set local app.allow_identity_link = 'false';

-- ---------------------------------------------------------------------------
-- 1. Grant: anon / authenticated KHÔNG có EXECUTE (10 test)
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.link_user_identity(uuid,text,text,jsonb)', 'execute'), 'anon không execute link_user_identity');
select ok(not has_function_privilege('anon', 'public.unlink_user_identity(uuid,text)', 'execute'), 'anon không execute unlink_user_identity');
select ok(not has_function_privilege('anon', 'public.get_user_identities(uuid)', 'execute'), 'anon không execute get_user_identities');
select ok(not has_function_privilege('anon', 'public.mark_password_set(uuid)', 'execute'), 'anon không execute mark_password_set');
select ok(not has_function_privilege('anon', 'public.check_oauth_collision(text,text,text,uuid)', 'execute'), 'anon không execute check_oauth_collision (R-12)');
select ok(not has_function_privilege('authenticated', 'public.link_user_identity(uuid,text,text,jsonb)', 'execute'), 'authenticated không execute link_user_identity');
select ok(not has_function_privilege('authenticated', 'public.unlink_user_identity(uuid,text)', 'execute'), 'authenticated không execute unlink_user_identity');
select ok(not has_function_privilege('authenticated', 'public.get_user_identities(uuid)', 'execute'), 'authenticated không execute get_user_identities');
select ok(not has_function_privilege('authenticated', 'public.mark_password_set(uuid)', 'execute'), 'authenticated không execute mark_password_set');
select ok(not has_function_privilege('authenticated', 'public.check_oauth_collision(text,text,text,uuid)', 'execute'), 'authenticated không execute check_oauth_collision');

-- service_role (API dùng admin client) vẫn gọi được cả 5 hàm (1 test)
select ok(
  has_function_privilege('service_role', 'public.link_user_identity(uuid,text,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.unlink_user_identity(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.get_user_identities(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.mark_password_set(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.check_oauth_collision(text,text,text,uuid)', 'execute'),
  'service_role execute được cả 5 hàm');

-- ---------------------------------------------------------------------------
-- 2. Gọi thật dưới role anon -> permission denied 42501 (5 test)
-- ---------------------------------------------------------------------------
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select public.tap_anon();
select throws_ok($$select public.get_user_identities('00000000-0000-0000-0000-00000000a102'::uuid)$$, '42501', null, 'anon gọi get_user_identities bị từ chối');
select throws_ok($$select public.mark_password_set('00000000-0000-0000-0000-00000000a102'::uuid)$$, '42501', null, 'anon gọi mark_password_set bị từ chối');
select throws_ok($$select public.unlink_user_identity('00000000-0000-0000-0000-00000000a102'::uuid, 'google')$$, '42501', null, 'anon gọi unlink_user_identity bị từ chối');
select throws_ok($$select public.link_user_identity('00000000-0000-0000-0000-00000000a102'::uuid, 'google', 'g_evil')$$, '42501', null, 'anon gọi link_user_identity bị từ chối');
select throws_ok($$select public.check_oauth_collision('google', 'x', 'priv_a@test.local', null)$$, '42501', null, 'anon không dò được email qua check_oauth_collision (R-12)');

-- ---------------------------------------------------------------------------
-- 3. Gọi dưới role authenticated (user A) -> không đọc/thao tác được user B (2 test)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-00000000a101');
select throws_ok($$select public.get_user_identities('00000000-0000-0000-0000-00000000a102'::uuid)$$, '42501', null, 'authenticated A không đọc identity của B');
select throws_ok($$select public.unlink_user_identity('00000000-0000-0000-0000-00000000a102'::uuid, 'facebook')$$, '42501', null, 'authenticated A không huỷ identity của B');

-- ---------------------------------------------------------------------------
-- 4. Thân hàm fail-closed (chạy bằng owner, bỏ qua lớp GRANT) (8 test)
-- ---------------------------------------------------------------------------
select public.tap_owner();
select throws_ok($$select public.get_user_identities('00000000-0000-0000-0000-00000000a102'::uuid)$$, '42501', null, 'auth.uid() null + không phải service_role: get_user_identities raise');
select throws_ok($$select public.mark_password_set('00000000-0000-0000-0000-00000000a102'::uuid)$$, '42501', null, 'auth.uid() null + không phải service_role: mark_password_set raise');
select throws_ok($$select public.unlink_user_identity('00000000-0000-0000-0000-00000000a102'::uuid, 'facebook')$$, '42501', null, 'auth.uid() null + không phải service_role: unlink raise');
select throws_ok($$select public.link_user_identity('00000000-0000-0000-0000-00000000a102'::uuid, 'github', 'gh_evil')$$, '42501', null, 'auth.uid() null + không phải service_role: link raise');

select public.tap_owner_with_claims('{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}');
select throws_ok($$select public.get_user_identities('00000000-0000-0000-0000-00000000a102'::uuid)$$, '42501', null, 'sub=A đọc identity của B bị từ chối');
select lives_ok($$select public.get_user_identities('00000000-0000-0000-0000-00000000a101'::uuid)$$, 'sub=A đọc identity của chính mình được');
select throws_ok($$select public.link_user_identity('00000000-0000-0000-0000-00000000a102'::uuid, 'github', 'gh_evil')$$, '42501', null, 'sub=A không link identity vào B');

select public.tap_owner_with_claims('{"role":"service_role"}');
select lives_ok($$select public.get_user_identities('00000000-0000-0000-0000-00000000a102'::uuid)$$, 'service_role (không sub) thao tác theo p_user_id được');

select * from finish();
rollback;
