-- Layer 2 / task 02: bảo mật & vận hành (R-08, R-09, R-10, R-11, R-86, R-109, R-111, R-130; AC-03).
-- Chỉ tạo bảng/hàm mới + 1 cron job + seed; KHÔNG DROP / đổi kiểu / backfill -> không HIGH_RISK_MIGRATION.
-- Mọi bảng bật RLS và KHÔNG cấp quyền cho anon/authenticated: chỉ service_role (Nest) truy cập;
-- Admin xem qua API Nest. Hàm SECURITY DEFINER chỉ cấp execute cho service_role.

-- ============================================================================
-- 1. login_attempts + register_login_failure / clear (R-11): 5 lần sai liên tiếp -> khoá 15 phút
-- ============================================================================
create table public.login_attempts (
  email          extensions.citext primary key,
  failed_count   integer not null default 0 check (failed_count >= 0),
  last_failed_at timestamptz,
  locked_until   timestamptz
);

-- Trả trạng thái khoá sau lần sai này. Khoá còn hạn thì không gia hạn thêm (không bị kéo dài vô hạn).
-- Khoá đã hết hạn -> đếm lại từ 1. Upsert 1 câu lệnh = khoá dòng, an toàn khi đồng thời.
create function public.register_login_failure(p_email text)
returns table (is_locked boolean, locked_until timestamptz, failed_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.login_attempts;
  -- search_path rỗng làm toán tử citext (schema extensions) không hiển thị -> "=" rơi về text phân biệt
  -- hoa thường; nên chuẩn hoá lower() ở mọi hàm.
  v_email text := lower(btrim(p_email));
begin
  insert into public.login_attempts as la (email, failed_count, last_failed_at)
  values (v_email, 1, now())
  on conflict (email) do update set
    failed_count   = case
      when la.locked_until is not null and la.locked_until > now() then la.failed_count
      when la.locked_until is not null then 1
      else la.failed_count + 1 end,
    last_failed_at = case
      when la.locked_until is not null and la.locked_until > now() then la.last_failed_at
      else now() end,
    locked_until   = case
      when la.locked_until is not null and la.locked_until > now() then la.locked_until
      else null end
  returning * into v_row;

  if v_row.locked_until is null and v_row.failed_count >= 5 then
    update public.login_attempts la set locked_until = now() + interval '15 minutes'
    where la.email = v_email returning * into v_row;
  end if;

  return query select (v_row.locked_until is not null and v_row.locked_until > now()),
                      v_row.locked_until, v_row.failed_count;
end;
$$;

create function public.is_login_locked(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select la.locked_until > now() from public.login_attempts la where la.email = lower(btrim(p_email))),
    false);
$$;

