-- ============================================================================
-- Migration: 20261112170000_identity_link_intent.sql
-- Bug layer34-review · phase-2-task-07: link-intent cho liên kết MXH thủ công (F-2, M-05)
-- Requirements: R-20, R-21, R-23, AC-04, NFR-17, M-05
-- Quyết định user: TTL link-intent 10 phút; kiểm tra re-auth ở API layer.
-- ============================================================================

-- 1. Bảng public.identity_link_intents
create table if not exists public.identity_link_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index tra cứu nhanh intent chưa tiêu thụ của user và provider
create index if not exists identity_link_intents_user_provider_idx
  on public.identity_link_intents (user_id, provider)
  where consumed_at is null;

-- RLS: Bật RLS và khoá chặt, chỉ service_role (API tin cậy) được thao tác
alter table public.identity_link_intents enable row level security;
revoke all on public.identity_link_intents from public, anon, authenticated;
grant select, insert, update, delete on public.identity_link_intents to service_role;

-- 2. Cập nhật trigger public.guard_identity_insert()
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

  -- 2. Kiểm tra nếu NEW.user_id đã là user tồn tại trong hệ thống (đã có identity nào đó trong auth.identities)
  -- Bao gồm cả user mật khẩu (AC-04) và user OAuth-only (M-05).
  -- GoTrue cố gộp (auto-merge) hoặc người dùng liên kết thủ công:
  -- BẮT BUỘC phải có link-intent hợp lệ còn hạn và chưa dùng.
  if exists (
    select 1 from auth.identities
    where user_id = NEW.user_id
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
      -- Không có intent hợp lệ (không có intent, hết hạn, đã dùng, sai provider) -> chặn auto-merge!
      raise exception 'OAUTH_AUTO_MERGE_BLOCKED: Email nay da co tai khoan mat khau — hay dang nhap de lien ket.'
        using errcode = '23514';
    end if;
  end if;

  -- 3. Với user mới đăng ký lần đầu qua OAuth (chưa có identity nào trong auth.identities):
  -- Kiểm tra va chạm email với user khác đã tồn tại trong auth.users (AC-04)
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
