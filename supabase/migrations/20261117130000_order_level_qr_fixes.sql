-- ============================================================================
-- Migration: 20261117130000_order_level_qr_fixes.sql
-- feature-order-level-qr phase-1 task-01, vòng review 1 (migration BỔ SUNG; 20261117120000 đã áp nên không sửa logic).
-- HIGH_RISK_MIGRATION kế thừa từ 20261117120000 (backfill/rewrite orders.qr_token): KHÔNG promote production khi chưa
-- verify staging; rollback xem header 20261117120000 (+ revert 3 hàm dưới đây về bản trước).
--
--   F1 checkin_ticket: khoá showtimes FOR SHARE TRƯỚC orders FOR UPDATE (statement riêng) -> hết deadlock 40P01 với
--      cancel_showtimes. Bỏ nhánh tra theo tickets.id (F4): chỉ orders.qr_token | booking_code | tickets.qr_token.
--   F2 audit_row_change: loại khoá 'qr_token' khỏi before/after snapshot (credential không được lưu vĩnh viễn trong
--      audit_logs). Hàm generic nên audit của tickets cũng thôi lưu tickets.qr_token (cải thiện; không bảng nào khác có cột này).
--   F5 orders_guard_transition: bất biến orders.qr_token (token đã gửi email không được đổi ngầm).
-- ============================================================================

-- F2
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'qr_token' end;
  v_after    jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'qr_token' end;
  v_row      jsonb := coalesce(v_after, v_before);
  v_cinema   uuid;
  v_record   text;
begin
  if tg_nargs > 0 then
    v_cinema := nullif(v_row ->> tg_argv[0], '')::uuid;
  end if;
  -- Khoá chính: cột 'id' nếu có, ngược lại ghép user_id/cinema_id/key (bảng khoá kép).
  v_record := coalesce(
    v_row ->> 'id',
    concat_ws(':', v_row ->> 'user_id', v_row ->> 'role', v_row ->> 'cinema_id', v_row ->> 'key')
  );

  insert into public.audit_logs (actor_id, cinema_id, table_name, record_id, action, before_data, after_data)
  values ((select auth.uid()), v_cinema, tg_table_name, v_record, tg_op, v_before, v_after);

  return null;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- F5 (thân hàm = bản hiện hành ở 20261112150000 + khoá bất biến qr_token)
create or replace function public.orders_guard_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_code is not null and new.booking_code not like (new.cinema_code || '-%') then
    raise exception 'Mã đặt vé phải bắt đầu bằng mã rạp' using errcode = '23514';
  end if;
  if new.channel is distinct from old.channel
     or new.showtime_id is distinct from old.showtime_id
     or new.cinema_id is distinct from old.cinema_id then
    raise exception 'Không được đổi kênh/suất/rạp của đơn' using errcode = '23514';
  end if;
  if new.qr_token is distinct from old.qr_token then
    raise exception 'Không được đổi qr_token của đơn' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'holding'         and new.status in ('pending_payment', 'expired', 'cancelled', 'paid', 'needs_manual_review'))
    or (old.status = 'pending_payment' and new.status in ('paid', 'cancelled', 'expired', 'needs_manual_review'))
    or (old.status in ('expired', 'cancelled') and new.status in ('paid', 'needs_manual_review'))
    or (old.status = 'paid'            and new.status in ('checked_in', 'affected'))
    or (old.status = 'checked_in'      and new.status in ('affected'))
    or (old.status = 'affected'        and new.status in ('exchanged', 'refunded_manual'))
  ) then
    raise exception 'Chuyển trạng thái đơn không hợp lệ: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_guard_transition() from public, anon, authenticated;

