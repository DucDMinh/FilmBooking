-- ============================================================================
-- pgTAP Test: 064_order_level_qr_concurrency.test.sql
-- feature-order-level-qr phase-1 task-01: 2 phiên quét ĐỒNG THỜI cùng một QR đơn (3 ghế).
-- Chạy thật bằng 2 kết nối dblink, lặp nhiều vòng với độ lệch thời gian khác nhau. Khẳng định:
--   - đúng 1 phiên SUCCESS ('OK'), phiên còn lại 'USED' (khoá orders FOR UPDATE tuần tự hoá lượt quét);
--   - không có deadlock 40P01 / lỗi khác;
--   - cả 3 vé được soát đúng 1 lần (checked_in_at không bị ghi đè), chỉ 1 dòng checkin_logs SUCCESS.
-- Dữ liệu commit thật qua dblink (không rollback được) nên tự dọn trước và sau.
-- ============================================================================
begin;
select plan(5);

create extension if not exists dblink with schema extensions;

create function public.tap64_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.checkin_logs where scanner_cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.tickets      where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.orders       where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.showtimes    where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.seats        where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.rooms        where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.movies       where id = '00000000-0000-0000-0000-00000640e001';
    delete from public.cinemas      where id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.provinces    where id = '00000000-0000-0000-0000-0000064000a1';
    delete from public.audit_logs   where cinema_id = '00000000-0000-0000-0000-0000064000c1'
       or record_id in ('00000000-0000-0000-0000-00000640e001', '00000000-0000-0000-0000-0000064000a1');
  $c$;
$$;

create function public.tap64_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000064000a1', 'T64', 'Tỉnh Test 64');
    insert into public.cinemas (id, code, name, province_id, address) values
      ('00000000-0000-0000-0000-0000064000c1', 'T641', 'Rạp T64-1', '00000000-0000-0000-0000-0000064000a1', '1 Test');
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000640e001', 'phim-test-64', 'Phim 64', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000640f101', '00000000-0000-0000-0000-0000064000c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-00000640b101', '00000000-0000-0000-0000-00000640f101', '00000000-0000-0000-0000-0000064000c1', 'A', 1, 'NORMAL', 'A1'),
      ('00000000-0000-0000-0000-00000640b102', '00000000-0000-0000-0000-00000640f101', '00000000-0000-0000-0000-0000064000c1', 'A', 2, 'NORMAL', 'A2'),
      ('00000000-0000-0000-0000-00000640b103', '00000000-0000-0000-0000-00000640f101', '00000000-0000-0000-0000-0000064000c1', 'A', 3, 'NORMAL', 'A3');
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status) values
      ('00000000-0000-0000-0000-00000640a501', '00000000-0000-0000-0000-0000064000c1',
       '00000000-0000-0000-0000-00000640f101', '00000000-0000-0000-0000-00000640e001',
       now() + interval '10 minutes', now() + interval '130 minutes', '2D', 'ON_SALE');
  $s$;
$$;

-- Mỗi vòng: đơn paid 3 ghế mới tinh (đơn cũ + log xoá đi).
create function public.tap64_order_sql() returns text language sql as $$
  select $o$
    delete from public.checkin_logs where scanner_cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.tickets      where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    delete from public.orders       where cinema_id = '00000000-0000-0000-0000-0000064000c1';
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, booking_code, qr_token) values
      ('00000000-0000-0000-0000-640000000001', 'WEB', '00000000-0000-0000-0000-00000640a501', 'paid', 300000, 300000,
       'T641-RACE01', '64646464646464646464646464646464');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-640000006001', '00000000-0000-0000-0000-640000000001', '00000000-0000-0000-0000-00000640b101', 'A1', 'NORMAL', 100000),
      ('00000000-0000-0000-0000-640000006002', '00000000-0000-0000-0000-640000000001', '00000000-0000-0000-0000-00000640b102', 'A2', 'NORMAL', 100000),
      ('00000000-0000-0000-0000-640000006003', '00000000-0000-0000-0000-640000000001', '00000000-0000-0000-0000-00000640b103', 'A3', 'NORMAL', 100000);
    insert into public.tickets (id, order_id, order_seat_id, showtime_id) values
      ('00000000-0000-0000-0000-640000007001', '00000000-0000-0000-0000-640000000001', '00000000-0000-0000-0000-640000006001', '00000000-0000-0000-0000-00000640a501'),
      ('00000000-0000-0000-0000-640000007002', '00000000-0000-0000-0000-640000000001', '00000000-0000-0000-0000-640000006002', '00000000-0000-0000-0000-00000640a501'),
      ('00000000-0000-0000-0000-640000007003', '00000000-0000-0000-0000-640000000001', '00000000-0000-0000-0000-640000006003', '00000000-0000-0000-0000-00000640a501');
  $o$;
$$;

