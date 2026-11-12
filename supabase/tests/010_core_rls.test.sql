-- pgTAP: lõi định danh & chuỗi rạp (layer 1 / task 03).
-- Kiểm: RLS bật mọi bảng, cô lập theo rạp (AC-16 phần lõi), khách chỉ thấy hồ sơ mình,
-- profile tự sinh + email citext, audit log (R-107), thêm rạp chỉ bằng INSERT (R-38).
begin;
select plan(81);

-- Chuyển vai trong transaction: giả lập PostgREST (role + JWT claims). Hết test rollback hết.
create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
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

create function public.tap_rows(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture (chạy bằng owner, bypass RLS)
-- ---------------------------------------------------------------------------
insert into public.provinces (id, code, name)
values ('00000000-0000-0000-0000-0000000000a1', 'HN', 'Hà Nội');

insert into public.cinemas (id, code, name, province_id, address) values
  ('00000000-0000-0000-0000-0000000000c1', 'HN01', 'Rạp HN01', '00000000-0000-0000-0000-0000000000a1', '1 Phố A'),
  ('00000000-0000-0000-0000-0000000000c2', 'HN02', 'Rạp HN02', '00000000-0000-0000-0000-0000000000a1', '2 Phố B');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.com',  '{}'),
  ('00000000-0000-0000-0000-000000000b01', 'mgr1@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000b02', 'mgr2@example.com',   '{}'),
  ('00000000-0000-0000-0000-000000000c01', 'staff1@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000c02', 'staff2@example.com', '{}'),
  ('00000000-0000-0000-0000-000000000d01', 'Cust1@Example.com',  '{"full_name":"  Khách Một  "}'),
  ('00000000-0000-0000-0000-000000000d02', 'cust2@example.com',  '{}');

insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000a01', 'ADMIN');
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000c1', 'STAFF'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000c2', 'MANAGER'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000c2', 'STAFF');
insert into public.cinema_settings (cinema_id, key, value) values
  ('00000000-0000-0000-0000-0000000000c1', 'seat_hold_minutes_web', '12'),
  ('00000000-0000-0000-0000-0000000000c2', 'seat_hold_minutes_web', '8');

-- ---------------------------------------------------------------------------
-- 1. RLS bật trên mọi bảng mới (2 test)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
      and relname in ('provinces','profiles','user_roles','cinemas','staff_assignments',
                      'app_settings','cinema_settings','consents','favorite_cinemas','audit_logs')),
  10, 'cả 10 bảng lõi bật RLS (relrowsecurity)');
select is(
  (select array_agg(relname::text order by relname) from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity
      and relname in ('provinces','profiles','user_roles','cinemas','staff_assignments',
                      'app_settings','cinema_settings','consents','favorite_cinemas','audit_logs')),
  null, 'không bảng lõi nào thiếu RLS');

-- ---------------------------------------------------------------------------
-- 2. Profile tự sinh từ auth.users; email citext (4 test)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.profiles), 7, 'mỗi user auth có đúng 1 profile');
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000d01'),
  'Khách Một', 'full_name lấy từ raw_user_meta_data (đã trim)');
select is(
  (select count(*)::int from public.profiles where email = 'cust1@example.com'),
  1, 'tìm email không phân biệt hoa thường (citext)');
select throws_ok(
  $$insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000d99', 'CUST1@EXAMPLE.COM')$$,
  '23505', null, 'email trùng khác hoa/thường bị chặn bởi unique citext');

update auth.users set email = 'Cust2.New@Example.com' where id = '00000000-0000-0000-0000-000000000d02';
select is(
  (select email::text from public.profiles where id = '00000000-0000-0000-0000-000000000d02'),
  'Cust2.New@Example.com', 'đổi email auth -> profile đồng bộ');

-- ---------------------------------------------------------------------------
-- 3. Khách: chỉ đọc/sửa hồ sơ của mình (8 test)
-- ---------------------------------------------------------------------------
-- Scaffolding test (rollback cùng transaction): helper tap_* tạo bởi owner không còn EXECUTE mặc định cho client (P0-08).
do $tapgrant$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tap_%' loop
    execute 'grant execute on function ' || r || ' to anon, authenticated';
  end loop;
