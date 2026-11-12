-- ============================================================================
-- pgTAP Test: 052_confirm_paid_hardening.test.sql
-- bug-layer34-review phase-2 task-02 (M1c, M3, M4, M5, M9, M10a): confirm_paid
--  (a) đơn pending_payment quá hạn chưa bị job quét + tiền về -> đi nhánh tiền-về-muộn (vé nếu còn ghế, manual review nếu mất ghế)
--  (b) suất CANCELLED/CLOSED, rạp TEMP_CLOSED -> needs_manual_review, không vé (kể cả hold còn hạn)
--  (c) cutoff CHỈ áp khi tiền về muộn: hold còn hạn qua cutoff -> vẫn bán; expired qua cutoff -> needs_manual_review
--  (d) mốc đóng bán đọc từ app_settings (đổi giá trị -> đổi hành vi) — sửa M9
--  (e) ghế bị khoá vận hành -> needs_manual_review, KHÔNG raise
--  (f) voucher hết lượt (tổng / mỗi khách) khi tiền về muộn -> needs_manual_review, không vượt trần (quyết định user)
--  (g) webhook retry ở needs_manual_review / lệch tiền -> không ghi thêm audit_logs / email_outbox
-- ============================================================================
begin;
select plan(31);

-- id tất định: kind 1 cinema, 2 room, 3 seat, 4 showtime, 5 order, 6 order_seat, 7 voucher, 8 user
create function public.t52_id(p_kind int, p_n int) returns uuid language sql immutable as $$
  select format('00000000-0000-0000-%s-%s', lpad(p_kind::text, 4, '0'), lpad(p_n::text, 12, '0'))::uuid
$$;

-- Tạo đơn + order_seats (+ dòng HELD nếu p_held) cho ghế số p_seat của suất p_st
-- p_voucher (kind 7 n): đơn mang voucher thật như apply_voucher tạo ra (voucher_id, discount 10000, total 90000).
-- Bỏ trống = đơn không voucher HOẶC voucher đã gỡ (remove_voucher: voucher_id null, total = subtotal).
create function public.t52_order(p_o int, p_st int, p_seat int, p_status text, p_hold interval, p_held boolean default false,
                                 p_voucher int default null)
returns void language plpgsql as $$
begin
  insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, voucher_id,
                             hold_expires_at, contact_email)
  values (public.t52_id(5, p_o), 'WEB', public.t52_id(4, p_st), p_status::public.order_status, 100000,
          case when p_voucher is null then 0 else 10000 end, case when p_voucher is null then 100000 else 90000 end,
          case when p_voucher is null then null else public.t52_id(7, p_voucher) end,
          case when p_hold is null then null else now() + p_hold end, 'o' || p_o || '@example.com');
  insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount)
  values (public.t52_id(6, p_o), public.t52_id(5, p_o), public.t52_id(3, p_st * 10 + p_seat), 'S' || p_seat, 'NORMAL', 100000);
  if p_held then
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
    values (public.t52_id(4, p_st), public.t52_id(3, p_st * 10 + p_seat), 'HELD', 'WEB', now() + p_hold, public.t52_id(5, p_o));
  end if;
end;
$$;

-- Đơn đã paid + ghế SOLD (đơn "khác" đã chốt)
create function public.t52_paid_order(p_o int, p_st int, p_seat int) returns void language plpgsql as $$
begin
  perform public.t52_order(p_o, p_st, p_seat, 'pending_payment', interval '10 minutes');
  update public.orders set status = 'paid', booking_code = 'T521-' || lpad(p_o::text, 6, '0') where id = public.t52_id(5, p_o);
  insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id)
  values (public.t52_id(4, p_st), public.t52_id(3, p_st * 10 + p_seat), 'SOLD', 'WEB', null, public.t52_id(5, p_o));
end;
$$;

insert into public.provinces (id, code, name) values (public.t52_id(9, 1), 'T52', 'Tỉnh Test 52');
-- Rạp 1: không đặt cutoff riêng -> dùng app_settings.default_online_cutoff_minutes; Rạp 2: dùng cho ca TEMP_CLOSED
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  (public.t52_id(1, 1), 'T521', 'Rạp T52-1', public.t52_id(9, 1), '1 Test', null),
  (public.t52_id(1, 2), 'T522', 'Rạp T52-2', public.t52_id(9, 1), '2 Test', null);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  (public.t52_id(9, 2), 'phim-test-52', 'Phim 52', 120, '2026-12-01', 'T13', 'PUBLISHED');

