-- ============================================================================
-- pgTAP Test: 048_function_privileges.test.sql
-- bug-layer34-review P0-08 (gộp K7): bảng quyền EXECUTE cho MỌI hàm schema public.
--   * Allowlist cứng: hàm mới có EXECUTE cho anon/authenticated ngoài danh sách -> test FAIL.
--   * Default privileges: hàm tạo sau này không tự mở cho PUBLIC/anon/authenticated.
--   * Hàm chỉ dành service_role / trigger / helper nội bộ: client gọi -> 42501.
--   * Hàm giữ authenticated: thân hàm fail-closed, user A không thao tác dữ liệu user B.
--   * Follow-up P0-02: assert_identity_rpc_caller không expose; A->B cho unlink/mark_password_set.
-- Allowlist đổi = quyết định bảo mật, phải sửa đồng thời docs/ERD.md (mục quyền RPC).
-- ============================================================================

begin;
select plan(41);

-- ---------------------------------------------------------------------------
-- 1. Allowlist EXECUTE (snapshot TRƯỚC khi test tạo helper nào)
-- ---------------------------------------------------------------------------
-- anon: chỉ price_quote (SECURITY INVOKER, đọc catalog công khai theo RLS).
select set_eq(
  $$select p.oid::regprocedure::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and has_function_privilege('anon', p.oid, 'execute')$$,
  $$values ('price_quote(uuid,uuid[])')$$,
  'anon chỉ EXECUTE được price_quote'
);

-- authenticated: RPC khách/nhân sự (thân hàm tự kiểm quyền) + helper RLS + price_quote.
select set_eq(
  $$select p.oid::regprocedure::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and has_function_privilege('authenticated', p.oid, 'execute')$$,
  $$values
    ('apply_voucher(uuid,text)'),
    ('can_view_order(uuid)'),
    ('cancel_showtimes(uuid[],text,uuid)'),
    ('checkin_ticket(text,uuid,uuid)'),
    ('confirm_zero_amount(uuid)'),
    ('extend_pos_hold(uuid,integer)'),
    ('has_cinema_role(uuid,staff_role[])'),
    ('has_cinema_scope(uuid)'),
    ('hold_seats(uuid,uuid[],text,uuid,text)'),
    ('is_admin()'),
    ('preview_cancel_showtimes(uuid[])'),
    ('price_quote(uuid,uuid[])'),
    ('release_seats(uuid,uuid)'),
    ('remove_voucher(uuid)'),
    ('report_by_movie_showtime(uuid,uuid,date,date)'),
    ('report_cancelled_showtimes(uuid,date,date)'),
    ('report_payos_reconciliation(uuid)'),
    ('report_revenue(uuid,date,date,order_channel)'),
    ('set_cinema_status(uuid,cinema_status)')$$,
  'authenticated chỉ EXECUTE được các hàm trong allowlist'
);

-- PUBLIC không còn EXECUTE hàm nào (anon/authenticated kế thừa PUBLIC)
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      and p.proname <> 'price_quote'),
  0,
  'PUBLIC không có EXECUTE trên hàm nào (trừ price_quote)'
);

-- ---------------------------------------------------------------------------
-- 2. Default privileges: hàm tạo sau này không tự mở EXECUTE
-- ---------------------------------------------------------------------------
create function public.zz_probe_new_function() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public.zz_probe_new_function()', 'execute'),
  'hàm mới tạo: anon không có EXECUTE mặc định');
select ok(not has_function_privilege('authenticated', 'public.zz_probe_new_function()', 'execute'),
  'hàm mới tạo: authenticated không có EXECUTE mặc định');
select ok(has_function_privilege('service_role', 'public.zz_probe_new_function()', 'execute'),
  'hàm mới tạo: service_role vẫn có EXECUTE (API admin client)');

-- ---------------------------------------------------------------------------
-- 3. Hàm chỉ service_role / trigger / nội bộ
-- ---------------------------------------------------------------------------
select ok(not exists (
  select 1
    from unnest(array[
      'public.record_payment_event(bigint,text,integer,text,boolean,timestamptz,uuid,uuid)',
      'public.confirm_paid(uuid,integer,text,bigint)',
      'public.mark_payment_cancelled(uuid,text)',
      'public.confirm_pos_sale(uuid,text)',
      'public.generate_booking_code(text)',
      'public.expire_overdue_holds()',
      'public.assert_identity_rpc_caller(uuid)',
      'public.get_user_identities(uuid)',
      'public.unlink_user_identity(uuid,text)',
      'public.mark_password_set(uuid)',
      'public.check_oauth_collision(text,text,text,uuid)',
      'public.hit_rate_limit(text,interval,integer)',
      'public.is_disposable_email(text)',
      'public.is_login_locked(text)',
      'public.register_login_failure(text)',
      'public.clear_login_failures(text)',
      'public.guard_identity_insert()',
      'public.on_identity_change()',
      'public.set_updated_at()'
    ]) as f
   where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
), 'hàm service_role-only/trigger/nội bộ: anon + authenticated không có EXECUTE');

