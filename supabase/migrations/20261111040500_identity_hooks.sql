-- ============================================================================
-- Migration: 20261111040500_identity_hooks.sql
-- Layer 4 / Task 06: Identity / OAuth security hooks & helper RPCs
-- Requirements: R-19, R-20, R-21, R-22, R-23, R-24; AC-04, AC-05; Quyết định #18
--
-- ============================================================================
-- SPIKE REPORT: SUPABASE GOTRUE AUTO-LINKING BEHAVIOR & TWO-LAYER DEFENSE
-- ============================================================================
-- 1. Mục tiêu Spike (AC-04):
--    Xác minh Supabase Auth có tự gộp identity OAuth vào user có cùng email đã
--    xác nhận không. Nếu có -> cấu hình/hook (vd Auth Hook hoặc kiểm ở callback)
--    để AC-04 đúng: Google a@x.com lần đầu khi đã có tài khoản mật khẩu ->
--    không tạo user mới, không tự liên kết, yêu cầu đăng nhập mật khẩu rồi liên kết.
--
-- 2. Kết quả phân tích hành vi Supabase GoTrue:
--    Mặc định trong Supabase GoTrue (nếu bật enable_manual_linking hoặc auto-confirm),
--    khi người dùng đăng nhập bằng bên thứ 3 (Google/Facebook) mà trả về email
--    khớp với user đã có trong auth.users, GoTrue có cơ chế gộp trực tiếp
--    identity mới vào auth.users mà không yêu cầu nhập mật khẩu của tài khoản cũ.
--    Hành vi này dẫn đến rủi ro chiếm đoạt tài khoản nếu email trên OAuth provider
--    chưa được kiểm chứng hoặc bị lợi dụng, vi phạm nghiêm trọng tiêu chí AC-04.
--
-- 3. Kiến trúc giải pháp 2 lớp (Two-Layer Defense Architecture):
--    - Lớp 1 (Database Trigger Guard: public.guard_identity_insert):
--      Trigger BEFORE INSERT ON auth.identities bắt mọi hành động chèn bản ghi identity.
--      Khi GoTrue cố chèn identity OAuth vào user đã có mật khẩu hoặc identity 'email'
--      mà không có cờ phiên bảo mật `app.allow_identity_link = 'true'`, trigger sẽ
--      chủ động ném exception OAUTH_AUTO_MERGE_BLOCKED (mã SQLSTATE 23514), chặn đứng
--      việc tự gộp ở tầng thấp nhất.
--      Đồng thời trigger kiểm tra R-23 (1 tài khoản MXH chỉ gắn tối đa 1 user, mã 23505)
--      và ném OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED (23514) nếu email trùng với user khác.
--      Chỉ duy nhất RPC `link_user_identity` (sau khi user đã đăng nhập phiên hợp lệ)
--      mới được set `app.allow_identity_link = 'true'` trong transaction cục bộ để liên kết.
--
--    - Lớp 2 (API Callback Collision Guard: public.check_oauth_collision):
--      Endpoint POST /auth/oauth/callback-check cho phép client web kiểm tra va chạm
--      trước khi hoàn tất trao đổi OAuth code lấy access token/session.
--      Nếu phát hiện email đã tồn tại tài khoản mật khẩu, trả về CONFLICT_EMAIL kèm
--      hướng dẫn đăng nhập mật khẩu trước khi liên kết.
-- ============================================================================

