-- ============================================================================
-- pgTAP Test: 053_zero_amount_sell.test.sql
-- bug-layer34-review phase-2 task-03 (M4 phần confirm_zero_amount, residual P0-05), thu hẹp bởi CR remove-pos:
--  confirm_zero_amount chiếm ghế qua sell_order_seats (không upsert vô điều kiện), kiểm suất ON_SALE + rạp OPEN
--  (R-33/AC-26: rạp không OPEN không được phát sinh vé),
--  tranh chấp ghế (SOLD / HELD còn hạn của đơn khác / ghế khoá vận hành) -> lỗi SEAT_TAKEN (rollback, không ghi đè, không vé).
-- Race đa phiên (dblink) nằm ở 054_zero_amount_concurrency.test.sql.
-- ============================================================================
begin;
select plan(18);

-- id tất định: kind 1 cinema, 2 room, 3 seat, 4 showtime, 5 order, 6 order_seat
create function public.t53_id(p_kind int, p_n int) returns uuid language sql immutable as $$
  select format('00000000-0000-0000-%s-%s', lpad(p_kind::text, 4, '0'), lpad(p_n::text, 12, '0'))::uuid
$$;

-- Đơn WEB 0đ p_o giữ ghế số p_seat của suất p_st; p_held: có dòng HELD còn hạn của chính đơn
create function public.t53_order(p_o int, p_st int, p_seat int, p_held boolean default true)
returns void language plpgsql as $$
begin
  insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount,
                             hold_expires_at, contact_email)
  values (public.t53_id(5, p_o), 'WEB', public.t53_id(4, p_st), 'holding', 100000, 100000, 0,
          now() + interval '10 minutes', 'o' || p_o || '@example.com');
  insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount)
  values (public.t53_id(6, p_o), public.t53_id(5, p_o), public.t53_id(3, p_st * 10 + p_seat), 'S' || p_seat, 'NORMAL', 100000);
  if p_held then
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
    values (public.t53_id(4, p_st), public.t53_id(3, p_st * 10 + p_seat), 'HELD', 'WEB',
            now() + interval '10 minutes', public.t53_id(5, p_o));
  end if;
end;
$$;

insert into public.provinces (id, code, name) values (public.t53_id(9, 1), 'T53', 'Tỉnh Test 53');
insert into public.cinemas (id, code, name, province_id, address) values
  (public.t53_id(1, 1), 'T531', 'Rạp T53-1', public.t53_id(9, 1), '1 Test'),
  (public.t53_id(1, 2), 'T532', 'Rạp T53-2', public.t53_id(9, 1), '2 Test');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  (public.t53_id(9, 2), 'phim-test-53', 'Phim 53', 120, '2026-12-01', 'T13', 'PUBLISHED');

-- Suất 1 ON_SALE | 2 CANCELLED | 3 rạp 2 (TEMP_CLOSED) | 4 ON_SALE (ca tranh chấp) | 8 CLOSED | 9 ghế khoá vận hành
--      10 ghế HELD của đơn khác | 11 pending_payment
do $$
declare n int;
begin
  foreach n in array array[1, 2, 3, 4, 8, 9, 10, 11] loop
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols)
    values (public.t53_id(2, n), public.t53_id(1, case when n = 3 then 2 else 1 end), 'P' || n, '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      (public.t53_id(3, n * 10 + 1), public.t53_id(2, n), public.t53_id(1, case when n = 3 then 2 else 1 end), 'A', 1, 'NORMAL', 'A1');
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status)
    values (public.t53_id(4, n), public.t53_id(1, case when n = 3 then 2 else 1 end), public.t53_id(2, n), public.t53_id(9, 2),
            now() + interval '2 days', '2D', 'ON_SALE');
  end loop;
end $$;
update public.showtimes set status = 'CANCELLED' where id = public.t53_id(4, 2);
update public.showtimes set status = 'CLOSED' where id = public.t53_id(4, 8);
update public.cinemas set status = 'TEMP_CLOSED' where id = public.t53_id(1, 2);

-- Z1 happy | Z2 ghế bị đơn khác chốt (SOLD của đơn 9) trước khi đơn 0đ chốt | Z3 suất CANCELLED | Z4 rạp TEMP_CLOSED
select public.t53_order(1, 1, 1);
select public.t53_order(2, 4, 1, false);
select public.t53_order(9, 4, 1, false);
update public.orders set status = 'paid', booking_code = 'T531-000009' where id = public.t53_id(5, 9);
insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
values (public.t53_id(4, 4), public.t53_id(3, 41), 'SOLD', 'WEB', null, public.t53_id(5, 9));
select public.t53_order(3, 2, 1);
select public.t53_order(4, 3, 1);
-- Z5 suất CLOSED | Z6 ghế khoá vận hành | Z7 ghế HELD còn hạn của đơn khác (đơn 23) | Z8 pending_payment
select public.t53_order(20, 8, 1);
select public.t53_order(21, 9, 1, false);
insert into public.showtime_seat_locks (showtime_id, seat_id) values (public.t53_id(4, 9), public.t53_id(3, 91));
select public.t53_order(22, 10, 1, false);
select public.t53_order(23, 10, 1);
select public.t53_order(24, 11, 1);
update public.orders set status = 'pending_payment' where id = public.t53_id(5, 24);

