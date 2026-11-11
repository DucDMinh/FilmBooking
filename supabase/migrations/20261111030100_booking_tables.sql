-- Layer 3 / task 02: đặt vé - đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn bị ảnh hưởng, check-in log.
-- orders, order_seats, showtime_seat_states (+ seat_status_public cho Realtime), tickets, payments,
-- payment_events, vouchers, voucher_redemptions, affected_order_actions, checkin_logs
-- + trigger bảo vệ suất đã bán vé (R-54) + máy trạng thái đơn (§8.5) + RLS.
--
-- Chỉ thêm đối tượng mới (CREATE TABLE/TYPE/FUNCTION/TRIGGER trên bảng mới; 1 trigger BEFORE mới trên
-- showtimes, không đổi cột/dữ liệu) -> additive, KHÔNG phải HIGH_RISK_MIGRATION. Không DROP, không backfill.
-- Không sửa showtimes_derive_end / policy showtimes_select (thuộc layer-3-task-01).
--
-- Bất biến chống bán trùng (NFR-04, R-62): UNIQUE (showtime_id, seat_id) trên showtime_seat_states.
-- Hold hết hạn "coi như trống khi đọc" (expires_at < now()); dòng HELD hết hạn vẫn chiếm unique cho tới khi
-- RPC giữ ghế / job nhả ghế xoá nó (RPC giữ ghế phải xoá HELD hết hạn của ghế đó trước khi insert).
-- Client không ghi trực tiếp các bảng này: ghi qua RPC SECURITY DEFINER / service role (task sau).
-- R-81: không có cột thẻ/tài khoản ngân hàng; payment_events không lưu raw payload.

-- ============================================================================
-- 1. Kiểu dữ liệu
-- ============================================================================
create type public.order_channel as enum ('WEB', 'POS');
-- §8.5 (+ checked_in, exchanged là trạng thái cuối của vòng đời)
create type public.order_status as enum (
  'holding', 'pending_payment', 'paid', 'expired', 'cancelled',
  'affected', 'needs_manual_review', 'refunded_manual', 'checked_in', 'exchanged'
);
create type public.seat_state as enum ('HELD', 'SOLD');
create type public.payment_status as enum ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED');
create type public.voucher_discount_type as enum ('PERCENT', 'FIXED');
create type public.voucher_scope as enum ('TICKET', 'COMBO', 'ORDER');
create type public.redemption_status as enum ('HELD', 'CONSUMED', 'RELEASED');
create type public.affected_action as enum ('EXCHANGED', 'REFUNDED_MANUAL');
create type public.checkin_result as enum (
  'SUCCESS', 'WRONG_CINEMA', 'OUTSIDE_WINDOW', 'ALREADY_USED', 'AFFECTED', 'INVALID'
);

-- ============================================================================
-- 2. Bảng
-- ============================================================================

