-- ============================================================================
-- Migration: 20261118110000_cinema_status_schedule_fixes.sql
-- HIGH_RISK_MIGRATION — feature cinema-status-notice phase-1 task-01, sửa theo review round 1.
-- Không destructive về dữ liệu: chỉ create or replace 2 hàm + đổi quyền INSERT cột của `authenticated`.
-- Rollback: create or replace 2 hàm về bản 20261118100000; `revoke insert (...)`/`grant insert on public.cinemas
--   to authenticated` (table-level như core_identity_chain).
--
--   F1 (deadlock): schedule_cinema_status + apply_due_cinema_status_changes khoá dòng rạp bằng
--      `FOR NO KEY UPDATE` thay vì `FOR UPDATE`. `FOR UPDATE` xung đột với `FOR KEY SHARE` mà FK
--      `cinema_id` lấy khi hold_seats/confirm_paid/... insert orders/payments/tickets/email_outbox
--      (các luồng này đã giữ `showtimes FOR SHARE` TRƯỚC): job giữ rạp chờ showtimes, hold_seats giữ
--      showtimes chờ rạp -> 40P01. `NO KEY UPDATE` vẫn loại trừ nhau giữa schedule <-> job <-> schedule
--      (cái cần tuần tự hoá) nhưng KHÔNG chặn KEY SHARE nên không có chu trình chờ.
--      Thứ tự khoá của job: cinemas (no key update) -> showtimes -> orders -> seat_states; cancel_showtimes_core
--      không khoá lại hàng rạp. Các luồng bán vé chỉ lấy KEY SHARE trên rạp (qua FK), không bao giờ chờ rạp.
--   F3: INSERT trên cinemas của authenticated chuyển sang column-level, bỏ scheduled_status/scheduled_effective_at
--      (Admin không tạo rạp có sẵn lịch để lách quy tắc báo trước 7 ngày). `status` giữ để tạo rạp COMING_SOON.
--   F4: schedule_cinema_status kiểm quyền Admin TRƯỚC khi khoá/đọc dòng rạp (người không quyền không dò được
--      mã rạp tồn tại; 42501 đi trước P0002).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- F3. INSERT theo cột (mọi cột client được ghi khi tạo rạp, trừ scheduled_*)
-- ---------------------------------------------------------------------------
revoke insert on public.cinemas from authenticated;
grant insert (
  id, code, name, province_id, district, address, latitude, longitude, hotline, email,
  opening_hours, image_url, amenities, status, cleaning_minutes, online_cutoff_minutes
) on public.cinemas to authenticated;

