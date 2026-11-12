-- ============================================================================
-- pgTAP Test: 047_double_sell.test.sql
-- bug-layer34-review K4: chống bán trùng ghế (NFR-02/17, R-62, AC-11).
--  Phần 1 (trong transaction): hai đơn expired cùng ghế, tiền về lần lượt -> chỉ 1 paid;
--           unique index vé ghế x suất tồn tại và chặn insert trùng.
--  Phần 2 (đồng thời THẬT, 2 phiên dblink): hai webhook confirm_paid chạy chồng nhau
--           cho 2 đơn khác nhau cùng 1 ghế -> đúng 1 paid, 1 vé, 1 dòng SOLD.
--  Phần 2 commit dữ liệu thật qua dblink (không rollback được) nên tự dọn trước và sau.
-- ============================================================================
begin;
select plan(30);

create extension if not exists dblink with schema extensions;

-- ---------------------------------------------------------------------------
-- Phần 1: fixture trong transaction (id tiền tố 4700.. / mã rạp T4xx, tách biệt fixture dblink)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000047000a1', 'T47', 'Tỉnh Test 47');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000047000c1', 'T471', 'Rạp T47-1', '00000000-0000-0000-0000-0000047000a1', '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000470e001', 'phim-test-47', 'Phim 47', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'P1', '{2D}', 3, 3);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000470b101', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-00000470b102', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'A', 2, 'NORMAL', 'A2');
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000470a501', '00000000-0000-0000-0000-0000047000c1',
   '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-00000470e001',
   now() + interval '2 days', '2D', 'ON_SALE');

-- Hai đơn expired cùng giữ ghế A1 (hold của cả hai đã hết hạn, dòng seat_state đã dọn)
insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-470000000001', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 100000, 100000, 'k4a@example.com'),
  ('00000000-0000-0000-0000-470000000002', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 100000, 100000, 'k4b@example.com'),
  ('00000000-0000-0000-0000-470000000003', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 100000, 100000, 'k4c@example.com');
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-470000006001', '00000000-0000-0000-0000-470000000001', '00000000-0000-0000-0000-00000470b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006002', '00000000-0000-0000-0000-470000000002', '00000000-0000-0000-0000-00000470b101', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006003', '00000000-0000-0000-0000-470000000003', '00000000-0000-0000-0000-00000470b101', 'A1', 'NORMAL', 100000);

-- Tiền đơn 1 về muộn -> khôi phục + chốt bán
select is(
  (public.confirm_paid('00000000-0000-0000-0000-470000000001', 100000, 'T47_TX_1', 4700101))->>'status',
  'SUCCESS',
  'Đơn 1 (expired) tiền về muộn, ghế trống -> SUCCESS'
);

-- Tiền đơn 2 về muộn trên cùng ghế đã bán cho đơn 1 -> KHÔNG chốt bán
select is(
  (public.confirm_paid('00000000-0000-0000-0000-470000000002', 100000, 'T47_TX_2', 4700102))->>'status',
  'NEEDS_MANUAL_REVIEW',
  'Đơn 2 (expired) tiền về muộn khi ghế đã thuộc đơn 1 -> NEEDS_MANUAL_REVIEW (chờ hoàn tiền)'
);

select is(
  (select count(*) from public.orders
    where id in ('00000000-0000-0000-0000-470000000001', '00000000-0000-0000-0000-470000000002') and status = 'paid'),
  1::bigint,
  'Trong hai đơn cùng ghế chỉ có đúng 1 đơn paid'
);

select is(
  (select status::text from public.orders where id = '00000000-0000-0000-0000-470000000002'),
  'needs_manual_review',
  'Đơn 2 ở trạng thái needs_manual_review (tiền đã về, cần hoàn tiền thủ công)'
);

select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-470000000002'),
  0::bigint,
  'Đơn 2 không có vé'
);

