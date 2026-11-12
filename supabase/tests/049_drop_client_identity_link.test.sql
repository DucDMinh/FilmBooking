-- ============================================================================
-- pgTAP Test: 049_drop_client_identity_link.test.sql
-- bug-layer34-review K2 (hướng a): link_user_identity (nhận provider_id do client khai,
-- không có bằng chứng sở hữu) đã bị DROP. Liên kết MXH chỉ qua GoTrue linkIdentity (OAuth).
-- Trigger guard_identity_insert vẫn bảo vệ R-23 khi GoTrue chèn identity.
-- ============================================================================
begin;
select plan(4);

select hasnt_function('public', 'link_user_identity', 'link_user_identity không còn tồn tại');
select hasnt_function('public', 'link_user_identity', array['uuid','text','text','jsonb'], 'link_user_identity(uuid,text,text,jsonb) không còn tồn tại');

-- Dữ liệu: user A đã gắn google g_k2_owner
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'k2_a@test.local', '', now(), now()),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'k2_b@test.local', '', now(), now());
insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
values (gen_random_uuid(), 'google', 'g_k2_owner', '00000000-0000-0000-0000-00000000b201', '{"sub":"g_k2_owner"}'::jsonb, now(), now());

-- R-23 ở DB: GoTrue (insert trực tiếp) gắn MXH đã thuộc A sang B -> bị trigger chặn 23505
select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_k2_owner', '00000000-0000-0000-0000-00000000b202', '{"sub":"g_k2_owner"}'::jsonb, now(), now())$$,
  '23505', null, 'R-23: trigger chặn gắn MXH đã thuộc user khác (đường GoTrue linkIdentity)');

-- user không mật khẩu liên kết MXH mới (đường GoTrue) vẫn được
select lives_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'facebook', 'fb_k2_new', '00000000-0000-0000-0000-00000000b202', '{"sub":"fb_k2_new"}'::jsonb, now(), now())$$,
  'GoTrue linkIdentity hợp lệ (provider_id mới, user chưa có mật khẩu) không bị trigger chặn');

select * from finish();
rollback;