-- Suất n (1..11): 1 phòng + 2 ghế mỗi suất
--  1 ON_SALE | 2 CANCELLED | 3 CLOSED | 4,13 bắt đầu sau 10 phút | 5,6 sau 40 phút | 7 rạp 2 | 8..12 ON_SALE
do $$
declare n int;
begin
  for n in 1..13 loop
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols)
    values (public.t52_id(2, n), public.t52_id(1, case when n = 7 then 2 else 1 end), 'P' || n, '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      (public.t52_id(3, n * 10 + 1), public.t52_id(2, n), public.t52_id(1, case when n = 7 then 2 else 1 end), 'A', 1, 'NORMAL', 'A1'),
      (public.t52_id(3, n * 10 + 2), public.t52_id(2, n), public.t52_id(1, case when n = 7 then 2 else 1 end), 'A', 2, 'NORMAL', 'A2');
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status)
    values (public.t52_id(4, n), public.t52_id(1, case when n = 7 then 2 else 1 end), public.t52_id(2, n), public.t52_id(9, 2),
            case n when 4 then now() + interval '10 minutes' when 13 then now() + interval '10 minutes' when 5 then now() + interval '40 minutes'
                   when 6 then now() + interval '40 minutes' else now() + interval '2 days' end,
            '2D', 'ON_SALE');
  end loop;
end $$;
update public.showtimes set status = 'CANCELLED' where id = public.t52_id(4, 2);
update public.showtimes set status = 'CLOSED' where id = public.t52_id(4, 3);
update public.cinemas set status = 'TEMP_CLOSED' where id = public.t52_id(1, 2);

-- (a) O1: pending_payment quá hạn 1 phút, dòng HELD còn nguyên (chưa bị job quét), ghế trống
select public.t52_order(1, 1, 1, 'pending_payment', interval '-1 minute', true);
-- (a2) O2: như O1 nhưng ghế 2 đã bị đơn paid O3 chốt
select public.t52_paid_order(3, 1, 2);
select public.t52_order(2, 1, 2, 'pending_payment', interval '-1 minute');
-- (b) O4: suất CANCELLED, đơn expired | O5: suất CLOSED, holding CÒN hạn | O6: rạp TEMP_CLOSED, holding còn hạn
select public.t52_order(4, 2, 1, 'expired', null);
select public.t52_order(5, 3, 1, 'holding', interval '10 minutes', true);
select public.t52_order(6, 7, 1, 'holding', interval '10 minutes', true);
-- (c) O7: bắt đầu sau 10 phút (< cutoff 15), hold CÒN hạn -> vẫn chốt bán (cutoff chỉ áp cho tiền về muộn)
select public.t52_order(7, 4, 1, 'holding', interval '10 minutes', true);
-- (c2) O19: cùng suất, đơn expired (tiền về muộn) qua mốc cutoff -> needs_manual_review
select public.t52_order(19, 4, 2, 'expired', null);
-- (c3) O20: pending_payment QUÁ HẠN 1 phút (HELD còn, chưa bị job quét), suất bắt đầu sau 10 phút (< cutoff 15)
--      -> hold quá hạn = tiền về muộn -> áp cutoff -> needs_manual_review (chứng minh mệnh đề hold_expires_at <= now())
select public.t52_order(20, 13, 1, 'pending_payment', interval '-1 minute', true);
-- (d) O8, O9: suất bắt đầu sau 40 phút; đơn expired (cutoff chỉ áp cho tiền về muộn)
select public.t52_order(8, 5, 1, 'expired', null);
select public.t52_order(9, 6, 1, 'expired', null);
-- (e) O10: hold hết hạn, ghế 1 của suất 8 bị Manager khoá vận hành
select public.t52_order(10, 8, 1, 'holding', interval '-1 minute', true);
insert into public.showtime_seat_locks (showtime_id, seat_id, room_id, cinema_id, reason)
values (public.t52_id(4, 8), public.t52_id(3, 81), public.t52_id(2, 8), public.t52_id(1, 1), 'OTHER');
-- (f) voucher: V1 tổng lượt 1 (đã có 1 lượt CONSUMED của O12), V2 tổng lượt 2 (còn chỗ), V3 per_user 1 (khách U đã dùng ở O15)
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
values (public.t52_id(8, 1), 'u52@example.com', '{}', now());
insert into public.vouchers (id, code, discount_type, discount_value, min_order_amount, total_uses_limit, per_user_limit) values
  (public.t52_id(7, 1), 'T52V1', 'FIXED', 10000, 0, 1, null),
  (public.t52_id(7, 2), 'T52V2', 'FIXED', 10000, 0, 2, null),
  (public.t52_id(7, 3), 'T52V3', 'FIXED', 10000, 0, null, 1);
