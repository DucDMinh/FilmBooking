-- ============================================================================
-- pgTAP Test: 056_hold_seats_hardening.test.sql
-- bug-layer34-review phase-2 task-04 (M4 phần hold, M6; CR remove-pos: chỉ kênh WEB).
--   A. hold_seats từ chối rạp không OPEN (CINEMA_NOT_OPEN) và phim không PUBLISHED (MOVIE_NOT_PUBLISHED) (R-33).
--   B. Race đa phiên THẬT (dblink):
--      1) 2 khách giữ CÙNG ghế CÙNG suất: đúng 1 thành công, 1 SEAT_TAKEN; không 40P01, không 23505 thô.
--      2) cancel_showtimes x hold_seats: sau cùng suất CANCELLED, không còn đơn holding/pending_payment, không dòng ghế.
-- Dữ liệu phần B commit thật qua dblink (không rollback được) nên tự dọn trước và sau.
-- ============================================================================
begin;
select plan(8);

create extension if not exists dblink with schema extensions;

-- ---------------------------------------------------------------- A. fixture trong transaction (rollback cuối file)
insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000056100a1', 'T56B', 'Tỉnh Test 56B');
insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
  ('00000000-0000-0000-0000-0000056100c1', 'T562', 'Rạp T56-2', '00000000-0000-0000-0000-0000056100a1', '1 Test', 15);
insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
  ('00000000-0000-0000-0000-00000561e001', 'phim-test-56b', 'Phim 56B', 120, '2026-12-01', 'P', 'PUBLISHED');
insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
  ('00000000-0000-0000-0000-00000561f101', '00000000-0000-0000-0000-0000056100c1', 'P1', '{2D}', 3, 4);
insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label)
  select ('00000000-0000-0000-0000-00000561b10' || c)::uuid, '00000000-0000-0000-0000-00000561f101',
         '00000000-0000-0000-0000-0000056100c1', 'A', c, 'NORMAL', 'A' || c
    from generate_series(1, 4) c;
insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
  select 'CINEMA', '00000000-0000-0000-0000-0000056100c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
    from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
  ('00000000-0000-0000-0000-00000561a501', '00000000-0000-0000-0000-0000056100c1', '00000000-0000-0000-0000-00000561f101',
   '00000000-0000-0000-0000-00000561e001', now() + interval '3 days', '2D', 'ON_SALE');
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000056100d1', 'u56b@example.com', '{}', now());

update public.cinemas set status = 'TEMP_CLOSED' where id = '00000000-0000-0000-0000-0000056100c1';
select throws_like(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000561a501',
      array['00000000-0000-0000-0000-00000561b101']::uuid[], 'WEB', '00000000-0000-0000-0000-0000056100d1')$$,
  'CINEMA_NOT_OPEN%', 'A1: rạp TEMP_CLOSED => CINEMA_NOT_OPEN');

update public.cinemas set status = 'OPEN' where id = '00000000-0000-0000-0000-0000056100c1';
update public.movies set status = 'ARCHIVED' where id = '00000000-0000-0000-0000-00000561e001';
select throws_like(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000561a501',
      array['00000000-0000-0000-0000-00000561b101']::uuid[], 'WEB', '00000000-0000-0000-0000-0000056100d1')$$,
  'MOVIE_NOT_PUBLISHED%', 'A2: phim ARCHIVED => MOVIE_NOT_PUBLISHED');

update public.movies set status = 'PUBLISHED' where id = '00000000-0000-0000-0000-00000561e001';
select lives_ok(
  $$select * from public.hold_seats('00000000-0000-0000-0000-00000561a501',
      array['00000000-0000-0000-0000-00000561b101']::uuid[], 'WEB', '00000000-0000-0000-0000-0000056100d1')$$,
  'A3: rạp OPEN + phim PUBLISHED => giữ ghế thành công');

-- ---------------------------------------------------------------- B. fixture đồng thời (dblink, commit thật)
create function public.tap56_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.affected_order_cases where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.price_rules   where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-00000560e001';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000056000c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000056000a1';
    delete from public.profiles      where id in ('00000000-0000-0000-0000-0000056000d1', '00000000-0000-0000-0000-0000056000d2');
    delete from auth.users           where id in ('00000000-0000-0000-0000-0000056000d1', '00000000-0000-0000-0000-0000056000d2');
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000056000c1'
       or record_id in ('00000000-0000-0000-0000-00000560e001', '00000000-0000-0000-0000-0000056000a1',
                        '00000000-0000-0000-0000-0000056000d1', '00000000-0000-0000-0000-0000056000d2');
  $c$;