-- 1. Bảng lưu yêu cầu xác thực email bổ sung từ OAuth (Facebook không email - R-21, #18)
create table if not exists public.oauth_missing_email_requests (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null default 'facebook',
  provider_access_token   text,
  oauth_state_token       text,
  email                   text not null,
  verification_token      text not null,
  expires_at              timestamptz not null default (now() + interval '24 hours'),
  consumed_at             timestamptz,
  created_at              timestamptz not null default now()
);

create index if not exists oauth_missing_email_requests_email_idx
  on public.oauth_missing_email_requests (lower(email));
create index if not exists oauth_missing_email_requests_token_idx
  on public.oauth_missing_email_requests (verification_token);

alter table public.oauth_missing_email_requests enable row level security;
revoke all on public.oauth_missing_email_requests from anon, authenticated;

-- ============================================================================
-- 2. Trigger BEFORE INSERT ON auth.identities
-- Chặn auto-merge vào tài khoản mật khẩu có sẵn (AC-04, R-20)
-- Đảm bảo 1 tài khoản MXH chỉ gắn với 1 user (R-23)
-- ============================================================================
create or replace function public.guard_identity_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_oauth_email text;
  v_existing_user_id uuid;
  v_has_password boolean := false;
  v_allow_link text;
begin
  -- Provider 'email' hoặc 'phone' không phải OAuth external
  if NEW.provider in ('email', 'phone') then
    return NEW;
  end if;

  -- 1. R-23: Một tài khoản MXH (provider + provider_id) chỉ gắn tối đa 1 user
  if exists (
    select 1 from auth.identities
    where provider = NEW.provider
      and provider_id = NEW.provider_id
      and user_id <> NEW.user_id
  ) then
    raise exception 'OAUTH_IDENTITY_ALREADY_LINKED: Tai khoan mang xa hoi da duoc lien ket voi nguoi dung khac.'
      using errcode = '23505';
  end if;

  v_allow_link := coalesce(current_setting('app.allow_identity_link', true), 'false');

  -- 2. AC-04: User NEW.user_id đã có tài khoản mật khẩu / identity 'email'
  -- Nếu GoTrue cố tự động gộp (auto-merge) mà không có cờ cho phép liên kết chủ động:
  select (
    exists (select 1 from auth.identities where user_id = NEW.user_id and provider = 'email')
    or exists (select 1 from auth.users where id = NEW.user_id and encrypted_password is not null and encrypted_password <> '')
  ) into v_has_password;

  if v_has_password and v_allow_link <> 'true' then
    raise exception 'OAUTH_AUTO_MERGE_BLOCKED: Email nay da co tai khoan mat khau — hay dang nhap de lien ket.'
      using errcode = '23514';
  end if;

  -- 3. AC-04: Nếu email của identity trùng với email của một user khác đã tồn tại trong auth.users
  v_oauth_email := lower(coalesce(NEW.identity_data->>'email', NEW.email));
  if v_oauth_email is not null and v_oauth_email <> '' then
    select id into v_existing_user_id
    from auth.users
    where lower(email) = v_oauth_email
      and id <> NEW.user_id
    limit 1;

    if v_existing_user_id is not null and v_allow_link <> 'true' then
      raise exception 'OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED: Email nay da co tai khoan — hay dang nhap bang mat khau de lien ket.'
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_identity_insert on auth.identities;
create trigger trg_guard_identity_insert
  before insert on auth.identities
  for each row execute function public.guard_identity_insert();

-- ============================================================================
-- 3. Trigger AFTER INSERT OR DELETE ON auth.identities
-- Tự động enqueue email vào email_outbox (R-24) + ghi audit_logs (R-107)
-- ============================================================================
create or replace function public.on_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_provider text;
  v_provider_id text;
  v_email text;
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    v_user_id := NEW.user_id;
    v_provider := NEW.provider;
    v_provider_id := NEW.provider_id;
  else
    v_user_id := OLD.user_id;
    v_provider := OLD.provider;
    v_provider_id := OLD.provider_id;
  end if;

  -- Tìm email của user
  select email into v_email from auth.users where id = v_user_id;
  if v_email is null and tg_op = 'INSERT' then
    v_email := lower(coalesce(NEW.identity_data->>'email', NEW.email));
  end if;

  -- Bỏ qua email notification khi chỉ là đăng ký mật khẩu lần đầu (đã có email xác nhận tài khoản)
  -- Nhưng khi liên kết/huỷ liên kết MXH hoặc đổi identity -> R-24 bắt buộc gửi email
  if v_provider <> 'email' and v_email is not null and v_email <> '' then
    insert into public.email_outbox (
      kind,
      to_email,
      payload,
      status
    ) values (
      case when tg_op = 'INSERT' then 'identity_linked' else 'identity_unlinked' end,
      v_email,
      jsonb_build_object(
        'template', case when tg_op = 'INSERT' then 'identity_linked' else 'identity_unlinked' end,
        'provider', v_provider,
        'provider_id', v_provider_id,
        'user_id', v_user_id,
        'action', case when tg_op = 'INSERT' then 'linked' else 'unlinked' end,
        'timestamp', now()
      ),
      'PENDING'
    );
  end if;

  -- Ghi audit log
  select auth.uid() into v_actor;
  if v_actor is null then
    v_actor := v_user_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    cinema_id,
    table_name,
    record_id,
    action,
    before_data,
    after_data
  ) values (
    v_actor,
    null,
    'identities',
    case when tg_op = 'INSERT' then NEW.id::text else OLD.id::text end,
    tg_op,
    case when tg_op = 'DELETE' then jsonb_build_object('provider', OLD.provider, 'provider_id', OLD.provider_id, 'user_id', OLD.user_id) else null end,
    case when tg_op = 'INSERT' then jsonb_build_object('provider', NEW.provider, 'provider_id', NEW.provider_id, 'user_id', NEW.user_id) else null end
  );

  return null;