-- Lời gọi ở câu lệnh riêng (tránh snapshot của subquery cùng câu)
create temp table t53_res (k text primary key, r jsonb);
create function public.t53_call(p_k text, p_o int) returns void language plpgsql as $$
begin
  insert into t53_res values (p_k, public.confirm_zero_amount(public.t53_id(5, p_o)));
end;
$$;
create function public.t53_state(p_o int) returns text language sql stable as $$
  select o.status::text || '/' || (select count(*) from public.tickets t where t.order_id = o.id)::text || '/'
         || coalesce((select string_agg(s.state::text || ':' || s.source::text, ',') from public.showtime_seat_states s
                       where s.order_id = o.id), '-')
    from public.orders o where o.id = public.t53_id(5, p_o)
$$;

-- ===== confirm_zero_amount =====
select public.t53_call('z1', 1);
select is((select r->>'status' from t53_res where k = 'z1'), 'SUCCESS', 'Z1 đơn 0đ hợp lệ: chốt bán');
select is(public.t53_state(1), 'paid/1/SOLD:WEB', 'Z1 đơn paid, 1 vé, ghế SOLD');

select throws_ok($$select public.confirm_zero_amount(public.t53_id(5, 2))$$, '23514', 'SEAT_TAKEN: Ghế đã bị đơn khác chiếm',
  'Z2 ghế đã bị đơn khác chốt: SEAT_TAKEN (không upsert đè)');
select is((select order_id from public.showtime_seat_states where seat_id = public.t53_id(3, 41)), public.t53_id(5, 9),
  'Z2 ghế SOLD của đơn khác không bị ghi đè');
select is(public.t53_state(2), 'holding/0/-', 'Z2 đơn 0đ giữ nguyên holding, không vé');

select throws_ok($$select public.confirm_zero_amount(public.t53_id(5, 3))$$, '23514', 'SHOWTIME_NOT_OPEN: Suất chiếu không ở trạng thái mở bán',
  'Z3 suất CANCELLED: từ chối');
select is(public.t53_state(3), 'holding/0/HELD:WEB', 'Z3 đơn giữ nguyên holding, không vé');

select throws_ok($$select public.confirm_zero_amount(public.t53_id(5, 4))$$, '23514', 'CINEMA_NOT_OPEN: Rạp không ở trạng thái mở cửa',
  'Z4 rạp TEMP_CLOSED: từ chối');
select is(public.t53_state(4), 'holding/0/HELD:WEB', 'Z4 đơn giữ nguyên holding, ghế còn HELD, không vé');

select throws_ok($$select public.confirm_zero_amount(public.t53_id(5, 20))$$, '23514', 'SHOWTIME_NOT_OPEN: Suất chiếu không ở trạng thái mở bán',
  'Z5 suất CLOSED: từ chối');
select is(public.t53_state(20), 'holding/0/HELD:WEB', 'Z5 đơn giữ nguyên holding, không vé');

select throws_ok($$select public.confirm_zero_amount(public.t53_id(5, 21))$$, '23514',
  'SEAT_TAKEN: Ghế đang bị khoá vận hành hoặc không còn bán được', 'Z6 ghế bị khoá vận hành: SEAT_TAKEN (thông điệp đúng nguyên nhân)');
select is(public.t53_state(21), 'holding/0/-', 'Z6 đơn giữ nguyên holding, không vé, không tạo seat_state');

select throws_ok($$select public.confirm_zero_amount(public.t53_id(5, 22))$$, '23514', 'SEAT_TAKEN: Ghế đã bị đơn khác chiếm',
  'Z7 ghế HELD còn hạn của đơn khác: SEAT_TAKEN');
select is((select order_id::text || ':' || state::text from public.showtime_seat_states where seat_id = public.t53_id(3, 101)),
  public.t53_id(5, 23)::text || ':HELD', 'Z7 HELD của đơn khác không bị ghi đè');
select is(public.t53_state(22), 'holding/0/-', 'Z7 đơn 0đ giữ nguyên holding, không vé');

select public.t53_call('z8', 24);
select is((select r->>'status' from t53_res where k = 'z8'), 'SUCCESS', 'Z8 đơn 0đ pending_payment còn hạn: chốt bán');
select is(public.t53_state(24), 'paid/1/SOLD:WEB', 'Z8 đơn paid, 1 vé, ghế SOLD');

select * from finish();
rollback;
