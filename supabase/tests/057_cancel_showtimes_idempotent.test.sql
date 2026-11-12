-- ============================================================================
-- pgTAP Test: 057_cancel_showtimes_idempotent.test.sql
-- bug-layer34-review phase-2 task-06 (M10c, MINOR #8; CR remove-pos: chỉ web).
--   1. preview_cancel_showtimes tính cả đơn checked_in vào paid_orders_count và total_refund_amount.
--   2. cancel_showtimes chuyển cả đơn paid và checked_in sang affected, tạo affected_order_cases, enqueue email.
--   3. cancel_showtimes gọi lại (lần 2): không enqueue trùng email (emails_enqueued_count = 0, email_outbox không đổi).
-- ============================================================================
begin;
select plan(15);

-- Helper functions
create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end;
$$;

create function public.tap_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;

-- ---------------------------------------------------------------------------
-- 1. Fixture Data
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0570000000a1', 'T57', 'Tỉnh Test 57');

insert into public.cinemas (id, code, name, province_id, address, status) values
  ('00000000-0000-0000-0000-0570000000c1', 'HN57', 'Rạp CGV Test HN57', '00000000-0000-0000-0000-0570000000a1', '57 Phố Test', 'OPEN');

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-057000000b01', 'mgr57@example.com',   '{}', now()),
  ('00000000-0000-0000-0000-057000000c01', 'staff57@example.com', '{}', now()),
  ('00000000-0000-0000-0000-057000000d01', 'cust57a@example.com', '{}', now()),
  ('00000000-0000-0000-0000-057000000d02', 'cust57b@example.com', '{}', now());

insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-057000000b01', '00000000-0000-0000-0000-0570000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-057000000c01', '00000000-0000-0000-0000-0570000000c1', 'STAFF');

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-057000000e01', 'phim-test-57', 'Phim Test 57', 120, '2026-12-01', 'T13', 'PUBLISHED');

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-057000000f01', '00000000-0000-0000-0000-0570000000c1', 'Phòng 57', '{2D}', 3, 3);

insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
  ('00000000-0000-0000-0000-057000000b01', '00000000-0000-0000-0000-057000000f01', '00000000-0000-0000-0000-0570000000c1', 'A', 1, 'NORMAL', 'A1'),
  ('00000000-0000-0000-0000-057000000b02', '00000000-0000-0000-0000-057000000f01', '00000000-0000-0000-0000-0570000000c1', 'A', 2, 'NORMAL', 'A2');

insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-057000000a01', '00000000-0000-0000-0000-0570000000c1',
   '00000000-0000-0000-0000-057000000f01', '00000000-0000-0000-0000-057000000e01',
   now() + interval '2 hours', '2D', 'ON_SALE');

-- 2 đơn hàng:
-- Đơn 1: status = 'paid' (chưa check-in), 100,000 VND
-- Đơn 2: status = 'checked_in' (đã quét vé vào rạp), 120,000 VND
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, booking_code, contact_email) values
  ('00000000-0000-0000-0000-570000000001', 'WEB', '00000000-0000-0000-0000-057000000a01',
   '00000000-0000-0000-0000-057000000d01', 'paid', 100000, 100000, 'HN57-WB0001', 'cust57a@example.com'),
  ('00000000-0000-0000-0000-570000000002', 'WEB', '00000000-0000-0000-0000-057000000a01',
   '00000000-0000-0000-0000-057000000d02', 'checked_in', 120000, 120000, 'HN57-WB0002', 'cust57b@example.com');

insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
  ('00000000-0000-0000-0000-670000000001', '00000000-0000-0000-0000-570000000001',
   '00000000-0000-0000-0000-057000000b01', 'A1', 'NORMAL', 100000),
  ('00000000-0000-0000-0000-670000000002', '00000000-0000-0000-0000-570000000002',
   '00000000-0000-0000-0000-057000000b02', 'A2', 'NORMAL', 120000);

insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
  ('00000000-0000-0000-0000-057000000a01', '00000000-0000-0000-0000-057000000b01', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-570000000001'),
  ('00000000-0000-0000-0000-057000000a01', '00000000-0000-0000-0000-057000000b02', 'SOLD', 'WEB', null, '00000000-0000-0000-0000-570000000002');

insert into public.tickets (id, order_id, order_seat_id, showtime_id, checked_in_at, checked_in_by) values
  ('00000000-0000-0000-0000-770000000001', '00000000-0000-0000-0000-570000000001',
   '00000000-0000-0000-0000-670000000001', '00000000-0000-0000-0000-057000000a01', null, null),
  ('00000000-0000-0000-0000-770000000002', '00000000-0000-0000-0000-570000000002',
   '00000000-0000-0000-0000-670000000002', '00000000-0000-0000-0000-057000000a01',
   now() - interval '10 minutes', '00000000-0000-0000-0000-057000000c01');

-- ---------------------------------------------------------------------------
-- 2. Test preview_cancel_showtimes: tính cả đơn checked_in
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-057000000b01'); -- Manager HN57

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-057000000a01'::uuid])->>'paid_orders_count')::int,
  2,
  '1. preview: paid_orders_count = 2 (tính cả đơn paid và checked_in)'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-057000000a01'::uuid])->>'web_paid_orders_count')::int,
  2,
  '2. preview: web_paid_orders_count = 2'
);