-- 2.1 vouchers (R-90, R-92): Admin quản lý. discount_value: % (1..100) hoặc số tiền VND.
create table public.vouchers (
  id                uuid primary key default gen_random_uuid(),
  code              extensions.citext not null unique check (length(btrim(code::text)) > 0),
  discount_type     public.voucher_discount_type not null,
  discount_value    integer not null check (discount_value > 0),
  max_discount      integer check (max_discount > 0),
  applies_to        public.voucher_scope not null default 'ORDER',
  valid_from        timestamptz,
  valid_to          timestamptz,
  min_order_amount  integer not null default 0 check (min_order_amount >= 0),
  total_uses_limit  integer check (total_uses_limit > 0),
  per_user_limit    integer check (per_user_limit > 0),
  movie_id          uuid references public.movies (id) on delete set null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (discount_type <> 'PERCENT' or discount_value <= 100),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index vouchers_movie_id_idx on public.vouchers (movie_id);
create trigger vouchers_set_updated_at before update on public.vouchers
  for each row execute function public.set_updated_at();

-- 2.2 orders (R-54, R-83, R-85): snapshot suất để khách vẫn xem vé khi phim bị archive / ẩn khỏi RLS.
-- showtime_id ON DELETE RESTRICT: suất đã có đơn không xoá được.
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  channel             public.order_channel not null,
  cinema_id           uuid not null references public.cinemas (id),
  showtime_id         uuid not null references public.showtimes (id) on delete restrict,
  user_id             uuid references auth.users (id) on delete set null,
  status              public.order_status not null default 'holding',
  subtotal_amount     integer not null default 0 check (subtotal_amount >= 0),
  discount_amount     integer not null default 0 check (discount_amount >= 0),
  total_amount        integer not null default 0 check (total_amount >= 0),
  voucher_id          uuid references public.vouchers (id) on delete set null,
  booking_code        text unique check (booking_code ~ '^[A-Z0-9]{2,10}-[A-Z0-9]{6}$'),
  hold_expires_at     timestamptz,
  consent_at          timestamptz,
  age_confirmed       boolean not null default false,
  contact_email       extensions.citext,
  contact_phone       text,
  manual_review_resolved_at timestamptz,
  -- snapshot (điền bằng trigger từ suất, client không đặt được)
  movie_title         text not null,
  cinema_code         text not null,
  cinema_name         text not null,
  room_name           text not null,
  showtime_starts_at  timestamptz not null,
  showtime_ends_at    timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (discount_amount <= subtotal_amount),
  check (total_amount = subtotal_amount - discount_amount)
);
create index orders_user_id_idx on public.orders (user_id, created_at desc);
create index orders_cinema_status_idx on public.orders (cinema_id, status, created_at desc);
create index orders_showtime_id_idx on public.orders (showtime_id);
create index orders_voucher_id_idx on public.orders (voucher_id);
-- R-64: mỗi khách tối đa 1 đơn đang giữ ghế trên toàn chuỗi (tạo đơn mới phải huỷ đơn giữ cũ trước).
create unique index orders_one_holding_per_user_key on public.orders (user_id)
  where status = 'holding' and user_id is not null;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- 2.3 order_seats: giá chốt từng ghế (+ snapshot nhãn/loại ghế).
create table public.order_seats (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  seat_id      uuid not null references public.seats (id) on delete restrict,
  seat_label   text not null,
  seat_type    public.seat_type not null,
  price_amount integer not null check (price_amount >= 0),
  created_at   timestamptz not null default now(),
  unique (order_id, seat_id)
);
create index order_seats_seat_id_idx on public.order_seats (seat_id);

