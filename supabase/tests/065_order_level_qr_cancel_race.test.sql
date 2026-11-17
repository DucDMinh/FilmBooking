-- ============================================================================
-- pgTAP Test: 065_order_level_qr_cancel_race.test.sql
-- feature-order-level-qr phase-1 task-01, review round 1 (F1): checkin_ticket x cancel_showtimes.
-- Thứ tự khoá toàn cục là showtimes -> orders. cancel_showtimes khoá showtimes FOR UPDATE rồi orders; checkin_ticket
-- khoá orders rồi insert checkin_logs (FK showtimes lấy KEY SHARE) nên bản cũ có thể deadlock 40P01.
-- Tái hiện XÁC ĐỊNH: trigger tạm 'tap65_pause' (BEFORE INSERT trên checkin_logs, ngủ 0.6s) giữ phiên quét ở đúng
-- khoảng "đã khoá orders, chưa xin KEY SHARE showtimes"; phiên huỷ suất chen vào sau 0.2s.
--   Bản sai thứ tự khoá: 40P01. Bản đúng (showtimes FOR SHARE trước): phiên huỷ chờ, kết quả nhất quán.
-- Khẳng định mỗi vòng: không 40P01; cancel_showtimes thành công; suất CANCELLED; đơn 'affected';
--   nếu quét OK thì CẢ vé đã soát, nếu quét CANCELLED thì không vé nào được soát (không trạng thái nửa vời).
-- Dữ liệu commit thật qua dblink nên tự dọn trước và sau (kể cả trigger tạm).
-- ============================================================================
begin;
select plan(5);

create extension if not exists dblink with schema extensions;

create function public.tap65_cleanup_sql() returns text language sql as $$
  select $c$
    drop trigger if exists tap65_pause on public.checkin_logs;
    drop function if exists public.tap65_pause();
    delete from public.affected_order_cases where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.checkin_logs  where scanner_cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-00000650e001';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000065000a1';
    delete from public.profiles      where id = '00000000-0000-0000-0000-0000065000d1';
    delete from auth.users           where id = '00000000-0000-0000-0000-0000065000d1';
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000065000c1'
       or record_id in ('00000000-0000-0000-0000-00000650e001', '00000000-0000-0000-0000-0000065000a1',
                        '00000000-0000-0000-0000-0000065000d1');
  $c$;
$$;

create function public.tap65_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000065000a1', 'T65', 'Tỉnh Test 65');
    insert into public.cinemas (id, code, name, province_id, address) values
      ('00000000-0000-0000-0000-0000065000c1', 'T651', 'Rạp T65-1', '00000000-0000-0000-0000-0000065000a1', '1 Test');
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000650e001', 'phim-test-65', 'Phim 65', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000650f101', '00000000-0000-0000-0000-0000065000c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-00000650b101', '00000000-0000-0000-0000-00000650f101', '00000000-0000-0000-0000-0000065000c1', 'A', 1, 'NORMAL', 'A1'),
      ('00000000-0000-0000-0000-00000650b102', '00000000-0000-0000-0000-00000650f101', '00000000-0000-0000-0000-0000065000c1', 'A', 2, 'NORMAL', 'A2');
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000065000d1', 'u65@example.com', '{}', now());
  $s$;
$$;

-- Mỗi vòng: suất + đơn paid 2 ghế mới tinh trong cửa sổ soát vé.
create function public.tap65_round_sql() returns text language sql as $$
  select $o$
    delete from public.affected_order_cases where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.checkin_logs  where scanner_cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000065000c1';
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status) values
      ('00000000-0000-0000-0000-00000650a501', '00000000-0000-0000-0000-0000065000c1',
       '00000000-0000-0000-0000-00000650f101', '00000000-0000-0000-0000-00000650e001',
       now() + interval '10 minutes', now() + interval '130 minutes', '2D', 'ON_SALE');
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, total_amount, booking_code, qr_token, contact_email) values
      ('00000000-0000-0000-0000-650000000001', 'WEB', '00000000-0000-0000-0000-00000650a501', 'paid', 200000, 200000,
       'T651-RACE01', '65656565656565656565656565656565', 'x65@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-650000006001', '00000000-0000-0000-0000-650000000001', '00000000-0000-0000-0000-00000650b101', 'A1', 'NORMAL', 100000),
      ('00000000-0000-0000-0000-650000006002', '00000000-0000-0000-0000-650000000001', '00000000-0000-0000-0000-00000650b102', 'A2', 'NORMAL', 100000);
    insert into public.tickets (id, order_id, order_seat_id, showtime_id) values
      ('00000000-0000-0000-0000-650000007001', '00000000-0000-0000-0000-650000000001', '00000000-0000-0000-0000-650000006001', '00000000-0000-0000-0000-00000650a501'),
      ('00000000-0000-0000-0000-650000007002', '00000000-0000-0000-0000-650000000001', '00000000-0000-0000-0000-650000006002', '00000000-0000-0000-0000-00000650a501');
  $o$;
$$;