select is(
  (public.preview_cancel_showtimes(array['00000000-0000-0000-0000-057000000a01'::uuid])->>'total_refund_amount')::bigint,
  220000::bigint,
  '3. preview: total_refund_amount = 220,000 VND (100,000 + 120,000)'
);

-- ---------------------------------------------------------------------------
-- 3. Test cancel_showtimes lần 1: xử lý cả đơn paid và checked_in, enqueue email
-- ---------------------------------------------------------------------------
create temp table t57_cancel_1 as
  select public.cancel_showtimes(
    array['00000000-0000-0000-0000-057000000a01'::uuid],
    'Sự cố kỹ thuật máy chiếu'
  ) as result;

select is(
  (result->>'success')::boolean,
  true,
  '4. cancel lần 1: success = true'
) from t57_cancel_1;

select is(
  (result->>'cancelled_showtimes_count')::int,
  1,
  '5. cancel lần 1: cancelled_showtimes_count = 1'
) from t57_cancel_1;

select is(
  (result->>'affected_orders_count')::int,
  2,
  '6. cancel lần 1: affected_orders_count = 2 (cả đơn paid và checked_in)'
) from t57_cancel_1;

select is(
  (result->>'emails_enqueued_count')::int,
  2,
  '7. cancel lần 1: emails_enqueued_count = 2'
) from t57_cancel_1;

-- Kiểm tra trạng thái đơn: cả 2 đơn đều chuyển sang 'affected'
select is(
  (select count(*)::int from public.orders
    where showtime_id = '00000000-0000-0000-0000-057000000a01' and status = 'affected'),
  2,
  '8. cả 2 đơn (paid và checked_in) đều chuyển sang status = affected'
);

-- Kiểm tra affected_order_cases: có đúng 2 bản ghi và email_sent = true
select is(
  (select count(*)::int from public.affected_order_cases
    where showtime_id = '00000000-0000-0000-0000-057000000a01'),
  2,
  '9. affected_order_cases có đúng 2 bản ghi'
);

select is(
  (select count(*)::int from public.affected_order_cases
    where showtime_id = '00000000-0000-0000-0000-057000000a01' and email_sent = true),
  2,
  '10. cả 2 bản ghi affected_order_cases đều có email_sent = true'
);

-- Kiểm tra email_outbox (dùng tap_owner vì authenticated không có quyền select email_outbox)
select tap_owner();

select is(
  (select count(*)::int from public.email_outbox
    where cinema_id = '00000000-0000-0000-0000-0570000000c1' and kind = 'showtime_cancelled'),
  2,
  '11. email_outbox có đúng 2 email cho 2 đơn affected'
);

-- ---------------------------------------------------------------------------
-- 4. Test cancel_showtimes lần 2: IDEMPOTENT, không gửi trùng email
-- ---------------------------------------------------------------------------
select tap_as('00000000-0000-0000-0000-057000000b01'); -- Manager HN57

create temp table t57_cancel_2 as
  select public.cancel_showtimes(
    array['00000000-0000-0000-0000-057000000a01'::uuid],
    'Sự cố kỹ thuật máy chiếu'
  ) as result;

select is(
  (result->>'success')::boolean,
  true,
  '12. cancel lần 2: success = true'
) from t57_cancel_2;

select is(
  (result->>'emails_enqueued_count')::int,
  0,
  '13. cancel lần 2: emails_enqueued_count = 0 (idempotent: không enqueue thêm email)'
) from t57_cancel_2;

select tap_owner();

select is(
  (select count(*)::int from public.email_outbox
    where cinema_id = '00000000-0000-0000-0000-0570000000c1' and kind = 'showtime_cancelled'),
  2,
  '14. email_outbox vẫn giữ đúng 2 bản ghi, không bị chèn trùng lặp'
);

select is(
  (select count(*)::int from public.affected_order_cases
    where showtime_id = '00000000-0000-0000-0000-057000000a01' and email_sent = true),
  2,
  '15. affected_order_cases vẫn giữ nguyên email_sent = true'
);

select * from finish();
rollback;
