-- ============================================================================
-- pgTAP Test: 051_order_lifecycle_concurrency.test.sql
-- bug-layer34-review phase-2 task-01 (review round 1, F1): thứ tự khoá orders -> payments -> seat_states.
-- Chạy ĐỒNG THỜI THẬT (3 phiên dblink) trên cùng một đơn pending_payment đã quá hạn:
--   A = confirm_paid (webhook), B = expire_overdue_holds (job), C = hold_seats §3.14 (khách khác giữ đúng ghế đó).
-- Lặp nhiều vòng với độ lệch thời gian khác nhau. Khẳng định: không có 40P01 (deadlock), trạng thái cuối nhất quán
-- (tối đa 1 dòng seat_state cho ghế; đơn expired thì không còn payment PENDING / ghế của đơn).
-- Phần 2: trigger tạm 'tap51_pause' (ngủ 0.6s ngay SAU khi khoá dòng seat_state bị DELETE) TẠM DỪNG release_seats /
--   cancel_showtimes giữa chừng, đúng lúc đã giữ dòng ghế -> job expire_overdue_holds chen vào. Nếu hàm khoá ghế trước đơn
--   thì xảy ra deadlock 40P01. Trigger bị drop khi dọn.
-- Dữ liệu commit thật qua dblink (không rollback được) nên tự dọn trước và sau.
-- ============================================================================
begin;
select plan(8);

create extension if not exists dblink with schema extensions;

create function public.tap51_cleanup_sql() returns text language sql as $$
  select $c$
    drop trigger if exists tap51_pause on public.showtime_seat_states;
    drop function if exists public.tap51_pause();
    delete from public.affected_order_cases where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.price_rules   where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-00000510e001';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000051000a1';
    delete from public.profiles      where id = '00000000-0000-0000-0000-0000051000d1';
    delete from auth.users           where id = '00000000-0000-0000-0000-0000051000d1';
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000051000c1'
       or record_id in ('00000000-0000-0000-0000-00000510e001', '00000000-0000-0000-0000-0000051000a1',
                        '00000000-0000-0000-0000-0000051000d1');
  $c$;
$$;

create function public.tap51_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000051000a1', 'T51', 'Tỉnh Test 51');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000051000c1', 'T511', 'Rạp T51-1', '00000000-0000-0000-0000-0000051000a1', '1 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000510e001', 'phim-test-51', 'Phim 51', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000510f101', '00000000-0000-0000-0000-0000051000c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-00000510b101', '00000000-0000-0000-0000-00000510f101', '00000000-0000-0000-0000-0000051000c1', 'A', 1, 'NORMAL', 'A1');
    insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
      select 'CINEMA', '00000000-0000-0000-0000-0000051000c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
        from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      ('00000000-0000-0000-0000-00000510a501', '00000000-0000-0000-0000-0000051000c1',
       '00000000-0000-0000-0000-00000510f101', '00000000-0000-0000-0000-00000510e001',
       now() + interval '2 days', '2D', 'ON_SALE');
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000051000d1', 'u51@example.com', '{}', now());
    update public.profiles set date_of_birth = '1995-05-15' where id = '00000000-0000-0000-0000-0000051000d1';
  $s$;
$$;

-- Mỗi vòng: đơn OX pending_payment quá hạn, ghế A1 HELD quá hạn, payment PENDING
create function public.tap51_order_sql() returns text language sql as $$
  select $o$
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, hold_expires_at, contact_email) values
      ('00000000-0000-0000-0000-510000000001', 'WEB', '00000000-0000-0000-0000-00000510a501', 'pending_payment', 100000, 100000, now() - interval '1 minute', 'x51@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-510000006001', '00000000-0000-0000-0000-510000000001', '00000000-0000-0000-0000-00000510b101', 'A1', 'NORMAL', 100000);
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
      ('00000000-0000-0000-0000-00000510a501', '00000000-0000-0000-0000-00000510b101', 'HELD', 'WEB', now() - interval '1 minute', '00000000-0000-0000-0000-510000000001');
    insert into public.payments (order_id, cinema_id, order_code, amount, status) values
      ('00000000-0000-0000-0000-510000000001', '00000000-0000-0000-0000-0000051000c1', 5100001, 100000, 'PENDING');
  $o$;
$$;

-- Trigger tạm dừng: ngủ 0.6s sau khi dòng seat_state của ghế test đã bị khoá để DELETE
create function public.tap51_pause_sql() returns text language sql as $$
  select $t$
    create function public.tap51_pause() returns trigger language plpgsql as 'begin perform pg_sleep(0.6); return old; end';
    create trigger tap51_pause before delete on public.showtime_seat_states
      for each row when (old.seat_id = '00000000-0000-0000-0000-00000510b101') execute function public.tap51_pause();
  $t$;
$$;