select ok(
  has_function_privilege('service_role', 'public.record_payment_event(bigint,text,integer,text,boolean,timestamptz,uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute')
  and has_function_privilege('service_role', 'public.mark_payment_cancelled(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.confirm_pos_sale(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.generate_booking_code(text)', 'execute'),
  'service_role vẫn EXECUTE được 5 hàm thanh toán/bán vé');

select ok(not has_function_privilege('anon', 'public.assert_identity_rpc_caller(uuid)', 'execute'),
  'anon không execute assert_identity_rpc_caller (follow-up P0-02)');
select ok(not has_function_privilege('authenticated', 'public.assert_identity_rpc_caller(uuid)', 'execute'),
  'authenticated không execute assert_identity_rpc_caller (follow-up P0-02)');

-- Sequence mã đơn nội bộ chỉ dùng trong hàm definer: client không đốt được
select ok(not has_sequence_privilege('authenticated', 'public.internal_payment_order_code_seq', 'usage')
      and not has_sequence_privilege('authenticated', 'public.internal_payment_order_code_seq', 'select')
      and not has_sequence_privilege('anon', 'public.internal_payment_order_code_seq', 'usage'),
  'client không có quyền trên internal_payment_order_code_seq');
select ok(has_sequence_privilege('service_role', 'public.internal_payment_order_code_seq', 'usage'),
  'service_role vẫn dùng được internal_payment_order_code_seq');

-- ---------------------------------------------------------------------------
-- Helper test (tạo SAU snapshot; cấp EXECUTE cho client chỉ trong transaction test)
-- ---------------------------------------------------------------------------
create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end;
$$;
create function public.tap_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;
create function public.tap_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
create function public.tap_owner_with_claims(p_claims text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', p_claims, true);
  perform set_config('role', 'postgres', true);
end;
$$;
grant execute on function public.tap_as(uuid, text), public.tap_anon(), public.tap_owner(),
  public.tap_owner_with_claims(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (owner)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000048a1', 'T48', 'Tỉnh T48');
insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000048c1', 'T4801', 'Rạp T48', '00000000-0000-0000-0000-0000000048a1', '1 Phố T');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000004801', 'fp_a@test.local', now(), '{}'),
  ('00000000-0000-0000-0000-000000004802', 'fp_b@test.local', now(), '{}'),
  ('00000000-0000-0000-0000-000000004803', 'fp_mgr@test.local', now(), '{}');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000004803', '00000000-0000-0000-0000-0000000048c1', 'MANAGER');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000000e048', 'phim-t48', 'Phim T48', 100, '2026-12-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000000f048', '00000000-0000-0000-0000-0000000048c1', 'Phòng T48', '{2D}', 3, 3);
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format) values
  ('00000000-0000-0000-0000-00000000a048', '00000000-0000-0000-0000-0000000048c1',
   '00000000-0000-0000-0000-00000000f048', '00000000-0000-0000-0000-00000000e048', '2026-12-05 19:00:00+07', '2D');
insert into public.vouchers (id, code, discount_type, discount_value, applies_to, active) values
  ('00000000-0000-0000-0000-000000004810', 'T48VOUCH', 'FIXED', 10000, 'ORDER', true);
-- Đơn của B (WEB) và đơn mồ côi không có chủ (POS, user_id null)
insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, total_amount, hold_expires_at) values
  ('00000000-0000-0000-0000-000000004851', 'WEB', '00000000-0000-0000-0000-00000000a048',
   '00000000-0000-0000-0000-000000004802', 'holding', 300000, 300000, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-000000004852', 'POS', '00000000-0000-0000-0000-00000000a048',
   null, 'holding', 300000, 300000, now() + interval '10 minutes');

-- ---------------------------------------------------------------------------
-- 4. Client gọi hàm service_role-only / nội bộ -> 42501 (anon + authenticated A)
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000004801');
select throws_ok($$select public.record_payment_event(1, 'evil-ref', 1, 'PAID', true)$$, '42501', null,
  'authenticated không ghi payment_events giả qua record_payment_event');
select throws_ok($$select public.mark_payment_cancelled('00000000-0000-0000-0000-000000004851'::uuid, 'CANCELLED')$$, '42501', null,
  'authenticated không huỷ đơn người khác qua mark_payment_cancelled');
select throws_ok($$select public.confirm_pos_sale('00000000-0000-0000-0000-000000004852'::uuid)$$, '42501', null,
  'authenticated không chốt bán POS qua confirm_pos_sale');
select throws_ok($$select public.confirm_paid('00000000-0000-0000-0000-000000004851'::uuid, 300000, 'evil', 1)$$, '42501', null,
  'authenticated không gọi confirm_paid');
select throws_ok($$select public.generate_booking_code('T4801')$$, '42501', null,
  'authenticated không gọi generate_booking_code');
select throws_ok($$select public.assert_identity_rpc_caller('00000000-0000-0000-0000-000000004801'::uuid)$$, '42501', null,
  'authenticated không gọi assert_identity_rpc_caller');

select public.tap_anon();
select throws_ok($$select public.hold_seats('00000000-0000-0000-0000-00000000a048'::uuid, array[gen_random_uuid()])$$, '42501', null,
  'anon không gọi hold_seats');
