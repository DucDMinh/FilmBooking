-- ============================================================================
-- 20261113180000_cron_http_jobs.sql
-- layer-6 task-02 (R-78, R-80): pg_cron + pg_net gọi Nest /jobs/*
--   * mỗi phút   -> POST {api_base_url}/jobs/send-emails   (email_outbox)
--   * mỗi 5 phút -> POST {api_base_url}/jobs/reconcile     (đối soát PayOS)
-- URL + secret đọc từ Supabase Vault lúc chạy (KHÔNG literal trong migration):
--   select vault.create_secret('<base url của API>', 'api_base_url');
--   select vault.create_secret('<JOB_SECRET>',       'job_secret');
-- Thiếu secret -> warning, bỏ qua lượt gọi (không raise, cron không crash).
-- Timeout 60s cho Render free cold start. Migration additive, không destructive.
-- ============================================================================

create or replace function public.call_nest_job(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret   text;
  v_request  bigint;
begin
  if p_path is null or p_path !~ '^/jobs/[a-z-]+$' then
    raise warning 'call_nest_job: path không hợp lệ';
    return null;
  end if;

  select decrypted_secret into v_base_url from vault.decrypted_secrets where name = 'api_base_url';
  select decrypted_secret into v_secret   from vault.decrypted_secrets where name = 'job_secret';

  if coalesce(v_base_url, '') = '' or coalesce(v_secret, '') = '' then
    raise warning 'call_nest_job(%): thiếu vault secret api_base_url/job_secret, bỏ qua', p_path;
    return null;
  end if;

  select net.http_post(
    url                  := rtrim(v_base_url, '/') || p_path,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-job-secret', v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
exception when others then
  raise warning 'call_nest_job(%) lỗi: %', p_path, sqlerrm;
  return null;
end;
$$;

revoke all on function public.call_nest_job(text) from public, anon, authenticated;
grant execute on function public.call_nest_job(text) to service_role;

-- Đối soát huỷ theo PAYMENT (không theo đơn): chỉ nhả ghế/huỷ đơn khi CHÍNH payment này còn PENDING,
-- là payment mới nhất của đơn và đơn còn pending_payment. Tránh giết link B mới khi A cũ bị huỷ (tạo lại link).
create or replace function public.cancel_stale_payment(p_payment_id uuid, p_reason text default 'CANCELLED')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order    public.orders;
  v_payment  public.payments;
begin
  select order_id into v_order_id from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('success', true, 'status', 'SKIPPED', 'reason', 'PAYMENT_NOT_FOUND');
  end if;

  -- Khoá đơn trước, payment sau (cùng thứ tự với mark_payment_cancelled) rồi mới kiểm lại điều kiện
  select * into v_order from public.orders where id = v_order_id for update;
  select * into v_payment from public.payments where id = p_payment_id for update;

  if v_payment.status <> 'PENDING' then
    return jsonb_build_object('success', true, 'status', 'SKIPPED', 'reason', 'PAYMENT_NOT_PENDING');
  end if;
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('success', true, 'status', 'SKIPPED', 'reason', 'ORDER_NOT_PENDING');
  end if;
  if exists (
    select 1 from public.payments np
     where np.order_id = v_order_id and np.id <> p_payment_id
       and (np.created_at, np.id) > (v_payment.created_at, v_payment.id)
  ) then
    return jsonb_build_object('success', true, 'status', 'SKIPPED', 'reason', 'NEWER_PAYMENT_EXISTS');
  end if;

  return public.mark_payment_cancelled(v_order_id, p_reason);
end;
$$;

revoke all on function public.cancel_stale_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_stale_payment(uuid, text) to service_role;

-- Idempotent: gỡ lịch cũ cùng tên rồi đặt lại
do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('job-send-emails', 'job-reconcile-payos');
end;
$$;

select cron.schedule('job-send-emails', '* * * * *', $$select public.call_nest_job('/jobs/send-emails')$$);
select cron.schedule('job-reconcile-payos', '*/5 * * * *', $$select public.call_nest_job('/jobs/reconcile')$$);