-- 2.4 showtime_seat_states: nguồn sự thật chống bán trùng. room_id/cinema_id điền từ suất bằng trigger.
create table public.showtime_seat_states (
  id          uuid primary key default gen_random_uuid(),
  showtime_id uuid not null,
  seat_id     uuid not null,
  room_id     uuid not null,
  cinema_id   uuid not null references public.cinemas (id) on delete cascade,
  state       public.seat_state not null,
  source      public.order_channel not null,
  expires_at  timestamptz,
  order_id    uuid not null references public.orders (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint showtime_seat_states_showtime_seat_key unique (showtime_id, seat_id),
  check ((state = 'HELD') = (expires_at is not null)),
  foreign key (showtime_id, room_id) references public.showtimes (id, room_id) on delete cascade,
  foreign key (seat_id, room_id) references public.seats (id, room_id) on delete cascade
);
create index showtime_seat_states_order_id_idx on public.showtime_seat_states (order_id);
create index showtime_seat_states_expiry_idx on public.showtime_seat_states (expires_at) where state = 'HELD';
create index showtime_seat_states_cinema_idx on public.showtime_seat_states (cinema_id);
create index showtime_seat_states_seat_idx on public.showtime_seat_states (seat_id, room_id);
create trigger showtime_seat_states_set_updated_at before update on public.showtime_seat_states
  for each row execute function public.set_updated_at();

-- 2.5 seat_status_public: bản công khai cho Realtime (không user_id/order_id). Chỉ trigger duy trì.
create table public.seat_status_public (
  showtime_id uuid not null,
  seat_id     uuid not null,
  state       public.seat_state not null,
  expires_at  timestamptz,
  primary key (showtime_id, seat_id)
);
-- DELETE event mang đủ cột để client lọc theo showtime_id.
alter table public.seat_status_public replica identity full;

-- 2.6 tickets (R-85): qr_token 128-bit ngẫu nhiên, không PII. Mỗi ghế 1 vé.
create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  order_seat_id   uuid not null unique references public.order_seats (id) on delete cascade,
  showtime_id     uuid not null references public.showtimes (id) on delete restrict,
  cinema_id       uuid not null references public.cinemas (id),
  qr_token        text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
                    check (qr_token ~ '^[0-9a-f]{32}$'),
  checked_in_at   timestamptz,
  checked_in_by   uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index tickets_order_id_idx on public.tickets (order_id);
create index tickets_showtime_id_idx on public.tickets (showtime_id);
create index tickets_cinema_id_idx on public.tickets (cinema_id);

-- 2.7 payments (R-81, R-83): chỉ mã giao dịch, số tiền, thời điểm, trạng thái.
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete restrict,
  cinema_id       uuid not null references public.cinemas (id),
  order_code      bigint not null unique check (order_code > 0),
  amount          integer not null check (amount >= 0),
  status          public.payment_status not null default 'PENDING',
  payment_link_id text,
  transaction_ref text unique,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index payments_order_id_idx on public.payments (order_id);
create index payments_cinema_status_idx on public.payments (cinema_id, status);
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- 2.8 payment_events: nhật ký webhook, UNIQUE mã giao dịch -> idempotent (R-75). Không lưu raw payload.
create table public.payment_events (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid references public.payments (id) on delete set null,
  cinema_id       uuid references public.cinemas (id) on delete set null,
  order_code      bigint,
  transaction_ref text unique,
  amount          integer check (amount >= 0),
  event_status    text not null,
  signature_valid boolean not null,
  occurred_at     timestamptz,
  received_at     timestamptz not null default now()
);
create index payment_events_payment_id_idx on public.payment_events (payment_id);
create index payment_events_cinema_id_idx on public.payment_events (cinema_id);

-- 2.9 voucher_redemptions (R-93): lượt dùng giữ cùng đơn, hoàn lại khi đơn huỷ/hết hạn.
create table public.voucher_redemptions (
  id              uuid primary key default gen_random_uuid(),
  voucher_id      uuid not null references public.vouchers (id) on delete cascade,
  order_id        uuid not null unique references public.orders (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  discount_amount integer not null check (discount_amount >= 0),
  status          public.redemption_status not null default 'HELD',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index voucher_redemptions_voucher_idx on public.voucher_redemptions (voucher_id, status);
create index voucher_redemptions_user_idx on public.voucher_redemptions (user_id);
create trigger voucher_redemptions_set_updated_at before update on public.voucher_redemptions
  for each row execute function public.set_updated_at();

-- 2.10 affected_order_actions (R-110, quyết định #6): Staff/Manager ghi kết quả đổi/hoàn thủ công
-- cho đơn `affected` của rạp mình. cinema_id lấy từ đơn (trigger), không do client đặt.
create table public.affected_order_actions (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete restrict,
  cinema_id        uuid not null references public.cinemas (id),
  action           public.affected_action not null,
  note             text,
  refund_reference text,
  refunded_amount  integer check (refunded_amount >= 0),
  performed_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- hoàn tiền thủ công phải đủ trường bắt buộc (§8.5)
  check (action <> 'REFUNDED_MANUAL'
         or (refund_reference is not null and length(btrim(refund_reference)) > 0 and refunded_amount is not null))
);
create index affected_order_actions_order_idx on public.affected_order_actions (order_id);
create index affected_order_actions_cinema_idx on public.affected_order_actions (cinema_id, created_at desc);

-- 2.11 checkin_logs (R-99..R-102): mọi lần quét. Không lưu token thô, không PII. Chỉ RPC/service ghi.
create table public.checkin_logs (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid references public.tickets (id) on delete set null,
  scanner_cinema_id uuid not null references public.cinemas (id) on delete cascade,
  ticket_cinema_id  uuid references public.cinemas (id) on delete set null,
  showtime_id       uuid references public.showtimes (id) on delete set null,
  result            public.checkin_result not null,
  scanned_by        uuid default auth.uid() references auth.users (id) on delete set null,
  scanned_at        timestamptz not null default now()
);
create index checkin_logs_scanner_idx on public.checkin_logs (scanner_cinema_id, scanned_at desc);
create index checkin_logs_ticket_idx on public.checkin_logs (ticket_id);
create index checkin_logs_ticket_cinema_idx on public.checkin_logs (ticket_cinema_id);
create index checkin_logs_showtime_idx on public.checkin_logs (showtime_id);

-- ============================================================================
-- 3. Hàm nghiệp vụ / trigger
-- ============================================================================

-- 3.1 Suất đã bán vé? (R-54) - SECURITY DEFINER vì Manager không đọc được mọi đơn qua RLS.
create function public.showtime_has_sales(p_showtime_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.showtime_seat_states s
                  where s.showtime_id = p_showtime_id and s.state = 'SOLD')
      or exists (select 1 from public.orders o
                  where o.showtime_id = p_showtime_id
                    and o.status in ('paid', 'checked_in', 'affected', 'exchanged', 'refunded_manual', 'needs_manual_review'))
      or exists (select 1 from public.tickets t
                  where t.showtime_id = p_showtime_id);
$$;
revoke all on function public.showtime_has_sales(uuid) from public, anon, authenticated;

-- 3.2 R-54: suất đã bán không được xoá / đổi giờ, phòng, phim, rạp, định dạng. Đóng bán / huỷ vẫn cho (status).
-- SECURITY DEFINER để gọi được showtime_has_sales (đã revoke khỏi client).
create function public.showtimes_protect_sold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if public.showtime_has_sales(old.id) then
      raise exception 'Suất đã bán vé, không được xoá (chỉ đóng bán hoặc huỷ suất)' using errcode = '23514';
    end if;
    return old;
  end if;
  if (new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.room_id is distinct from old.room_id
      or new.movie_id is distinct from old.movie_id
      or new.cinema_id is distinct from old.cinema_id
      or new.format is distinct from old.format)
     and public.showtime_has_sales(old.id) then
    raise exception 'Suất đã bán vé, không được đổi giờ/phòng/phim/định dạng (chỉ đóng bán hoặc huỷ suất)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.showtimes_protect_sold() from public, anon, authenticated;
create trigger showtimes_protect_sold before update or delete on public.showtimes
  for each row execute function public.showtimes_protect_sold();

-- 3.3 orders: điền snapshot suất + cinema_id từ suất (client không đặt được).
create function public.orders_fill_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select s.cinema_id, s.starts_at, s.ends_at, m.title_vi, c.code as cinema_code, c.name as cinema_name, r.name as room_name
    into v
    from public.showtimes s
    join public.movies m on m.id = s.movie_id
    join public.cinemas c on c.id = s.cinema_id
    join public.rooms r on r.id = s.room_id
   where s.id = new.showtime_id;
  if not found then
    raise exception 'Suất chiếu không tồn tại' using errcode = '23503';
  end if;
  new.cinema_id := v.cinema_id;
  new.movie_title := v.title_vi;
  new.cinema_code := v.cinema_code;
  new.cinema_name := v.cinema_name;
  new.room_name := v.room_name;
  new.showtime_starts_at := v.starts_at;
  new.showtime_ends_at := v.ends_at;
  if new.booking_code is not null and new.booking_code not like (new.cinema_code || '-%') then
    raise exception 'Mã đặt vé phải bắt đầu bằng mã rạp' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_fill_snapshot() from public, anon, authenticated;
create trigger orders_fill_snapshot before insert on public.orders
  for each row execute function public.orders_fill_snapshot();

-- 3.4 orders: máy trạng thái §8.5 (áp cho mọi role, kể cả service_role) + bất biến định danh.
-- holding -> paid cho đơn 0đ (R-82) và bán trực tiếp POS.
create function public.orders_guard_transition()
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
       (old.status = 'holding'         and new.status in ('pending_payment', 'expired', 'cancelled', 'paid'))
    or (old.status = 'pending_payment' and new.status in ('paid', 'cancelled', 'expired'))
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
create trigger orders_guard_transition before update on public.orders
  for each row execute function public.orders_guard_transition();

-- 3.5 showtime_seat_states: điền room_id/cinema_id từ suất; đơn phải cùng suất; ghế đang khoá bị từ chối.
create function public.showtime_seat_states_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_cinema uuid;
  v_order_showtime uuid;
begin
  select s.room_id, s.cinema_id into v_room, v_cinema from public.showtimes s where s.id = new.showtime_id;
  if not found then
    raise exception 'Suất chiếu không tồn tại' using errcode = '23503';
  end if;
  select o.showtime_id into v_order_showtime from public.orders o where o.id = new.order_id;
  if v_order_showtime is distinct from new.showtime_id then
    raise exception 'Đơn không thuộc suất này' using errcode = '23514';
  end if;
  if not exists (select 1 from public.seats st
                  where st.id = new.seat_id and st.room_id = v_room
                    and st.seat_type in ('NORMAL', 'VIP', 'SWEETBOX')) then
    raise exception 'Ghế không thuộc phòng chiếu hoặc không bán được' using errcode = '23514';
  end if;
  if exists (select 1 from public.showtime_seat_locks l
              where l.showtime_id = new.showtime_id and l.seat_id = new.seat_id) then
    raise exception 'Ghế đang bị khoá' using errcode = '23514';
  end if;
  new.room_id := v_room;
  new.cinema_id := v_cinema;
  return new;
end;
$$;
revoke all on function public.showtime_seat_states_fill() from public, anon, authenticated;
create trigger showtime_seat_states_fill before insert on public.showtime_seat_states
  for each row execute function public.showtime_seat_states_fill();

-- 3.5b showtime_seat_locks (R-55): không khoá đè lên ghế đã bán hoặc đang được giữ còn hạn.
create function public.showtime_seat_locks_guard_taken()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.showtime_seat_states s
              where s.showtime_id = new.showtime_id and s.seat_id = new.seat_id
                and (s.state = 'SOLD' or (s.state = 'HELD' and s.expires_at > now()))) then
    raise exception 'Ghế đang được giữ hoặc đã bán, không thể khoá' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.showtime_seat_locks_guard_taken() from public, anon, authenticated;
create trigger showtime_seat_locks_guard_taken before insert on public.showtime_seat_locks
  for each row execute function public.showtime_seat_locks_guard_taken();

-- 3.5c R-29: khi ẩn danh hoá profile (xoá tài khoản), tự động xoá PII khỏi orders & voucher_redemptions
-- nhưng giữ nguyên dòng đơn/vé/thanh toán cho kế toán rạp.
create function public.profiles_scrub_order_pii()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email is not null and new.email is null and new.full_name is null and new.phone is null then
    update public.orders
       set user_id = null, contact_email = null, contact_phone = null
     where user_id = new.id;
    update public.voucher_redemptions
       set user_id = null
     where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_scrub_order_pii() from public, anon, authenticated;
create trigger profiles_scrub_order_pii after update on public.profiles
  for each row execute function public.profiles_scrub_order_pii();

-- 3.6 Duy trì seat_status_public trong cùng transaction (không lộ user_id/order_id).
create function public.seat_status_public_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.seat_status_public where showtime_id = old.showtime_id and seat_id = old.seat_id;
    return old;
  end if;
  if tg_op = 'UPDATE' and (old.showtime_id, old.seat_id) is distinct from (new.showtime_id, new.seat_id) then
    delete from public.seat_status_public where showtime_id = old.showtime_id and seat_id = old.seat_id;
  end if;
  insert into public.seat_status_public (showtime_id, seat_id, state, expires_at)
  values (new.showtime_id, new.seat_id, new.state, new.expires_at)
  on conflict (showtime_id, seat_id) do update set state = excluded.state, expires_at = excluded.expires_at;
  return new;
end;
$$;
revoke all on function public.seat_status_public_sync() from public, anon, authenticated;
create trigger seat_status_public_sync after insert or update or delete on public.showtime_seat_states
  for each row execute function public.seat_status_public_sync();

-- 3.7 tickets / payments / affected_order_actions: cinema_id luôn lấy từ đơn.
create function public.fill_cinema_from_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cinema uuid;
begin
  select o.cinema_id into v_cinema from public.orders o where o.id = new.order_id;
  if v_cinema is null then
    raise exception 'Đơn không tồn tại' using errcode = '23503';
  end if;
  new.cinema_id := v_cinema;
  return new;
end;
$$;
revoke all on function public.fill_cinema_from_order() from public, anon, authenticated;
create trigger tickets_fill_cinema before insert on public.tickets
  for each row execute function public.fill_cinema_from_order();
create trigger payments_fill_cinema before insert on public.payments
  for each row execute function public.fill_cinema_from_order();
create trigger affected_order_actions_fill_cinema before insert on public.affected_order_actions
  for each row execute function public.fill_cinema_from_order();

-- 3.8 affected_order_actions: chỉ cho đơn `affected`; ghi xong chuyển đơn sang exchanged/refunded_manual.
create function public.affected_order_actions_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.status = 'affected') then
    raise exception 'Chỉ ghi nhận đổi/hoàn cho đơn ở trạng thái affected' using errcode = '23514';
  end if;
  return new;
end;
$$;
create function public.affected_order_actions_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
     set status = case new.action when 'EXCHANGED' then 'exchanged'::public.order_status
                                  else 'refunded_manual'::public.order_status end
   where id = new.order_id;
  return null;
end;
$$;
revoke all on function public.affected_order_actions_validate() from public, anon, authenticated;
revoke all on function public.affected_order_actions_apply() from public, anon, authenticated;
create trigger affected_order_actions_validate before insert on public.affected_order_actions
  for each row execute function public.affected_order_actions_validate();
create trigger affected_order_actions_apply after insert on public.affected_order_actions
  for each row execute function public.affected_order_actions_apply();

-- 3.9 Helper RLS: xem được đơn (chủ đơn / Admin / Staff-Manager rạp của đơn).
create function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        o.user_id = (select auth.uid())
        or public.is_admin()
        or public.has_cinema_role(o.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[])
      )
  );
