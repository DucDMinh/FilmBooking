-- ============================================================================
-- 20261112120000_zero_amount_sell_hardening.sql
-- bug-layer34-review phase-2 task-03 (M4 phần confirm_zero_amount, scan Defect #2), thu hẹp bởi CR remove-pos
-- (feature-remove-pos phase-2 task-01): chỉ còn confirm_zero_amount; confirm_pos_sale bị gỡ cùng POS (20261112130000).
-- HIGH_RISK_MIGRATION: đổi hành vi + thứ tự khoá của confirm_zero_amount (đường bán vé). KHÔNG có thay đổi schema.
--
-- Nguyên nhân gốc:
--  * confirm_zero_amount còn upsert / update seat_state KHÔNG điều kiện (bản trước K4): nếu dòng ghế đã bị đơn khác chiếm
--    (hold cũ hết hạn bị thế chỗ, ghế bị khoá vận hành) thì ghi đè ghế của đơn khác; chỉ unique index vé là lớp chặn cuối
--    (lỗi 23505 thô). Hàm còn không kiểm suất ON_SALE / rạp OPEN, và không khoá showtimes => race với cancel_showtimes (M4).
--
-- Sửa:
--  * Chiếm ghế bằng public.sell_order_seats (khoá dòng, có điều kiện; false khi ghế bị đơn khác chiếm / khoá).
--  * Khoá showtimes FOR SHARE TRƯỚC khoá đơn; kiểm suất ON_SALE + rạp OPEN; dọn nhánh `elsif` dead code ở phần kiểm quyền
--    (role không phải authenticated thì 048 đã chặn ở mức EXECUTE; service_role / postgres đi thẳng).
--
-- QUYẾT ĐỊNH / GIẢ ĐỊNH (ghi để review):
--  * Tranh chấp ghế KHÔNG chuyển needs_manual_review mà raise SEAT_TAKEN (23514, rollback toàn bộ): đơn 0đ KHÔNG có tiền về
--    => không có gì để hoàn / đối soát, không có nhánh "tiền về muộn" => không áp cutoff (R-67 đã áp lúc giữ ghế; hold còn
--    hạn vẫn chốt, khớp luật task-02), hold hết hạn vẫn lỗi như cũ. (Đã được user xác nhận ở review round 1, F3.)
--  * Thông điệp SEAT_TAKEN phân biệt ghế bị khoá vận hành / đổi loại với ghế bị đơn khác chiếm (F6); cùng mã SEAT_TAKEN.
--  * FK tickets.seat_id -> seats(id) KHÔNG nằm trong migration này (round 3 F11: FK + KEY SHARE gây deadlock confirm_paid x
--    hold_seats). Chuyển backlog CR-002.
--
-- THỨ TỰ KHOÁ: showtimes FOR SHARE -> orders FOR UPDATE -> seat_states (sell_order_seats). Hàm KHÔNG khoá vouchers;
--   payments / voucher_redemptions chỉ được ghi SAU sell_order_seats.
--   Khớp confirm_paid (20261112110000), cancel_showtimes, hold_seats, release_seats, expire job: không tạo chu trình.
-- ROLLBACK: áp lại định nghĩa confirm_zero_amount ở 20261111040100 (không có thay đổi schema để hoàn tác).
-- ============================================================================


create or replace function public.confirm_zero_amount(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order           public.orders;
  v_showtime_id     uuid;
  v_showtime_status public.showtime_status;
  v_cinema_status   public.cinema_status;
  v_booking_code    text;
  v_to_email        text;
begin
  -- 0. Khoá suất FOR SHARE TRƯỚC khoá đơn (thứ tự toàn cục showtimes -> orders): loại trừ cancel_showtimes (M4).
  select o.showtime_id into v_showtime_id from public.orders o where o.id = p_order_id;
  if found then
    select s.status, c.status
      into v_showtime_status, v_cinema_status
      from public.showtimes s
      join public.cinemas c on c.id = s.cinema_id
     where s.id = v_showtime_id
       for share of s;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'ORDER_NOT_FOUND', 'message', 'Đơn không tồn tại');
  end if;

  -- 1. Kiểm tra quyền sở hữu đơn hàng (chống BOLA/IDOR - Defect 2). Chỉ authenticated tới được đây (anon bị chặn ở EXECUTE,
  --    service_role / postgres là caller tin cậy) nên không cần nhánh dự phòng cho role khác.
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    if auth.uid() is null or v_order.user_id is null or v_order.user_id <> auth.uid() then
      raise exception 'FORBIDDEN: Không có quyền xác nhận đơn hàng của người khác' using errcode = '42501';
    end if;
  end if;

  -- 2. Idempotent
  if v_order.status = 'paid' then
    return jsonb_build_object('success', true, 'status', 'ALREADY_PAID', 'order_id', v_order.id, 'booking_code', v_order.booking_code);
  end if;

  if v_order.total_amount <> 0 then
    raise exception 'Đơn hàng có số tiền % > 0, không thể dùng confirm_zero_amount', v_order.total_amount using errcode = '23514';
  end if;

  if v_order.status not in ('holding', 'pending_payment') then
    raise exception 'Đơn hàng không ở trạng thái holding hoặc pending_payment (hiện tại: %)', v_order.status using errcode = '23514';
  end if;

  if v_order.hold_expires_at is not null and v_order.hold_expires_at <= now() then
    raise exception 'Thời gian giữ ghế đã hết hạn' using errcode = '23514';
  end if;

  -- 2b. Suất ON_SALE + rạp OPEN. Không áp cutoff: không có "tiền về muộn" với đơn 0đ, hold còn hạn được phép chốt.
  if v_showtime_status is distinct from 'ON_SALE' then
    raise exception 'SHOWTIME_NOT_OPEN: Suất chiếu không ở trạng thái mở bán' using errcode = '23514';
  end if;
  if v_cinema_status is distinct from 'OPEN' then
    raise exception 'CINEMA_NOT_OPEN: Rạp không ở trạng thái mở cửa' using errcode = '23514';
  end if;

  -- 3. Chiếm ghế SOLD (K4): sell_order_seats khoá dòng, không ghi đè ghế đơn khác; false => rollback bằng lỗi định danh
  if not public.sell_order_seats(v_order.id) then
    if exists (
      select 1
        from public.order_seats os
        join public.seats st on st.id = os.seat_id
       where os.order_id = v_order.id
         and (st.seat_type not in ('NORMAL', 'VIP', 'SWEETBOX')
              or exists (select 1 from public.showtime_seat_locks l
                          where l.showtime_id = v_order.showtime_id and l.seat_id = os.seat_id))
    ) then
      raise exception 'SEAT_TAKEN: Ghế đang bị khoá vận hành hoặc không còn bán được' using errcode = '23514';
    end if;
    raise exception 'SEAT_TAKEN: Ghế đã bị đơn khác chiếm' using errcode = '23514';
  end if;

  if v_order.booking_code is null then
    v_booking_code := public.generate_booking_code(v_order.cinema_code);
  else
    v_booking_code := v_order.booking_code;
  end if;

  update public.orders
     set status = 'paid',
         booking_code = v_booking_code
   where id = v_order.id;

  -- Tạo payment bản ghi cho đơn 0đ (Defect 4: dùng sequence an toàn)
  insert into public.payments (
    order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
  ) values (
    v_order.id,
    v_order.cinema_id,
    nextval('public.internal_payment_order_code_seq'),
    0,
    'PAID',
    'ZERO_AMOUNT_' || v_order.id::text,
    now()
  );

  update public.voucher_redemptions
     set status = 'CONSUMED'
   where order_id = v_order.id and status = 'HELD';

  insert into public.tickets (order_id, order_seat_id, showtime_id, cinema_id, qr_token)
  select
    v_order.id,
    os.id,
    v_order.showtime_id,
    v_order.cinema_id,
    encode(extensions.gen_random_bytes(16), 'hex')
  from public.order_seats os
  where os.order_id = v_order.id
    and not exists (select 1 from public.tickets t where t.order_seat_id = os.id);

  v_to_email := coalesce(
    v_order.contact_email::text,
    (select u.email::text from auth.users u where u.id = v_order.user_id)
  );

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
        'total_amount', 0
      ),
      v_order.cinema_id,
      'PENDING'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'status', 'SUCCESS',
    'order_id', v_order.id,
    'booking_code', v_booking_code
  );
end;
$$;

revoke all on function public.confirm_zero_amount(uuid) from public, anon;
grant execute on function public.confirm_zero_amount(uuid) to authenticated, service_role;