end $tapgrant$;
select public.tap_as('00000000-0000-0000-0000-000000000d01');
select is((select count(*)::int from public.profiles), 1, 'khách chỉ thấy 1 profile (của mình)');
select lives_ok(
  $$update public.profiles set full_name = 'Khách Mới', marketing_opt_in = true
    where id = '00000000-0000-0000-0000-000000000d01'$$, 'khách sửa hồ sơ của mình');
select is(
  (select marketing_opt_in from public.profiles where id = '00000000-0000-0000-0000-000000000d01'),
  true, 'khách bật opt-in marketing (mặc định tắt)');
select is(
  public.tap_rows($$update public.profiles set full_name = 'Hack'
              where id = '00000000-0000-0000-0000-000000000d02'$$),
  0, 'khách không sửa được hồ sơ người khác (0 dòng)');
select throws_ok(
  $$update public.profiles set email = 'x@example.com' where id = '00000000-0000-0000-0000-000000000d01'$$,
  '42501', null, 'khách không đổi được cột email của profile');
select is((select count(*)::int from public.user_roles), 0, 'khách không có vai trò nào');
select throws_ok(
  $$insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000d01', 'ADMIN')$$,
  '42501', null, 'khách không tự gán ADMIN');
select throws_ok(
  $$insert into public.staff_assignments (user_id, cinema_id, role)
    values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1', 'STAFF')$$,
  '42501', null, 'khách không tự gán rạp');

-- ---------------------------------------------------------------------------
-- 4. consents + favorite_cinemas của khách (9 test)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.consents (user_id, consent_type, version)
    values ('00000000-0000-0000-0000-000000000d01', 'TERMS_OF_SERVICE', '1.0')$$,
  'khách ghi consent của mình');
select throws_ok(
  $$insert into public.consents (user_id, consent_type, version)
    values ('00000000-0000-0000-0000-000000000d02', 'TERMS_OF_SERVICE', '1.0')$$,
  '42501', null, 'khách không ghi consent thay người khác');
select throws_ok(
  $$update public.consents set version = '0.1'$$, '42501', null, 'consent bất biến: không UPDATE');
select throws_ok(
  $$delete from public.consents$$, '42501', null, 'consent bất biến: không DELETE');
select throws_ok(
  $$insert into public.consents (user_id, consent_type, version, accepted_at)
    values ('00000000-0000-0000-0000-000000000d01', 'PRIVACY_POLICY', '1.0', now() - interval '30 days')$$,
  '42501', null, 'khách không tự đặt accepted_at (không backdate bằng chứng)');
select throws_ok(
  $$insert into public.consents (id, user_id, consent_type, version)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000d01', 'PRIVACY_POLICY', '1.0')$$,
  '42501', null, 'khách không tự đặt id consent');
select is(
  (select accepted_at from public.consents
    where user_id = '00000000-0000-0000-0000-000000000d01' and consent_type = 'TERMS_OF_SERVICE'),
  now(), 'accepted_at do DB đặt = now()');
select lives_ok(
  $$insert into public.favorite_cinemas (user_id, cinema_id)
    values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1')$$,
  'khách thêm rạp yêu thích');
select throws_ok(
  $$insert into public.favorite_cinemas (user_id, cinema_id)
    values ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-0000000000c1')$$,
  '42501', null, 'khách không thêm yêu thích thay người khác');

reset role;
select public.tap_as('00000000-0000-0000-0000-000000000d02');
select is((select count(*)::int from public.consents), 0, 'khách khác không thấy consent của người ta');
select is((select count(*)::int from public.favorite_cinemas), 0, 'khách khác không thấy rạp yêu thích của người ta');
select is((select count(*)::int from public.audit_logs), 0, 'khách không đọc được audit_logs');

