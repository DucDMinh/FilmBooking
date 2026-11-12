-- Reviewer repro (round 2) — KHÔNG phải test của dự án; BEGIN ... ROLLBACK, không đổi dữ liệu.
-- (1) DB local đang chạy đúng thân hàm confirm_paid như file migration 20261112110000 (so sánh sau khi chuẩn hoá khoảng trắng)
-- (2) ACL / SECURITY DEFINER / search_path
-- (3) Edge: đơn tiền-về-muộn CHƯA bị job quét (pending_payment quá hạn), lượt voucher vẫn HELD, voucher đã đầy trần
--     (chính lượt HELD này chiếm chỗ) -> phải SUCCESS, HELD -> CONSUMED, không vượt trần.
-- (4) Edge: đơn expired có voucher thật, voucher không giới hạn -> hồi sinh RELEASED -> CONSUMED.
-- (5) Edge: đơn expired có voucher thật nhưng mất ghế -> NMR, lượt giữ RELEASED.
begin;
select plan(9);

create temp table r2_def (body text);
insert into r2_def values ($def$
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
  select o.showtime_id into v_showtime_id from public.orders o where o.id = p_order_id;
  if found then
    select s.status, s.starts_at, c.online_cutoff_minutes, c.status
      into v_showtime_status, v_starts_at, v_cinema_cutoff, v_cinema_status
      from public.showtimes s
      join public.cinemas c on c.id = s.cinema_id
     where s.id = v_showtime_id
       for share of s;
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'ORDER_NOT_FOUND', 'message', 'Đơn hàng không tồn tại');
  end if;
  if v_order.status in ('paid', 'checked_in', 'affected', 'exchanged', 'refunded_manual') then
    return jsonb_build_object(
      'success', true,
      'status', 'ALREADY_PAID',
      'order_id', v_order.id,
      'booking_code', v_order.booking_code
    );
  end if;
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
  v_to_email := coalesce(
    v_order.contact_email::text,
    (select u.email::text from auth.users u where u.id = v_order.user_id)
  );
  select * into v_payment from public.payments where order_id = v_order.id for update;
  if p_amount <> v_order.total_amount then
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
    delete from public.showtime_seat_states
     where order_id = v_order.id and state = 'HELD';
    if v_order.status in ('holding', 'pending_payment') then
      update public.orders set status = 'expired' where id = v_order.id;
    end if;
    update public.orders set status = 'needs_manual_review' where id = v_order.id;
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
    insert into public.audit_logs (cinema_id, table_name, record_id, action, before_data, after_data)
    values (
      v_order.cinema_id,
      'orders',
      v_order.id::text,
      'UPDATE',
      jsonb_build_object('status', v_order.status, 'total_amount', v_order.total_amount),
      jsonb_build_object('status', 'needs_manual_review', 'paid_amount', p_amount, 'mismatch', true, 'transaction_ref', p_transaction_ref)
    );
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
  v_is_late := v_order.status in ('expired', 'cancelled')
               or (v_order.hold_expires_at is not null and v_order.hold_expires_at <= now());
  select coalesce(
    v_cinema_cutoff,
    (select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'default_online_cutoff_minutes'),
    15
  ) into v_cutoff_mins;
  if v_showtime_status is distinct from 'ON_SALE' then
    v_reason := 'SHOWTIME_NOT_ON_SALE';
  elsif v_cinema_status is distinct from 'OPEN' then
    v_reason := 'CINEMA_NOT_OPEN';
  elsif v_is_late and not (v_starts_at - make_interval(mins => v_cutoff_mins) > now()) then
    v_reason := 'ONLINE_CUTOFF_PASSED';
  end if;
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
  if v_reason is null and not public.sell_order_seats(v_order.id) then
    v_reason := case when v_is_late then 'SEATS_UNAVAILABLE' else 'SEATS_TAKEN' end;
  end if;
  if v_reason is null then
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
    update public.voucher_redemptions
       set status = 'CONSUMED'
     where order_id = v_order.id
       and (status = 'HELD' or (v_revive_voucher and status = 'RELEASED' and voucher_id = v_order.voucher_id));
    insert into public.tickets (order_id, order_seat_id, showtime_id, cinema_id, qr_token)
    select v_order.id, os.id, v_order.showtime_id, v_order.cinema_id, encode(extensions.gen_random_bytes(16), 'hex')
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
    if v_is_late then
      return jsonb_build_object('success', true, 'status', 'SUCCESS', 'recovered', true,
                                'order_id', v_order.id, 'booking_code', v_booking_code);
    end if;
    return jsonb_build_object('success', true, 'status', 'SUCCESS', 'order_id', v_order.id, 'booking_code', v_booking_code);
  end if;
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
$def$);