-- F1 + F4
create or replace function public.checkin_ticket(
  p_token_or_code text,
  p_cinema_id uuid,
  p_staff_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_cleaned text;
  v_order_id uuid;
  v_order record;
  v_total_tickets integer;
  v_unused_tickets integer;
  v_first_checked_in_at timestamptz;
  v_first_checked_in_by uuid;
  v_rep_ticket_id uuid;
  v_first_staff_name text;
  v_seats jsonb;
  v_now timestamptz := clock_timestamp();
  v_showtime_end timestamptz;
begin
  -- 2.1. Phân quyền caller: caller phải có quyền tại rạp quét (p_cinema_id) hoặc là admin/service_role
  if not public.has_cinema_scope(p_cinema_id) then
    raise exception 'FORBIDDEN_CINEMA_SCOPE' using errcode = '42501';
  end if;

  -- Chống giả mạo p_staff_id (Non-Repudiation):
  -- Khi caller là authenticated thông thường (auth.uid() is not null và không phải admin/service_role):
  -- - Nếu truyền p_staff_id khác auth.uid() -> chặn ngay lập tức với mã 42501
  -- - Cưỡng chế v_staff_id := auth.uid()
  -- Chỉ khi gọi từ service_role/postgres (auth.uid() is null) hoặc caller là public.is_admin() mới cho phép dùng p_staff_id truyền vào
  if auth.uid() is not null and not public.is_admin() then
    if p_staff_id is not null and p_staff_id <> auth.uid() then
      raise exception 'FORBIDDEN_STAFF_SPOOFING' using errcode = '42501';
    end if;
    v_staff_id := auth.uid();
  else
    v_staff_id := coalesce(p_staff_id, auth.uid());
  end if;
  v_cleaned := trim(coalesce(p_token_or_code, ''));

  if v_cleaned = '' then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      null, p_cinema_id, null, null, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'code', 'EMPTY_CODE',
      'message', 'Mã vé hoặc token không được để trống'
    );
  end if;

  -- 2.2. Tìm ĐƠN theo QR đơn, mã đặt vé, hoặc QR cũ theo ghế (ưu tiên QR đơn). KHÔNG tra theo tickets.id (UUID không phải credential).
  select x.order_id
  into v_order_id
  from (
    select o.id as order_id, 1 as prio from public.orders o where o.qr_token = lower(v_cleaned)
    union all
    select o.id, 2 from public.orders o where o.booking_code = upper(v_cleaned)
    union all
    select t.order_id, 3 from public.tickets t where t.qr_token = lower(v_cleaned)
  ) x
  order by x.prio
  limit 1;

  if v_order_id is not null then
    -- Thứ tự khoá toàn cục showtimes -> orders -> tickets (như confirm_paid/hold_seats; cancel_showtimes khoá showtimes
    -- FOR UPDATE rồi orders). Khoá suất FOR SHARE TRƯỚC, vì mọi insert checkin_logs lấy KEY SHARE trên showtimes (FK):
    -- giữ khoá orders rồi mới xin showtimes sẽ deadlock 40P01 với cancel_showtimes. showtime_id của đơn bất biến.
    perform 1
    from public.showtimes s
    join public.orders o on o.showtime_id = s.id
    where o.id = v_order_id
    for share of s;

    -- Khoá hàng orders bằng statement RIÊNG (chống race 2 lần quét): nhận snapshot mới nên thấy trạng thái đơn/suất
    -- sau khi cancel_showtimes commit.
    select
      o.id as order_id,
      o.status as order_status,
      o.booking_code,
      s.id as showtime_id,
      s.cinema_id as showtime_cinema_id,
      s.starts_at,
      s.status as showtime_status,
      m.title_vi as movie_title,
      m.duration_minutes,
      c.code as cinema_code,
      c.name as cinema_name,
      c.address as cinema_address,
      r.name as room_name
    into v_order
    from public.orders o
    join public.showtimes s on s.id = o.showtime_id
    join public.cinemas c on c.id = s.cinema_id
    join public.rooms r on r.id = s.room_id
    join public.movies m on m.id = s.movie_id
    where o.id = v_order_id
    for update of o;
  end if;

  if v_order_id is null or not found then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      null, p_cinema_id, null, null, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'code', 'TICKET_NOT_FOUND',
      'message', 'Không tìm thấy vé tương ứng'
    );
  end if;

  -- Khoá toàn bộ vé của đơn (thứ tự id cố định) rồi gom trạng thái soát vé của đơn.
  perform 1 from public.tickets t where t.order_id = v_order.order_id order by t.id for update;

  select count(*)::integer,
         (count(*) filter (where t.checked_in_at is null))::integer,
         (array_agg(t.id order by t.created_at, t.id))[1]
  into v_total_tickets, v_unused_tickets, v_rep_ticket_id
  from public.tickets t
  where t.order_id = v_order.order_id;

  -- 2.3. Thứ tự kiểm tra:
  -- BƯỚC 1: Kiểm rạp trước (AC-13, R-99, R-102)
  -- Sai rạp chỉ trả về tên + địa chỉ rạp đúng, KHÔNG lộ PII (tên khách, ghế...)
  if v_order.showtime_cinema_id <> p_cinema_id then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'WRONG_CINEMA', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'WRONG_CINEMA',
      'result', 'WRONG_CINEMA',
      'message', 'Vé thuộc rạp khác',
      'correct_cinema_id', v_order.showtime_cinema_id,
      'correct_cinema_code', v_order.cinema_code,
      'correct_cinema_name', v_order.cinema_name,
      'correct_cinema_address', v_order.cinema_address
    );
  end if;

  -- BƯỚC 2: Kiểm suất huỷ / đơn affected / đơn bị huỷ (R-101)
  if v_order.showtime_status = 'CANCELLED'
     or v_order.order_status in ('affected', 'cancelled', 'refunded_manual', 'exchanged') then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'AFFECTED', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'CANCELLED',
      'result', 'AFFECTED',
      'message', 'Suất chiếu hoặc đơn vé đã bị huỷ / ảnh hưởng',
      'order_status', v_order.order_status,
      'showtime_status', v_order.showtime_status
    );
  end if;

  -- BƯỚC 3: Kiểm đơn đã dùng (AC-12, R-98): đơn có vé và KHÔNG còn vé nào chưa soát.
  -- Trả thời điểm + người soát của lần soát ĐẦU TIÊN của đơn.
  if v_total_tickets > 0 and v_unused_tickets = 0 then
    select t.checked_in_at, t.checked_in_by
    into v_first_checked_in_at, v_first_checked_in_by
    from public.tickets t
    where t.order_id = v_order.order_id and t.checked_in_at is not null
    order by t.checked_in_at, t.id
    limit 1;

    select coalesce(p.full_name, 'Nhân viên')
    into v_first_staff_name
    from public.profiles p
    where p.id = v_first_checked_in_by;

    if v_first_staff_name is null then
      v_first_staff_name := 'Nhân viên';
    end if;

    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'ALREADY_USED', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'USED',
      'result', 'ALREADY_USED',
      'message', 'Vé đã được sử dụng',
      'checked_in_at', v_first_checked_in_at,
      'checked_in_by_name', v_first_staff_name,
      'staff_name', v_first_staff_name
    );
  end if;

  -- BƯỚC 4: Kiểm cửa sổ thời gian soát vé (R-99, R-102, #11)
  -- Hết hạn: quá starts_at + duration_minutes
  v_showtime_end := v_order.starts_at + make_interval(mins => coalesce(v_order.duration_minutes, 120));
  if v_now > v_showtime_end then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'OUTSIDE_WINDOW', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'EXPIRED',
      'result', 'OUTSIDE_WINDOW',
      'message', 'Suất chiếu đã kết thúc (quá thời lượng phim)',
      'starts_at', v_order.starts_at,
      'expired_at', v_showtime_end
    );
  end if;

  -- Quá sớm: trước starts_at - 30 minutes
  if v_now < (v_order.starts_at - interval '30 minutes') then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'OUTSIDE_WINDOW', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'TOO_EARLY',
      'result', 'OUTSIDE_WINDOW',
      'message', 'Chưa đến giờ soát vé (chỉ mở trước giờ chiếu 30 phút)',
      'starts_at', v_order.starts_at
    );
  end if;

  -- BƯỚC 5: Kiểm trạng thái đơn hàng (phải là paid hoặc checked_in)
  if v_order.order_status not in ('paid', 'checked_in') then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'message', 'Đơn hàng chưa được thanh toán thành công',
      'order_status', v_order.order_status
    );
  end if;

  -- Đơn đã thanh toán nhưng không có vé nào: không có gì để soát (không được báo thành công/USED nhầm).
  if v_total_tickets = 0 then
    insert into public.checkin_logs (
      ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
    ) values (
      null, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'INVALID', v_staff_id, v_now
    );
    return jsonb_build_object(
      'status', 'INVALID',
      'result', 'INVALID',
      'code', 'TICKET_NOT_FOUND',
      'message', 'Đơn hàng không có vé để soát'
    );
  end if;

  -- BƯỚC 6: Hợp lệ -> soát TẤT CẢ ghế chưa soát của đơn trong một lệnh.
  -- Vé đã soát từ trước (đơn legacy soát dở) giữ nguyên checked_in_at/checked_in_by.
  update public.tickets
  set checked_in_at = v_now,
      checked_in_by = v_staff_id
  where order_id = v_order.order_id
    and checked_in_at is null;

  if v_order.order_status = 'paid' then
    update public.orders
    set status = 'checked_in'
    where id = v_order.order_id;
  end if;

  insert into public.checkin_logs (
    ticket_id, scanner_cinema_id, ticket_cinema_id, showtime_id, result, scanned_by, scanned_at
  ) values (
    v_rep_ticket_id, p_cinema_id, v_order.showtime_cinema_id, v_order.showtime_id, 'SUCCESS', v_staff_id, v_now
  );

  -- Nhãn ghế của cả đơn, xếp tự nhiên theo (hàng, số): A2 trước A10.
  select coalesce(
           jsonb_agg(os.seat_label order by substring(os.seat_label from '^[^0-9]*'),
                                            nullif(substring(os.seat_label from '[0-9]+'), '')::integer nulls last,
                                            os.seat_label),
           '[]'::jsonb)
  into v_seats
  from public.tickets t
  join public.order_seats os on os.id = t.order_seat_id
  where t.order_id = v_order.order_id;

  return jsonb_build_object(
    'status', 'OK',
    'result', 'SUCCESS',
    'message', 'Soát vé thành công',
    'order_id', v_order.order_id,
    'booking_code', v_order.booking_code,
    'movie_title', v_order.movie_title,
    'cinema_name', v_order.cinema_name,
    'room_name', v_order.room_name,
    'seats', v_seats,
    'seat_count', jsonb_array_length(v_seats),
    'starts_at', v_order.starts_at,
    'checked_in_at', v_now
  );
end;
$$;

revoke all on function public.checkin_ticket(text, uuid, uuid) from public, anon;
grant execute on function public.checkin_ticket(text, uuid, uuid) to authenticated, service_role;