-- ---------------------------------------------------------------------------
-- 5. Khách vãng lai (anon) (5 test)
-- ---------------------------------------------------------------------------
reset role;
select public.tap_anon();
select is((select count(*)::int from public.cinemas), 2, 'anon xem được danh sách rạp');
select is(
  (select value from public.app_settings where key = 'seat_hold_minutes_web'),
  '10'::jsonb, 'anon đọc được giữ ghế web mặc định 10 phút');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon không đọc profiles');
select throws_ok($$update public.cinemas set name = 'x'$$, '42501', null, 'anon không sửa rạp');
select throws_ok($$select * from public.staff_assignments$$, '42501', null, 'anon không đọc staff_assignments');

-- ---------------------------------------------------------------------------
-- 6. Cinema Manager HN01 không chạm được dữ liệu HN02 (AC-16) (14 test)
-- ---------------------------------------------------------------------------
reset role;
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is((select count(*)::int from public.cinema_settings), 1, 'Manager HN01 chỉ đọc cinema_settings 1 rạp');
select is(
  (select count(*)::int from public.cinema_settings where cinema_id = '00000000-0000-0000-0000-0000000000c2'),
  0, 'Manager HN01 không đọc cinema_settings của HN02');
select is(
  (select count(*)::int from public.staff_assignments where cinema_id = '00000000-0000-0000-0000-0000000000c2'),
  0, 'Manager HN01 không đọc staff_assignments của HN02');
select is(
  (select count(*)::int from public.staff_assignments where cinema_id = '00000000-0000-0000-0000-0000000000c1'),
  2, 'Manager HN01 đọc staff_assignments của HN01');
select is(
  public.tap_rows($$update public.cinema_settings set value = '99'
              where cinema_id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'Manager HN01 không sửa được cinema_settings HN02');
select throws_ok(
  $$insert into public.cinema_settings (cinema_id, key, value)
    values ('00000000-0000-0000-0000-0000000000c2', 'default_cleaning_minutes', '30')$$,
  '42501', null, 'Manager HN01 không thêm cinema_settings cho HN02');
select is(
  public.tap_rows($$delete from public.staff_assignments
              where user_id = '00000000-0000-0000-0000-000000000c02'$$),
  0, 'Manager HN01 không gỡ được Staff của HN02');
select throws_ok(
  $$insert into public.staff_assignments (user_id, cinema_id, role)
    values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c2', 'STAFF')$$,
  '42501', null, 'Manager HN01 không gán Staff vào HN02');
select throws_ok(
  $$insert into public.staff_assignments (user_id, cinema_id, role)
    values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1', 'MANAGER')$$,
  '42501', null, 'Manager không nâng quyền: không gán MANAGER (R-105)');
select is(
  public.tap_rows($$update public.staff_assignments set role = 'MANAGER'
                    where user_id = '00000000-0000-0000-0000-000000000c01'$$),
  0, 'Manager không UPDATE nâng Staff lên MANAGER (0 dòng)');
select is(
  public.tap_rows($$delete from public.staff_assignments where role = 'MANAGER'$$),
  0, 'Manager không xoá được dòng MANAGER (kể cả của mình)');
select throws_ok(
  $$insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000b01', 'ADMIN')$$,
  '42501', null, 'Manager không tự gán ADMIN');
select throws_ok(
  $$insert into public.staff_assignments (user_id, cinema_id, role, assigned_by)
    values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1', 'STAFF',
            '00000000-0000-0000-0000-000000000a01')$$,
  '42501', null, 'Manager không giả mạo assigned_by');
select is(
  (select count(*)::int from public.profiles
    where id in ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000c02')),
  0, 'Manager HN01 không đọc profile nhân sự HN02 (IDOR)');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000d02'),
  0, 'Manager không đọc profile khách không thuộc rạp mình');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000c01'),
  1, 'Manager HN01 đọc được profile Staff rạp mình');
select lives_ok(
  $$insert into public.staff_assignments (user_id, cinema_id, role)
    values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1', 'STAFF')$$,
  'Manager HN01 thêm Staff cho rạp mình');