$$;
revoke all on function public.can_view_order(uuid) from public, anon;
grant execute on function public.can_view_order(uuid) to authenticated, service_role;

-- 3.10 Audit (R-103 lịch sử trạng thái, R-107)
create trigger orders_audit after insert or update or delete on public.orders
  for each row execute function public.audit_row_change('cinema_id');
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_row_change('cinema_id');
create trigger tickets_audit after insert or update or delete on public.tickets
  for each row execute function public.audit_row_change('cinema_id');
create trigger vouchers_audit after insert or update or delete on public.vouchers
  for each row execute function public.audit_row_change();
create trigger affected_order_actions_audit after insert or update or delete on public.affected_order_actions
  for each row execute function public.audit_row_change('cinema_id');

-- ============================================================================
-- 4. RLS + GRANT (thu hẹp quyền bảng trước, policy lọc dòng sau)
-- ============================================================================
alter table public.vouchers               enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_seats            enable row level security;
alter table public.showtime_seat_states   enable row level security;
alter table public.seat_status_public     enable row level security;
alter table public.tickets                enable row level security;
alter table public.payments               enable row level security;
alter table public.payment_events         enable row level security;
alter table public.voucher_redemptions    enable row level security;
alter table public.affected_order_actions enable row level security;
alter table public.checkin_logs           enable row level security;