-- Kết quả một phiên dblink: status của RPC, hoặc sqlstate nếu phiên lỗi.
create function public.tap64_get(p_conn text) returns text language plpgsql as $$
declare v_status text; v_state text;
begin
  select t.s into v_status from extensions.dblink_get_result(p_conn) as t(s text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(s text);  -- rút nốt kết quả rỗng cuối
  return coalesce(v_status, 'null');
exception when others then
  v_state := sqlstate;
  begin
    perform 1 from extensions.dblink_get_result(p_conn) as t(s text);
  exception when others then null;
  end;
  return v_state;
end;
$$;

create function public.tap64_run() returns jsonb language plpgsql as $$
declare
  v_conn      text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                             coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_b_delay   numeric[] := array[0, 0.01, 0.02, 0, 0.05, 0.03, 0, 0.04, 0.01, 0, 0.06, 0.02, 0.01, 0, 0.03];
  v_a text; v_b text;
  v_ok_count integer;
  v_used_count integer;
  v_bad_rounds integer := 0;
  v_deadlocks integer := 0;
  v_log text := '';
  v_checked integer; v_distinct_at integer; v_success_logs integer; v_order_status text;
  i integer;
  v_call text := $q$public.checkin_ticket('64646464646464646464646464646464', '00000000-0000-0000-0000-0000064000c1', null)->>'status'$q$;
begin
  perform extensions.dblink_connect('t64_setup', v_conn);
  perform extensions.dblink_exec('t64_setup', public.tap64_cleanup_sql());
  perform extensions.dblink_exec('t64_setup', public.tap64_setup_sql());
  perform extensions.dblink_connect('t64_a', v_conn);
  perform extensions.dblink_connect('t64_b', v_conn);

  for i in 1..array_length(v_b_delay, 1) loop
    perform extensions.dblink_exec('t64_setup', public.tap64_order_sql());

    perform extensions.dblink_send_query('t64_a', format('select %s as s', v_call));
    perform extensions.dblink_send_query('t64_b', format('select pg_sleep(%s)::text, %s as s', v_b_delay[i], v_call));
    v_a := public.tap64_get('t64_a');
    -- phiên B có 2 cột (sleep, s): đọc riêng
    begin
      select t.s into v_b from extensions.dblink_get_result('t64_b') as t(r text, s text);
      perform 1 from extensions.dblink_get_result('t64_b') as t(r text, s text);
    exception when others then
      v_b := sqlstate;
      begin perform 1 from extensions.dblink_get_result('t64_b') as t(r text, s text); exception when others then null; end;
    end;

    v_ok_count   := (v_a = 'OK')::int   + (v_b = 'OK')::int;
    v_used_count := (v_a = 'USED')::int + (v_b = 'USED')::int;
    v_deadlocks  := v_deadlocks + (v_a = '40P01')::int + (v_b = '40P01')::int;
    v_log := v_log || format('[%s:%s/%s]', i, v_a, v_b);

    select t.n, t.d, t.l, t.s into v_checked, v_distinct_at, v_success_logs, v_order_status
    from extensions.dblink('t64_setup',
      $q$select (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-640000000001' and checked_in_at is not null)::int,
                (select count(distinct checked_in_at) from public.tickets where order_id = '00000000-0000-0000-0000-640000000001')::int,
                (select count(*) from public.checkin_logs where scanner_cinema_id = '00000000-0000-0000-0000-0000064000c1' and result = 'SUCCESS')::int,
                (select status::text from public.orders where id = '00000000-0000-0000-0000-640000000001')$q$)
      as t(n int, d int, l int, s text);

    if v_ok_count <> 1 or v_used_count <> 1 or v_checked <> 3 or v_distinct_at <> 1
       or v_success_logs <> 1 or v_order_status <> 'checked_in' then
      v_bad_rounds := v_bad_rounds + 1;
      v_log := v_log || format('{bad %s: checked=%s distinct_at=%s success_logs=%s status=%s}',
                               i, v_checked, v_distinct_at, v_success_logs, v_order_status);
    end if;
  end loop;

  perform extensions.dblink_exec('t64_setup', public.tap64_cleanup_sql());
  perform extensions.dblink_disconnect('t64_a');
  perform extensions.dblink_disconnect('t64_b');
  perform extensions.dblink_disconnect('t64_setup');

  return jsonb_build_object('rounds', array_length(v_b_delay, 1), 'bad_rounds', v_bad_rounds,
                            'deadlocks', v_deadlocks, 'log', v_log);
exception when others then
  begin perform extensions.dblink_exec('t64_setup', public.tap64_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t64_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t64_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t64_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table tap64_result as select public.tap64_run() as j;
grant select on tap64_result to public;

select is((select (j->>'rounds')::int from tap64_result), 15, 'Chạy đủ 15 vòng quét đồng thời');
select is((select (j->>'deadlocks')::int from tap64_result), 0, 'Không có deadlock 40P01 giữa 2 phiên quét cùng đơn');
select is((select (j->>'bad_rounds')::int from tap64_result), 0,
  'Mỗi vòng đúng 1 SUCCESS + 1 USED, cả 3 vé soát đúng 1 lần, 1 log SUCCESS, đơn checked_in');
select ok((select j->>'log' from tap64_result) !~ '\{bad', 'Không vòng nào lệch: ' || (select j->>'log' from tap64_result));
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000064000c1'),
  0::bigint, 'Đã dọn dữ liệu thử sau test');

select * from finish();
rollback;