select is(
  (select assigned_by from public.staff_assignments where user_id = '00000000-0000-0000-0000-000000000d01'),
  '00000000-0000-0000-0000-000000000b01'::uuid, 'assigned_by tự = Manager thực hiện');
select is(
  public.tap_rows($$delete from public.staff_assignments
              where user_id = '00000000-0000-0000-0000-000000000d01'$$),
  1, 'Manager HN01 bớt Staff của rạp mình');
select is(
  public.tap_rows($$update public.cinemas set name = 'Hack' where id = '00000000-0000-0000-0000-0000000000c2'$$),
  0, 'Manager HN01 không sửa được rạp HN02');
select is(
  (select count(*)::int from public.audit_logs where cinema_id = '00000000-0000-0000-0000-0000000000c2'),
  0, 'Manager HN01 không đọc audit_logs của HN02');
select throws_ok(
  $$insert into public.cinemas (code, name, province_id, address)
    values ('HN09', 'Rạp lậu', '00000000-0000-0000-0000-0000000000a1', 'x')$$,
  '42501', null, 'Manager không thêm rạp mới (chỉ Admin)');

-- ---------------------------------------------------------------------------
-- 7. Manager sửa rạp mình có giới hạn cột; Staff chỉ đọc (7 test)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.cinemas set hotline = '1900 0001', cleaning_minutes = 20
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'Manager sửa thông tin + cấu hình dọn phòng rạp mình (R-56)');
select throws_ok(
  $$update public.cinemas set status = 'CLOSED' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'Manager không đổi trạng thái đóng/mở rạp');
select throws_ok(
  $$update public.cinemas set code = 'ZZ99' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'Manager không đổi mã rạp');

reset role;
select public.tap_as('00000000-0000-0000-0000-000000000c01');
select is(
  (select count(*)::int from public.cinema_settings), 1, 'Staff HN01 đọc cinema_settings rạp mình');
select is(
  public.tap_rows($$update public.cinemas set name = 'Hack' where id = '00000000-0000-0000-0000-0000000000c1'$$),
  0, 'Staff không sửa được rạp');
select throws_ok(
  $$insert into public.staff_assignments (user_id, cinema_id, role)
    values ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-0000000000c1', 'STAFF')$$,
  '42501', null, 'Staff không gán nhân sự');
select is((select count(*)::int from public.audit_logs), 0, 'Staff không đọc audit_logs');

-- ---------------------------------------------------------------------------
-- 8. Helper is_admin / has_cinema_role (5 test)
-- ---------------------------------------------------------------------------
reset role;
select public.tap_as('00000000-0000-0000-0000-000000000b01');
select is(public.is_admin(), false, 'Manager không phải Admin');
select is(
  public.has_cinema_role('00000000-0000-0000-0000-0000000000c1', array['MANAGER']::public.staff_role[]),
  true, 'Manager HN01 có role MANAGER ở HN01');
select is(
  public.has_cinema_role('00000000-0000-0000-0000-0000000000c2', array['STAFF','MANAGER']::public.staff_role[]),
  false, 'Manager HN01 không có role nào ở HN02');
reset role;
select public.tap_as('00000000-0000-0000-0000-000000000c01');
select is(
  public.has_cinema_role('00000000-0000-0000-0000-0000000000c1', array['MANAGER']::public.staff_role[]),
  false, 'Staff HN01 không có role MANAGER');
reset role;
select public.tap_as('00000000-0000-0000-0000-000000000a01');
select is(public.is_admin(), true, 'Admin được nhận diện qua user_roles');

-- ---------------------------------------------------------------------------
-- 9. Admin: thêm rạp bằng INSERT (R-38) + audit (R-107) (8 test)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.cinema_settings), 2, 'Admin đọc cinema_settings mọi rạp');
select lives_ok(
  $$insert into public.cinemas (id, code, name, province_id, address, latitude, longitude)
    values ('00000000-0000-0000-0000-0000000000c3', 'HN03', 'Rạp HN03',
            '00000000-0000-0000-0000-0000000000a1', '3 Phố C', 21.0285, 105.8542)$$,
  'Admin thêm rạp mới chỉ bằng INSERT');
