-- ============================================================================
-- Migration: 20261112050000_identity_rpc_hardening.sql
-- bug-layer34-review K1 + K3 (independent-review-layer-3-4)
--
-- Vấn đề: 20261111040500_identity_hooks.sql tạo các RPC SECURITY DEFINER thao tác
-- trên auth.identities nhưng (a) Supabase mặc định cấp EXECUTE cho anon/authenticated
-- trên hàm mới ở schema public, (b) kiểm quyền bỏ qua khi auth.uid() null
-- (`auth.uid() is not null and ...`) -> anon gọi qua PostgREST /rpc chiếm/gỡ identity
-- của bất kỳ user nào. check_oauth_collision cấp cho anon -> oracle dò email (R-12).
--
-- Cách gọi thực tế: API (identity.service.ts) luôn gọi bằng supabase.admin()
-- (service_role) và truyền p_user_id = user từ JWT đã xác thực. Vì vậy:
--   1. Chỉ service_role được EXECUTE (anon/authenticated/public bị revoke).
--   2. Thân hàm fail-closed: nếu auth.uid() null thì BẮT BUỘC auth.role() =
--      'service_role'; nếu có auth.uid() thì chỉ được thao tác trên chính mình.
--      Bỏ nhánh is_admin() (không có luồng nào cần admin sửa identity người khác).
-- Migration additive: không sửa migration đã apply; CREATE OR REPLACE giữ nguyên
-- chữ ký + set search_path (SECURITY DEFINER an toàn: public, auth, pg_temp).
-- ============================================================================

-- 1. Guard dùng chung (nội bộ, không expose)
create or replace function public.assert_identity_rpc_caller(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    -- Không có danh tính end-user: chỉ chấp nhận service_role (API tin cậy).
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  elsif p_user_id is null or auth.uid() <> p_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_identity_rpc_caller(uuid) from public, anon, authenticated;

-- 2. get_user_identities
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
  perform public.assert_identity_rpc_caller(p_user_id);

  select (
    exists (select 1 from auth.identities where user_id = p_user_id and provider = 'email')
    or exists (select 1 from auth.users where id = p_user_id and encrypted_password is not null and encrypted_password <> '')
  ) into v_has_password;

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

-- 3. unlink_user_identity
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
  perform public.assert_identity_rpc_caller(p_user_id);

  if v_provider = 'email' then
    raise exception 'INVALID_OPERATION: Không thể huỷ phương thức email/mật khẩu qua API này.'
      using errcode = '22023';
  end if;

  v_info := public.get_user_identities(p_user_id);
  v_can_unlink := (v_info->>'canUnlink')::boolean;

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

-- 4. link_user_identity
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
  perform public.assert_identity_rpc_caller(p_user_id);

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

-- 5. mark_password_set
create or replace function public.mark_password_set(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
begin
  perform public.assert_identity_rpc_caller(p_user_id);

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

-- 6. check_oauth_collision: thân hàm giữ nguyên hành vi R-12/AC-04; chỉ thu hẹp quyền gọi.
--    (Hàm trả CONFLICT_EMAIL cho email có tài khoản => KHÔNG được để anon/authenticated gọi.)

-- 7. Quyền: revoke mọi role client, chỉ service_role.
revoke all on function public.get_user_identities(uuid) from public, anon, authenticated;
revoke all on function public.unlink_user_identity(uuid, text) from public, anon, authenticated;
revoke all on function public.link_user_identity(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_password_set(uuid) from public, anon, authenticated;
revoke all on function public.check_oauth_collision(text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.get_user_identities(uuid) to service_role;
grant execute on function public.unlink_user_identity(uuid, text) to service_role;
grant execute on function public.link_user_identity(uuid, text, text, jsonb) to service_role;
grant execute on function public.mark_password_set(uuid) to service_role;
grant execute on function public.check_oauth_collision(text, text, text, uuid) to service_role;