$$;

create function public.tap56_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000056000a1', 'T56', 'Tỉnh Test 56');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000056000c1', 'T561', 'Rạp T56-1', '00000000-0000-0000-0000-0000056000a1', '1 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000560e001', 'phim-test-56', 'Phim 56', 120, '2026-12-01', 'P', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000560f101', '00000000-0000-0000-0000-0000056000c1', 'P1', '{2D}', 3, 4);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label)
      select ('00000000-0000-0000-0000-00000560b10' || c)::uuid, '00000000-0000-0000-0000-00000560f101',
             '00000000-0000-0000-0000-0000056000c1', 'A', c, 'NORMAL', 'A' || c
        from generate_series(1, 4) c;
    insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
      select 'CINEMA', '00000000-0000-0000-0000-0000056000c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
        from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000056000d1', 'u56a@example.com', '{}', now()),
      ('00000000-0000-0000-0000-0000056000d2', 'u56c@example.com', '{}', now());
  $s$;
$$;

-- Suất mới mỗi vòng (cách nhau 1 ngày: exclusion constraint chồng suất cùng phòng). Phần 1: ngày 2..; phần 2: ngày 30..
create function public.tap56_showtime_sql(p_id text, p_days int) returns text language sql as $$
  select format($r$
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      (%L, '00000000-0000-0000-0000-0000056000c1', '00000000-0000-0000-0000-00000560f101',
       '00000000-0000-0000-0000-00000560e001', now() + make_interval(days => %s), '2D', 'ON_SALE');
  $r$, p_id, p_days);
$$;

-- Kết quả một phiên dblink: 'ok' hoặc '<sqlstate>:<10 ký tự đầu thông báo>'
create function public.tap56_get(p_conn text) returns text language plpgsql as $$
declare v_state text;
begin
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);  -- rút nốt kết quả rỗng cuối
  return 'ok';
exception when others then
  v_state := sqlstate || ':' || left(sqlerrm, 10);
  begin
    perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  exception when others then null;
  end;
  return v_state;
end;
$$;

create function public.tap56_hold_q(p_delay numeric, p_st text, p_seat text, p_user text) returns text language sql as $$
  select format($q$select pg_sleep(%s)::text as r,
    (select h.order_id::text from public.hold_seats(%L::uuid, array[%L]::uuid[], 'WEB', %L::uuid) h) as s$q$,
    p_delay, p_st, p_seat, p_user);
$$;

create function public.tap56_run() returns jsonb language plpgsql as $$
declare
  v_conn      text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                             coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_a_delay   numeric[] := array[0, 0.05, 0.02, 0.1, 0, 0.07, 0.03, 0.12, 0.01, 0.06, 0.09, 0.04];
  v_b_delay   numeric[] := array[0.05, 0, 0.04, 0, 0.08, 0.02, 0.1, 0.01, 0.06, 0.03, 0, 0.07];
  v_u1        text := '00000000-0000-0000-0000-0000056000d1';
  v_u2        text := '00000000-0000-0000-0000-0000056000d2';
  v_seat      text := '00000000-0000-0000-0000-00000560b101';
  i           integer;
  v_a text; v_b text; v_st text;
  v_oks integer; v_taken integer; v_orders integer; v_states integer; v_st_status text;
  z_dead integer := 0; z_bad1 integer := 0; z_bad2 integer := 0; z_hold_won integer := 0; z_cancel_won integer := 0;
  v_log text := '';
