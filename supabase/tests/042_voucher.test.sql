-- pgTAP: RPC voucher lõi (layer 4 / task 03).
-- Kiểm tra:
-- 1. apply_voucher: áp mã % (có trần max_discount), mã cố định (FIXED).
-- 2. Tối đa 1 voucher / đơn (VOUCHER_ALREADY_APPLIED).
-- 3. remove_voucher: gỡ mã, hoàn tiền gốc, chuyển status sang RELEASED.
-- 4. Voucher không hợp lệ / inactive (VOUCHER_INVALID).
-- 5. Voucher hết hạn / chưa tới hạn (VOUCHER_EXPIRED).
-- 6. Đơn chưa đạt tối thiểu (VOUCHER_MIN_NOT_MET).
-- 7. Phim không áp dụng (VOUCHER_NOT_APPLICABLE).
-- 8. Tổng lượt dùng (total_uses_limit): 2 đơn tranh voucher 1 lượt -> đơn 2 VOUCHER_EXHAUSTED.
-- 9. Hoàn lượt khi đơn expired/cancelled: đơn khác áp lại thành công.
-- 10. Chốt lượt khi đơn paid: redemption thành CONSUMED.
-- 11. Giới hạn mỗi khách (per_user_limit -> VOUCHER_USER_LIMIT_REACHED).
-- 12. Bảo mật: khách A không áp/gỡ mã trên đơn khách B (FORBIDDEN).
-- 13. Trạng thái đơn không hợp lệ (ORDER_NOT_HOLDING / ORDER_EXPIRED).
-- 14. Rate limit: nhập mã > 5 lần trong 10 phút -> RATE_LIMITED.

begin;
select plan(38);

-- ---------------------------------------------------------------------------
-- TAP helper functions
-- ---------------------------------------------------------------------------
create or replace function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end;
$$;

create or replace function public.tap_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (chạy dưới owner / postgres)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name)
values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội')
on conflict (id) do nothing;

insert into public.cinemas (id, code, name, province_id, address)
values ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A')
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d01', 'cust1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d03', 'cust3@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d04', 'cust4@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d05', 'cust5@example.com', '{}')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-000000000a01', 'ADMIN')
on conflict (user_id, role) do nothing;

insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e001', 'phim-a', 'Phim A', 120, '2026-12-01', 'T13', 'PUBLISHED'),
  ('00000000-0000-0000-0000-00000000e002', 'phim-b', 'Phim B', 100, '2026-12-01', 'P',   'PUBLISHED')
on conflict (id) do nothing;

insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols)
values ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c1', 'Phòng 1', '{2D}', 5, 6)
on conflict (id) do nothing;

insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e001', '2026-12-05 19:00:00+07', '2D'),
  ('00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e002', '2026-12-05 22:00:00+07', '2D')
on conflict (id) do nothing;

-- Vouchers test
insert into public.vouchers (
  id, code, discount_type, discount_value, max_discount, applies_to, valid_from, valid_to,
  min_order_amount, total_uses_limit, per_user_limit, movie_id, active
) values
  ('00000000-0000-0000-0000-000000000010', 'DISCOUNT20', 'PERCENT', 20, 50000, 'ORDER', null, null, 0, 10, null, null, true),
  ('00000000-0000-0000-0000-000000000011', 'MINUS30K',   'FIXED', 30000, null,  'ORDER', null, null, 0, null, null, null, true),
  ('00000000-0000-0000-0000-000000000012', 'ONETIME',    'FIXED', 20000, null,  'ORDER', null, null, 0, 1, null, null, true),
  ('00000000-0000-0000-0000-000000000013', 'PERUSER1',   'FIXED', 10000, null,  'ORDER', null, null, 0, 10, 1, null, true),
  ('00000000-0000-0000-0000-000000000014', 'MIN200K',    'FIXED', 50000, null,  'ORDER', null, null, 200000, null, null, null, true),
  ('00000000-0000-0000-0000-000000000015', 'OLDVOUCHER', 'FIXED', 10000, null,  'ORDER', null, now() - interval '1 hour', 0, null, null, null, true),
  ('00000000-0000-0000-0000-000000000016', 'FUTUREVOUCHER', 'FIXED', 10000, null, 'ORDER', now() + interval '1 day', null, 0, null, null, null, true),
  ('00000000-0000-0000-0000-000000000017', 'OFFVOUCHER', 'FIXED', 10000, null,  'ORDER', null, null, 0, null, null, null, false),
  ('00000000-0000-0000-0000-000000000018', 'PHIM_B_ONLY', 'FIXED', 20000, null, 'ORDER', null, null, 0, null, null, '00000000-0000-0000-0000-00000000e002', true),
  ('00000000-0000-0000-0000-000000000019', 'TRYRATE',    'FIXED', 10000, null,  'ORDER', null, null, 0, null, null, null, true);