-- Chuẩn hoá: bỏ comment dòng (-- ...) và gộp mọi khoảng trắng; so sánh thân hàm trên DB với bản sao từ file migration
create function public.r2_norm(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(t, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
$$;
select is(
  (select public.r2_norm(p.prosrc) from pg_proc p where p.oid = 'public.confirm_paid(uuid,integer,text,bigint)'::regprocedure),
  (select public.r2_norm(body) from r2_def),
  'DB local: thân confirm_paid khớp file migration 20261112110000 (đã bỏ comment, chuẩn hoá khoảng trắng)');

select is(
  (select p.prosecdef::text || '/' || array_to_string(p.proconfig, ',') from pg_proc p
    where p.oid = 'public.confirm_paid(uuid,integer,text,bigint)'::regprocedure),
  'true/search_path=""', 'SECURITY DEFINER + search_path rỗng');
select is(
  (select has_function_privilege('anon', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute')::text || '/' ||
          has_function_privilege('authenticated', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute')::text || '/' ||
          has_function_privilege('service_role', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute')::text),
  'false/false/true', 'ACL: chỉ service_role');

-- ===== Fixture edge =====
create function public.r2_id(p_kind int, p_n int) returns uuid language sql immutable as $$
  select format('00000000-0000-0000-%s-%s', lpad(p_kind::text, 4, '0'), lpad((800 + p_n)::text, 12, '0'))::uuid
$$;
insert into public.provinces (id, code, name) values (public.r2_id(9, 1), 'R62', 'Tinh R62');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  (public.r2_id(1, 1), 'R621', 'Rap R62', public.r2_id(9, 1), '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  (public.r2_id(9, 2), 'phim-r-62', 'Phim R62', 120, '2026-12-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols)
values (public.r2_id(2, 1), public.r2_id(1, 1), 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  (public.r2_id(3, 1), public.r2_id(2, 1), public.r2_id(1, 1), 'A', 1, 'NORMAL', 'A1'),
  (public.r2_id(3, 2), public.r2_id(2, 1), public.r2_id(1, 1), 'A', 2, 'NORMAL', 'A2'),
  (public.r2_id(3, 3), public.r2_id(2, 1), public.r2_id(1, 1), 'A', 3, 'NORMAL', 'A3');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status)
values (public.r2_id(4, 1), public.r2_id(1, 1), public.r2_id(2, 1), public.r2_id(9, 2), now() + interval '2 days', '2D', 'ON_SALE');
insert into public.vouchers (id, code, discount_type, discount_value, min_order_amount, total_uses_limit, per_user_limit) values
  (public.r2_id(7, 1), 'R62V1', 'FIXED', 10000, 0, 1, null),
  (public.r2_id(7, 2), 'R62V2', 'FIXED', 10000, 0, null, null);

-- E1: pending_payment quá hạn chưa quét, voucher V1 (trần 1) lượt HELD của chính đơn này, ghế A1 HELD
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, voucher_id, hold_expires_at, contact_email)
values (public.r2_id(5, 1), 'WEB', public.r2_id(4, 1), 'pending_payment', 100000, 10000, 90000, public.r2_id(7, 1), now() - interval '1 minute', 'e1@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r2_id(5, 1), public.r2_id(3, 1), 'A1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
values (public.r2_id(4, 1), public.r2_id(3, 1), 'HELD', 'WEB', now() - interval '1 minute', public.r2_id(5, 1));
-- E2: expired, voucher V2 (không giới hạn), lượt RELEASED, ghế A2 trống
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, voucher_id, hold_expires_at, contact_email)
values (public.r2_id(5, 2), 'WEB', public.r2_id(4, 1), 'expired', 100000, 10000, 90000, public.r2_id(7, 2), now() - interval '5 minutes', 'e2@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r2_id(5, 2), public.r2_id(3, 2), 'A2', 'NORMAL', 100000);
-- E3: expired, voucher V2, lượt RELEASED, ghế A3 đã bị đơn paid E4 chốt
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email)
values (public.r2_id(5, 4), 'WEB', public.r2_id(4, 1), 'pending_payment', 100000, 100000, now() + interval '10 minutes', 'e4@example.com');
update public.orders set status = 'paid', booking_code = 'R621-000004' where id = public.r2_id(5, 4);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
values (public.r2_id(4, 1), public.r2_id(3, 3), 'SOLD', 'WEB', null, public.r2_id(5, 4));
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, voucher_id, hold_expires_at, contact_email)
values (public.r2_id(5, 3), 'WEB', public.r2_id(4, 1), 'expired', 100000, 10000, 90000, public.r2_id(7, 2), now() - interval '5 minutes', 'e3@example.com');
insert into public.order_seats (order_id, seat_id, seat_label, seat_type, price_amount)
values (public.r2_id(5, 3), public.r2_id(3, 3), 'A3', 'NORMAL', 100000);

insert into public.voucher_redemptions (voucher_id, order_id, user_id, discount_amount, status) values
  (public.r2_id(7, 1), public.r2_id(5, 1), null, 10000, 'HELD'),
  (public.r2_id(7, 2), public.r2_id(5, 2), null, 10000, 'RELEASED'),
  (public.r2_id(7, 2), public.r2_id(5, 3), null, 10000, 'RELEASED');

create temp table r2_res (k text primary key, r jsonb);
insert into r2_res values ('e1', public.confirm_paid(public.r2_id(5, 1), 90000, 'R62_TX_1', 6290001));
insert into r2_res values ('e2', public.confirm_paid(public.r2_id(5, 2), 90000, 'R62_TX_2', 6290002));
insert into r2_res values ('e3', public.confirm_paid(public.r2_id(5, 3), 90000, 'R62_TX_3', 6290003));

select is((select r->>'status' from r2_res where k = 'e1'), 'SUCCESS',
  'E1 pending_payment quá hạn chưa quét + voucher HELD (đầy trần do chính lượt này) -> SUCCESS');
select is((select status::text from public.voucher_redemptions where order_id = public.r2_id(5, 1)) || '/' ||
          (select count(*) from public.voucher_redemptions where voucher_id = public.r2_id(7, 1) and status in ('HELD','CONSUMED')),
  'CONSUMED/1', 'E1 HELD -> CONSUMED, V1 không vượt trần');
select is((select r->>'status' from r2_res where k = 'e2') || '/' ||
          (select status::text from public.voucher_redemptions where order_id = public.r2_id(5, 2)),
  'SUCCESS/CONSUMED', 'E2 expired + voucher không giới hạn -> hồi sinh CONSUMED');
select is((select r->>'status' from r2_res where k = 'e3') || '/' ||
          (select status::text from public.voucher_redemptions where order_id = public.r2_id(5, 3)),
  'NEEDS_MANUAL_REVIEW/RELEASED', 'E3 expired mất ghế -> NMR, lượt giữ RELEASED');
select is((select count(*)::int from public.tickets where order_id = public.r2_id(5, 3)), 0, 'E3 không vé');
select is((select state::text from public.showtime_seat_states where seat_id = public.r2_id(3, 3)) || '/' ||
          (select order_id::text from public.showtime_seat_states where seat_id = public.r2_id(3, 3)),
  'SOLD/' || public.r2_id(5, 4)::text, 'E3 ghế của đơn paid khác không bị ghi đè');

select * from finish();
rollback;