-- Đơn holding quá hạn của khách U (cho release_seats / cancel_showtimes)
create function public.tap51_holding_sql() returns text language sql as $$
  select $h$
    delete from public.affected_order_cases where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000051000c1';
    insert into public.orders (id, channel, showtime_id, status, user_id, subtotal_amount, total_amount, hold_expires_at, contact_email) values
      ('00000000-0000-0000-0000-510000000002', 'WEB', '00000000-0000-0000-0000-00000510a501', 'holding', '00000000-0000-0000-0000-0000051000d1', 100000, 100000, now() - interval '1 minute', 'y51@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-510000006002', '00000000-0000-0000-0000-510000000002', '00000000-0000-0000-0000-00000510b101', 'A1', 'NORMAL', 100000);
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
      ('00000000-0000-0000-0000-00000510a501', '00000000-0000-0000-0000-00000510b101', 'HELD', 'WEB', now() - interval '1 minute', '00000000-0000-0000-0000-510000000002');
  $h$;
$$;

-- Lấy kết quả một phiên dblink; trả sqlstate nếu phiên lỗi ('ok' nếu thành công)
create function public.tap51_get(p_conn text) returns text language plpgsql as $$
declare v_state text;
begin
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);  -- rút nốt kết quả rỗng cuối
  return 'ok';
exception when others then
  v_state := sqlstate;
  begin
    perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  exception when others then null;
  end;
  return v_state;
end;
$$;

create function public.tap51_run() returns jsonb language plpgsql as $$
declare
  v_conn      text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                             coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_b_delay   numeric[] := array[0, 0.05, 0.1, 0, 0.15, 0.02, 0.08, 0.03, 0, 0.12, 0.01, 0.06, 0, 0.04, 0.09, 0.02, 0.11, 0, 0.07, 0.05];
  v_c_delay   numeric[] := array[0.1, 0, 0.05, 0.15, 0, 0.08, 0.02, 0, 0.1, 0.03, 0.06, 0.01, 0.12, 0, 0.04, 0.09, 0, 0.07, 0.02, 0.11];
  v_a_delay   numeric[] := array[0.05, 0.1, 0, 0.03, 0.08, 0, 0.12, 0.06, 0.02, 0, 0.09, 0.04, 0.07, 0, 0.11, 0.01, 0.05, 0.13, 0.03, 0];
  i           integer;
  v_a text; v_b text; v_c text;
  v_deadlocks integer := 0;
  v_c_bad     integer := 0;
  v_errors    text := '';
  v_bad_rows  integer := 0;
  v_bad_state integer := 0;
  v_n         integer;
  v_status    text;
  v_pending   integer;
  v_seat_rows integer;
  v_pause_dead integer := 0;
  v_pause_bad  integer := 0;
  v_pause_log  text := '';
  v_k          integer;
  v_call       text;