select is(
  (select order_id::text from public.showtime_seat_states
    where showtime_id = '00000000-0000-0000-0000-00000470a501' and seat_id = '00000000-0000-0000-0000-00000470b101'),
  '00000000-0000-0000-0000-470000000001',
  'Ghế A1 vẫn SOLD cho đơn 1, không bị đơn 2 ghi đè'
);

-- Unique index vé ghế x suất (bất biến DB, chặn cả khi RPC có lỗi)
select ok(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and tablename = 'tickets'
             and indexname = 'tickets_one_ticket_per_showtime_seat' and indexdef ilike '%unique%'),
  'Tồn tại unique index tickets_one_ticket_per_showtime_seat (showtime_id, seat_id)'
);

select throws_ok(
  $$ insert into public.tickets (order_id, order_seat_id, showtime_id)
     values ('00000000-0000-0000-0000-470000000003', '00000000-0000-0000-0000-470000006003',
             '00000000-0000-0000-0000-00000470a501') $$,
  '23505',
  null,
  'Insert vé thứ hai cho cùng ghế x suất bị unique index chặn (23505)'
);

-- ---------------------------------------------------------------------------
-- Phần 1b: quyền EXECUTE (confirm_paid không kiểm caller => chỉ service_role; helper nội bộ => không ai)
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute'),
  'anon KHÔNG gọi được confirm_paid');
select ok(not has_function_privilege('authenticated', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute'),
  'authenticated KHÔNG gọi được confirm_paid (tránh khách tự chốt đơn không trả tiền)');
select ok(has_function_privilege('service_role', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute'),
  'service_role gọi được confirm_paid');
select ok(not has_function_privilege('anon', 'public.sell_order_seats(uuid)', 'execute'),
  'anon KHÔNG gọi được sell_order_seats');
select ok(not has_function_privilege('authenticated', 'public.sell_order_seats(uuid)', 'execute'),
  'authenticated KHÔNG gọi được sell_order_seats');
select ok(not has_function_privilege('service_role', 'public.sell_order_seats(uuid)', 'execute'),
  'service_role KHÔNG gọi được sell_order_seats (chỉ hàm SECURITY DEFINER nội bộ)');

-- ---------------------------------------------------------------------------
-- Phần 1c: sell_order_seats (gọi trực tiếp bằng owner để bỏ qua precheck, mô phỏng race)
-- ---------------------------------------------------------------------------
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-00000470b103', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'A', 3, 'NORMAL', 'A3'),
  ('00000000-0000-0000-0000-00000470b111', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'B', 1, 'NORMAL', 'B1'),
  ('00000000-0000-0000-0000-00000470b112', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'B', 2, 'NORMAL', 'B2'),
  ('00000000-0000-0000-0000-00000470b113', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'B', 3, 'NORMAL', 'B3'),
  ('00000000-0000-0000-0000-00000470b121', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1', 'C', 1, 'NORMAL', 'C1');

insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, contact_email) values
  ('00000000-0000-0000-0000-470000000011', 'WEB', '00000000-0000-0000-0000-00000470a501', 'paid',    100000, 100000, 'q@example.com'),   -- Q: đã bán A3
  ('00000000-0000-0000-0000-470000000012', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 200000, 200000, 'p@example.com'),   -- P: A2 + A3
  ('00000000-0000-0000-0000-470000000013', 'WEB', '00000000-0000-0000-0000-00000470a501', 'holding', 200000, 200000, 'r@example.com'),   -- R: giữ B1 (còn hạn) + B2 (hết hạn)
  ('00000000-0000-0000-0000-470000000014', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 100000, 100000, 'p2@example.com'),  -- P2: B1
  ('00000000-0000-0000-0000-470000000015', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 100000, 100000, 't@example.com'),   -- T: B2
  ('00000000-0000-0000-0000-470000000016', 'WEB', '00000000-0000-0000-0000-00000470a501', 'expired', 100000, 100000, 'u@example.com'),   -- U: B3 (bị khoá)
  ('00000000-0000-0000-0000-470000000017', 'WEB', '00000000-0000-0000-0000-00000470a501', 'holding', 100000, 100000, 'v@example.com');   -- V: C1 bị khoá, chưa có dòng ghế
insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-470000006012', '00000000-0000-0000-0000-470000000012', '00000000-0000-0000-0000-00000470b102', 'A2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006013', '00000000-0000-0000-0000-470000000012', '00000000-0000-0000-0000-00000470b103', 'A3', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006014', '00000000-0000-0000-0000-470000000014', '00000000-0000-0000-0000-00000470b111', 'B1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006015', '00000000-0000-0000-0000-470000000015', '00000000-0000-0000-0000-00000470b112', 'B2', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006016', '00000000-0000-0000-0000-470000000016', '00000000-0000-0000-0000-00000470b113', 'B3', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-470000006017', '00000000-0000-0000-0000-470000000017', '00000000-0000-0000-0000-00000470b121', 'C1', 'NORMAL', 100000);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-00000470a501', '00000000-0000-0000-0000-00000470b103', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-470000000011'),
  ('00000000-0000-0000-0000-00000470a501', '00000000-0000-0000-0000-00000470b111', 'HELD', 'WEB', now() + interval '10 minutes', '00000000-0000-0000-0000-470000000013'),
  ('00000000-0000-0000-0000-00000470a501', '00000000-0000-0000-0000-00000470b112', 'HELD', 'WEB', now() - interval '1 minute',  '00000000-0000-0000-0000-470000000013');
