-- ============================================================================
-- pgTAP Test: 045_identity_hooks.test.sql
-- Layer 4 / Task 06: Identity / OAuth Security Hooks, Triggers & Helper RPCs
-- Requirements: R-19, R-20, R-21, R-22, R-23, R-24; AC-04, AC-05; Quyết định #18
-- ============================================================================

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- 0. Thiết lập dữ liệu mẫu trong auth.users và auth.identities
-- ---------------------------------------------------------------------------
set local app.allow_identity_link = 'true';

-- User a001: Có email + mật khẩu (hasPassword = true)
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-00000000a001',
  'user_pwd@test.local',
  '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF',
  now(),
  now()
);

insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
values (
  gen_random_uuid(),
  'email',
  '00000000-0000-0000-0000-00000000a001',
  '00000000-0000-0000-0000-00000000a001',
  '{"sub":"00000000-0000-0000-0000-00000000a001","email":"user_pwd@test.local"}'::jsonb,
  now(),
  now()
);

-- User a002: Chỉ có Google (chưa có mật khẩu, hasPassword = false)
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-00000000a002',
  'user_oauth@test.local',
  null,
  now(),
  now()
);

insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
values (
  gen_random_uuid(),
  'google',
  'g_oauth_222',
  '00000000-0000-0000-0000-00000000a002',
  '{"sub":"g_oauth_222","email":"user_oauth@test.local"}'::jsonb,
  now(),
  now()
);

-- User a003: Có cả Google và Facebook (totalMethods = 2, canUnlink = true)
insert into auth.users (id, email, encrypted_password, created_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-00000000a003',
  'user_multi@test.local',
  null,
  now(),
  now()
);

insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
values
  (gen_random_uuid(), 'google', 'g_multi_333', '00000000-0000-0000-0000-00000000a003', '{"sub":"g_multi_333"}'::jsonb, now(), now()),
  (gen_random_uuid(), 'facebook', 'fb_multi_333', '00000000-0000-0000-0000-00000000a003', '{"sub":"fb_multi_333"}'::jsonb, now(), now());

-- Trả cờ liên kết về mặc định
set local app.allow_identity_link = 'false';

-- ---------------------------------------------------------------------------
-- 1. Kiểm tra RPC get_user_identities (R-21)
-- ---------------------------------------------------------------------------
select is(
  (public.get_user_identities('00000000-0000-0000-0000-00000000a001'::uuid)->>'hasPassword')::boolean,
  true,
  'a001: hasPassword là true'
);

select is(
  (public.get_user_identities('00000000-0000-0000-0000-00000000a002'::uuid)->>'canUnlink')::boolean,
  false,
  'a002 (chỉ 1 OAuth): canUnlink là false'
);

select is(
  (public.get_user_identities('00000000-0000-0000-0000-00000000a003'::uuid)->>'canUnlink')::boolean,
  true,
  'a003 (2 phương thức OAuth): canUnlink là true'
);

-- ---------------------------------------------------------------------------
-- 2. Kiểm tra RPC unlink_user_identity (Defect 2 & AC-05)
-- ---------------------------------------------------------------------------

-- Defect 2: Chặn huỷ phương thức 'email' (SQLSTATE 22023)
select throws_ok(
  $$select public.unlink_user_identity('00000000-0000-0000-0000-00000000a001'::uuid, 'email')$$,
  '22023',
  null,
  'Defect 2: Chặn huỷ phương thức email/mật khẩu qua unlink_user_identity'
);

-- AC-05: Chặn huỷ phương thức đăng nhập cuối cùng (SQLSTATE 23514)
select throws_ok(
  $$select public.unlink_user_identity('00000000-0000-0000-0000-00000000a002'::uuid, 'google')$$,
  '23514',
  null,
  'AC-05: Từ chối huỷ phương thức cuối cùng của a002'
);

-- Huỷ thành công phương thức facebook của a003 khi còn >= 2 phương thức
select lives_ok(
  $$select public.unlink_user_identity('00000000-0000-0000-0000-00000000a003'::uuid, 'facebook')$$,
  'Huỷ liên kết facebook của a003 thành công'
);