-- Đơn O_TEST1: cust1, suất Phim A, subtotal 300.000đ, holding
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values (
  '00000000-0000-0000-0000-000000000051', 'WEB', '00000000-0000-0000-0000-00000000a501',
  '00000000-0000-0000-0000-000000000d01', 'holding', 300000, 300000, now() + interval '10 minutes'
);

-- ---------------------------------------------------------------------------
-- 1. Existence tests
-- ---------------------------------------------------------------------------
select has_function('public', 'apply_voucher', array['uuid', 'text'], 'apply_voucher exists');
select has_function('public', 'remove_voucher', array['uuid'], 'remove_voucher exists');
select has_function('public', 'orders_voucher_status_sync', 'orders_voucher_status_sync exists');

-- ---------------------------------------------------------------------------
-- 2. apply_voucher: PERCENT có trần max_discount (300k * 20% = 60k -> cap 50k)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000d01');

select lives_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000051'::uuid, 'DISCOUNT20')$$,
  'Cust1 áp mã DISCOUNT20 thành công'
);

select public.tap_owner();

select is(
  (select discount_amount from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  50000,
  'orders.discount_amount được đặt đúng trần 50.000đ'
);

select is(
  (select total_amount from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  250000,
  'orders.total_amount được trừ đúng 250.000đ'
);

select is(
  (select voucher_id from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  '00000000-0000-0000-0000-000000000010'::uuid,
  'orders.voucher_id lưu đúng voucher id'
);

select is(
  (select status from public.voucher_redemptions where order_id = '00000000-0000-0000-0000-000000000051'),
  'HELD'::public.redemption_status,
  'voucher_redemptions tạo bản ghi với status HELD'
);

-- ---------------------------------------------------------------------------
-- 3. Tối đa 1 voucher / đơn: áp tiếp mã thứ 2
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000d01');

select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000051'::uuid, 'MINUS30K')$$,
  'P0001',
  'VOUCHER_ALREADY_APPLIED',
  'Áp voucher thứ 2 cho cùng đơn bị từ chối'
);

-- ---------------------------------------------------------------------------
-- 4. remove_voucher: gỡ voucher, trả lại giá gốc, giải phóng lượt
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.remove_voucher('00000000-0000-0000-0000-000000000051'::uuid)$$,
  'Gỡ voucher thành công'
);

select public.tap_owner();

select ok(
  (select voucher_id is null from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  'orders.voucher_id được set về null'
);

select is(
  (select discount_amount from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  0,
  'orders.discount_amount về 0'
);

select is(
  (select total_amount from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  300000,
  'orders.total_amount khôi phục về subtotal 300.000đ'
);

select is(
  (select status from public.voucher_redemptions where order_id = '00000000-0000-0000-0000-000000000051'),
  'RELEASED'::public.redemption_status,
  'voucher_redemptions chuyển sang RELEASED'
);

-- ---------------------------------------------------------------------------
-- 5. apply_voucher: FIXED (giảm cố định 30.000đ)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000000d01');

select lives_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000051'::uuid, 'MINUS30K')$$,
  'Áp mã cố định MINUS30K thành công'
);

select public.tap_owner();

select is(
  (select discount_amount from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  30000,
  'orders.discount_amount giảm đúng 30.000đ'
);

select is(
  (select total_amount from public.orders where id = '00000000-0000-0000-0000-000000000051'),
  270000,
  'orders.total_amount còn 270.000đ'
);

-- ---------------------------------------------------------------------------
-- 6. Voucher không tồn tại hoặc inactive (VOUCHER_INVALID)
-- ---------------------------------------------------------------------------
-- Tạo đơn tạm cho cust2
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values (
  '00000000-0000-0000-0000-000000000052', 'WEB', '00000000-0000-0000-0000-00000000a501',
  '00000000-0000-0000-0000-000000000d02', 'holding', 150000, 150000, now() + interval '10 minutes'
);

select public.tap_as('00000000-0000-0000-0000-000000000d02');

select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'NOSUCHCODE')$$,
  'P0001',
  'VOUCHER_INVALID',
  'Mã không tồn tại báo VOUCHER_INVALID'
);

select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'OFFVOUCHER')$$,
  'P0001',
  'VOUCHER_INVALID',
  'Mã inactive báo VOUCHER_INVALID'
);

-- ---------------------------------------------------------------------------
-- 7. Voucher hết hạn / chưa tới hạn (VOUCHER_EXPIRED)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'OLDVOUCHER')$$,
  'P0001',
  'VOUCHER_EXPIRED',
  'Mã đã hết hạn báo VOUCHER_EXPIRED'
);

