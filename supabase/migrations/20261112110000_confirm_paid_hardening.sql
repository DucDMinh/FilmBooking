-- ============================================================================
-- 20261112110000_confirm_paid_hardening.sql
-- bug-layer34-review phase-2 task-02 (M1c, M3, M4 phần confirm_paid, M5, M9, M10a): siết confirm_paid.
-- HIGH_RISK (đổi hành vi + khoá của đường tiền): không đổi schema/dữ liệu, chỉ CREATE OR REPLACE confirm_paid
-- (giữ chữ ký, SECURITY DEFINER, search_path = '', ACL: chỉ service_role). Rollback = áp lại định nghĩa ở 20261112060000.
--
-- Nguyên nhân gốc (độc lập review layer 3-4) và cách sửa:
--  M1c  Case A (holding/pending_payment) chỉ kiểm ghế, bỏ qua hết hạn + trạng thái suất/rạp/cutoff
--       => bán vé cho suất CANCELLED/CLOSED, rạp TEMP_CLOSED, sau mốc đóng bán; đơn quá hạn mà chưa bị job quét
--       được coi như còn hold. Sửa: hold_expires_at <= now() => đi nhánh "tiền về muộn" (case B); MỌI nhánh kiểm
--       suất ON_SALE + rạp OPEN; mốc đóng bán online (cutoff) CHỈ kiểm khi tiền về muộn (SPECIFICATIONS #9/10/17) —
--       hold còn hạn qua cutoff vẫn được chốt.
--  M3   Case B hồi sinh lượt voucher RELEASED thành CONSUMED không kiểm giới hạn => vượt total_uses_limit /
--       per_user_limit. Sửa: khoá voucher FOR UPDATE rồi đếm lượt (HELD/CONSUMED) của đơn khác; hết lượt =>
--       needs_manual_review (quyết định user 2026-11-12: không chốt vé vượt trần), lượt giữ nguyên RELEASED.
--  M4   Race cancel_showtimes <-> confirm_paid: confirm_paid lấy `showtimes FOR SHARE` (loại trừ cancel_showtimes
--       FOR UPDATE) TRƯỚC khi khoá đơn, nên không thể chốt vé trên suất vừa bị huỷ.
--  M5   Ghế bị Manager khoá sau khi hold hết hạn: sell_order_seats trả false (không raise) => needs_manual_review,
--       webhook nhận kết quả xác định, PayOS không retry vô hạn.
--  M9   `(value->>0)::integer` trên jsonb scalar trả NULL => luôn rơi về 15 phút. Đọc đúng bằng `value #>> '{}'`
--       (hold_seats ở 20261112100000 đã đúng; đây là chỗ cuối cùng còn sai).
--  M10a Webhook retry: đơn đã needs_manual_review trả kết quả xác định, KHÔNG ghi thêm audit_logs/email_outbox
--       (trước đó rơi vào INVALID_STATE, hoặc nhánh lệch tiền ghi trùng audit + email).
--
-- THỨ TỰ KHOÁ (khớp ghi chú ở 20261112100000): showtimes FOR SHARE -> orders FOR UPDATE -> payments FOR UPDATE
--   -> vouchers FOR UPDATE (chỉ khi cần hồi sinh lượt) -> seat_states (trong sell_order_seats).
--   Trước đây confirm_paid khoá seat_states TRƯỚC payments (lệch thứ tự toàn cục); nay payments khoá ngay sau orders.
--   Voucher đứng sau payments / trước seats: apply_voucher chỉ khoá voucher rồi insert redemption, không đi
--   ngược sang ghế/payments nên không tạo chu trình.
-- ============================================================================

create or replace function public.confirm_paid(
  p_order_id        uuid,
  p_amount          integer,
  p_transaction_ref text,
  p_order_code      bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order            public.orders;
  v_payment          public.payments;
  v_redemption       public.voucher_redemptions;
  v_voucher          public.vouchers;
  v_showtime_id      uuid;
  v_showtime_status  public.showtime_status;
  v_starts_at        timestamptz;
  v_cinema_cutoff    integer;
  v_cinema_status    public.cinema_status;
  v_cutoff_mins      integer;
  v_booking_code     text;
  v_to_email         text;
  v_is_late          boolean;
  v_reason           text;
  v_used             integer;
  v_revive_voucher   boolean := false;
begin
  -- 0. Khoá suất FOR SHARE TRƯỚC khoá đơn (thứ tự toàn cục: showtimes -> orders). Loại trừ cancel_showtimes (FOR UPDATE):
  --    suất không thể bị huỷ giữa lúc kiểm trạng thái và lúc chốt vé (M4). showtime_id của đơn bất biến.
  select o.showtime_id into v_showtime_id from public.orders o where o.id = p_order_id;
  if found then
    select s.status, s.starts_at, c.online_cutoff_minutes, c.status
      into v_showtime_status, v_starts_at, v_cinema_cutoff, v_cinema_status
      from public.showtimes s
      join public.cinemas c on c.id = s.cinema_id
     where s.id = v_showtime_id
       for share of s;
  end if;

  -- 1. Khoá dòng đơn hàng
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'ORDER_NOT_FOUND', 'message', 'Đơn hàng không tồn tại');
  end if;

  -- 2. Idempotent check (AC-10): đơn đã thanh toán hoặc ở các trạng thái kế tiếp
  if v_order.status in ('paid', 'checked_in', 'affected', 'exchanged', 'refunded_manual') then
    return jsonb_build_object(
      'success', true,
      'status', 'ALREADY_PAID',
      'order_id', v_order.id,
      'booking_code', v_order.booking_code
    );
  end if;

  -- 2b. Webhook retry khi đơn đã needs_manual_review (M10a): trả lại kết quả xác định, KHÔNG ghi thêm gì
  --     (audit_logs / email_outbox / payments) — lần đầu đã ghi đủ.
  if v_order.status = 'needs_manual_review' then
    if p_amount <> v_order.total_amount then
      return jsonb_build_object(
        'success', false,
        'status', 'AMOUNT_MISMATCH',
        'order_status', 'needs_manual_review',
        'order_id', v_order.id,
        'expected_amount', v_order.total_amount,
        'received_amount', p_amount
      );
    end if;
    return jsonb_build_object(
      'success', false,
      'status', 'NEEDS_MANUAL_REVIEW',
      'order_id', v_order.id,
      'message', 'Đơn đang chờ xử lý thủ công'
    );
  end if;

  -- Xác định trước email nhận thông báo
  v_to_email := coalesce(
    v_order.contact_email::text,
    (select u.email::text from auth.users u where u.id = v_order.user_id)
  );

  -- Khoá payment ngay sau đơn, TRƯỚC mọi thao tác trên seat_states (thứ tự orders -> payments -> seat_states)
  select * into v_payment from public.payments where order_id = v_order.id for update;

  -- 3. Kiểm tra số tiền lệch (Amount Mismatch - R-104, R-134 - Defect 5)
  if p_amount <> v_order.total_amount then
    -- 3.1 Cập nhật hoặc insert payments để theo dõi số tiền thực nhận
    if v_payment.id is not null then
      update public.payments
         set transaction_ref = coalesce(p_transaction_ref, transaction_ref),
             order_code = coalesce(p_order_code, order_code),
             amount = p_amount
       where id = v_payment.id;
    else
      insert into public.payments (
        order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
      ) values (
        v_order.id,
        v_order.cinema_id,
        coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
        p_amount,
        'PENDING',
        p_transaction_ref,
        null
      );
    end if;

    -- 3.2 Giải phóng ghế HELD của đơn đó nếu có
    delete from public.showtime_seat_states
     where order_id = v_order.id and state = 'HELD';

    -- 3.3 Chuyển trạng thái đơn sang needs_manual_review (qua expired nếu đang holding/pending_payment)
    if v_order.status in ('holding', 'pending_payment') then
      update public.orders set status = 'expired' where id = v_order.id;
    end if;
    update public.orders set status = 'needs_manual_review' where id = v_order.id;

    -- 3.4 Ghi nhận sự kiện mismatch vào payment_events để đối soát PayOS (R-116, R-134)
    if p_transaction_ref is not null then
      insert into public.payment_events (
        cinema_id, order_code, transaction_ref, amount, event_status, signature_valid, occurred_at
      ) values (
        v_order.cinema_id, p_order_code, p_transaction_ref, p_amount, 'AMOUNT_MISMATCH', true, now()
      )
      on conflict (transaction_ref) do update set
        event_status = 'AMOUNT_MISMATCH',
        amount = excluded.amount;
    end if;

    -- 3.5 Ghi audit log
    insert into public.audit_logs (cinema_id, table_name, record_id, action, before_data, after_data)
    values (
      v_order.cinema_id,
      'orders',
      v_order.id::text,
      'UPDATE',
      jsonb_build_object('status', v_order.status, 'total_amount', v_order.total_amount),
      jsonb_build_object('status', 'needs_manual_review', 'paid_amount', p_amount, 'mismatch', true, 'transaction_ref', p_transaction_ref)
    );

    -- 3.6 Enqueue email thông báo khách và vận hành (R-104, R-134)
    if v_to_email is not null and length(btrim(v_to_email)) > 0 then
      insert into public.email_outbox (kind, to_email, payload, cinema_id, status)
      values (
        'AMOUNT_MISMATCH_MANUAL_REVIEW',
        v_to_email,
        jsonb_build_object(
          'order_id', v_order.id,
          'cinema_id', v_order.cinema_id,
          'cinema_name', v_order.cinema_name,
          'movie_title', v_order.movie_title,
          'expected_amount', v_order.total_amount,
          'received_amount', p_amount,
          'transaction_ref', p_transaction_ref,
          'reason', 'AMOUNT_MISMATCH'
        ),
        v_order.cinema_id,
        'PENDING'
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'status', 'AMOUNT_MISMATCH',
      'order_status', 'needs_manual_review',
      'order_id', v_order.id,
      'expected_amount', v_order.total_amount,
      'received_amount', p_amount
    );
  end if;

  if v_order.status not in ('holding', 'pending_payment', 'expired', 'cancelled') then
    return jsonb_build_object(
      'success', false,
      'status', 'INVALID_STATE',
      'order_id', v_order.id,
      'current_status', v_order.status,
      'message', 'Đơn hàng không ở trạng thái hợp lệ để xác nhận thanh toán'
    );
  end if;

  -- 4. Quyết định chốt bán hay chuyển xử lý thủ công. v_reason = null <=> đủ điều kiện chốt bán.
  --    "Tiền về muộn" = đơn đã expired/cancelled HOẶC còn holding/pending_payment nhưng hold_expires_at đã qua
  --    (job quét chưa chạy) => cùng một luật (M1c).
  v_is_late := v_order.status in ('expired', 'cancelled')
               or (v_order.hold_expires_at is not null and v_order.hold_expires_at <= now());

  select coalesce(
    v_cinema_cutoff,
    (select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'default_online_cutoff_minutes'),
    15
  ) into v_cutoff_mins;

  -- Suất ON_SALE + rạp OPEN: kiểm ở MỌI nhánh. Mốc đóng bán online chỉ kiểm khi tiền về muộn (SPECIFICATIONS #9/10/17):
  -- đơn còn hold hợp lệ (R-67 đã áp ở lúc giữ ghế) vẫn được chốt dù đã qua mốc.
  if v_showtime_status is distinct from 'ON_SALE' then
    v_reason := 'SHOWTIME_NOT_ON_SALE';
  elsif v_cinema_status is distinct from 'OPEN' then
    v_reason := 'CINEMA_NOT_OPEN';
  elsif v_is_late and not (v_starts_at - make_interval(mins => v_cutoff_mins) > now()) then
    v_reason := 'ONLINE_CUTOFF_PASSED';
  end if;

  -- 4b. Hồi sinh lượt voucher (M3) — CHỈ khi tiền về muộn và lượt RELEASED do expire/cancel: khi đó orders.voucher_id
  --     vẫn trỏ voucher (trigger orders_voucher_status_sync giữ nguyên). Voucher khách đã GỠ (remove_voucher) có
  --     orders.voucher_id = null => lượt RELEASED bị bỏ qua, không hồi sinh, không chặn chốt bán (F1).
  --     Khoá voucher rồi đếm lượt của ĐƠN KHÁC (HELD/CONSUMED).
  if v_reason is null and v_is_late and v_order.voucher_id is not null then
    select * into v_redemption from public.voucher_redemptions
     where order_id = v_order.id and status = 'RELEASED' and voucher_id = v_order.voucher_id;
    if found then
      v_revive_voucher := true;
      select * into v_voucher from public.vouchers where id = v_redemption.voucher_id for update;
      if v_voucher.total_uses_limit is not null then
        select count(*) into v_used from public.voucher_redemptions vr
         where vr.voucher_id = v_voucher.id and vr.order_id <> v_order.id and vr.status in ('HELD', 'CONSUMED');
        if v_used >= v_voucher.total_uses_limit then
          v_reason := 'VOUCHER_EXHAUSTED';
        end if;
      end if;
      if v_reason is null and v_voucher.per_user_limit is not null and v_redemption.user_id is not null then
        select count(*) into v_used from public.voucher_redemptions vr
         where vr.voucher_id = v_voucher.id and vr.order_id <> v_order.id
           and vr.user_id = v_redemption.user_id and vr.status in ('HELD', 'CONSUMED');
        if v_used >= v_voucher.per_user_limit then
          v_reason := 'VOUCHER_EXHAUSTED';
        end if;
      end if;
    end if;
  end if;

  -- 4c. Chiếm ghế (K4): sell_order_seats khoá dòng, không ghi đè ghế đơn khác; false khi ghế bị đơn khác chiếm
  --     hoặc bị khoá vận hành (M5) — không raise.
  if v_reason is null and not public.sell_order_seats(v_order.id) then
    v_reason := case when v_is_late then 'SEATS_UNAVAILABLE' else 'SEATS_TAKEN' end;
  end if;

  if v_reason is null then
    -- 5. ĐỦ ĐIỀU KIỆN: chốt bán
    if v_order.booking_code is null then
      v_booking_code := public.generate_booking_code(v_order.cinema_code);
    else
      v_booking_code := v_order.booking_code;
    end if;

    update public.orders set status = 'paid', booking_code = v_booking_code where id = v_order.id;

    if v_payment.id is not null then
      update public.payments
         set status = 'PAID',
             paid_at = coalesce(paid_at, now()),
             transaction_ref = coalesce(p_transaction_ref, transaction_ref),
             order_code = coalesce(p_order_code, order_code)
       where id = v_payment.id;
    else
      insert into public.payments (order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at)
      values (
        v_order.id,
        v_order.cinema_id,
        coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
        p_amount,
        'PAID',
        p_transaction_ref,
        now()
      );
    end if;

    -- HELD -> CONSUMED (như bản cũ). RELEASED chỉ hồi sinh khi 4b đã kiểm giới hạn (đơn expired/cancelled còn voucher_id);
    -- lượt RELEASED của voucher đã gỡ giữ nguyên.
    update public.voucher_redemptions
       set status = 'CONSUMED'
     where order_id = v_order.id
       and (status = 'HELD' or (v_revive_voucher and status = 'RELEASED' and voucher_id = v_order.voucher_id));

    insert into public.tickets (order_id, order_seat_id, showtime_id, cinema_id, qr_token)
    select v_order.id, os.id, v_order.showtime_id, v_order.cinema_id, encode(extensions.gen_random_bytes(16), 'hex')
      from public.order_seats os
     where os.order_id = v_order.id
       and not exists (select 1 from public.tickets t where t.order_seat_id = os.id);

    -- Enqueue đúng 1 email vé vào email_outbox (AC-10)
    if v_to_email is not null and length(btrim(v_to_email)) > 0 then
      insert into public.email_outbox (kind, to_email, payload, cinema_id, status)
      values (
        'TICKET_ISSUED',
        v_to_email,
        jsonb_build_object(
          'order_id', v_order.id,
          'booking_code', v_booking_code,
          'cinema_id', v_order.cinema_id,
          'cinema_name', v_order.cinema_name,
          'movie_title', v_order.movie_title,
          'room_name', v_order.room_name,
          'showtime_starts_at', v_order.showtime_starts_at,
          'total_amount', v_order.total_amount
        ),
        v_order.cinema_id,
        'PENDING'
      );
    end if;

    if v_is_late then
      return jsonb_build_object('success', true, 'status', 'SUCCESS', 'recovered', true,
                                'order_id', v_order.id, 'booking_code', v_booking_code);
    end if;
    return jsonb_build_object('success', true, 'status', 'SUCCESS', 'order_id', v_order.id, 'booking_code', v_booking_code);
  end if;

  -- 6. KHÔNG ĐỦ ĐIỀU KIỆN: needs_manual_review (AC-11) — tiền đã về nên payment = PAID, không sinh vé,
  --    nhả ghế HELD của đơn, lượt voucher giữ nguyên (không hồi sinh).
  if v_payment.id is not null then
    update public.payments
       set status = 'PAID',
           paid_at = coalesce(paid_at, now()),
           transaction_ref = coalesce(p_transaction_ref, transaction_ref),
           order_code = coalesce(p_order_code, order_code)
     where id = v_payment.id;
  else
    insert into public.payments (order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at)
    values (
      v_order.id,
      v_order.cinema_id,
      coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
      p_amount,
      'PAID',
      p_transaction_ref,
      now()
    );
  end if;

  delete from public.showtime_seat_states where order_id = v_order.id and state = 'HELD';

  if v_order.status in ('holding', 'pending_payment') then
    update public.orders set status = 'expired' where id = v_order.id;
  end if;
  update public.orders set status = 'needs_manual_review' where id = v_order.id;

  -- Đúng 1 email hướng dẫn khách liên hệ rạp (AC-11)
  if v_to_email is not null and length(btrim(v_to_email)) > 0 then
    insert into public.email_outbox (kind, to_email, payload, cinema_id, status)
    values (
      'LATE_PAYMENT_MANUAL_REVIEW',
      v_to_email,
      jsonb_build_object(
        'order_id', v_order.id,
        'cinema_id', v_order.cinema_id,
        'cinema_name', v_order.cinema_name,
        'movie_title', v_order.movie_title,
        'amount', p_amount,
        'transaction_ref', p_transaction_ref,
        'reason', v_reason
      ),
      v_order.cinema_id,
      'PENDING'
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'status', 'NEEDS_MANUAL_REVIEW',
    'order_id', v_order.id,
    'message', case v_reason
      when 'SEATS_TAKEN' then 'Ghế đã bị chiếm bởi đơn khác trong thời gian thanh toán'
      else 'Tiền về nhưng không đủ điều kiện chốt vé tự động'
    end
  );
end;
$$;

-- CREATE OR REPLACE giữ ACL nhưng khẳng định lại cho chắc (authenticated không được gọi: không kiểm caller)
revoke all on function public.confirm_paid(uuid, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_paid(uuid, integer, text, bigint) to service_role;