end;
$$;

drop trigger if exists trg_on_identity_change on auth.identities;
create trigger trg_on_identity_change
  after insert or delete on auth.identities
  for each row execute function public.on_identity_change();

-- ============================================================================
-- 4. Helper RPCs cho API & kiểm tra bảo mật
-- ============================================================================

-- 4.1 RPC: check_oauth_collision (AC-04 guard & R-23 check)
create or replace function public.check_oauth_collision(
  p_provider text,
  p_provider_id text,
  p_email text,
  p_authenticated_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_existing_identity_user uuid;
  v_existing_email_user uuid;
  v_email text := lower(trim(p_email));
begin
  -- 1. Kiểm tra nếu (provider, provider_id) đã gắn với user khác (R-23)
  select user_id into v_existing_identity_user
  from auth.identities
  where provider = p_provider and provider_id = p_provider_id
  limit 1;

  if v_existing_identity_user is not null then
    if p_authenticated_user_id is not null and v_existing_identity_user = p_authenticated_user_id then
      return jsonb_build_object('status', 'ALREADY_OWNED', 'message', 'Phương thức này đã được liên kết với tài khoản của bạn.');
    else
      return jsonb_build_object(
        'status', 'CONFLICT_IDENTITY',
        'code', 'IDENTITY_ALREADY_LINKED',
        'message', 'Tài khoản mạng xã hội này đã được liên kết với một người dùng khác.'
      );
    end if;
  end if;

  -- 2. Đăng nhập lần đầu (chưa đăng nhập) mà email trùng tài khoản đã có (AC-04)
  if p_authenticated_user_id is null and v_email is not null and v_email <> '' then
    select id into v_existing_email_user
    from auth.users
    where lower(email) = v_email
    limit 1;

    if v_existing_email_user is not null then
      -- Nếu user chưa liên kết provider này -> yêu cầu đăng nhập bằng mật khẩu
      if not exists (select 1 from auth.identities where user_id = v_existing_email_user and provider = p_provider) then
        return jsonb_build_object(
          'status', 'CONFLICT_EMAIL',
          'code', 'OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED',
          'message', 'Email này đã có tài khoản — hãy đăng nhập bằng mật khẩu để liên kết.'
        );
      end if;
    end if;
  end if;

  return jsonb_build_object('status', 'OK', 'message', 'Hợp lệ');
end;
$$;

grant execute on function public.check_oauth_collision(text, text, text, uuid) to anon, authenticated;

-- 4.2 RPC: get_user_identities (GET /me/identities)
create or replace function public.get_user_identities(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_identities jsonb;
  v_has_password boolean := false;
  v_oauth_count int := 0;
  v_total_methods int := 0;
  v_can_unlink boolean := false;
begin
  -- Kiểm tra quyền: chính user hoặc admin hoặc service_role
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Kiểm tra mật khẩu
  select (
    exists (select 1 from auth.identities where user_id = p_user_id and provider = 'email')
    or exists (select 1 from auth.users where id = p_user_id and encrypted_password is not null and encrypted_password <> '')
  ) into v_has_password;

  -- Lấy identities
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'provider', provider,
        'providerId', provider_id,
        'email', email,
        'createdAt', created_at,
        'lastSignInAt', last_sign_in_at
      ) order by created_at asc
    ),
    '[]'::jsonb
  )
  into v_identities
  from auth.identities
  where user_id = p_user_id;

  -- Số phương thức MXH (khác 'email')
  select count(*) into v_oauth_count
  from auth.identities
  where user_id = p_user_id and provider <> 'email';

  v_total_methods := v_oauth_count + (case when v_has_password then 1 else 0 end);
  v_can_unlink := v_total_methods > 1;

  return jsonb_build_object(
    'identities', v_identities,
    'hasPassword', v_has_password,
    'canUnlink', v_can_unlink,
    'totalMethods', v_total_methods
  );