revoke all on public.vouchers, public.orders, public.order_seats, public.showtime_seat_states,
              public.seat_status_public, public.tickets, public.payments, public.payment_events,
              public.voucher_redemptions, public.affected_order_actions, public.checkin_logs
  from anon, authenticated;

-- orders / order_seats / tickets / payments: đọc theo can_view_order; ghi qua RPC/service role.
grant select on public.orders, public.order_seats, public.tickets, public.payments to authenticated;
create policy orders_select on public.orders for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
  );
create policy order_seats_select on public.order_seats for select to authenticated
  using (public.can_view_order(order_id));
create policy tickets_select on public.tickets for select to authenticated
  using (public.can_view_order(order_id));
create policy payments_select on public.payments for select to authenticated
  using (public.can_view_order(order_id));

-- showtime_seat_states: chứa order_id -> chỉ chủ đơn / nhân sự rạp; khách khác dùng seat_status_public.
grant select on public.showtime_seat_states to authenticated;
create policy showtime_seat_states_select on public.showtime_seat_states for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
    or public.can_view_order(order_id)
  );

-- seat_status_public: công khai, chỉ đọc.
grant select on public.seat_status_public to anon, authenticated;
create policy seat_status_public_select on public.seat_status_public for select to anon, authenticated using (true);