select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'FUTUREVOUCHER')$$,
  'P0001',
  'VOUCHER_EXPIRED',
  'Mã chưa tới hạn báo VOUCHER_EXPIRED'
);

-- ---------------------------------------------------------------------------
-- 8. Đơn chưa đạt tối thiểu (VOUCHER_MIN_NOT_MET)
-- ---------------------------------------------------------------------------
-- Đơn subtotal 150k, mã MIN200K yêu cầu 200k
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'MIN200K')$$,
  'P0001',
  'VOUCHER_MIN_NOT_MET',
  'Đơn chưa đạt tối thiểu báo VOUCHER_MIN_NOT_MET'
);

-- ---------------------------------------------------------------------------
-- 9. Phim không áp dụng (VOUCHER_NOT_APPLICABLE)
-- ---------------------------------------------------------------------------
-- Đơn thuộc Phim A, voucher chỉ cho Phim B
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'PHIM_B_ONLY')$$,
  'P0001',
  'VOUCHER_NOT_APPLICABLE',
  'Voucher áp phim khác báo VOUCHER_NOT_APPLICABLE'
);

-- ---------------------------------------------------------------------------
-- 10. Tổng lượt dùng, hoàn lượt khi expired/cancelled, chốt lượt khi paid
-- ---------------------------------------------------------------------------
select public.tap_owner();

-- Chuẩn bị đơn 53 (cust3) và đơn 54 (cust4)
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values
  ('00000000-0000-0000-0000-000000000053', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d03', 'holding', 100000, 100000, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000054', 'WEB', '00000000-0000-0000-0000-00000000a501',
   '00000000-0000-0000-0000-000000000d04', 'holding', 100000, 100000, now() + interval '10 minutes');

-- Đơn 53 áp mã ONETIME (total_uses_limit = 1) -> thành công
select public.tap_as('00000000-0000-0000-0000-000000000d03');
select lives_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000053'::uuid, 'ONETIME')$$,
  'Đơn 53 giữ lượt ONETIME thành công'
);

-- Đơn 54 cùng áp mã ONETIME -> báo VOUCHER_EXHAUSTED
select public.tap_as('00000000-0000-0000-0000-000000000d04');
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000054'::uuid, 'ONETIME')$$,
  'P0001',
  'VOUCHER_EXHAUSTED',
  'Đơn 54 áp mã ONETIME khi đã hết lượt bị báo VOUCHER_EXHAUSTED'
);

-- Đơn 53 chuyển sang expired -> trigger tự động giải phóng lượt (HELD -> RELEASED)
select public.tap_owner();
update public.orders set status = 'expired' where id = '00000000-0000-0000-0000-000000000053';

select is(
  (select status from public.voucher_redemptions where order_id = '00000000-0000-0000-0000-000000000053'),
  'RELEASED'::public.redemption_status,
  'Đơn expired làm trigger giải phóng lượt (status RELEASED)'
);

-- Bây giờ Đơn 54 áp lại ONETIME -> THÀNH CÔNG!
select public.tap_as('00000000-0000-0000-0000-000000000d04');
select lives_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000054'::uuid, 'ONETIME')$$,
  'Đơn 54 áp lại ONETIME thành công sau khi Đơn 53 hết hạn'
);

-- Đơn 54 chuyển sang paid -> trigger chốt lượt (HELD -> CONSUMED)
select public.tap_owner();
update public.orders set status = 'paid' where id = '00000000-0000-0000-0000-000000000054';

select is(
  (select status from public.voucher_redemptions where order_id = '00000000-0000-0000-0000-000000000054'),
  'CONSUMED'::public.redemption_status,
  'Đơn paid làm trigger chốt lượt thành CONSUMED'
);

-- Tạo thêm đơn 55 để thử ONETIME -> phải báo VOUCHER_EXHAUSTED
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values (
  '00000000-0000-0000-0000-000000000055', 'WEB', '00000000-0000-0000-0000-00000000a501',
  null, 'holding', 100000, 100000, now() + interval '10 minutes'
);

select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000055'::uuid, 'ONETIME')$$,
  'P0001',
  'VOUCHER_EXHAUSTED',
  'Sau khi đơn đã paid chốt lượt thì ONETIME hết lượt hoàn toàn'
);

-- ---------------------------------------------------------------------------
-- 11. Giới hạn lượt mỗi khách (per_user_limit)
-- ---------------------------------------------------------------------------
-- Cust2 áp PERUSER1 (limit = 1) vào Đơn 52
select public.tap_as('00000000-0000-0000-0000-000000000d02');
select lives_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'PERUSER1')$$,
  'Cust2 áp PERUSER1 lần 1 thành công'
);