begin
  perform extensions.dblink_connect('t51_setup', v_conn);
  perform extensions.dblink_exec('t51_setup', public.tap51_cleanup_sql());
  perform extensions.dblink_exec('t51_setup', public.tap51_setup_sql());
  perform extensions.dblink_connect('t51_a', v_conn);
  perform extensions.dblink_connect('t51_b', v_conn);
  perform extensions.dblink_connect('t51_c', v_conn);

  for i in 1..array_length(v_b_delay, 1) loop
    perform extensions.dblink_exec('t51_setup', public.tap51_order_sql());

    perform extensions.dblink_send_query('t51_a',
      format($q$select pg_sleep(%s)::text as r, public.confirm_paid('00000000-0000-0000-0000-510000000001', 100000, 'T51_TX', 5100001)::text || pg_sleep(0.05)::text as s$q$, v_a_delay[i]));
    perform extensions.dblink_send_query('t51_b',
      format($q$select pg_sleep(%s)::text as r, public.expire_overdue_holds()::text as s$q$, v_b_delay[i]));
    perform extensions.dblink_send_query('t51_c',
      format($q$select pg_sleep(%s)::text as r, (select count(*) from public.hold_seats('00000000-0000-0000-0000-00000510a501'::uuid,
              array['00000000-0000-0000-0000-00000510b101']::uuid[], 'WEB', '00000000-0000-0000-0000-0000051000d1'::uuid))::text as s$q$, v_c_delay[i]));

    v_a := public.tap51_get('t51_a');
    v_b := public.tap51_get('t51_b');
    v_c := public.tap51_get('t51_c');
    v_errors := v_errors || format('[%s:%s/%s/%s]', i, v_a, v_b, v_c);
    if v_c not in ('ok', '23514') then v_c_bad := v_c_bad + 1; end if;
    v_deadlocks := v_deadlocks + (v_a = '40P01')::int + (v_b = '40P01')::int + (v_c = '40P01')::int;

    -- Nhất quán: tối đa 1 dòng seat_state cho ghế; đơn OX expired => không còn payment PENDING và ghế của OX
    select t.n into v_n from extensions.dblink('t51_setup',
      $q$select count(*)::int from public.showtime_seat_states where seat_id = '00000000-0000-0000-0000-00000510b101'$q$) as t(n int);
    if v_n > 1 then v_bad_rows := v_bad_rows + 1; end if;

    select t.s, t.p, t.r into v_status, v_pending, v_seat_rows from extensions.dblink('t51_setup',
      $q$select (select status::text from public.orders where id = '00000000-0000-0000-0000-510000000001'),
                (select count(*)::int from public.payments where order_id = '00000000-0000-0000-0000-510000000001' and status = 'PENDING'),
                (select count(*)::int from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-510000000001')$q$)
      as t(s text, p int, r int);
    if v_status not in ('paid', 'expired', 'needs_manual_review')
       or (v_status = 'expired' and (v_pending > 0 or v_seat_rows > 0))
       or (v_status = 'paid' and v_seat_rows <> 1) then
      v_bad_state := v_bad_state + 1;
      v_errors := v_errors || format('{bad %s: %s pending=%s seats=%s}', i, v_status, v_pending, v_seat_rows);
    end if;
  end loop;

  -- Phần 2: release_seats (k=1) và cancel_showtimes (k=2) bị tạm dừng giữa chừng, job chen vào sau 0.2s
  perform extensions.dblink_exec('t51_setup', public.tap51_pause_sql());
  for v_k in 1..2 loop
    perform extensions.dblink_exec('t51_setup', public.tap51_holding_sql());
    v_call := case v_k
      when 1 then $q$public.release_seats('00000000-0000-0000-0000-510000000002', '00000000-0000-0000-0000-0000051000d1')::text$q$
      else $q$public.cancel_showtimes(array['00000000-0000-0000-0000-00000510a501']::uuid[], 'test 51', '00000000-0000-0000-0000-0000051000d1')::text$q$
    end;
    perform extensions.dblink_send_query('t51_a', format('select %s as r, null::text as s', v_call));
    perform extensions.dblink_send_query('t51_b',
      $q$select pg_sleep(0.2)::text as r, public.expire_overdue_holds()::text as s$q$);
    v_a := public.tap51_get('t51_a');
    v_b := public.tap51_get('t51_b');
    v_pause_log := v_pause_log || format('[k%s:%s/%s]', v_k, v_a, v_b);
    v_pause_dead := v_pause_dead + (v_a = '40P01')::int + (v_b = '40P01')::int;
    select t.s, t.r into v_status, v_seat_rows from extensions.dblink('t51_setup',
      $q$select (select status::text from public.orders where id = '00000000-0000-0000-0000-510000000002'),
                (select count(*)::int from public.showtime_seat_states where order_id = '00000000-0000-0000-0000-510000000002')$q$)
      as t(s text, r int);
    if v_status not in ('cancelled', 'expired') or v_seat_rows <> 0 or v_a not in ('ok', '23514') or v_b <> 'ok' then
      v_pause_bad := v_pause_bad + 1;
      v_pause_log := v_pause_log || format('{bad k%s: %s seats=%s}', v_k, v_status, v_seat_rows);
    end if;
  end loop;

  perform extensions.dblink_exec('t51_setup', public.tap51_cleanup_sql());
  perform extensions.dblink_disconnect('t51_a');
  perform extensions.dblink_disconnect('t51_b');
  perform extensions.dblink_disconnect('t51_c');
  perform extensions.dblink_disconnect('t51_setup');

  return jsonb_build_object('deadlocks', v_deadlocks, 'bad_rows', v_bad_rows, 'bad_state', v_bad_state,
                            'rounds', array_length(v_b_delay, 1), 'log', v_errors || v_pause_log,
                            'c_bad', v_c_bad, 'pause_deadlocks', v_pause_dead, 'pause_bad', v_pause_bad);
exception when others then
  begin perform extensions.dblink_exec('t51_setup', public.tap51_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t51_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t51_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t51_c'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t51_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table tap51_result as select public.tap51_run() as j;
grant select on tap51_result to public;

select is((select (j->>'rounds')::int from tap51_result), 20, 'Chạy đủ 20 vòng đồng thời');
select is((select (j->>'deadlocks')::int from tap51_result), 0, 'Không có deadlock 40P01 giữa confirm_paid / job / hold_seats');
select is((select (j->>'bad_rows')::int from tap51_result), 0, 'Ghế không bao giờ có >1 dòng seat_state');
select is((select (j->>'bad_state')::int from tap51_result), 0,
  'Trạng thái cuối nhất quán (đơn expired không còn payment PENDING/ghế; đơn paid giữ đúng 1 ghế)');
select is((select (j->>'c_bad')::int from tap51_result), 0,
  'hold_seats (phiên C) chỉ trả ok hoặc 23514 SEAT_TAKEN, không bao giờ 23505 thô');
select is((select (j->>'pause_deadlocks')::int from tap51_result), 0,
  'release_seats / cancel_showtimes bị tạm dừng giữa chừng + job chen vào: không deadlock 40P01');
select is((select (j->>'pause_bad')::int from tap51_result), 0,
  'release_seats / cancel_showtimes vs job: đơn cuối cancelled/expired, ghế đã nhả, job không lỗi');
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000051000c1'),
  0::bigint, 'Dữ liệu fixture đồng thời đã được dọn sạch');

select diag((select j->>'log' from tap51_result));
select * from finish();
rollback;