-- R-24: Trigger trg_on_identity_change tự enqueue email thông báo vào email_outbox
select is(
  (select count(*)::int from public.email_outbox where to_email = 'user_multi@test.local' and kind = 'identity_unlinked'),
  1,
  'R-24: Trigger tự động enqueue email identity_unlinked vào email_outbox'
);

-- Sau khi huỷ facebook, a003 chỉ còn 1 phương thức -> canUnlink trở thành false
select is(
  (public.get_user_identities('00000000-0000-0000-0000-00000000a003'::uuid)->>'canUnlink')::boolean,
  false,
  'Sau khi huỷ 1 phương thức, canUnlink chuyển về false'
);

-- ---------------------------------------------------------------------------
-- 3. Kiểm tra RPC link_user_identity & Trigger trg_guard_identity_insert (AC-04, R-23)
-- ---------------------------------------------------------------------------

-- R-23: Chặn liên kết tài khoản MXH đã thuộc về người dùng khác (SQLSTATE 23505)
select throws_ok(
  $$select public.link_user_identity('00000000-0000-0000-0000-00000000a001'::uuid, 'google', 'g_oauth_222')$$,
  '23505',
  null,
  'R-23: Từ chối liên kết tài khoản MXH (g_oauth_222) đã thuộc về a002'
);

-- AC-04: Chặn auto-merge khi chèn trực tiếp identity vào user đã có mật khẩu mà không có cờ session
select throws_ok(
  $$insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), 'google', 'g_unauthorized_999', '00000000-0000-0000-0000-00000000a001', '{"sub":"g_unauthorized_999"}'::jsonb, now(), now())$$,
  '23514',
  null,
  'AC-04: Trigger trg_guard_identity_insert chặn auto-merge vào tài khoản mật khẩu'
);

-- Liên kết hợp lệ qua RPC link_user_identity (chủ động set cờ phiên)
select lives_ok(
  $$select public.link_user_identity('00000000-0000-0000-0000-00000000a001'::uuid, 'facebook', 'fb_new_444')$$,
  'Liên kết chủ động qua link_user_identity thành công'
);

-- R-24: Trigger tự động enqueue email identity_linked
select is(
  (select count(*)::int from public.email_outbox where to_email = 'user_pwd@test.local' and kind = 'identity_linked'),
  1,
  'R-24: Trigger tự động enqueue email identity_linked vào email_outbox'
);

-- ---------------------------------------------------------------------------
-- 4. Kiểm tra RPC check_oauth_collision (AC-04 & R-23 guard)
-- ---------------------------------------------------------------------------

-- AC-04: Đăng nhập lần đầu bằng Google có email trùng tài khoản mật khẩu -> CONFLICT_EMAIL
select is(
  (public.check_oauth_collision('google', 'g_new_555', 'user_pwd@test.local', null)->>'status'),
  'CONFLICT_EMAIL',
  'AC-04: check_oauth_collision phát hiện xung đột email với tài khoản mật khẩu'
);

-- R-23: MXH đã thuộc về user khác -> CONFLICT_IDENTITY
select is(
  (public.check_oauth_collision('google', 'g_oauth_222', 'random_different@test.local', null)->>'status'),
  'CONFLICT_IDENTITY',
  'R-23: check_oauth_collision phát hiện MXH đã gắn với tài khoản khác'
);

-- OAuth hoàn toàn mới -> OK
select is(
  (public.check_oauth_collision('google', 'g_brand_new_999', 'brand_new@test.local', null)->>'status'),
  'OK',
  'OAuth mới hoàn toàn -> check_oauth_collision trả về OK'
);

-- ---------------------------------------------------------------------------
-- 5. Kiểm tra RPC mark_password_set (R-22)
-- ---------------------------------------------------------------------------

select is(
  (public.mark_password_set('00000000-0000-0000-0000-00000000a002'::uuid)->>'success')::boolean,
  true,
  'mark_password_set trả về success = true'
);

select is(
  (select count(*)::int from auth.identities where user_id = '00000000-0000-0000-0000-00000000a002' and provider = 'email'),
  1,
  'mark_password_set tự động tạo identity provider = email'
);

select is(
  (public.get_user_identities('00000000-0000-0000-0000-00000000a002'::uuid)->>'canUnlink')::boolean,
  true,
  'Sau khi đặt mật khẩu, a002 có thể huỷ liên kết Google (canUnlink = true)'
);

select * from finish();
rollback;