end;
$$;

grant execute on function public.get_user_identities(uuid) to authenticated;

-- 4.3 RPC: unlink_user_identity (DELETE /me/identities/:provider) - AC-05
create or replace function public.unlink_user_identity(p_user_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_info jsonb;
  v_can_unlink boolean;
  v_deleted_count int;
  v_provider text := lower(trim(coalesce(p_provider, '')));
begin
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Chặn huỷ phương thức email/mật khẩu
  if v_provider = 'email' then
    raise exception 'INVALID_OPERATION: Không thể huỷ phương thức email/mật khẩu qua API này.'
      using errcode = '22023';
  end if;

  v_info := public.get_user_identities(p_user_id);
  v_can_unlink := (v_info->>'canUnlink')::boolean;

  -- AC-05: Từ chối nếu là phương thức cuối cùng
  if not v_can_unlink then
    raise exception 'LAST_LOGIN_METHOD: Không thể huỷ phương thức đăng nhập cuối cùng. Vui lòng thêm mật khẩu hoặc liên kết phương thức khác trước khi huỷ.'
      using errcode = '23514';
  end if;

  delete from auth.identities
  where user_id = p_user_id and provider = v_provider;
  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    raise exception 'NOT_FOUND: Phương thức đăng nhập không tồn tại trên tài khoản.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object('success', true, 'unlinkedProvider', v_provider);
end;
$$;

grant execute on function public.unlink_user_identity(uuid, text) to authenticated;

-- 4.4 RPC: link_user_identity (POST /me/identities/link)
create or replace function public.link_user_identity(
  p_user_id uuid,
  p_provider text,
  p_provider_id text,
  p_identity_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_new_id uuid;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- R-23: kiểm tra xem tài khoản MXH đã thuộc về user khác chưa
  if exists (
    select 1 from auth.identities
    where provider = p_provider and provider_id = p_provider_id and user_id <> p_user_id
  ) then
    raise exception 'IDENTITY_ALREADY_LINKED: Tài khoản mạng xã hội này đã được liên kết với một người dùng khác.'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from auth.identities
    where provider = p_provider and user_id = p_user_id
  ) then
    raise exception 'IDENTITY_ALREADY_LINKED: Tài khoản của bạn đã liên kết với phương thức này.'
      using errcode = '23505';
  end if;

  perform set_config('app.allow_identity_link', 'true', true);

  insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
  values (gen_random_uuid(), p_provider, p_provider_id, p_user_id, p_identity_data, now(), now())
  returning id into v_new_id;

  return jsonb_build_object('success', true, 'identityId', v_new_id, 'provider', p_provider);
end;
$$;

grant execute on function public.link_user_identity(uuid, text, text, jsonb) to authenticated;

-- 4.5 RPC: mark_password_set (R-22)
create or replace function public.mark_password_set(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = p_user_id;

  if not exists (select 1 from auth.identities where user_id = p_user_id and provider = 'email') then
    perform set_config('app.allow_identity_link', 'true', true);
    insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at)
    values (
      gen_random_uuid(),
      'email',
      p_user_id::text,
      p_user_id,
      jsonb_build_object('sub', p_user_id, 'email', v_email),
      now(),
      now()
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.mark_password_set(uuid) to authenticated;
