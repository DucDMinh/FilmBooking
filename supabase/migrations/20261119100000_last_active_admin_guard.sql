-- ============================================================================
-- Migration: 20261119100000_last_active_admin_guard.sql
-- bug admin-self-lock-last-admin-guard phase-1 task-01 (CR-004, GAP-010, R-105, NFR-06).
-- Không destructive: chỉ thêm 6 hàm + 5 trigger, KHÔNG đổi/xoá dữ liệu hiện có.
-- Rollback: drop trigger user_roles_last_admin_guard_delete / _update on public.user_roles;
--   drop trigger auth_users_last_admin_guard_update / _delete on auth.users;
--   drop trigger auth_identities_last_admin_guard_delete on auth.identities;
--   drop function public.is_last_active_admin(uuid), public.guard_last_active_admin(uuid),
--   public.trg_guard_last_admin_user_roles(), public.trg_guard_last_admin_auth_users(),
--   public.trg_guard_last_admin_identities(), public.auth_account_is_active(uuid, timestamptz, jsonb, timestamptz, timestamptz).
--
-- Hàng rào cuối ở tầng DB: chuỗi luôn còn >= 1 "Admin hoạt động" = có user_roles ADMIN, tài khoản không bị khoá/xoá mềm,
-- VÀ (đã xác nhận email HOẶC có identity facebook) -- đúng điều kiện loại trừ của cron delete_unconfirmed_users
-- (20261111020100_security_ops: chưa xác nhận email và không có identity facebook thì bị xoá sau 7 ngày). Trạng thái khoá user nằm ở auth.users (banned_until / raw_app_meta_data.locked, do API ghi qua
-- GoTrue) nên trigger gắn vào cả user_roles lẫn auth.users, bao phủ: gỡ role ADMIN, đổi role, khoá user,
-- xoá user (kể cả cascade). Mọi đường đi qua một advisory lock cấp giao dịch rồi mới đếm -> 2 request đồng
-- thời không cùng thấy "còn Admin kia".
-- Lỗi: SQLSTATE 'FB409' (LAST_ADMIN) để API map sang 409.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tài khoản còn hoạt động? Chưa xoá mềm, chưa hết hạn ban, không có cờ locked, và (đã xác nhận email HOẶC có
-- identity facebook). Tài khoản chưa xác nhận email và không có facebook không đăng nhập được và cron
-- delete_unconfirmed_users xoá sau 7 ngày -> không được tính là Admin. Điều kiện này CÙNG điều kiện cron.
-- Đổi chữ ký so với các bản trước (đã áp local) -> drop bản cũ (không hàm nào khác phụ thuộc).
-- ---------------------------------------------------------------------------
drop function if exists public.auth_account_is_active(timestamptz, jsonb, timestamptz);
drop function if exists public.auth_account_is_active(timestamptz, jsonb, timestamptz, timestamptz);
create or replace function public.auth_account_is_active(
  p_user_id uuid,
  p_banned_until timestamptz,
  p_app_metadata jsonb,
  p_deleted_at timestamptz,
  p_email_confirmed_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_deleted_at is null
     and (p_banned_until is null or p_banned_until <= now())
     and coalesce(p_app_metadata ->> 'locked', 'false') <> 'true'
     and (
       p_email_confirmed_at is not null
       or exists (select 1 from auth.identities i where i.user_id = p_user_id and i.provider = 'facebook')
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. Hàng rào: gọi TRƯỚC khi một Admin hoạt động sắp mất tư cách. Khoá toàn tập Admin rồi đếm lại
-- (mỗi câu lệnh trong plpgsql lấy snapshot mới sau khi chờ khoá -> thấy commit của giao dịch trước).
-- ---------------------------------------------------------------------------
create or replace function public.guard_last_active_admin(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('filmbooking.admin_set', 0));

  if not exists (
    select 1
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where ur.user_id = p_user_id and ur.role = 'ADMIN'
      and public.auth_account_is_active(u.id, u.banned_until, u.raw_app_meta_data, u.deleted_at, u.email_confirmed_at)
  ) then
    return; -- người này hiện không phải Admin hoạt động -> không làm giảm số Admin hoạt động
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where ur.user_id <> p_user_id and ur.role = 'ADMIN'
      and public.auth_account_is_active(u.id, u.banned_until, u.raw_app_meta_data, u.deleted_at, u.email_confirmed_at)
  ) then
    raise exception 'LAST_ADMIN: Không thể gỡ quyền, khoá hoặc xoá Admin hoạt động cuối cùng của chuỗi'
      using errcode = 'FB409';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tra cứu không khoá cho API (báo lỗi sớm, message rõ). Hàng rào thật vẫn là trigger.
-- ---------------------------------------------------------------------------
create or replace function public.is_last_active_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
      from public.user_roles ur
      join auth.users u on u.id = ur.user_id
      where ur.user_id = p_user_id and ur.role = 'ADMIN'
        and public.auth_account_is_active(u.id, u.banned_until, u.raw_app_meta_data, u.deleted_at, u.email_confirmed_at)
    )
    and not exists (
      select 1
      from public.user_roles ur
      join auth.users u on u.id = ur.user_id
      where ur.user_id <> p_user_id and ur.role = 'ADMIN'
        and public.auth_account_is_active(u.id, u.banned_until, u.raw_app_meta_data, u.deleted_at, u.email_confirmed_at)
    );
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger trên user_roles: xoá dòng ADMIN, hoặc đổi role/user của dòng ADMIN
-- ---------------------------------------------------------------------------
create or replace function public.trg_guard_last_admin_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'ADMIN'
     and (tg_op = 'DELETE' or new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
    perform public.guard_last_active_admin(old.user_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_last_admin_guard_delete on public.user_roles;
create trigger user_roles_last_admin_guard_delete
  before delete on public.user_roles
  for each row execute function public.trg_guard_last_admin_user_roles();
drop trigger if exists user_roles_last_admin_guard_update on public.user_roles;
create trigger user_roles_last_admin_guard_update
  before update of role, user_id on public.user_roles
  for each row execute function public.trg_guard_last_admin_user_roles();

-- ---------------------------------------------------------------------------
-- 5. Trigger trên auth.users: khoá (banned_until / app_metadata.locked), đánh dấu xoá mềm, xoá cứng.
-- Chỉ vào hàng rào khi tài khoản đang hoạt động và sắp thành không hoạt động -> cập nhật thường
-- (đăng nhập, đổi email...) không tốn khoá.
-- ---------------------------------------------------------------------------
create or replace function public.trg_guard_last_admin_auth_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_account_is_active(old.id, old.banned_until, old.raw_app_meta_data, old.deleted_at, old.email_confirmed_at)
     and (
       tg_op = 'DELETE'
       or not public.auth_account_is_active(old.id, new.banned_until, new.raw_app_meta_data, new.deleted_at, new.email_confirmed_at)
     ) then
    perform public.guard_last_active_admin(old.id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_users_last_admin_guard_update on auth.users;
create trigger auth_users_last_admin_guard_update
  before update of banned_until, raw_app_meta_data, deleted_at, email_confirmed_at on auth.users
  for each row execute function public.trg_guard_last_admin_auth_users();
drop trigger if exists auth_users_last_admin_guard_delete on auth.users;
create trigger auth_users_last_admin_guard_delete
  before delete on auth.users
  for each row execute function public.trg_guard_last_admin_auth_users();

-- ---------------------------------------------------------------------------
-- 5b. Trigger trên auth.identities: Admin chưa xác nhận email chỉ còn đăng nhập được nhờ identity facebook -> gỡ
-- liên kết facebook (xoá dòng identity) làm họ mất tư cách Admin hoạt động. User không còn trong auth.users
-- (xoá cascade) thì bỏ qua: trigger auth.users đã chặn trước đó.
-- ---------------------------------------------------------------------------
create or replace function public.trg_guard_last_admin_identities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.provider = 'facebook'
     and exists (select 1 from auth.users u where u.id = old.user_id and u.email_confirmed_at is null) then
    perform public.guard_last_active_admin(old.user_id);
  end if;
  return old;
end;
$$;

drop trigger if exists auth_identities_last_admin_guard_delete on auth.identities;
create trigger auth_identities_last_admin_guard_delete
  before delete on auth.identities
  for each row execute function public.trg_guard_last_admin_identities();

-- ---------------------------------------------------------------------------
-- 6. Quyền: hàm nội bộ không lộ qua PostgREST; API (service_role) chỉ gọi is_last_active_admin.
-- ---------------------------------------------------------------------------
revoke all on function public.auth_account_is_active(uuid, timestamptz, jsonb, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.guard_last_active_admin(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_last_active_admin(uuid) from public, anon, authenticated;
revoke all on function public.trg_guard_last_admin_user_roles() from public, anon, authenticated, service_role;
revoke all on function public.trg_guard_last_admin_auth_users() from public, anon, authenticated, service_role;
revoke all on function public.trg_guard_last_admin_identities() from public, anon, authenticated, service_role;
grant execute on function public.is_last_active_admin(uuid) to service_role;