select public.t52_paid_order(12, 9, 1);
-- O11/O13/O14: đơn expired mang voucher thật (voucher_id giữ nguyên, lượt RELEASED do expire), total 90000
select public.t52_order(11, 8, 2, 'expired', null, false, 1);
select public.t52_order(13, 9, 2, 'expired', null, false, 2);
select public.t52_paid_order(15, 10, 2);
select public.t52_order(14, 10, 1, 'expired', null, false, 3);
-- (f2) F1: khách ĐÃ GỠ voucher V1 (remove_voucher: lượt RELEASED, orders.voucher_id null, trả đủ giá 100000)
--      O17: hold còn hạn (đúng hạn) | O18: đơn expired, ghế trống (tiền về muộn)
select public.t52_order(17, 12, 1, 'pending_payment', interval '10 minutes', true);
select public.t52_order(18, 12, 2, 'expired', null);
insert into public.voucher_redemptions (voucher_id, order_id, user_id, discount_amount, status) values
  (public.t52_id(7, 1), public.t52_id(5, 12), null, 10000, 'CONSUMED'),
  (public.t52_id(7, 1), public.t52_id(5, 11), null, 10000, 'RELEASED'),
  (public.t52_id(7, 2), public.t52_id(5, 13), null, 10000, 'RELEASED'),
  (public.t52_id(7, 3), public.t52_id(5, 15), public.t52_id(8, 1), 10000, 'CONSUMED'),
  (public.t52_id(7, 3), public.t52_id(5, 14), public.t52_id(8, 1), 10000, 'RELEASED'),
  (public.t52_id(7, 1), public.t52_id(5, 17), null, 10000, 'RELEASED'),
  (public.t52_id(7, 1), public.t52_id(5, 18), null, 10000, 'RELEASED');
-- (g) O16: holding còn hạn, sẽ nhận tiền lệch hai lần
select public.t52_order(16, 11, 1, 'holding', interval '10 minutes', true);


-- confirm_paid chạy TRONG câu SELECT ngoài => subquery đếm vé/ghế của cùng câu thấy snapshot CŨ. Vì vậy mọi lời gọi
-- đi qua t52_call (ghi kết quả vào t52_res) ở câu lệnh riêng; assert đọc t52_res + bảng ở câu lệnh sau.
create temp table t52_res (k text primary key, r jsonb);
create function public.t52_call(p_k text, p_o int, p_amount int, p_tx text, p_code bigint) returns void language plpgsql as $$
begin
  insert into t52_res values (p_k, public.confirm_paid(public.t52_id(5, p_o), p_amount, p_tx, p_code))
  on conflict (k) do update set r = excluded.r;
end;
$$;
create function public.t52_st(p_k text) returns text language sql stable as $$
  select r->>'status' from t52_res where k = p_k
$$;
create function public.t52_res_recovered(p_k text) returns text language sql stable as $$
  select r->>'recovered' from t52_res where k = p_k
$$;
create function public.t52_tickets(p_o int) returns bigint language sql stable as $$
  select count(*) from public.tickets where order_id = public.t52_id(5, p_o)
$$;
create function public.t52_ostatus(p_o int) returns text language sql stable as $$
  select status::text from public.orders where id = public.t52_id(5, p_o)
$$;

select public.t52_call('o1', 1, 100000, 'T52_TX_1', 5200001);
select public.t52_call('o2', 2, 100000, 'T52_TX_2', 5200002);
select public.t52_call('o4', 4, 100000, 'T52_TX_4', 5200004);
select public.t52_call('o5', 5, 100000, 'T52_TX_5', 5200005);
select public.t52_call('o6', 6, 100000, 'T52_TX_6', 5200006);
select public.t52_call('o7', 7, 100000, 'T52_TX_7', 5200007);
select public.t52_call('o19', 19, 100000, 'T52_TX_19', 5200019);
select public.t52_call('o20', 20, 100000, 'T52_TX_20', 5200020);
select public.t52_call('o8', 8, 100000, 'T52_TX_8', 5200008);
update public.app_settings set value = '60'::jsonb where key = 'default_online_cutoff_minutes';
select public.t52_call('o9', 9, 100000, 'T52_TX_9', 5200009);
update public.app_settings set value = '15'::jsonb where key = 'default_online_cutoff_minutes';
select lives_ok($$select public.t52_call('o10', 10, 100000, 'T52_TX_10', 5200010)$$,
  '(e) ghế bị khoá vận hành ở case A: không raise (webhook không retry vô hạn)');
