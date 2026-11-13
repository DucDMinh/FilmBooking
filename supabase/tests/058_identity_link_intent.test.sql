-- ============================================================================
-- pgTAP Test: 058_identity_link_intent.test.sql
-- Bug layer34-review · phase-2-task-07: link-intent cho liên kết MXH thủ công (F-2, M-05)
-- Requirements: R-20, R-21, R-23, AC-04, NFR-17, M-05
-- ============================================================================

begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- 0. Thiết lập dữ liệu mẫu trong auth.users và auth.identities
-- ---------------------------------------------------------------------------
-- User 7701: Có email/mật khẩu
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-000000007701',
  'user_7701@test.local',
  '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF',
  now(),
  now()
);

insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
values (
  gen_random_uuid(),
  'email',
  '00000000-0000-0000-0000-000000007701',
  '00000000-0000-0000-0000-000000007701',
  '{"sub":"00000000-0000-0000-0000-000000007701","email":"user_7701@test.local"}'::jsonb,
  now(),
  now()
);

-- User 7702: Chỉ có Google (OAuth-only, M-05)
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-000000007702',
  'user_7702@test.local',
  null,
  now(),
  now()
);

insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
values (
  gen_random_uuid(),
  'google',
  'g_7702_init',
  '00000000-0000-0000-0000-000000007702',
  '{"sub":"g_7702_init","email":"user_7702@test.local"}'::jsonb,
  now(),
  now()
);

-- ---------------------------------------------------------------------------
-- 1. Test chèn KHÔNG có intent -> ném 23514 OAUTH_AUTO_MERGE_BLOCKED
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7701_unauth', '00000000-0000-0000-0000-000000007701', '{"sub":"g_7701_unauth"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'AC-04: Chặn chèn identity OAuth vào user mật khẩu khi không có link intent'
);

-- M-05: User OAuth-only cố chèn thêm identity khác không có intent -> chặn auto-merge
select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'facebook', 'fb_7702_unauth', '00000000-0000-0000-0000-000000007702', '{"sub":"fb_7702_unauth"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'M-05: Chặn chèn identity OAuth vào user OAuth-only khi không có link intent'
);

-- ---------------------------------------------------------------------------
-- 2. Test chèn với intent HẾT HẠN -> ném 23514
-- ---------------------------------------------------------------------------
insert into public.identity_link_intents (user_id, provider, expires_at)
values ('00000000-0000-0000-0000-000000007701', 'google', now() - interval '1 minute');

select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7701_expired', '00000000-0000-0000-0000-000000007701', '{"sub":"g_7701_expired"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'Chặn liên kết khi link intent đã hết hạn'
);

-- ---------------------------------------------------------------------------
-- 3. Test chèn với intent ĐÃ DÙNG (consumed_at is not null) -> ném 23514
-- ---------------------------------------------------------------------------
insert into public.identity_link_intents (user_id, provider, expires_at, consumed_at)
values ('00000000-0000-0000-0000-000000007701', 'google', now() + interval '10 minutes', now() - interval '2 minutes');

select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7701_consumed', '00000000-0000-0000-0000-000000007701', '{"sub":"g_7701_consumed"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'Chặn liên kết khi link intent đã được sử dụng trước đó'
);

-- ---------------------------------------------------------------------------
-- 4. Test chèn với intent SAI PROVIDER -> ném 23514
-- ---------------------------------------------------------------------------
insert into public.identity_link_intents (user_id, provider, expires_at)
values ('00000000-0000-0000-0000-000000007701', 'facebook', now() + interval '10 minutes');

select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7701_wrong_provider', '00000000-0000-0000-0000-000000007701', '{"sub":"g_7701_wrong_provider"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'Chặn liên kết khi intent tồn tại nhưng khác provider (có facebook nhưng link google)'
);

-- ---------------------------------------------------------------------------
-- 5. Test chèn CÓ intent hợp lệ -> PASS và intent được đánh dấu consumed
-- ---------------------------------------------------------------------------
-- Intent hợp lệ cho 7701 với provider google
insert into public.identity_link_intents (id, user_id, provider, expires_at)
values ('11111111-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000007701', 'google', now() + interval '10 minutes');

select lives_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7701_valid', '00000000-0000-0000-0000-000000007701', '{"sub":"g_7701_valid"}'::jsonb, now(), now())$$,
  'Liên kết Google vào 7701 thành công khi có link intent hợp lệ'
);

-- Kiểm tra intent đã được đánh dấu consumed_at
select ok(
  (select consumed_at is not null from public.identity_link_intents where id = '11111111-0000-0000-0000-000000000001'::uuid),
  'Intent hợp lệ đã được trigger cập nhật consumed_at = now()'
);

-- Không thể tái sử dụng intent vừa dùng
select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7701_reuse', '00000000-0000-0000-0000-000000007701', '{"sub":"g_7701_reuse"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'Không thể tái sử dụng intent vừa được consume'
);

-- ---------------------------------------------------------------------------
-- 6. M-05: User OAuth-only liên kết thêm provider khác CÓ intent hợp lệ -> PASS
-- ---------------------------------------------------------------------------
insert into public.identity_link_intents (id, user_id, provider, expires_at)
values ('11111111-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000007702', 'facebook', now() + interval '10 minutes');

select lives_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'facebook', 'fb_7702_valid', '00000000-0000-0000-0000-000000007702', '{"sub":"fb_7702_valid"}'::jsonb, now(), now())$$,
  'M-05: Liên kết Facebook vào OAuth-only user 7702 thành công khi có link intent'
);

-- ---------------------------------------------------------------------------
-- 7. User mới toanh đăng ký lần đầu qua OAuth (chưa có identity nào) -> PASS
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-000000007703',
  'user_brand_new@test.local',
  null,
  now(),
  now()
);

select lives_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_7703_first', '00000000-0000-0000-0000-000000007703', '{"sub":"g_7703_first","email":"user_brand_new@test.local"}'::jsonb, now(), now())$$,
  'User mới đăng ký lần đầu qua OAuth (chưa có identity) được chèn không cần intent'
);

-- ---------------------------------------------------------------------------
-- 8. Bảo mật bảng identity_link_intents: RLS chặn anon / authenticated
-- ---------------------------------------------------------------------------
do $$ begin perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000007701"}', true); end $$;
set local role authenticated;

select throws_ok(
  $$select * from public.identity_link_intents$$,
  '42501',
  null,
  'RLS/Privilege: authenticated không được phép đọc identity_link_intents'
);

select throws_ok(
  $$insert into public.identity_link_intents (user_id, provider) values ('00000000-0000-0000-0000-000000007701', 'google')$$,
  '42501',
  null,
  'RLS/Privilege: authenticated không được phép chèn identity_link_intents'
);

select * from finish();
rollback;