-- Khoá ghế B3, C1 (chưa có dòng seat_state nên trigger guard cho qua). KHÔNG ALTER TABLE ở đây: nó giữ khoá
-- bảng tới hết transaction và làm phần dblink bên dưới bị treo.
insert into public.showtime_seat_locks (showtime_id, seat_id, room_id, cinema_id) values
  ('00000000-0000-0000-0000-00000470a501', '00000000-0000-0000-0000-00000470b113', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1'),
  ('00000000-0000-0000-0000-00000470a501', '00000000-0000-0000-0000-00000470b121', '00000000-0000-0000-0000-00000470f101', '00000000-0000-0000-0000-0000047000c1');

-- (a) Đơn 2 ghế, 1 ghế đã thuộc đơn khác -> false và KHÔNG còn dòng dở dang cho ghế còn lại
select is(public.sell_order_seats('00000000-0000-0000-0000-470000000012'), false,
  '(a) đơn 2 ghế có 1 ghế đã SOLD cho đơn khác -> sell_order_seats = false');
select is(
  (select count(*) from public.showtime_seat_states
    where showtime_id = '00000000-0000-0000-0000-00000470a501' and seat_id = '00000000-0000-0000-0000-00000470b102'),
  0::bigint, '(a) ghế còn trống A2 KHÔNG bị chiếm dở dang (subtransaction rollback)');
select is(
  (select order_id::text from public.showtime_seat_states
    where showtime_id = '00000000-0000-0000-0000-00000470a501' and seat_id = '00000000-0000-0000-0000-00000470b103'),
  '00000000-0000-0000-0000-470000000011', '(a) ghế A3 vẫn SOLD cho đơn Q');

-- (b) HELD còn hạn của đơn khác không bị ghi đè
select is(public.sell_order_seats('00000000-0000-0000-0000-470000000014'), false,
  '(b) ghế đang HELD còn hạn bởi đơn khác -> false');
select is(
  (select order_id::text || state::text from public.showtime_seat_states
    where showtime_id = '00000000-0000-0000-0000-00000470a501' and seat_id = '00000000-0000-0000-0000-00000470b111'),
  '00000000-0000-0000-0000-470000000013HELD', '(b) HELD của đơn R giữ nguyên, không bị ghi đè');

-- (c) HELD đã hết hạn của đơn khác được chiếm
select is(public.sell_order_seats('00000000-0000-0000-0000-470000000015'), true,
  '(c) ghế HELD đã hết hạn của đơn khác -> chiếm được');
select is(
  (select order_id::text || state::text || coalesce(expires_at::text, 'null') from public.showtime_seat_states
    where showtime_id = '00000000-0000-0000-0000-00000470a501' and seat_id = '00000000-0000-0000-0000-00000470b112'),
  '00000000-0000-0000-0000-470000000015SOLDnull', '(c) dòng ghế B2 giờ là SOLD của đơn T');

-- (d) Ghế đang bị khoá vận hành -> false (không ném lỗi)
select is(public.sell_order_seats('00000000-0000-0000-0000-470000000016'), false,
  '(d) ghế bị khoá (23514 từ trigger) -> false, không ném lỗi');

-- (e) Nhánh holding: precheck qua, sell_order_seats thất bại (ghế bị khoá) -> manual review xác định
select is(
  (public.confirm_paid('00000000-0000-0000-0000-470000000017', 100000, 'T47_TX_V', 4700117))->>'status',
  'NEEDS_MANUAL_REVIEW', '(e) đơn holding, sell_order_seats = false -> NEEDS_MANUAL_REVIEW (webhook không rollback)');
select is(
  (select status::text from public.orders where id = '00000000-0000-0000-0000-470000000017'),
  'needs_manual_review', '(e) đơn V ở needs_manual_review');
select is(
  (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-470000000017')
  + (select count(*) from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-470000000017'),
  0::bigint, '(e) đơn V không có vé và không còn dòng ghế');

-- ---------------------------------------------------------------------------
-- Phần 2: đồng thời thật bằng dblink (dữ liệu commit thật, tự dọn)
-- ---------------------------------------------------------------------------
create function public.tap47_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-00000471e001';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000047100c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000047100a1';
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000047100c1'
       or record_id in ('00000000-0000-0000-0000-00000471e001', '00000000-0000-0000-0000-0000047100a1');
  $c$;
$$;

create function public.tap47_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000047100a1', 'T48', 'Tỉnh Test 48');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000047100c1', 'T481', 'Rạp T48-1', '00000000-0000-0000-0000-0000047100a1', '1 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000471e001', 'phim-test-47-conc', 'Phim 47 conc', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000471f101', '00000000-0000-0000-0000-0000047100c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-00000471b101', '00000000-0000-0000-0000-00000471f101', '00000000-0000-0000-0000-0000047100c1', 'A', 1, 'NORMAL', 'A1');
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      ('00000000-0000-0000-0000-00000471a501', '00000000-0000-0000-0000-0000047100c1',
       '00000000-0000-0000-0000-00000471f101', '00000000-0000-0000-0000-00000471e001',
       now() + interval '2 days', '2D', 'ON_SALE');
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, contact_email) values
      ('00000000-0000-0000-0000-471000000001', 'WEB', '00000000-0000-0000-0000-00000471a501', 'expired', 100000, 100000, 'k4x@example.com'),
      ('00000000-0000-0000-0000-471000000002', 'WEB', '00000000-0000-0000-0000-00000471a501', 'expired', 100000, 100000, 'k4y@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-471000006001', '00000000-0000-0000-0000-471000000001', '00000000-0000-0000-0000-00000471b101', 'A1', 'NORMAL', 100000),
      ('00000000-0000-0000-0000-471000006002', '00000000-0000-0000-0000-471000000002', '00000000-0000-0000-0000-00000471b101', 'A1', 'NORMAL', 100000);
  $s$;
$$;

-- Chạy kịch bản; trả jsonb kết quả. Phiên A giữ transaction mở ~2s sau khi confirm_paid;
-- phiên B bắt đầu sau 0.7s (khi A chưa commit) -> hai webhook chồng nhau thật sự.
create function public.tap47_run_concurrent() returns jsonb language plpgsql as $$
declare
  -- Qua IP container (pg_hba: scram) để dblink chấp nhận kết nối non-superuser; mật khẩu mặc định của stack local.
  v_conn   text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                          coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_a      jsonb;
  v_b      jsonb;
  v_paid   integer;
  v_tickets integer;
  v_sold   integer;
  v_unused text;
begin
  perform extensions.dblink_connect('t47_setup', v_conn);
  perform extensions.dblink_exec('t47_setup', public.tap47_cleanup_sql());
  perform extensions.dblink_exec('t47_setup', public.tap47_setup_sql());

  perform extensions.dblink_connect('t47_a', v_conn);
  perform extensions.dblink_connect('t47_b', v_conn);

  perform extensions.dblink_send_query('t47_a', $q$
    select public.confirm_paid('00000000-0000-0000-0000-471000000001', 100000, 'T47_TX_A', 4710001) as r,
           pg_sleep(2)::text as s $q$);
  perform pg_sleep(0.7);
  perform extensions.dblink_send_query('t47_b', $q$
    select public.confirm_paid('00000000-0000-0000-0000-471000000002', 100000, 'T47_TX_B', 4710002) as r,
           pg_sleep(0)::text as s $q$);

  select t.r into v_a from extensions.dblink_get_result('t47_a') as t(r jsonb, s text);
  select t.r into v_b from extensions.dblink_get_result('t47_b') as t(r jsonb, s text);

  select t.n into v_paid from extensions.dblink('t47_setup',
    $q$select count(*)::int from public.orders
        where id in ('00000000-0000-0000-0000-471000000001','00000000-0000-0000-0000-471000000002') and status = 'paid'$q$) as t(n int);
  select t.n into v_tickets from extensions.dblink('t47_setup',
    $q$select count(*)::int from public.tickets where showtime_id = '00000000-0000-0000-0000-00000471a501'$q$) as t(n int);
  select t.n into v_sold from extensions.dblink('t47_setup',
    $q$select count(*)::int from public.showtime_seat_states
        where showtime_id = '00000000-0000-0000-0000-00000471a501' and state = 'SOLD'$q$) as t(n int);

  perform extensions.dblink_exec('t47_setup', public.tap47_cleanup_sql());
  perform extensions.dblink_disconnect('t47_a');
  perform extensions.dblink_disconnect('t47_b');
  perform extensions.dblink_disconnect('t47_setup');

  return jsonb_build_object('a', v_a, 'b', v_b, 'paid', v_paid, 'tickets', v_tickets, 'sold', v_sold);
exception when others then
  -- luôn dọn dữ liệu đã commit thật rồi mới ném lỗi tiếp
  begin
    perform extensions.dblink_exec('t47_setup', public.tap47_cleanup_sql());
  exception when others then null;
  end;
  begin perform extensions.dblink_disconnect('t47_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t47_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t47_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table tap47_result as select public.tap47_run_concurrent() as j;
grant select on tap47_result to public;

select is(
  (select (j->>'paid')::int from tap47_result),
  1,
  'Đồng thời: hai webhook cùng ghế -> đúng 1 đơn paid'
);
select is(
  (select (j->>'tickets')::int from tap47_result),
  1,
  'Đồng thời: đúng 1 vé cho ghế'
);
select is(
  (select (j->>'sold')::int from tap47_result),
  1,
  'Đồng thời: đúng 1 dòng SOLD cho ghế'
);
select is(
  (select ((j->'a'->>'status') || ',' || (j->'b'->>'status')) from tap47_result),
  'SUCCESS,NEEDS_MANUAL_REVIEW',
  'Đồng thời: phiên đến trước SUCCESS, phiên sau NEEDS_MANUAL_REVIEW (webhook trả kết quả xác định, không rollback)'
);
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000047100c1'),
  0::bigint,
  'Dữ liệu fixture đồng thời đã được dọn sạch'
);

select * from finish();
rollback;