select public.t52_call('o11', 11, 90000, 'T52_TX_11', 5200011);
select public.t52_call('o13', 13, 90000, 'T52_TX_13', 5200013);
select public.t52_call('o14', 14, 90000, 'T52_TX_14', 5200014);
select public.t52_call('o17', 17, 100000, 'T52_TX_17', 5200017);
select public.t52_call('o18', 18, 100000, 'T52_TX_18', 5200018);

-- ===== (a) =====
select is(public.t52_st('o1'), 'SUCCESS',
  '(a) pending_payment quá hạn (chưa bị job quét), ghế còn trống -> chốt bán qua nhánh tiền-về-muộn');
select is(public.t52_ostatus(1) || '/' || public.t52_tickets(1) || '/' ||
          (select state::text from public.showtime_seat_states where order_id = public.t52_id(5, 1)),
          'paid/1/SOLD', '(a) đơn paid, 1 vé, ghế SOLD');
select is(public.t52_st('o2'), 'NEEDS_MANUAL_REVIEW',
  '(a2) pending_payment quá hạn mà ghế đã bị đơn khác chốt -> needs_manual_review');
select is(public.t52_ostatus(2) || '/' || public.t52_tickets(2) || '/' ||
          (select status::text from public.payments where order_id = public.t52_id(5, 2)),
          'needs_manual_review/0/PAID', '(a2) không vé, payment ghi nhận PAID');
select is((select count(*)::int from public.showtime_seat_states where seat_id = public.t52_id(3, 12) and state = 'SOLD'
            and order_id = public.t52_id(5, 3)), 1, '(a2) ghế của đơn paid O3 không bị ghi đè');

select is(public.t52_res_recovered('o1'), 'true',
  '(a) O1 đi nhánh tiền-về-muộn (recovered = true), không phải chốt bán đúng hạn');

-- ===== (b) =====
select is(public.t52_st('o4') || '/' || public.t52_tickets(4), 'NEEDS_MANUAL_REVIEW/0',
  '(b) suất CANCELLED -> needs_manual_review, không vé');
select is(public.t52_st('o5') || '/' || public.t52_tickets(5), 'NEEDS_MANUAL_REVIEW/0',
  '(b) suất CLOSED (hold còn hạn, case A) -> needs_manual_review, không vé');
select is(public.t52_st('o6') || '/' || public.t52_tickets(6), 'NEEDS_MANUAL_REVIEW/0',
  '(b) rạp TEMP_CLOSED (hold còn hạn, case A) -> needs_manual_review, không vé');
select is(public.t52_ostatus(5) || '/' ||
          (select count(*) from public.showtime_seat_states where order_id = public.t52_id(5, 5) and state = 'HELD'),
          'needs_manual_review/0', '(b) ghế HELD của đơn bị nhả khi chuyển manual review');

-- ===== (c) =====
select is(public.t52_st('o7') || '/' || public.t52_tickets(7), 'SUCCESS/1',
  '(c) hold CÒN hạn dù đã qua mốc đóng bán (bắt đầu sau 10 phút < 15) -> vẫn chốt bán (spec #9/10/17: cutoff chỉ áp cho tiền về muộn)');
select is(public.t52_st('o19') || '/' || public.t52_tickets(19), 'NEEDS_MANUAL_REVIEW/0',
  '(c2) tiền về muộn (expired) qua mốc đóng bán -> needs_manual_review, không vé');

select is(public.t52_st('o20') || '/' || public.t52_tickets(20), 'NEEDS_MANUAL_REVIEW/0',
  '(c3) pending_payment quá hạn chưa quét + qua mốc đóng bán -> coi là tiền về muộn -> needs_manual_review, không vé');

-- ===== (d) cutoff đọc từ app_settings (M9) =====
select is(public.t52_st('o8'), 'SUCCESS', '(d) cutoff mặc định 15, bắt đầu sau 40 phút -> chốt bán');
select is(public.t52_st('o9'), 'NEEDS_MANUAL_REVIEW',
  '(d) đổi cutoff mặc định thành 60 -> cùng suất 40 phút nay bị chặn (confirm_paid đọc app_settings bằng #>> chứ không rơi về 15)');

