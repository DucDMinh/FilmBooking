-- ============================================================================
-- pgTAP Test: 061_cancel_showtimes_skip_cancelled.test.sql
-- layer-7 task-03 F1: cancel_showtimes bỏ qua suất đã CANCELLED
-- (không ghi đè cancel_reason/cancelled_by, không đếm lại).
-- ============================================================================
begin;
select plan(7);

create function public.tap_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
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

insert into public.provinces (id, code, name) values
  ('00000000-0000-0000-0000-0610000000a1', 'T61', 'Tỉnh Test 61');
insert into public.cinemas (id, code, name, province_id, address, status) values
  ('00000000-0000-0000-0000-0610000000c1', 'HN61', 'Rạp Test HN61', '00000000-0000-0000-0000-0610000000a1', '61 Phố Test', 'OPEN');
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-061000000b01', 'mgr61@example.com', '{}', now());
insert into public.staff_assignments (user_id, cinema_id, role) values
  ('00000000-0000-0000-0000-061000000b01', '00000000-0000-0000-0000-0610000000c1', 'MANAGER');
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-061000000e01', 'phim-test-61', 'Phim Test 61', 120, '2026-12-01', 'T13', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-061000000f01', '00000000-0000-0000-0000-0610000000c1', 'Phòng 61', '{2D}', 3, 3);
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-061000000a01', '00000000-0000-0000-0000-0610000000c1',
   '00000000-0000-0000-0000-061000000f01', '00000000-0000-0000-0000-061000000e01', now() + interval '2 hours', '2D', 'ON_SALE'),
  ('00000000-0000-0000-0000-061000000a02', '00000000-0000-0000-0000-0610000000c1',
   '00000000-0000-0000-0000-061000000f01', '00000000-0000-0000-0000-061000000e01', now() + interval '6 hours', '2D', 'ON_SALE');

select tap_as('00000000-0000-0000-0000-061000000b01');

create temp table t61_first as
  select public.cancel_showtimes(array['00000000-0000-0000-0000-061000000a01'::uuid], 'Lý do gốc') as result;
grant select on t61_first to authenticated;

select is((select (result->>'cancelled_showtimes_count')::int from t61_first), 1, '1. lần 1 huỷ 1 suất');

create temp table t61_second as
  select public.cancel_showtimes(
    array['00000000-0000-0000-0000-061000000a01'::uuid, '00000000-0000-0000-0000-061000000a02'::uuid],
    'Lý do mới') as result;
grant select on t61_second to authenticated;

select is((select (result->>'cancelled_showtimes_count')::int from t61_second), 1, '2. lần 2 chỉ đếm suất chưa huỷ (1)');

select is(
  (select cancel_reason from public.showtimes where id = '00000000-0000-0000-0000-061000000a01'),
  'Lý do gốc', '3. suất đã huỷ giữ nguyên cancel_reason');
select is(
  (select cancel_reason from public.showtimes where id = '00000000-0000-0000-0000-061000000a02'),
  'Lý do mới', '4. suất chưa huỷ nhận lý do mới');

select is(
  (public.cancel_showtimes(array['00000000-0000-0000-0000-061000000a01'::uuid], 'Lại')->>'cancelled_showtimes_count')::int,
  0, '5. chỉ gồm suất đã huỷ: không đếm gì');
select is(
  (select cancel_reason from public.showtimes where id = '00000000-0000-0000-0000-061000000a01'),
  'Lý do gốc', '6. cancel_reason vẫn không bị ghi đè');

select tap_owner();
select is(
  (select cancelled_by from public.showtimes where id = '00000000-0000-0000-0000-061000000a01'),
  '00000000-0000-0000-0000-061000000b01'::uuid, '7. cancelled_by giữ người huỷ đầu tiên');

select * from finish();
rollback;
