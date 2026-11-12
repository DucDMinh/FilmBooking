-- bug-layer34-review / phase-1 / task-05 — K4: chống bán trùng ghế.
--
-- Nguyên nhân gốc (độc lập review layer 3-4): confirm_paid kiểm tra "ghế còn trống" bằng SELECT không khoá,
-- rồi chốt bán bằng INSERT .. ON CONFLICT DO UPDATE vô điều kiện. Hai đơn expired cùng giữ 1 ghế, tiền về
-- đồng thời: cả hai qua bước kiểm tra, phiên sau chờ unique index rồi GHI ĐÈ dòng SOLD của phiên trước
-- => cả hai đơn 'paid' + 2 vé cùng ghế x suất. Bảng tickets không có ràng buộc ghế x suất.
--
-- Sửa (additive, không sửa migration cũ):
--  1. tickets.seat_id (denormalize từ order_seats, trigger điền) + UNIQUE INDEX (showtime_id, seat_id):
--     bất biến DB "một ghế x một suất tối đa một vé". tickets không có cột trạng thái và vé không bị xoá
--     (cancel_showtimes giữ vé, suất chuyển CANCELLED nên ghế không bán lại được) => mọi vé đều còn hiệu lực.
--  2. sell_order_seats(order): khoá dòng seat_state theo seat_id, rồi chiếm ghế bằng ON CONFLICT DO UPDATE
--     CÓ ĐIỀU KIỆN (chỉ ghế của chính đơn hoặc HELD đã hết hạn của đơn khác); thiếu ghế nào -> subtransaction
--     rollback + trả false. Không bao giờ ghi đè SOLD/HELD còn hạn của đơn khác.
--  3. confirm_paid dùng sell_order_seats ở cả nhánh holding/pending_payment và nhánh tiền về muộn.
--     Ghế đã thuộc đơn khác -> đơn NÀY chuyển needs_manual_review (trạng thái "cần hoàn tiền thủ công" sẵn có,
--     AC-11), payments=PAID ghi nhận tiền đã về, email LATE_PAYMENT_MANUAL_REVIEW, trả
--     {success:false,status:'NEEDS_MANUAL_REVIEW'} (kết quả xác định, giao dịch commit => PayOS không retry vô hạn).
--
-- Migration an toàn: nếu dữ liệu hiện có đã vi phạm (2 vé cùng ghế x suất) thì migration FAIL rõ ràng,
-- KHÔNG xoá/sửa dữ liệu. Phạm vi KHÔNG làm: confirm_zero_amount (vẫn upsert; unique index vé là lớp chặn cuối),
-- cấu hình cutoff, voucher, hết hạn pending_payment... (các MAJOR khác, task riêng).

-- ============================================================================
-- 1. tickets.seat_id + unique index ghế x suất
-- ============================================================================
alter table public.tickets add column seat_id uuid;

-- Backfill: tắt trigger audit tạm thời để không sinh N dòng audit nhiễu cho thao tác bảo trì schema.
alter table public.tickets disable trigger tickets_audit;
update public.tickets t
   set seat_id = os.seat_id
  from public.order_seats os
 where os.id = t.order_seat_id;
alter table public.tickets enable trigger tickets_audit;

do $$
declare
  v_dup integer;