create function public.clear_login_failures(p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_attempts la where la.email = lower(btrim(p_email));
$$;

-- ============================================================================
-- 2. rate_limit_buckets + hit_rate_limit (R-08): cửa sổ cố định, nguyên tử bằng upsert (khoá dòng)
-- ============================================================================
create table public.rate_limit_buckets (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0 check (hits >= 0)
);

-- true = được phép (đã tính lượt này); false = vượt ngưỡng trong cửa sổ.
-- ON CONFLICT DO UPDATE khoá dòng -> 2 transaction đồng thời xếp hàng, tổng không vượt p_max.
create function public.hit_rate_limit(p_key text, p_window interval, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limit_buckets as b (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when b.window_start + p_window <= now() then now() else b.window_start end,
    hits         = case when b.window_start + p_window <= now() then 1 else b.hits + 1 end
  returning b.hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- ============================================================================
-- 3. disposable_email_domains (R-09): cập nhật được bằng INSERT/DELETE, không sửa code
-- ============================================================================
create table public.disposable_email_domains (
  domain     extensions.citext primary key,
  created_at timestamptz not null default now()
);

insert into public.disposable_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('sharklasers.com'), ('10minutemail.com'), ('10minutemail.net'), ('tempmail.com'),
  ('temp-mail.org'), ('temp-mail.io'), ('throwawaymail.com'), ('yopmail.com'), ('yopmail.net'),
  ('getnada.com'), ('trashmail.com'), ('trashmail.net'), ('dispostable.com'), ('maildrop.cc'),
  ('fakeinbox.com'), ('mailnesia.com'), ('mintemail.com'), ('mohmal.com'), ('emailondeck.com'),
  ('tempail.com'), ('burnermail.io'), ('mytemp.email'), ('moakt.com'), ('spamgourmet.com'),
  ('mailcatch.com'), ('inboxkitten.com'), ('tempr.email'), ('discard.email'), ('33mail.com'),
  ('anonbox.net'), ('mail.tm'), ('tmpmail.org'), ('tmpmail.net'), ('mailsac.com'),
  ('guerrillamailblock.com'), ('spam4.me'), ('grr.la'), ('harakirimail.com'), ('tempinbox.com'),
  ('dropmail.me'), ('emailfake.com'), ('fakemail.net'), ('luxusmail.org'), ('nowmymail.com'),
  ('byom.de'), ('trbvm.com')
on conflict do nothing;

-- Chuẩn hoá lower() hai phía (xem ghi chú search_path ở register_login_failure).
create function public.is_disposable_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.disposable_email_domains d
    where lower(d.domain::text) = lower(split_part(btrim(p_email), '@', 2)));
$$;

-- ============================================================================
-- 4. email_outbox (R-86, R-109): hàng đợi email giao dịch, job Nest gửi + retry
-- ============================================================================
create type public.outbox_status as enum ('PENDING', 'SENT', 'FAILED');

create table public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  to_email        text not null,
  payload         jsonb not null default '{}'::jsonb,
  cinema_id       uuid references public.cinemas (id) on delete set null,
  status          public.outbox_status not null default 'PENDING',
  attempts        integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status = 'PENDING';
create index email_outbox_cinema_id_idx on public.email_outbox (cinema_id);

-- ============================================================================
-- 5. pos_api_keys + pos_api_logs (R-111, R-130): chỉ lưu hash; key gốc hiện 1 lần lúc tạo
-- ============================================================================
create table public.pos_api_keys (
  id         uuid primary key default gen_random_uuid(),
  cinema_id  uuid not null references public.cinemas (id) on delete cascade,
  key_hash   text not null unique,
  prefix     text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index pos_api_keys_cinema_id_idx on public.pos_api_keys (cinema_id);

create table public.pos_api_logs (
  id          bigint generated always as identity primary key,
  key_id      uuid references public.pos_api_keys (id) on delete set null,
  cinema_id   uuid references public.cinemas (id) on delete set null,
  occurred_at timestamptz not null default now(),
  method      text not null,
  path        text not null,
  status_code integer,
  request_id  text
);
create index pos_api_logs_cinema_time_idx on public.pos_api_logs (cinema_id, occurred_at desc);
create index pos_api_logs_key_id_idx on public.pos_api_logs (key_id);

-- ============================================================================
-- 6. Xoá tài khoản chưa xác nhận > 7 ngày (R-10), trừ Facebook (quyết định #14)
-- ============================================================================
create function public.delete_unconfirmed_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from auth.users u
  where u.email_confirmed_at is null
    and u.created_at < now() - interval '7 days'
    and not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'facebook');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

select cron.schedule('delete-unconfirmed-users', '0 * * * *', $$select public.delete_unconfirmed_users()$$);

-- ============================================================================
-- 7. Hook before_user_created (review layer-0 F3; bảo vệ R-03 / R-07 / R-09)
-- GoTrue gọi trước khi tạo user. Chỉ cho: (a) user do Nest tạo qua Admin API kèm
-- app_metadata.created_via = 'nest'; (b) OAuth Google/Facebook. Còn lại (signup email/password
-- gọi thẳng GoTrue bằng anon key) bị từ chối để không bỏ qua Turnstile / consent / blocklist.
-- ============================================================================
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(event -> 'user' -> 'app_metadata', '{}'::jsonb);
  v_provider text  := v_meta ->> 'provider';
begin
  if v_meta ->> 'created_via' = 'nest' or v_provider in ('google', 'facebook') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Đăng ký trực tiếp không được hỗ trợ. Vui lòng đăng ký qua ứng dụng.'));
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ============================================================================
-- 8. RLS + quyền: bật RLS, không policy, thu hồi mọi quyền client; chỉ service_role dùng hàm/bảng
-- ============================================================================
alter table public.login_attempts           enable row level security;
alter table public.rate_limit_buckets       enable row level security;
alter table public.disposable_email_domains enable row level security;
alter table public.email_outbox             enable row level security;
alter table public.pos_api_keys             enable row level security;
alter table public.pos_api_logs             enable row level security;

revoke all on public.login_attempts, public.rate_limit_buckets, public.disposable_email_domains,
  public.email_outbox, public.pos_api_keys, public.pos_api_logs from anon, authenticated;
revoke all on sequence public.pos_api_logs_id_seq from anon, authenticated;

revoke all on function public.register_login_failure(text), public.is_login_locked(text),
  public.clear_login_failures(text), public.hit_rate_limit(text, interval, integer),
  public.is_disposable_email(text), public.delete_unconfirmed_users() from public, anon, authenticated;
grant execute on function public.register_login_failure(text), public.is_login_locked(text),
  public.clear_login_failures(text), public.hit_rate_limit(text, interval, integer),
  public.is_disposable_email(text) to service_role;