-- Đơn 52 chuyển paid để Cust2 có thể tạo đơn mới (tránh unique index 1 holding/user)
select public.tap_owner();
update public.orders set status = 'paid' where id = '00000000-0000-0000-0000-000000000052';

-- Tạo đơn 56 cho Cust2
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values (
  '00000000-0000-0000-0000-000000000056', 'WEB', '00000000-0000-0000-0000-00000000a501',
  '00000000-0000-0000-0000-000000000d02', 'holding', 100000, 100000, now() + interval '10 minutes'
);

-- Cust2 thử áp lại PERUSER1 cho Đơn 56 -> báo VOUCHER_USER_LIMIT_REACHED
select public.tap_as('00000000-0000-0000-0000-000000000d02');
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000056'::uuid, 'PERUSER1')$$,
  'P0001',
  'VOUCHER_USER_LIMIT_REACHED',
  'Cust2 vượt giới hạn 1 lượt/khách bị báo VOUCHER_USER_LIMIT_REACHED'
);

-- Khách khác (Cust3) áp PERUSER1 cho đơn 55 -> thành công
select public.tap_owner();
update public.orders set user_id = '00000000-0000-0000-0000-000000000d03' where id = '00000000-0000-0000-0000-000000000055';
select public.tap_as('00000000-0000-0000-0000-000000000d03');
select lives_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000055'::uuid, 'PERUSER1')$$,
  'Cust3 chưa dùng mã PERUSER1 nên áp thành công'
);

-- ---------------------------------------------------------------------------
-- 12. Bảo mật & phân quyền (FORBIDDEN, ORDER_NOT_HOLDING, ORDER_EXPIRED)
-- ---------------------------------------------------------------------------
-- Cust1 thử áp mã vào đơn 56 của Cust2
select public.tap_as('00000000-0000-0000-0000-000000000d01');
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000056'::uuid, 'MINUS30K')$$,
  '42501',
  'FORBIDDEN',
  'Cust1 không được áp voucher vào đơn của Cust2'
);

select throws_ok(
  $$select public.remove_voucher('00000000-0000-0000-0000-000000000056'::uuid)$$,
  '42501',
  'FORBIDDEN',
  'Cust1 không được gỡ voucher khỏi đơn của Cust2'
);

-- Đơn đã paid (Đơn 52) thử áp mã
select public.tap_owner();
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000052'::uuid, 'MINUS30K')$$,
  'P0001',
  'ORDER_NOT_HOLDING',
  'Đơn đã paid không cho áp voucher'
);

-- Đơn hết hạn hold_expires_at
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values (
  '00000000-0000-0000-0000-000000000057', 'WEB', '00000000-0000-0000-0000-00000000a501',
  null, 'holding', 100000, 100000, now() - interval '5 minutes'
);

select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000057'::uuid, 'MINUS30K')$$,
  'P0001',
  'ORDER_EXPIRED',
  'Đơn đã quá hạn giữ ghế không cho áp voucher'
);

-- ---------------------------------------------------------------------------
-- 13. Rate limit nhập mã (tối đa 5 lần trong 10 phút -> RATE_LIMITED)
-- ---------------------------------------------------------------------------
-- Tạo đơn 58 cho cust5 để test rate limit
insert into public.orders (
  id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at
) values (
  '00000000-0000-0000-0000-000000000058', 'WEB', '00000000-0000-0000-0000-00000000a501',
  '00000000-0000-0000-0000-000000000d05', 'holding', 100000, 100000, now() + interval '10 minutes'
);

-- Đưa 5 hits vào rate limit bucket của cust5
select public.tap_owner();
select ok(
  (select bool_and(public.hit_rate_limit('voucher_apply:00000000-0000-0000-0000-000000000d05', interval '10 minutes', 5))
     from generate_series(1, 5)),
  '5 lần thử đã đạt ngưỡng tối đa 5 lượt trong cửa sổ 10 phút'
);

-- Lần thứ 6 cust5 gọi apply_voucher -> phải bị ném RATE_LIMITED!
select public.tap_as('00000000-0000-0000-0000-000000000d05');
select throws_ok(
  $$select public.apply_voucher('00000000-0000-0000-0000-000000000058'::uuid, 'TRYRATE')$$,
  'P0001',
  'RATE_LIMITED',
  'Lần thứ 6 vượt ngưỡng 5 lần/10 phút bị RATE_LIMITED'
);

-- ---------------------------------------------------------------------------
-- Hoàn tất
-- ---------------------------------------------------------------------------
select * from finish();
rollback;