begin
  perform extensions.dblink_connect('t56_setup', v_conn);
  perform extensions.dblink_exec('t56_setup', public.tap56_cleanup_sql());
  perform extensions.dblink_exec('t56_setup', public.tap56_setup_sql());
  perform extensions.dblink_connect('t56_a', v_conn);
  perform extensions.dblink_connect('t56_b', v_conn);

  -- Phần 1: hold_seats (user1) x hold_seats (user2), cùng ghế cùng suất
  for i in 1..array_length(v_a_delay, 1) loop
    v_st := '00000000-0000-0000-0000-00000560a5' || to_char(i, 'FM00');
    perform extensions.dblink_exec('t56_setup', public.tap56_showtime_sql(v_st, i + 1));
    perform extensions.dblink_send_query('t56_a', public.tap56_hold_q(v_a_delay[i], v_st, v_seat, v_u1));
    perform extensions.dblink_send_query('t56_b', public.tap56_hold_q(v_b_delay[i], v_st, v_seat, v_u2));
    v_a := public.tap56_get('t56_a');
    v_b := public.tap56_get('t56_b');
    z_dead := z_dead + (left(v_a, 5) = '40P01')::int + (left(v_b, 5) = '40P01')::int;
    v_oks := (v_a = 'ok')::int + (v_b = 'ok')::int;
    v_taken := (v_a = '23514:SEAT_TAKEN')::int + (v_b = '23514:SEAT_TAKEN')::int;
    select t.o, t.s into v_orders, v_states from extensions.dblink('t56_setup',
      format($q$select (select count(*)::int from public.orders where showtime_id = %1$L and status = 'holding'),
                       (select count(*)::int from public.showtime_seat_states where showtime_id = %1$L)$q$, v_st))
      as t(o int, s int);
    if v_oks <> 1 or v_taken <> 1 or v_orders <> 1 or v_states <> 1 then
      z_bad1 := z_bad1 + 1;
      v_log := v_log || format('{bad hold %s: A=%s B=%s orders=%s states=%s}', i, v_a, v_b, v_orders, v_states);
    end if;
  end loop;

  -- Phần 2: hold_seats (user1) x cancel_showtimes cùng suất
  for i in 1..array_length(v_a_delay, 1) loop
    v_st := '00000000-0000-0000-0000-00000560a6' || to_char(i, 'FM00');
    perform extensions.dblink_exec('t56_setup', public.tap56_showtime_sql(v_st, i + 30));
    perform extensions.dblink_send_query('t56_a', public.tap56_hold_q(v_a_delay[i], v_st, v_seat, v_u1));
    perform extensions.dblink_send_query('t56_b',
      format($q$select pg_sleep(%s)::text as r, public.cancel_showtimes(array[%L]::uuid[], 'test 56', %L::uuid)::text as s$q$,
             v_b_delay[i], v_st, v_u2));
    v_a := public.tap56_get('t56_a');
    v_b := public.tap56_get('t56_b');
    z_dead := z_dead + (left(v_a, 5) = '40P01')::int + (left(v_b, 5) = '40P01')::int;
    select t.o, t.s, t.st into v_orders, v_states, v_st_status from extensions.dblink('t56_setup',
      format($q$select (select count(*)::int from public.orders where showtime_id = %1$L and status in ('holding', 'pending_payment')),
                       (select count(*)::int from public.showtime_seat_states where showtime_id = %1$L),
                       (select status::text from public.showtimes where id = %1$L)$q$, v_st))
      as t(o int, s int, st text);
    if v_a = 'ok' then z_hold_won := z_hold_won + 1; else z_cancel_won := z_cancel_won + 1; end if;
    if v_b <> 'ok' or v_a not in ('ok', '23514:SHOWTIME_C') or v_st_status <> 'CANCELLED' or v_orders <> 0 or v_states <> 0 then
      z_bad2 := z_bad2 + 1;
      v_log := v_log || format('{bad cancel %s: hold=%s cancel=%s live_orders=%s states=%s showtime=%s}',
                               i, v_a, v_b, v_orders, v_states, v_st_status);
    end if;
  end loop;

  perform extensions.dblink_exec('t56_setup', public.tap56_cleanup_sql());
  perform extensions.dblink_disconnect('t56_a');
  perform extensions.dblink_disconnect('t56_b');
  perform extensions.dblink_disconnect('t56_setup');

  return jsonb_build_object('rounds', array_length(v_a_delay, 1), 'dead', z_dead, 'bad1', z_bad1, 'bad2', z_bad2,
                            'log', format('cancel race: hold won=%s cancel won=%s %s', z_hold_won, z_cancel_won, v_log));
exception when others then
  begin perform extensions.dblink_exec('t56_setup', public.tap56_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t56_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t56_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t56_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table tap56_result as select public.tap56_run() as j;
grant select on tap56_result to public;

select is((select (j->>'rounds')::int from tap56_result), 12, 'B: chạy đủ 12 vòng mỗi phần');
select is((select (j->>'dead')::int from tap56_result), 0, 'B: không deadlock 40P01 ở cả hai phần');
select is((select (j->>'bad1')::int from tap56_result), 0,
  'B1: 2 hold cùng ghế cùng suất => đúng 1 ok + 1 SEAT_TAKEN (không 23505 thô), đúng 1 đơn holding + 1 dòng ghế');
select is((select (j->>'bad2')::int from tap56_result), 0,
  'B2: hold x cancel_showtimes => suất CANCELLED, không đơn holding/pending_payment, không dòng ghế, hold chỉ ok hoặc SHOWTIME_CANCELLED');
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000056000c1'),
  0::bigint, 'B: dữ liệu fixture đồng thời đã được dọn sạch');

select diag((select j->>'log' from tap56_result));
select * from finish();
rollback;