-- ---------------------------------------------------------------------------
-- F1 + F4. schedule_cinema_status
-- ---------------------------------------------------------------------------
create or replace function public.schedule_cinema_status(
  p_cinema_id uuid,
  p_status public.cinema_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_caller_admin boolean;
  v_cinema record;
  v_cancelling boolean;
  v_notice_target public.cinema_status;
  v_notice_effective_at timestamptz;
  v_new_effective_at timestamptz;
  v_emails integer;
begin
  -- F4: quyền TRƯỚC mọi truy cập dữ liệu rạp.
  v_is_caller_admin := (select auth.role()) = 'service_role'
    or public.is_admin()
    or (
      nullif(current_setting('request.jwt.claims', true), '') is null
      and session_user in ('postgres', 'supabase_admin')
    );

  if not v_is_caller_admin then
    raise exception 'FORBIDDEN_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_cinema_id is null or p_status is null then
    raise exception 'INVALID_ARGUMENTS: cinema_id và status là bắt buộc' using errcode = '22023';
  end if;

  -- F1: NO KEY UPDATE (không FOR UPDATE) để không chặn FOR KEY SHARE của FK cinema_id từ các luồng bán vé
  -- trong lúc enqueue email cho toàn bộ tài khoản; vẫn tuần tự hoá các lần hẹn/huỷ lịch của cùng rạp.
  select id, code, name, address, hotline, status, scheduled_status, scheduled_effective_at into v_cinema
  from public.cinemas
  where id = p_cinema_id
  for no key update;

  if not found then
    raise exception 'CINEMA_NOT_FOUND: Rạp không tồn tại' using errcode = 'P0002';
  end if;

  v_cancelling := p_status = v_cinema.status;

  if v_cancelling and v_cinema.scheduled_status is null then
    raise exception 'STATUS_UNCHANGED: Rạp đã ở trạng thái % và không có lịch đổi trạng thái đang chờ', p_status
      using errcode = '22023';
  end if;

  if v_cancelling then
    -- Huỷ lịch chờ: email đính chính mang thông tin lịch BỊ huỷ để khách hiểu mình được báo về cái gì.
    v_notice_target := v_cinema.scheduled_status;
    v_notice_effective_at := v_cinema.scheduled_effective_at;
    v_new_effective_at := null;

    update public.cinemas
    set scheduled_status = null,
        scheduled_effective_at = null
    where id = p_cinema_id;
  else
    v_notice_target := p_status;
    v_new_effective_at := now() + interval '7 days';
    v_notice_effective_at := v_new_effective_at;

    update public.cinemas
    set scheduled_status = p_status,
        scheduled_effective_at = v_new_effective_at
    where id = p_cinema_id;
  end if;

  -- Mỗi email 1 dòng (dedupe theo lower(email)); chỉ tài khoản đã xác nhận email, chưa xoá/khoá.
  with recipients as (
    select distinct on (lower(btrim(u.email)))
           btrim(u.email) as email,
           nullif(btrim(pr.full_name), '') as full_name
      from auth.users u
      left join public.profiles pr on pr.id = u.id
     where u.email_confirmed_at is not null
       and coalesce(btrim(u.email), '') <> ''
       and u.deleted_at is null
       and (u.banned_until is null or u.banned_until <= now())
     order by lower(btrim(u.email)), u.created_at
  ),
  inserted as (
    insert into public.email_outbox (kind, to_email, payload, cinema_id, status)
    select
      'CINEMA_STATUS_NOTICE',
      r.email,
      jsonb_build_object(
        'cinema_name', v_cinema.name,
        'cinema_code', v_cinema.code,
        'cinema_address', v_cinema.address,
        'hotline', v_cinema.hotline,
        'target_status', v_notice_target,
        'current_status', v_cinema.status,
        'effective_at', to_char(v_notice_effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'customer_name', r.full_name
      ) || case when v_cancelling then jsonb_build_object('schedule_cancelled', true) else '{}'::jsonb end,
      p_cinema_id,
      'PENDING'::public.outbox_status
    from recipients r
    returning 1
  )
  select count(*)::integer into v_emails from inserted;

  return jsonb_build_object(
    'success', true,
    'cinema_id', p_cinema_id,
    'status', v_cinema.status,
    'scheduled_status', case when v_cancelling then null else p_status end,
    'scheduled_effective_at', v_new_effective_at,
    'schedule_cancelled', v_cancelling,
    'emails_enqueued_count', v_emails
  );
end;
$$;

revoke all on function public.schedule_cinema_status(uuid, public.cinema_status) from public, anon;
grant execute on function public.schedule_cinema_status(uuid, public.cinema_status) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F1. apply_due_cinema_status_changes: FOR NO KEY UPDATE SKIP LOCKED
-- ---------------------------------------------------------------------------
create or replace function public.apply_due_cinema_status_changes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cinema record;
  v_showtime_ids uuid[];
  v_applied integer := 0;
  v_label text;
begin
  -- NO KEY UPDATE (không FOR UPDATE): xem ghi chú đầu file (F1). Thứ tự khoá: cinemas -> showtimes -> orders
  -- -> seat_states; hold_seats/confirm_paid giữ showtimes FOR SHARE rồi chỉ lấy KEY SHARE trên rạp (FK).
  for v_cinema in
    select id, name, scheduled_status
      from public.cinemas
     where scheduled_effective_at <= now()
     order by id
       for no key update skip locked
  loop
    begin
      update public.cinemas
         set status = v_cinema.scheduled_status,
             scheduled_status = null,
             scheduled_effective_at = null
       where id = v_cinema.id;

      -- Rạp không còn bán vé (TEMP_CLOSED / CLOSED / COMING_SOON): huỷ mọi suất tương lai còn lại.
      -- Khách đã được báo trước 7 ngày (hạn hoàn tiền = ngày hiệu lực) nên KHÔNG gửi email từng đơn.
      if v_cinema.scheduled_status <> 'OPEN' then
        select coalesce(array_agg(st.id order by st.id), '{}'::uuid[]) into v_showtime_ids
          from public.showtimes st
         where st.cinema_id = v_cinema.id
           and st.starts_at > now()
           and st.status <> 'CANCELLED';

        v_label := case v_cinema.scheduled_status
          when 'CLOSED' then 'đóng cửa'
          when 'TEMP_CLOSED' then 'tạm đóng cửa'
          else 'ngừng bán vé (sắp khai trương)'
        end;

        perform public.cancel_showtimes_core(
          v_showtime_ids,
          'Rạp ' || v_cinema.name || ' ' || v_label || ' theo lịch đã thông báo trước 7 ngày',
          null,
          false
        );
      end if;

      v_applied := v_applied + 1;
    exception when others then
      -- Sub-transaction đã rollback: rạp giữ nguyên trạng thái + lịch, thử lại phút sau; lỗi không chặn rạp khác.
      raise warning 'apply_due_cinema_status_changes: rạp % lỗi, giữ lịch để thử lại: %', v_cinema.id, sqlerrm;
    end;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.apply_due_cinema_status_changes() from public, anon, authenticated;
grant execute on function public.apply_due_cinema_status_changes() to service_role;