-- ===== (e) =====
select is(public.t52_ostatus(10) || '/' || public.t52_tickets(10), 'needs_manual_review/0',
  '(e) đơn needs_manual_review, không vé');

-- ===== (f) =====
select is(public.t52_st('o11'), 'NEEDS_MANUAL_REVIEW',
  '(f) voucher hết tổng lượt khi tiền về muộn -> needs_manual_review');
select is((select status::text from public.voucher_redemptions where order_id = public.t52_id(5, 11)) || '/' ||
          (select count(*) from public.voucher_redemptions where voucher_id = public.t52_id(7, 1) and status in ('HELD', 'CONSUMED')) || '/' ||
          public.t52_tickets(11),
          'RELEASED/1/0', '(f) lượt không bị hồi sinh, voucher không vượt trần 1, không vé');
select is(public.t52_st('o13') || '/' || (select status::text from public.voucher_redemptions where order_id = public.t52_id(5, 13)),
          'SUCCESS/CONSUMED', '(f) dương: voucher còn lượt -> chốt bán, lượt CONSUMED');
select is((select count(*) from public.voucher_redemptions where voucher_id = public.t52_id(7, 2) and status in ('HELD', 'CONSUMED'))::int, 1,
  '(f) tổng lượt dùng voucher V2 = 1 (không đếm đôi chính đơn này)');
select is(public.t52_st('o14') || '/' || (select status::text from public.voucher_redemptions where order_id = public.t52_id(5, 14)),
          'NEEDS_MANUAL_REVIEW/RELEASED', '(f) voucher hết lượt theo khách -> needs_manual_review, lượt vẫn RELEASED');

-- ===== (f2) voucher đã GỠ không được hồi sinh (F1) =====
select is(public.t52_st('o17') || '/' || (select status::text from public.voucher_redemptions where order_id = public.t52_id(5, 17)),
          'SUCCESS/RELEASED', '(f2) gỡ voucher + trả đủ giá đúng hạn -> chốt bán, lượt vẫn RELEASED');
select is(public.t52_st('o18') || '/' || (select status::text from public.voucher_redemptions where order_id = public.t52_id(5, 18)),
          'SUCCESS/RELEASED', '(f2) gỡ voucher + tiền về muộn còn ghế -> SUCCESS (không VOUCHER_EXHAUSTED), lượt vẫn RELEASED');
select is((select count(*) from public.voucher_redemptions where voucher_id = public.t52_id(7, 1) and status in ('HELD', 'CONSUMED'))::int, 1,
  '(f2) V1 (total_uses_limit=1) không vượt trần sau khi hai đơn đã gỡ voucher chốt bán');

-- ===== (g) retry idempotent (M10a) =====
create temp table t52_snap as
  select (select count(*) from public.audit_logs) as audits, (select count(*) from public.email_outbox) as emails;
select public.t52_call('o2r', 2, 100000, 'T52_TX_2', 5200002);
select is(public.t52_st('o2r'), 'NEEDS_MANUAL_REVIEW',
  '(g) retry khi đơn đã needs_manual_review -> kết quả xác định NEEDS_MANUAL_REVIEW');
select is((select (audits = (select count(*) from public.audit_logs) and emails = (select count(*) from public.email_outbox)) from t52_snap), true,
  '(g) retry không ghi thêm audit_logs / email_outbox');

select public.t52_call('o16', 16, 5000, 'T52_TX_16', 5200016);
select is(public.t52_st('o16'), 'AMOUNT_MISMATCH', '(g) lần đầu tiền lệch -> AMOUNT_MISMATCH + needs_manual_review');
update t52_snap set audits = (select count(*) from public.audit_logs), emails = (select count(*) from public.email_outbox);
select public.t52_call('o16r', 16, 5000, 'T52_TX_16', 5200016);
select is(public.t52_st('o16r'), 'AMOUNT_MISMATCH',
  '(g) retry tiền lệch trên đơn needs_manual_review -> vẫn AMOUNT_MISMATCH (xác định)');
select is((select (audits = (select count(*) from public.audit_logs) and emails = (select count(*) from public.email_outbox)) from t52_snap), true,
  '(g) retry tiền lệch không ghi thêm audit_logs / email_outbox');
select is((select count(*) from public.email_outbox where payload->>'order_id' = public.t52_id(5, 16)::text)::int, 1,
  '(g) đơn lệch tiền có đúng 1 email (AC-10)');

select * from finish();
rollback;