-- payment_events: Admin + Manager rạp (đối soát).
grant select on public.payment_events to authenticated;
create policy payment_events_select on public.payment_events for select to authenticated
  using (
    (select public.is_admin())
    or (cinema_id is not null and (select public.has_cinema_role(cinema_id, array['MANAGER']::public.staff_role[])))
  );

-- vouchers: Admin CRUD; Manager chỉ xem (R-90). Khách kiểm mã qua RPC (chống dò mã, R-95).
grant select, insert, update, delete on public.vouchers to authenticated;
create policy vouchers_select on public.vouchers for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.staff_assignments sa
               where sa.user_id = (select auth.uid()) and sa.role = 'MANAGER')
  );
create policy vouchers_admin_insert on public.vouchers for insert to authenticated with check ((select public.is_admin()));
create policy vouchers_admin_update on public.vouchers for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy vouchers_admin_delete on public.vouchers for delete to authenticated using ((select public.is_admin()));

-- voucher_redemptions: chủ lượt dùng / người xem được đơn.
grant select on public.voucher_redemptions to authenticated;
create policy voucher_redemptions_select on public.voucher_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_order(order_id));

-- affected_order_actions: Staff/Manager/Admin rạp của đơn đọc + ghi kết quả (quyết định #6).
grant select on public.affected_order_actions to authenticated;
grant insert (order_id, action, note, refund_reference, refunded_amount) on public.affected_order_actions to authenticated;
create policy affected_order_actions_select on public.affected_order_actions for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
  );
create policy affected_order_actions_insert on public.affected_order_actions for insert to authenticated
  with check (
    (select public.is_admin())
    or (select public.has_cinema_role(cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
  );

-- checkin_logs: Admin; Staff/Manager rạp quét; Manager rạp sở hữu vé. Chỉ RPC/service ghi.
grant select on public.checkin_logs to authenticated;
create policy checkin_logs_select on public.checkin_logs for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_cinema_role(scanner_cinema_id, array['STAFF', 'MANAGER']::public.staff_role[]))
    or (ticket_cinema_id is not null
        and (select public.has_cinema_role(ticket_cinema_id, array['MANAGER']::public.staff_role[])))
  );

-- ============================================================================
-- 5. Realtime: postgres_changes tôn trọng RLS -> chỉ đưa bảng công khai vào publication.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.seat_status_public;
  end if;
end;
$$;
