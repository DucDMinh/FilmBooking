-- ============================================================================
-- Migration: 20261118100000_cinema_status_schedule.sql
-- HIGH_RISK_MIGRATION — feature cinema-status-notice phase-1 task-01 (R-33, R-136, AC-26, AC-27)
-- Rủi ro (đã đánh dấu): đổi quyền cột `cinemas` của role authenticated (thu UPDATE status/scheduled_*),
--   DROP FUNCTION set_cinema_status, job pg_cron tự huỷ suất + đơn hàng loạt khi tới hạn.
-- Không destructive về dữ liệu: chỉ ADD 2 cột nullable (không backfill), không đổi/xoá dòng nào.
-- Rollback: drop job + 2 hàm mới + cancel_showtimes_core, khôi phục cancel_showtimes bản 20261114000000,
--   khôi phục set_cinema_status bản 20261112160000, `grant update on public.cinemas to authenticated`,
--   drop 2 cột scheduled_*.
--
-- Nội dung:
--   1. Cột cinemas.scheduled_status / scheduled_effective_at (+ check cùng null / cùng có).
--   2. Thu quyền: authenticated không UPDATE được status & scheduled_* (chỉ RPC definer / service_role / job).
--   3. Tách thân cancel_showtimes thành cancel_showtimes_core(…, p_send_emails) — cancel_showtimes công khai
--      giữ nguyên hành vi (gọi core với p_send_emails = true).
--   4. RPC schedule_cinema_status (Admin): hẹn lịch +7 ngày + xếp hàng email CINEMA_STATUS_NOTICE cho mọi
--      tài khoản đã xác nhận email; cùng trạng thái hiện tại + đang có lịch = huỷ lịch (email đính chính).
--   5. Gỡ set_cinema_status (đổi tức thì).
--   6. apply_due_cinema_status_changes(): job nội bộ, tới hạn -> đổi status, xoá lịch, đích != OPEN -> huỷ
--      suất tương lai (đơn paid -> affected, KHÔNG gửi email từng đơn).
--   7. pg_cron apply-cinema-status-changes mỗi phút (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cột lịch đổi trạng thái
-- ---------------------------------------------------------------------------
alter table public.cinemas
  add column scheduled_status       public.cinema_status,
  add column scheduled_effective_at timestamptz,
  add constraint cinemas_scheduled_pair_check
    check ((scheduled_status is null) = (scheduled_effective_at is null));

-- Job tìm rạp tới hạn: chỉ vài dòng có lịch nên dùng partial index.
create index cinemas_scheduled_due_idx on public.cinemas (scheduled_effective_at)
  where scheduled_effective_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Quyền cột. SELECT: grant bảng đã có sẵn -> cột mới đọc được (anon/authenticated, banner trang rạp);
--    ghi tường minh để hợp đồng rõ ràng. UPDATE: chuyển table-level -> column-level, BỎ status + scheduled_*.
--    Danh sách cột = mọi cột thông tin rạp Manager/Admin sửa được trước đây (trừ id/created_at/updated_at:
--    updated_at do trigger set_updated_at gán, không cần quyền cột).
-- ---------------------------------------------------------------------------
grant select (scheduled_status, scheduled_effective_at) on public.cinemas to anon, authenticated;

revoke update on public.cinemas from authenticated;
grant update (
  code, name, province_id, district, address, latitude, longitude, hotline, email,
  opening_hours, image_url, amenities, cleaning_minutes, online_cutoff_minutes
) on public.cinemas to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tách logic huỷ suất: cancel_showtimes_core (nội bộ) + cancel_showtimes (công khai, hành vi cũ)
--    Thân core = thân cancel_showtimes bản 20261114000000 từ mục 5.1 trở đi; p_send_emails = false bỏ
--    bước đồng bộ cờ + enqueue email từng đơn (dùng cho job đóng rạp: khách đã được báo trước 7 ngày).
-- ---------------------------------------------------------------------------
create or replace function public.cancel_showtimes_core(
  p_showtime_ids uuid[],
  p_reason text,
  p_actor_id uuid,
  p_send_emails boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_st_count integer := 0;
  v_cancelled_holds integer := 0;
  v_affected_paid integer := 0;
  v_cancelled_orders integer := 0;
  v_emails_enqueued integer := 0;
  v_ids uuid[];
begin
  -- 5.1 Khoá và đổi trạng thái các suất chiếu sang CANCELLED (bỏ qua suất đã CANCELLED)
  select coalesce(array_agg(s.id order by s.id), '{}'::uuid[]) into v_ids
  from (
    select st.id from public.showtimes st
    where st.id = any(p_showtime_ids) and st.status <> 'CANCELLED'
    order by st.id
    for update
  ) s;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object(
      'success', true,
      'cancelled_showtimes_count', 0,
      'affected_orders_count', 0,
      'cancelled_holds_count', 0,
      'cancelled_orders_count', 0,
      'emails_enqueued_count', 0
    );
  end if;

  update public.showtimes
  set status = 'CANCELLED',
      cancel_reason = p_reason,
      cancelled_at = now(),
      cancelled_by = p_actor_id,
      updated_at = now()
  where id = any(v_ids);
  get diagnostics v_st_count = row_count;

  -- 5.1b Khoá các đơn bị ảnh hưởng (id tăng dần) TRƯỚC khi xoá seat_states (thứ tự khoá toàn cục: showtimes -> orders -> seat_states)
  perform 1 from public.orders
  where showtime_id = any(v_ids)
    and status in ('holding', 'pending_payment', 'paid', 'checked_in')
  order by id
  for update;

  -- 5.2 Nhả toàn bộ ghế HELD trên các suất chiếu này (khoá dòng theo (showtime_id, seat_id))
  delete from public.showtime_seat_states
  where id in (select x.id from public.showtime_seat_states x
                where x.showtime_id = any(v_ids)
                  and x.state = 'HELD'
                order by x.showtime_id, x.seat_id
                  for update);
  get diagnostics v_cancelled_holds = row_count;

  -- 5.3 Huỷ các đơn holding và pending_payment
  perform 1 from public.orders
  where showtime_id = any(v_ids)
    and status in ('holding', 'pending_payment')
  order by id
  for update;

  update public.orders
  set status = 'cancelled',
      cancel_reason = p_reason,
      cancelled_at = coalesce(orders.cancelled_at, now()),
      updated_at = now()
  where showtime_id = any(v_ids)
    and status in ('holding', 'pending_payment');
  get diagnostics v_cancelled_orders = row_count;

  -- 5.4 Với các đơn paid và checked_in (cả WEB và POS) -> chuyển sang affected
  perform 1 from public.orders
  where showtime_id = any(v_ids)
    and status in ('paid', 'checked_in')
  order by id
  for update;

  update public.orders
  set status = 'affected',
      counter_contact = (channel = 'POS' and (contact_email is null or length(btrim(contact_email::text)) = 0)),
      cancel_reason = p_reason,
      cancelled_at = coalesce(orders.cancelled_at, now()),
      updated_at = now()
  where showtime_id = any(v_ids)
    and status in ('paid', 'checked_in');
  get diagnostics v_affected_paid = row_count;

  -- 5.5 Tạo bản ghi trong affected_order_cases
  insert into public.affected_order_cases (
    order_id,
    showtime_id,
    cinema_id,
    reason,
    counter_contact,
    email_sent
  )
  select
    o.id,
    o.showtime_id,
    o.cinema_id,
    p_reason,
    (o.channel = 'POS' and (o.contact_email is null or length(btrim(o.contact_email::text)) = 0)),
    false
  from public.orders o
  where o.showtime_id = any(v_ids)
    and o.status = 'affected'
  on conflict (order_id) do update
    set reason = excluded.reason,
        counter_contact = excluded.counter_contact;

  if p_send_emails then
    -- 5.6 Đồng bộ cờ email_sent nếu outbox đã có sẵn email cho đơn đó (chống out-of-sync)
    update public.affected_order_cases aoc
    set email_sent = true
    where aoc.showtime_id = any(v_ids)
      and aoc.email_sent = false
      and exists (
        select 1 from public.email_outbox eo
        where eo.kind = 'showtime_cancelled'
          and eo.payload->>'order_id' = aoc.order_id::text
      );

    -- Enqueue email IDEMPOTENT cho các đơn chưa gửi email
    with inserted_emails as (
      insert into public.email_outbox (
        kind,
        to_email,
        payload,
        cinema_id,
        status
      )
      select
        'showtime_cancelled',
        btrim(o.contact_email::text),
        jsonb_build_object(
          'order_id', o.id,
          'booking_code', o.booking_code,
          'cinema_id', o.cinema_id,
          'cinema_name', o.cinema_name,
          'movie_title', o.movie_title,
          'room_name', o.room_name,
          'showtime_starts_at', o.showtime_starts_at,
          'reason', p_reason,
          'template', 'showtime_cancelled'
        ),
        o.cinema_id,
        'PENDING'::public.outbox_status
      from public.orders o
      join public.affected_order_cases aoc on aoc.order_id = o.id
      where o.showtime_id = any(v_ids)
        and o.status = 'affected'
        and aoc.email_sent = false
        and o.contact_email is not null
        and length(btrim(o.contact_email::text)) > 0
        and not exists (
          select 1 from public.email_outbox eo
          where eo.kind = 'showtime_cancelled'
            and eo.payload->>'order_id' = o.id::text
        )
      returning id, (payload->>'order_id')::uuid as order_id
    ),
    mark_sent as (
      update public.affected_order_cases aoc
      set email_sent = true
      from inserted_emails ie
      where aoc.order_id = ie.order_id
      returning aoc.id
    )
    select count(*) into v_emails_enqueued from inserted_emails;
  end if;

  -- 5.7 Cập nhật tickets status nếu bảng tickets có cột status
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'status'
  ) then
    execute 'update public.tickets set status = ''cancelled'' where showtime_id = any($1)' using v_ids;
  end if;

  return jsonb_build_object(
    'success', true,
    'cancelled_showtimes_count', v_st_count,
    'affected_orders_count', v_affected_paid,
    'cancelled_holds_count', v_cancelled_holds,
    'cancelled_orders_count', v_cancelled_orders,
    'emails_enqueued_count', v_emails_enqueued
  );
end;
$function$;

-- Nội bộ: chỉ hàm SECURITY DEFINER cùng owner gọi (cancel_showtimes, apply_due_cinema_status_changes).
revoke all on function public.cancel_showtimes_core(uuid[], text, uuid, boolean) from public, anon, authenticated, service_role;

-- cancel_showtimes công khai: giữ nguyên chữ ký, kiểm tra quyền, hành vi (kể cả email từng đơn) như 20261114000000.
create or replace function public.cancel_showtimes(
  p_showtime_ids uuid[],
  p_reason text,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_caller_admin boolean;
  v_actor_id uuid;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'CANCEL_REASON_REQUIRED: Lý do huỷ suất không được để trống' using errcode = 'P0001';
  end if;

  if p_showtime_ids is null or cardinality(p_showtime_ids) = 0 then
    return jsonb_build_object(
      'success', true,
      'cancelled_showtimes_count', 0,
      'affected_orders_count', 0,
      'cancelled_holds_count', 0,
      'cancelled_orders_count', 0,
      'emails_enqueued_count', 0
    );
  end if;

  -- P0-08: client role không được ghi cancelled_by là người khác (giả mạo audit). service_role (uid null) truyền actor tường minh.
  if auth.uid() is not null and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'FORBIDDEN_ACTOR_SPOOFING' using errcode = '42501';
  end if;
  v_actor_id := coalesce(auth.uid(), p_actor_id);
  v_is_caller_admin := (select auth.role()) = 'service_role'
    or public.is_admin()
    or (
      nullif(current_setting('request.jwt.claims', true), '') is null
      and session_user in ('postgres', 'supabase_admin')
    );

  if not v_is_caller_admin then
    if exists (
      select 1 from public.showtimes st
      where st.id = any(p_showtime_ids)
        and not public.has_cinema_role(st.cinema_id, array['MANAGER']::public.staff_role[])
    ) then
      raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
    end if;
  end if;

  return public.cancel_showtimes_core(p_showtime_ids, p_reason, v_actor_id, true);
end;
$function$;

revoke all on function public.cancel_showtimes(uuid[], text, uuid) from public, anon;
grant execute on function public.cancel_showtimes(uuid[], text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC schedule_cinema_status (Admin / service_role) — thay set_cinema_status
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
  if p_cinema_id is null or p_status is null then
    raise exception 'INVALID_ARGUMENTS: cinema_id và status là bắt buộc' using errcode = '22023';
  end if;

  select id, code, name, address, hotline, status, scheduled_status, scheduled_effective_at into v_cinema
  from public.cinemas
  where id = p_cinema_id
  for update;

  if not found then
    raise exception 'CINEMA_NOT_FOUND: Rạp không tồn tại' using errcode = 'P0002';
  end if;

  v_is_caller_admin := (select auth.role()) = 'service_role'
    or public.is_admin()
    or (
      nullif(current_setting('request.jwt.claims', true), '') is null
      and session_user in ('postgres', 'supabase_admin')
    );

  if not v_is_caller_admin then
    raise exception 'FORBIDDEN_ADMIN_REQUIRED' using errcode = '42501';
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
-- 5. Gỡ đường đổi trạng thái tức thì
-- ---------------------------------------------------------------------------
drop function public.set_cinema_status(uuid, public.cinema_status);

-- ---------------------------------------------------------------------------
-- 6. Job nội bộ: áp dụng lịch tới hạn. Lỗi 1 rạp không chặn rạp khác (lịch giữ nguyên, thử lại phút sau).
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
  for v_cinema in
    select id, name, scheduled_status
      from public.cinemas
     where scheduled_effective_at <= now()
     order by id
       for update skip locked
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
      raise warning 'apply_due_cinema_status_changes: rạp % lỗi, giữ lịch để thử lại: %', v_cinema.id, sqlerrm;
    end;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.apply_due_cinema_status_changes() from public, anon, authenticated;
grant execute on function public.apply_due_cinema_status_changes() to service_role;

-- ---------------------------------------------------------------------------
-- 7. pg_cron mỗi phút (idempotent; chỉ khi extension có)
-- ---------------------------------------------------------------------------
do $block$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'apply-cinema-status-changes') then
      perform cron.unschedule('apply-cinema-status-changes');
    end if;
    perform cron.schedule('apply-cinema-status-changes', '* * * * *', 'select public.apply_due_cinema_status_changes()');
  end if;
end;
$block$;