create function public.tap65_pause_sql() returns text language sql as $$
  select $t$
    create function public.tap65_pause() returns trigger language plpgsql as 'begin perform pg_sleep(0.6); return new; end';
    create trigger tap65_pause before insert on public.checkin_logs
      for each row when (new.scanner_cinema_id = '00000000-0000-0000-0000-0000065000c1') execute function public.tap65_pause();
  $t$;
$$;

-- Kết quả một phiên (2 cột r, s): giá trị cột s, hoặc sqlstate nếu phiên lỗi.
create function public.tap65_get(p_conn text) returns text language plpgsql as $$
declare v_s text; v_state text;
begin
  select t.s into v_s from extensions.dblink_get_result(p_conn) as t(r text, s text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);  -- rút nốt kết quả rỗng cuối
  return coalesce(v_s, 'null');
exception when others then
  v_state := sqlstate;
  begin
    perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  exception when others then null;
  end;
  return v_state;
end;
$$;

create function public.tap65_run() returns jsonb language plpgsql as $$
declare
  v_conn text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                        coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_rounds integer := 3;
  v_a text; v_b text;
  v_deadlocks integer := 0;
  v_bad integer := 0;
  v_log text := '';
  v_checked integer; v_order_status text; v_st_status text;
  i integer;
begin
  perform extensions.dblink_connect('t65_setup', v_conn);
  perform extensions.dblink_exec('t65_setup', public.tap65_cleanup_sql());
  perform extensions.dblink_exec('t65_setup', public.tap65_setup_sql());
  perform extensions.dblink_exec('t65_setup', public.tap65_pause_sql());
  perform extensions.dblink_connect('t65_a', v_conn);
  perform extensions.dblink_connect('t65_b', v_conn);

  for i in 1..v_rounds loop
    perform extensions.dblink_exec('t65_setup', public.tap65_round_sql());
    perform extensions.dblink_send_query('t65_a',
      $q$select pg_sleep(0)::text as r, public.checkin_ticket('65656565656565656565656565656565', '00000000-0000-0000-0000-0000065000c1', null)->>'status' as s$q$);
    perform extensions.dblink_send_query('t65_b',
      $q$select pg_sleep(0.2)::text as r, public.cancel_showtimes(array['00000000-0000-0000-0000-00000650a501']::uuid[], 'test 65', '00000000-0000-0000-0000-0000065000d1'::uuid)->>'success' as s$q$);
    v_a := public.tap65_get('t65_a');
    v_b := public.tap65_get('t65_b');
    v_deadlocks := v_deadlocks + (v_a = '40P01')::int + (v_b = '40P01')::int;
    v_log := v_log || format('[%s:scan=%s/cancel=%s]', i, v_a, v_b);

    select t.n, t.o, t.s into v_checked, v_order_status, v_st_status from extensions.dblink('t65_setup',
      $q$select (select count(*)::int from public.tickets where order_id = '00000000-0000-0000-0000-650000000001' and checked_in_at is not null),
                (select status::text from public.orders where id = '00000000-0000-0000-0000-650000000001'),
                (select status::text from public.showtimes where id = '00000000-0000-0000-0000-00000650a501')$q$)
      as t(n int, o text, s text);
    if v_b <> 'true' or v_st_status <> 'CANCELLED' or v_order_status <> 'affected'
       or v_a not in ('OK', 'CANCELLED')
       or (v_a = 'OK' and v_checked <> 2) or (v_a = 'CANCELLED' and v_checked <> 0) then
      v_bad := v_bad + 1;
      v_log := v_log || format('{bad %s: checked=%s order=%s showtime=%s}', i, v_checked, v_order_status, v_st_status);
    end if;
  end loop;

  perform extensions.dblink_exec('t65_setup', public.tap65_cleanup_sql());
  perform extensions.dblink_disconnect('t65_a');
  perform extensions.dblink_disconnect('t65_b');
  perform extensions.dblink_disconnect('t65_setup');

  return jsonb_build_object('rounds', v_rounds, 'deadlocks', v_deadlocks, 'bad', v_bad, 'log', v_log);
exception when others then
  begin perform extensions.dblink_exec('t65_setup', public.tap65_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t65_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t65_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t65_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table tap65_result as select public.tap65_run() as j;
grant select on tap65_result to public;

select is((select (j->>'rounds')::int from tap65_result), 3, 'Chạy đủ 3 vòng quét x huỷ suất');
select is((select (j->>'deadlocks')::int from tap65_result), 0,
  'Không deadlock 40P01 giữa checkin_ticket và cancel_showtimes (showtimes -> orders)');
select is((select (j->>'bad')::int from tap65_result), 0,
  'Kết quả nhất quán: suất CANCELLED, đơn affected, quét OK thì soát đủ vé / quét CANCELLED thì không soát vé nào');
select ok((select j->>'log' from tap65_result) !~ '\{bad', 'Log vòng: ' || (select j->>'log' from tap65_result));
select is(
  (select count(*) from pg_trigger where tgname = 'tap65_pause'),
  0::bigint, 'Đã gỡ trigger tạm tap65_pause');

select * from finish();
rollback;
