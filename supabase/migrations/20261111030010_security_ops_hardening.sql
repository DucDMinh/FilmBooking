-- Layer 3 / task 01 (follow-up review layer 2): siết bảo mật & vận hành.
-- Chỉ CREATE OR REPLACE hàm (giữ nguyên quyền execute), thêm index + hàm purge + 1 cron job.
-- Không DROP bảng/cột, không đổi kiểu, không backfill -> KHÔNG phải HIGH_RISK_MIGRATION.
-- (Purge ở mục 3 XOÁ dữ liệu quá hạn theo lịch — đó là hành vi vận hành chủ đích, không phải thao tác migration.)

-- ============================================================================
-- 1. is_disposable_email: khớp cả subdomain và dùng index
-- Lấy phần sau '@' CUỐI, sinh mọi hậu tố theo nhãn ('a.b.mailinator.com' -> 'b.mailinator.com',
-- 'mailinator.com', 'com') rồi tra bằng index biểu thức lower(domain::text).
-- Chặn cả "x@mail.mailinator.com", không chặn "x@notmailinator.com" (hậu tố theo ranh giới nhãn).
-- ============================================================================
create index disposable_email_domains_lower_idx on public.disposable_email_domains (lower(domain::text));

create or replace function public.is_disposable_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with host as (
    select string_to_array(lower(btrim(substring(btrim(p_email) from '[^@]*$'), '.')), '.') as labels
     where position('@' in btrim(p_email)) > 0
  )
  select exists (
    select 1
      from host h
      cross join lateral generate_series(1, cardinality(h.labels)) i
      join public.disposable_email_domains d
        on lower(d.domain::text) = array_to_string(h.labels[i:cardinality(h.labels)], '.')
  );
$$;

-- ============================================================================
-- 2. hit_rate_limit: validate tham số (lỗi rõ thay vì so sánh NULL im lặng)
-- ============================================================================
create or replace function public.hit_rate_limit(p_key text, p_window interval, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_key is null or length(btrim(p_key)) = 0 then
    raise exception 'hit_rate_limit: p_key không được rỗng' using errcode = '22023';
  end if;
  if p_window is null or p_window <= interval '0' then
    raise exception 'hit_rate_limit: p_window phải là khoảng thời gian dương' using errcode = '22023';
  end if;
  if p_max is null or p_max <= 0 then
    raise exception 'hit_rate_limit: p_max phải > 0' using errcode = '22023';
  end if;

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
-- 3. Purge định kỳ dữ liệu vận hành quá hạn (chống phình bảng)
--   rate_limit_buckets : cửa sổ bắt đầu > 1 ngày trước (cửa sổ dùng hiện tại <= vài giờ).
--   login_attempts     : không còn khoá hiệu lực và lần sai cuối > 1 ngày (bộ đếm reset sau 1 ngày yên).
--   pos_api_logs       : nhật ký gọi API POS > 90 ngày.
-- Chạy bằng pg_cron (quyền postgres); client không gọi được.
-- ============================================================================
create function public.purge_expired_ops_data()
returns table (rate_limit_buckets integer, login_attempts integer, pos_api_logs integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buckets integer;
  v_logins  integer;
  v_logs    integer;
begin
  delete from public.rate_limit_buckets b where b.window_start < now() - interval '1 day';
  get diagnostics v_buckets = row_count;

  delete from public.login_attempts la
   where (la.locked_until is null or la.locked_until < now())
     and coalesce(la.last_failed_at, '-infinity'::timestamptz) < now() - interval '1 day';
  get diagnostics v_logins = row_count;

  delete from public.pos_api_logs l where l.occurred_at < now() - interval '90 days';
  get diagnostics v_logs = row_count;

  return query select v_buckets, v_logins, v_logs;
end;
$$;
revoke all on function public.purge_expired_ops_data() from public, anon, authenticated;

select cron.schedule('purge-expired-ops-data', '17 3 * * *', $$select public.purge_expired_ops_data()$$);