begin
  select count(*) into v_dup from (
    select 1 from public.tickets group by showtime_id, seat_id having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception 'K4 migration dừng: % cặp (showtime_id, seat_id) đang có nhiều hơn 1 vé; xử lý thủ công trước khi áp migration', v_dup
      using errcode = '23505';
  end if;
end;
$$;

alter table public.tickets alter column seat_id set not null;

create function public.tickets_fill_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seat uuid;
begin
  select os.seat_id into v_seat from public.order_seats os where os.id = new.order_seat_id;
  if v_seat is null then
    raise exception 'order_seat không tồn tại' using errcode = '23503';
  end if;
  new.seat_id := v_seat;
  return new;
end;
$$;
revoke all on function public.tickets_fill_seat() from public, anon, authenticated;
create trigger tickets_fill_seat before insert on public.tickets
  for each row execute function public.tickets_fill_seat();

create unique index tickets_one_ticket_per_showtime_seat on public.tickets (showtime_id, seat_id);

-- ============================================================================
-- 2. sell_order_seats: chiếm ghế SOLD cho đơn, có khoá và có điều kiện (nội bộ, chỉ SECURITY DEFINER gọi)
-- ============================================================================
create function public.sell_order_seats(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_seat_cnt  integer;
  v_done_cnt  integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  select count(*) into v_seat_cnt from public.order_seats where order_id = p_order_id;
  if v_seat_cnt = 0 then
    return true;
  end if;

  -- Khoá dòng ghế sẵn có theo thứ tự seat_id (thứ tự cố định giữa các phiên => không deadlock chéo).
  perform 1
     from public.showtime_seat_states sss
    where sss.showtime_id = v_order.showtime_id
      and sss.seat_id in (select seat_id from public.order_seats where order_id = p_order_id)
    order by sss.seat_id
      for update;

  begin
    -- Ghế chưa có dòng: insert; phiên khác insert trước thì chờ unique index rồi rơi vào DO UPDATE có WHERE.
    insert into public.showtime_seat_states as sss (
      showtime_id, seat_id, room_id, cinema_id, state, source, expires_at, order_id
    )
    select v_order.showtime_id, os.seat_id, s.room_id, v_order.cinema_id,
           'SOLD'::public.seat_state, v_order.channel, null, v_order.id
      from public.order_seats os
      join public.showtimes s on s.id = v_order.showtime_id
     where os.order_id = v_order.id
     order by os.seat_id
    on conflict (showtime_id, seat_id) do update set
      state = 'SOLD',
      expires_at = null,
      order_id = v_order.id
    where sss.order_id = v_order.id
       or (sss.state = 'HELD' and sss.expires_at <= now());
    get diagnostics v_done_cnt = row_count;

    if v_done_cnt <> v_seat_cnt then
      raise exception 'SEATS_TAKEN' using errcode = 'P0001';
    end if;
  exception
    -- P0001: có ghế thuộc đơn khác; 23514: ghế đang bị khoá vận hành (trigger fill). Subtransaction đã rollback.
    when sqlstate 'P0001' or sqlstate '23514' then
      return false;
  end;
  return true;
end;
$$;
revoke all on function public.sell_order_seats(uuid) from public, anon, authenticated, service_role;

-- ============================================================================
-- 3. confirm_paid (CREATE OR REPLACE: giữ chữ ký, SECURITY DEFINER, search_path, grant)
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

    -- K4: chốt ghế bằng sell_order_seats (khoá dòng, không ghi đè ghế đơn khác). Race giữa precheck và
    -- insert (đơn khác vừa chốt) -> false -> rơi vào nhánh manual review bên dưới.
    if not v_conflict_held then
      v_conflict_held := not public.sell_order_seats(v_order.id);
    end if;


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

    -- K4: chỉ chốt khi sell_order_seats chiếm đủ ghế (khoá dòng, không ghi đè); thất bại => nhánh manual review.
    if v_showtime_status = 'ON_SALE'
       and (v_starts_at - (v_cutoff_mins || ' minutes')::interval > now())
       and v_seats_available then
      v_seats_available := public.sell_order_seats(v_order.id);
    end if;


    if v_showtime_status = 'ON_SALE'
       and (v_starts_at - (v_cutoff_mins || ' minutes')::interval > now())
       and v_seats_available then
      -- ĐỦ ĐIỀU KIỆN: Tự động khôi phục và chốt bán
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

-- authenticated phải bị thu hồi: confirm_paid không kiểm caller, chỉ webhook (service_role) được gọi.
revoke all on function public.confirm_paid(uuid, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_paid(uuid, integer, text, bigint) to service_role;