select throws_ok($$select public.confirm_zero_amount('00000000-0000-0000-0000-000000004851'::uuid)$$, '42501', null,
  'anon không gọi confirm_zero_amount');
select throws_ok($$select public.report_revenue(null, null, null, null)$$, '42501', null,
  'anon không gọi report_revenue');
select throws_ok($$select public.guard_identity_insert()$$, '42501', null,
  'anon không gọi trực tiếp trigger function guard_identity_insert');

-- ---------------------------------------------------------------------------
-- 5. Hàm giữ authenticated: user A không thao tác dữ liệu user B / đơn mồ côi
-- ---------------------------------------------------------------------------
select public.tap_as('00000000-0000-0000-0000-000000004801');
select throws_ok($$select public.apply_voucher('00000000-0000-0000-0000-000000004851'::uuid, 'T48VOUCH')$$, '42501', null,
  'A không áp voucher lên đơn của B');
select throws_ok($$select public.apply_voucher('00000000-0000-0000-0000-000000004852'::uuid, 'T48VOUCH')$$, '42501', null,
  'A không áp voucher lên đơn không chủ (user_id null)');
select throws_ok($$select public.remove_voucher('00000000-0000-0000-0000-000000004851'::uuid)$$, '42501', null,
  'A không gỡ voucher của đơn B');
select throws_ok($$select public.remove_voucher('00000000-0000-0000-0000-000000004852'::uuid)$$, '42501', null,
  'A không gỡ voucher của đơn không chủ (user_id null)');
select throws_ok($$select public.hold_seats('00000000-0000-0000-0000-00000000a048'::uuid, array[gen_random_uuid()], 'WEB', '00000000-0000-0000-0000-000000004802'::uuid)$$, '42501', null,
  'A không giữ ghế mạo danh B');
select throws_ok($$select public.release_seats('00000000-0000-0000-0000-000000004851'::uuid)$$, '42501', null,
  'A không nhả ghế đơn của B');
select throws_ok($$select public.confirm_zero_amount('00000000-0000-0000-0000-000000004851'::uuid)$$, '42501', null,
  'A không chốt đơn 0đ của B');
select throws_ok($$select public.confirm_zero_amount('00000000-0000-0000-0000-000000004852'::uuid)$$, '42501', null,
  'A không chốt đơn 0đ không chủ');
select throws_ok($$select public.extend_pos_hold('00000000-0000-0000-0000-000000004852'::uuid, 5)$$, '42501', null,
  'A (không phải nhân sự rạp) không gia hạn đơn POS');
select throws_ok($$select public.preview_cancel_showtimes(array['00000000-0000-0000-0000-00000000a048'::uuid])$$, '42501', null,
  'A không xem trước huỷ suất của rạp khác');
select throws_ok($$select public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a048'::uuid], 'x')$$, '42501', null,
  'A không huỷ suất chiếu');
select throws_ok($$select public.set_cinema_status('00000000-0000-0000-0000-0000000048c1'::uuid, 'TEMP_CLOSED')$$, '42501', null,
  'A không đổi trạng thái rạp');
select throws_ok($$select public.checkin_ticket('NOPE', '00000000-0000-0000-0000-0000000048c1'::uuid)$$, '42501', null,
  'A không soát vé của rạp không được gán');
select throws_ok($$select public.report_revenue('00000000-0000-0000-0000-0000000048c1'::uuid, null, null, null)$$, '42501', null,
  'A không xem báo cáo doanh thu rạp');

-- Manager hợp lệ nhưng giả mạo actor (audit) -> bị chặn; không giả mạo -> chạy được
select public.tap_as('00000000-0000-0000-0000-000000004803');
select throws_ok($$select public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a048'::uuid], 'x', '00000000-0000-0000-0000-000000004802'::uuid)$$, '42501', null,
  'Manager không giả mạo p_actor_id của người khác khi huỷ suất');
select lives_ok($$select public.cancel_showtimes(array['00000000-0000-0000-0000-00000000a048'::uuid], 'Sự cố kỹ thuật')$$,
  'Manager đúng rạp huỷ suất (actor = chính mình) vẫn chạy');
select public.tap_owner();
select is((select cancelled_by from public.showtimes where id = '00000000-0000-0000-0000-00000000a048'),
  '00000000-0000-0000-0000-000000004803'::uuid, 'cancelled_by ghi đúng manager thực hiện');

-- ---------------------------------------------------------------------------
-- 6. Follow-up P0-02: A -> B ở thân hàm identity (owner + claims sub=A, bỏ qua lớp GRANT)
-- ---------------------------------------------------------------------------
select public.tap_owner_with_claims('{"sub":"00000000-0000-0000-0000-000000004801","role":"authenticated"}');
select throws_ok($$select public.unlink_user_identity('00000000-0000-0000-0000-000000004802'::uuid, 'google')$$, '42501', null,
  'sub=A không huỷ liên kết identity của B');
select throws_ok($$select public.mark_password_set('00000000-0000-0000-0000-000000004802'::uuid)$$, '42501', null,
  'sub=A không đánh dấu password_set cho B');

select * from finish();
rollback;
