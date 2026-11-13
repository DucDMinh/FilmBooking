-- ============================================================================
-- Migration: 20261113090000_identity_link_intent_hardening.sql
-- Bug layer34-review · phase-2-task-07 (fix round 1): M-1, M-2, M-3
-- Additive: không sửa 20261112170000 đã apply.
--   M-1: guard_identity_insert coi user có encrypted_password là "đã tồn tại" dù 0 identity
--   M-2: thông điệp 23514 trung tính (giữ tiền tố OAUTH_AUTO_MERGE_BLOCKED + errcode)
--   M-3: CHECK identity_link_intents.provider khớp linkIntentProviderSchema (google | facebook)
-- ============================================================================

-- M-3: tập provider khớp packages/shared/src/schemas/identity.ts (linkIntentProviderSchema)
alter table public.identity_link_intents
  add constraint identity_link_intents_provider_check
  check (provider in ('google', 'facebook'));

create or replace function public.guard_identity_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_oauth_email text;
  v_existing_user_id uuid;
  v_intent_id uuid;
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

  -- 2. NEW.user_id đã là user tồn tại: có identity nào đó (AC-04 user mật khẩu, M-05 user OAuth-only)
  -- HOẶC có encrypted_password (M-1: updateUserById xong nhưng mark_password_set lỗi -> 0 identity).
  -- Auto-merge của GoTrue hay liên kết thủ công đều BẮT BUỘC có link-intent hợp lệ, còn hạn, chưa dùng.
  if exists (
    select 1 from auth.identities
    where user_id = NEW.user_id
  ) or exists (
    select 1 from auth.users
    where id = NEW.user_id
      and encrypted_password is not null
      and encrypted_password <> ''
  ) then
    select id into v_intent_id
    from public.identity_link_intents
    where user_id = NEW.user_id
      and provider = NEW.provider
      and consumed_at is null
      and expires_at > now()
    order by created_at desc
    limit 1
    for update;

    if v_intent_id is not null then
      update public.identity_link_intents
      set consumed_at = now()
      where id = v_intent_id;

      return NEW;
    else
      -- Không có intent hợp lệ (không có, hết hạn, đã dùng, sai provider) -> chặn auto-merge.
      raise exception 'OAUTH_AUTO_MERGE_BLOCKED: Khong the tu dong gop tai khoan - can yeu cau lien ket tu phien da dang nhap.'
        using errcode = '23514';
    end if;
  end if;

  -- 3. User mới đăng ký lần đầu qua OAuth (chưa có identity, chưa có mật khẩu):
  -- kiểm tra va chạm email với user khác đã tồn tại trong auth.users (AC-04)
  v_oauth_email := lower(coalesce(NEW.identity_data->>'email', NEW.email));
  if v_oauth_email is not null and v_oauth_email <> '' then
    select id into v_existing_user_id
    from auth.users
    where lower(email) = v_oauth_email
      and id <> NEW.user_id
    limit 1;

    if v_existing_user_id is not null then
      raise exception 'OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED: Email nay da co tai khoan — hay dang nhap bang mat khau de lien ket.'
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.guard_identity_insert() from public, anon, authenticated;
