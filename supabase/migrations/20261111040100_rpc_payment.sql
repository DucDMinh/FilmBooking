-- Layer 4 / task 02: RPC thanh toán & bán vé (R-75, R-76, R-77, R-78, R-82, R-85, R-86, R-125, R-128; AC-10, AC-11; quyết định #9, #10, #17).
-- record_payment_event, confirm_paid, mark_payment_cancelled, confirm_zero_amount, confirm_pos_sale.
-- Không DROP / đổi kiểu cột / backfill -> Không phải HIGH_RISK_MIGRATION.
-- Mọi hàm SECURITY DEFINER + search_path = '' + cấp quyền qua GRANT/REVOKE chặt chẽ.

-- ============================================================================
-- 0. Sequence sinh order_code duy nhất cho thanh toán nội bộ / POS / đơn 0đ (Defect 4)
-- ============================================================================
create sequence if not exists public.internal_payment_order_code_seq
  start with 900000000000000
  increment by 1;

revoke all on sequence public.internal_payment_order_code_seq from public, anon;
grant usage, select on sequence public.internal_payment_order_code_seq to authenticated, service_role;

-- ============================================================================
-- 0.1 Cập nhật orders_guard_transition cho phép holding/pending_payment -> needs_manual_review (Defect 1)
-- ============================================================================
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
  if new.status is distinct from old.status and not (
       (old.status = 'holding'         and new.status in ('pending_payment', 'expired', 'cancelled', 'paid', 'needs_manual_review'))
    or (old.status = 'pending_payment' and new.status in ('paid', 'cancelled', 'expired', 'needs_manual_review'))
    or (old.status in ('expired', 'cancelled') and new.status in ('paid', 'needs_manual_review'))
    or (old.status = 'paid'            and new.status in ('checked_in', 'affected'))
    or (old.status = 'affected'        and new.status in ('exchanged', 'refunded_manual'))
  ) then
    raise exception 'Chuyển trạng thái đơn không hợp lệ: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.orders_guard_transition() from public, anon, authenticated;

-- ============================================================================
-- 1. Helper: sinh mã đặt vé booking_code chuẩn định dạng ^[A-Z0-9]{2,10}-[A-Z0-9]{6}$
-- ============================================================================
create or replace function public.generate_booking_code(p_cinema_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_code  text;
  v_rand  text;
  i       integer;
begin
  if p_cinema_code is null or length(btrim(p_cinema_code)) = 0 then
    raise exception 'Mã rạp không hợp lệ để sinh mã đặt vé' using errcode = '23514';
  end if;

  loop
    v_rand := '';
    for i in 1..6 loop
      v_rand := v_rand || substr(v_chars, floor(random() * 36 + 1)::integer, 1);
    end loop;
    v_code := upper(btrim(p_cinema_code)) || '-' || v_rand;
    exit when not exists (select 1 from public.orders where booking_code = v_code);
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generate_booking_code(text) from public, anon;
grant execute on function public.generate_booking_code(text) to authenticated, service_role;

-- ============================================================================
-- 2. record_payment_event (R-75, AC-10): ghi nhận webhook PayOS, idempotent tuyệt đối
-- ============================================================================
create or replace function public.record_payment_event(
  p_order_code     bigint,
  p_transaction_ref text,
  p_amount         integer,
  p_event_status   text,
  p_signature_valid boolean,
  p_occurred_at    timestamptz default null,
  p_cinema_id      uuid default null,
  p_payment_id     uuid default null
)
returns public.payment_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event  public.payment_events;
  v_cin_id uuid := p_cinema_id;
  v_pay_id uuid := p_payment_id;
begin
  if p_transaction_ref is null or length(btrim(p_transaction_ref)) = 0 then
    raise exception 'transaction_ref không được để trống' using errcode = '23514';
  end if;

  if v_pay_id is null and p_order_code is not null then
    select id, cinema_id into v_pay_id, v_cin_id from public.payments where order_code = p_order_code;
  elsif v_cin_id is null and v_pay_id is not null then
    select cinema_id into v_cin_id from public.payments where id = v_pay_id;
  end if;

  insert into public.payment_events (
    payment_id,
    cinema_id,
    order_code,
    transaction_ref,
    amount,
    event_status,
    signature_valid,
    occurred_at
  )
  values (
    v_pay_id,
    v_cin_id,
    p_order_code,
    p_transaction_ref,
    p_amount,
    coalesce(p_event_status, 'PAID'),
    p_signature_valid,
    coalesce(p_occurred_at, now())
  )
  on conflict (transaction_ref) do nothing
  returning * into v_event;

  if not found then
    select * into v_event from public.payment_events where transaction_ref = p_transaction_ref;
  end if;

  return v_event;
end;
$$;

revoke all on function public.record_payment_event(bigint, text, integer, text, boolean, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.record_payment_event(bigint, text, integer, text, boolean, timestamptz, uuid, uuid) to service_role;

-- ============================================================================
-- 3. confirm_paid (R-75, R-76, R-78; AC-10, AC-11; quyết định #9, #10, #17)
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
  v_booking_code     text;
  v_to_email         text;
  v_showtime_status  public.showtime_status;
  v_starts_at        timestamptz;
  v_cinema_cutoff    integer;
  v_cutoff_mins      integer;
  v_seats_available  boolean;
  v_conflict_held    boolean;
begin
  -- 1. Khoá dòng đơn hàng
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object(
      'success', false,
      'status', 'ORDER_NOT_FOUND',
      'message', 'Đơn hàng không tồn tại'
    );
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

  -- Xác định trước email nhận thông báo
  v_to_email := coalesce(
    v_order.contact_email::text,
    (select u.email::text from auth.users u where u.id = v_order.user_id)
  );

  -- 3. Kiểm tra số tiền lệch (Amount Mismatch - R-104, R-134 - Defect 5)
  if p_amount <> v_order.total_amount then
    -- 3.1 Giải phóng ghế HELD của đơn đó nếu có
    delete from public.showtime_seat_states
     where order_id = v_order.id and state = 'HELD';

    -- 3.2 Chuyển trạng thái đơn sang needs_manual_review (qua expired nếu đang holding/pending_payment)
    if v_order.status in ('holding', 'pending_payment') then
      update public.orders set status = 'expired' where id = v_order.id;
    end if;
    update public.orders set status = 'needs_manual_review' where id = v_order.id;

    -- 3.3 Cập nhật hoặc insert payments để theo dõi số tiền thực nhận
    select * into v_payment from public.payments where order_id = v_order.id for update;
    if found then
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

    -- 3.4 Ghi nhận sự kiện mismatch vào payment_events để đối soát PayOS (R-116, R-134)
    if p_transaction_ref is not null then
      insert into public.payment_events (
        cinema_id,
        order_code,
        transaction_ref,
        amount,
        event_status,
        signature_valid,
        occurred_at
      ) values (
        v_order.cinema_id,
        p_order_code,
        p_transaction_ref,
        p_amount,
        'AMOUNT_MISMATCH',
        true,
        now()
      )
      on conflict (transaction_ref) do update set
        event_status = 'AMOUNT_MISMATCH',
        amount = excluded.amount;
    end if;

    -- 3.5 Ghi audit log
    insert into public.audit_logs (
      cinema_id,
      table_name,
      record_id,
      action,
      before_data,
      after_data
    ) values (
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

  -- 4. Trường hợp A: Đơn đang ở 'holding' hoặc 'pending_payment'
  if v_order.status in ('holding', 'pending_payment') then
    -- Kiểm tra xem có ghế nào của đơn bị đơn khác chiếm trong showtime_seat_states không
    select exists (
      select 1
      from public.order_seats os
      join public.showtime_seat_states sss
        on sss.showtime_id = v_order.showtime_id
       and sss.seat_id = os.seat_id
      where os.order_id = v_order.id
        and sss.order_id <> v_order.id
    ) into v_conflict_held;

    if v_conflict_held then
      -- Ghế đã bị đơn khác chiếm (race condition khi hold vừa hết hạn): chuyển manual review (Defect 1)
      -- Xoá ghế HELD còn sót của đơn này nếu có
      delete from public.showtime_seat_states
       where order_id = v_order.id and state = 'HELD';

      if v_order.status in ('holding', 'pending_payment') then
        update public.orders
           set status = 'expired'
         where id = v_order.id;
      end if;

      update public.orders
         set status = 'needs_manual_review'
       where id = v_order.id;

      -- Cập nhật hoặc insert payments để ghi nhận tiền đã về
      select * into v_payment from public.payments where order_id = v_order.id for update;
      if found then
        update public.payments
           set status = 'PAID',
               paid_at = coalesce(paid_at, now()),
               transaction_ref = coalesce(p_transaction_ref, transaction_ref),
               order_code = coalesce(p_order_code, order_code)
         where id = v_payment.id;
      else
        insert into public.payments (
          order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
        ) values (
          v_order.id,
          v_order.cinema_id,
          coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
          p_amount,
          'PAID',
          p_transaction_ref,
          now()
        );
      end if;

      -- Enqueue email hướng dẫn khách liên hệ rạp (AC-11)
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
            'reason', 'SEATS_TAKEN'
          ),
          v_order.cinema_id,
          'PENDING'
        );
      end if;

      return jsonb_build_object(
        'success', false,
        'status', 'NEEDS_MANUAL_REVIEW',
        'order_id', v_order.id,
        'message', 'Ghế đã bị chiếm bởi đơn khác trong thời gian thanh toán'
      );
    end if;

    -- Ghế không bị chiếm: Chuyển ghế sang SOLD
    insert into public.showtime_seat_states (
      showtime_id, seat_id, room_id, cinema_id, state, source, expires_at, order_id
    )
    select
      v_order.showtime_id,
      os.seat_id,
      s.room_id,
      v_order.cinema_id,
      'SOLD'::public.seat_state,
      v_order.channel,
      null,
      v_order.id
    from public.order_seats os
    join public.showtimes s on s.id = v_order.showtime_id
    where os.order_id = v_order.id
    on conflict (showtime_id, seat_id) do update set
      state = 'SOLD',
      expires_at = null,
      order_id = v_order.id;

    -- Sinh booking_code (nếu chưa có)
    if v_order.booking_code is null then
      v_booking_code := public.generate_booking_code(v_order.cinema_code);
    else
      v_booking_code := v_order.booking_code;
    end if;

    -- Chuyển trạng thái đơn sang paid
    update public.orders
       set status = 'paid',
           booking_code = v_booking_code
     where id = v_order.id;

    -- Cập nhật hoặc insert payments (Defect 4: dùng sequence an toàn)
    select * into v_payment from public.payments where order_id = v_order.id for update;
    if found then
      update public.payments
         set status = 'PAID',
             paid_at = coalesce(paid_at, now()),
             transaction_ref = coalesce(p_transaction_ref, transaction_ref),
             order_code = coalesce(p_order_code, order_code)
       where id = v_payment.id;
    else
      insert into public.payments (
        order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
      ) values (
        v_order.id,
        v_order.cinema_id,
        coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
        p_amount,
        'PAID',
        p_transaction_ref,
        now()
      );
    end if;

    -- Chuyển voucher_redemptions sang CONSUMED
    update public.voucher_redemptions
       set status = 'CONSUMED'
     where order_id = v_order.id and status = 'HELD';

    -- Sinh vé tickets (mỗi order_seats 1 vé)
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

    return jsonb_build_object(
      'success', true,
      'status', 'SUCCESS',
      'order_id', v_order.id,
      'booking_code', v_booking_code
    );

  -- 5. Trường hợp B: Tiền về muộn khi đơn đã 'expired' hoặc 'cancelled' (R-78, AC-11, #9/#10/#17)
  elsif v_order.status in ('expired', 'cancelled') then
    -- Lấy thông tin suất chiếu & rạp
    select s.status, s.starts_at, c.online_cutoff_minutes
      into v_showtime_status, v_starts_at, v_cinema_cutoff
      from public.showtimes s
      join public.cinemas c on c.id = s.cinema_id
     where s.id = v_order.showtime_id;

    -- Lấy mốc đóng bán online
    select coalesce(
      v_cinema_cutoff,
      (select (value->>0)::integer from public.app_settings where key = 'default_online_cutoff_minutes'),
      15
    ) into v_cutoff_mins;

    -- Kiểm tra 3 điều kiện:
    -- (1) Suất vẫn ON_SALE
    -- (2) Chưa qua mốc đóng bán online
    -- (3) Mọi ghế của đơn còn trống (không có SOLD, không có HELD còn hạn của đơn khác, không bị lock)
    v_seats_available := not exists (
      select 1
      from public.order_seats os
      where os.order_id = v_order.id
        and (
          exists (
            select 1 from public.showtime_seat_states sss
            where sss.showtime_id = v_order.showtime_id
              and sss.seat_id = os.seat_id
              and (
                sss.state = 'SOLD'
                or (sss.state = 'HELD' and sss.expires_at > now() and sss.order_id <> v_order.id)
              )
          )
          or exists (
            select 1 from public.showtime_seat_locks ssl
            where ssl.showtime_id = v_order.showtime_id
              and ssl.seat_id = os.seat_id
          )
        )
    );

    if v_showtime_status = 'ON_SALE'
       and (v_starts_at - (v_cutoff_mins || ' minutes')::interval > now())
       and v_seats_available then
      -- ĐỦ ĐIỀU KIỆN: Tự động khôi phục và chốt bán
      insert into public.showtime_seat_states (
        showtime_id, seat_id, room_id, cinema_id, state, source, expires_at, order_id
      )
      select
        v_order.showtime_id,
        os.seat_id,
        s.room_id,
        v_order.cinema_id,
        'SOLD'::public.seat_state,
        v_order.channel,
        null,
        v_order.id
      from public.order_seats os
      join public.showtimes s on s.id = v_order.showtime_id
      where os.order_id = v_order.id
      on conflict (showtime_id, seat_id) do update set
        state = 'SOLD',
        expires_at = null,
        order_id = v_order.id;

      if v_order.booking_code is null then
        v_booking_code := public.generate_booking_code(v_order.cinema_code);
      else
        v_booking_code := v_order.booking_code;
      end if;

      update public.orders
         set status = 'paid',
             booking_code = v_booking_code
       where id = v_order.id;

      select * into v_payment from public.payments where order_id = v_order.id for update;
      if found then
        update public.payments
           set status = 'PAID',
               paid_at = coalesce(paid_at, now()),
               transaction_ref = coalesce(p_transaction_ref, transaction_ref),
               order_code = coalesce(p_order_code, order_code)
         where id = v_payment.id;
      else
        insert into public.payments (
          order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
        ) values (
          v_order.id,
          v_order.cinema_id,
          coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
          p_amount,
          'PAID',
          p_transaction_ref,
          now()
        );
      end if;

      update public.voucher_redemptions
         set status = 'CONSUMED'
       where order_id = v_order.id;

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

      return jsonb_build_object(
        'success', true,
        'status', 'SUCCESS',
        'recovered', true,
        'order_id', v_order.id,
        'booking_code', v_booking_code
      );
    else
      -- KHÔNG ĐỦ ĐIỀU KIỆN (ghế đã bán hoặc suất đóng/huỷ): Chuyển sang needs_manual_review (AC-11)
      update public.orders
         set status = 'needs_manual_review'
       where id = v_order.id;

      -- Cập nhật payments để ghi nhận tiền đã về
      select * into v_payment from public.payments where order_id = v_order.id for update;
      if found then
        update public.payments
           set status = 'PAID',
               paid_at = coalesce(paid_at, now()),
               transaction_ref = coalesce(p_transaction_ref, transaction_ref),
               order_code = coalesce(p_order_code, order_code)
         where id = v_payment.id;
      else
        insert into public.payments (
          order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
        ) values (
          v_order.id,
          v_order.cinema_id,
          coalesce(p_order_code, nextval('public.internal_payment_order_code_seq')),
          p_amount,
          'PAID',
          p_transaction_ref,
          now()
        );
      end if;

      -- Xoá HELD cũ nếu còn sót của đơn này
      delete from public.showtime_seat_states
       where order_id = v_order.id and state = 'HELD';

      -- KHÔNG sinh vé, Enqueue đúng 1 email hướng dẫn khách liên hệ rạp (AC-11)
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
            'reason', case
              when v_showtime_status <> 'ON_SALE' then 'SHOWTIME_NOT_ON_SALE'
              when not (v_starts_at - (v_cutoff_mins || ' minutes')::interval > now()) then 'ONLINE_CUTOFF_PASSED'
              else 'SEATS_UNAVAILABLE'
            end
          ),
          v_order.cinema_id,
          'PENDING'
        );
      end if;

      return jsonb_build_object(
        'success', false,
        'status', 'NEEDS_MANUAL_REVIEW',
        'order_id', v_order.id,
        'message', 'Tiền về muộn, không đủ điều kiện khôi phục tự động'
      );
    end if;

  else
    return jsonb_build_object(
      'success', false,
      'status', 'INVALID_STATE',
      'order_id', v_order.id,
      'current_status', v_order.status,
      'message', 'Đơn hàng không ở trạng thái hợp lệ để xác nhận thanh toán'
    );
  end if;
end;
$$;

revoke all on function public.confirm_paid(uuid, integer, text, bigint) from public, anon;
grant execute on function public.confirm_paid(uuid, integer, text, bigint) to service_role;

-- ============================================================================
-- 4. mark_payment_cancelled (R-77; quyết định #9, #10): huỷ / hết hạn PayOS -> nhả ghế
-- ============================================================================
create or replace function public.mark_payment_cancelled(
  p_order_id uuid,
  p_reason   text default 'CANCELLED'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order      public.orders;
  v_new_status public.order_status;
  v_pay_status public.payment_status;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'ORDER_NOT_FOUND', 'message', 'Đơn không tồn tại');
  end if;

  -- Idempotent nếu đơn đã ở cancelled hoặc expired
  if v_order.status in ('cancelled', 'expired') then
    return jsonb_build_object('success', true, 'status', v_order.status, 'order_id', v_order.id);
  end if;

  if v_order.status in ('paid', 'checked_in', 'affected', 'exchanged', 'refunded_manual') then
    raise exception 'Không thể huỷ đơn hàng đã thanh toán' using errcode = '23514';
  end if;

  if upper(coalesce(p_reason, '')) like '%EXPIRE%' then
    v_new_status := 'expired'::public.order_status;
    v_pay_status := 'EXPIRED'::public.payment_status;
  else
    v_new_status := 'cancelled'::public.order_status;
    v_pay_status := 'CANCELLED'::public.payment_status;
  end if;

  -- 1. Nhả ghế của đơn
  delete from public.showtime_seat_states where order_id = p_order_id;

  -- 2. Cập nhật payments nếu có
  update public.payments
     set status = v_pay_status
   where order_id = p_order_id and status = 'PENDING';

  -- 3. Cập nhật trạng thái đơn
  update public.orders
     set status = v_new_status
   where id = p_order_id;

  -- 4. Hoàn lượt voucher nếu có
  update public.voucher_redemptions
     set status = 'RELEASED'
   where order_id = p_order_id and status = 'HELD';

  return jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'order_id', p_order_id
  );
end;
$$;

revoke all on function public.mark_payment_cancelled(uuid, text) from public, anon;
grant execute on function public.mark_payment_cancelled(uuid, text) to service_role;

-- ============================================================================
-- 5. confirm_zero_amount (R-82): chốt đơn 0đ (voucher 100%) trực tiếp
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
  v_order        public.orders;
  v_booking_code text;
  v_to_email     text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'ORDER_NOT_FOUND', 'message', 'Đơn không tồn tại');
  end if;

  -- 1. Kiểm tra quyền sở hữu đơn hàng (chống BOLA/IDOR - Defect 2)
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    if auth.uid() is null or v_order.user_id is null or v_order.user_id <> auth.uid() then
      raise exception 'FORBIDDEN: Không có quyền xác nhận đơn hàng của người khác' using errcode = '42501';
    end if;
  elsif coalesce(auth.role(), '') <> 'service_role'
        and current_setting('role', true) not in ('postgres', 'supabase_admin')
        and current_user not in ('postgres', 'supabase_admin')
        and not public.is_admin() then
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

  -- Chuyển ghế sang SOLD
  insert into public.showtime_seat_states (
    showtime_id, seat_id, room_id, cinema_id, state, source, expires_at, order_id
  )
  select
    v_order.showtime_id,
    os.seat_id,
    s.room_id,
    v_order.cinema_id,
    'SOLD'::public.seat_state,
    v_order.channel,
    null,
    v_order.id
  from public.order_seats os
  join public.showtimes s on s.id = v_order.showtime_id
  where os.order_id = v_order.id
  on conflict (showtime_id, seat_id) do update set
    state = 'SOLD',
    expires_at = null,
    order_id = v_order.id;

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

-- ============================================================================
-- 6. confirm_pos_sale (R-125, R-128): xác nhận bán tại quầy POS
-- ============================================================================
create or replace function public.confirm_pos_sale(
  p_order_id   uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order          public.orders;
  v_showtime       public.showtimes;
  v_booking_code   text;
  v_seat_count     integer;
  v_held_count     integer;
  v_has_expired    boolean;
  v_to_email       text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'ORDER_NOT_FOUND', 'message', 'Đơn không tồn tại');
  end if;

  -- Idempotent theo request_id hoặc đã thanh toán (R-126)
  if v_order.status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'status', 'ALREADY_PAID',
      'order_id', v_order.id,
      'booking_code', v_order.booking_code
    );
  end if;

  if v_order.channel <> 'POS' then
    raise exception 'Đơn hàng không thuộc kênh POS' using errcode = '23514';
  end if;

  if v_order.status <> 'holding' then
    raise exception 'Đơn POS không ở trạng thái holding (hiện tại: %)', v_order.status using errcode = '23514';
  end if;

  -- 1. Kiểm tra trạng thái suất chiếu (R-127, AC-24 - Defect 3)
  select * into v_showtime from public.showtimes where id = v_order.showtime_id for share;
  if not found then
    raise exception 'SHOWTIME_NOT_FOUND: Suất chiếu không tồn tại' using errcode = '23514';
  end if;

  if v_showtime.status = 'CANCELLED' then
    raise exception 'SHOWTIME_CANCELLED: Suất chiếu đã bị huỷ, không thể bán vé' using errcode = '23514';
  end if;

  if v_showtime.status <> 'ON_SALE' then
    raise exception 'SHOWTIME_NOT_OPEN: Suất chiếu không ở trạng thái mở bán' using errcode = '23514';
  end if;

  -- 2. Kiểm tra ghế của đơn (R-125, R-128: chỉ ghế đang được chính POS đó giữ hợp lệ)
  select count(*) into v_seat_count from public.order_seats where order_id = p_order_id;
  if v_seat_count = 0 then
    raise exception 'Đơn hàng không có ghế nào' using errcode = '23514';
  end if;

  select count(*) into v_held_count
  from public.order_seats os
  join public.showtime_seat_states sss
    on sss.showtime_id = v_order.showtime_id
   and sss.seat_id = os.seat_id
   and sss.order_id = p_order_id
   and sss.source = 'POS'
   and sss.state = 'HELD'
   and sss.expires_at > now()
  where os.order_id = p_order_id;

  if v_held_count <> v_seat_count then
    -- Phân biệt nguyên nhân để báo lỗi chính xác
    select exists (
      select 1
      from public.order_seats os
      left join public.showtime_seat_states sss
        on sss.showtime_id = v_order.showtime_id
       and sss.seat_id = os.seat_id
       and sss.order_id = p_order_id
      where os.order_id = p_order_id
        and (sss.id is null or sss.expires_at <= now())
    ) into v_has_expired;

    if v_has_expired then
      raise exception 'HOLD_EXPIRED: Giữ ghế POS đã hết hạn' using errcode = '23514';
    else
      raise exception 'SEAT_TAKEN: Ghế không được giữ hợp lệ bởi chính đơn POS này' using errcode = '23514';
    end if;
  end if;

  -- Chuyển trạng thái ghế sang SOLD
  update public.showtime_seat_states
     set state = 'SOLD',
         expires_at = null
   where order_id = p_order_id;

  if v_order.booking_code is null then
    v_booking_code := public.generate_booking_code(v_order.cinema_code);
  else
    v_booking_code := v_order.booking_code;
  end if;

  update public.orders
     set status = 'paid',
         booking_code = v_booking_code
   where id = p_order_id;

  -- Tạo payments cho POS (không qua cổng PayOS) (Defect 4: dùng sequence an toàn)
  insert into public.payments (
    order_id, cinema_id, order_code, amount, status, transaction_ref, paid_at
  ) values (
    p_order_id,
    v_order.cinema_id,
    nextval('public.internal_payment_order_code_seq'),
    v_order.total_amount,
    'PAID',
    coalesce(p_request_id, 'POS_' || v_order.id::text),
    now()
  );

  update public.voucher_redemptions
     set status = 'CONSUMED'
   where order_id = p_order_id and status = 'HELD';

  -- Sinh vé tickets
  insert into public.tickets (order_id, order_seat_id, showtime_id, cinema_id, qr_token)
  select
    p_order_id,
    os.id,
    v_order.showtime_id,
    v_order.cinema_id,
    encode(extensions.gen_random_bytes(16), 'hex')
  from public.order_seats os
  where os.order_id = p_order_id
    and not exists (select 1 from public.tickets t where t.order_seat_id = os.id);

  -- Nếu đơn POS có để lại email liên hệ thì enqueue email vé
  v_to_email := v_order.contact_email::text;
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

  return jsonb_build_object(
    'success', true,
    'status', 'SUCCESS',
    'order_id', p_order_id,
    'booking_code', v_booking_code
  );
end;
$$;

revoke all on function public.confirm_pos_sale(uuid, text) from public, anon;
grant execute on function public.confirm_pos_sale(uuid, text) to service_role;