select is(
  (select status::text from public.cinemas where code = 'HN03'), 'OPEN', 'rạp mới mặc định OPEN');

update public.cinemas set name = 'Rạp HN03 (đổi tên)' where id = '00000000-0000-0000-0000-0000000000c3';
select is(
  (select count(*)::int from public.audit_logs
    where table_name = 'cinemas' and record_id = '00000000-0000-0000-0000-0000000000c3' and action = 'UPDATE'),
  1, 'sửa rạp ghi đúng 1 dòng audit UPDATE');
select results_eq(
  $$select actor_id, cinema_id, before_data ->> 'name', after_data ->> 'name'
      from public.audit_logs
     where table_name = 'cinemas' and record_id = '00000000-0000-0000-0000-0000000000c3' and action = 'UPDATE'$$,
  $$values ('00000000-0000-0000-0000-000000000a01'::uuid, '00000000-0000-0000-0000-0000000000c3'::uuid,
            'Rạp HN03', 'Rạp HN03 (đổi tên)')$$,
  'audit có actor + cinema_id + before/after');
select is(
  (select count(*)::int from public.audit_logs
    where table_name = 'cinemas' and record_id = '00000000-0000-0000-0000-0000000000c3' and action = 'INSERT'),
  1, 'thêm rạp ghi 1 dòng audit INSERT');
select throws_ok(
  $$insert into public.audit_logs (table_name, action) values ('cinemas', 'INSERT')$$,
  '42501', null, 'client (kể cả Admin) không ghi tay audit_logs');
select lives_ok(
  $$update public.cinemas set status = 'TEMP_CLOSED' where id = '00000000-0000-0000-0000-0000000000c3'$$,
  'Admin đổi trạng thái rạp');
select lives_ok(
  $$insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000000000a2', 'HCM', 'TP HCM')$$,
  'Admin thêm tỉnh/thành');
select lives_ok(
  $$update public.provinces set name = 'TP Hồ Chí Minh' where id = '00000000-0000-0000-0000-0000000000a2'$$,
  'Admin sửa tỉnh/thành');
select is(
  (select count(*)::int from public.audit_logs
    where table_name = 'provinces' and record_id = '00000000-0000-0000-0000-0000000000a2'
      and actor_id = '00000000-0000-0000-0000-000000000a01'),
  2, 'thay đổi provinces được audit (INSERT + UPDATE, có actor)');

-- service_role (Nest/job) không bị guard cột chặn: nhận diện theo role, không theo uid.
reset role;
select public.tap_as('00000000-0000-0000-0000-000000000a01', 'service_role');
select lives_ok(
  $$update public.cinemas set status = 'OPEN' where id = '00000000-0000-0000-0000-0000000000c3'$$,
  'service_role đổi được trạng thái rạp (caller tin cậy theo role)');

-- ---------------------------------------------------------------------------
-- 10. Audit cho staff_assignments do Manager thực hiện giữ actor + cinema_id (2 test) + ràng buộc mã rạp (1)
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from public.audit_logs
    where table_name = 'staff_assignments' and action = 'INSERT'
      and actor_id = '00000000-0000-0000-0000-000000000b01'
      and cinema_id = '00000000-0000-0000-0000-0000000000c1'),
  1, 'Manager gán Staff -> audit có actor Manager + cinema_id rạp');
select is(
  (select count(*)::int from public.audit_logs
    where table_name = 'staff_assignments' and action = 'DELETE'
      and actor_id = '00000000-0000-0000-0000-000000000b01'
      and before_data ->> 'user_id' = '00000000-0000-0000-0000-000000000d01'),
  1, 'Manager bớt Staff -> audit DELETE có before_data');
select throws_ok(
  $$insert into public.cinemas (code, name, province_id, address)
    values ('hn 1', 'Sai mã', '00000000-0000-0000-0000-0000000000a1', 'x')$$,
  '23514', null, 'mã rạp phải in hoa/số, không khoảng trắng');

select * from finish();
rollback;
