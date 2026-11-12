-- ============================================================================
-- pgTAP Test: 054_zero_amount_concurrency.test.sql
-- bug-layer34-review phase-2 task-03 (review round 1, F2), thu hẹp bởi CR remove-pos: race đa phiên THẬT (dblink) cho
-- confirm_zero_amount (M4): A = confirm_zero_amount đồng thời với B = cancel_showtimes trên cùng suất/đơn 0đ.
--    Khẳng định: không 40P01; A chỉ ok hoặc 23514; sau cùng suất CANCELLED, đơn là 'affected' (A thắng rồi bị huỷ suất)
--    hoặc 'cancelled' (B thắng; khi đó không vé, không dòng ghế). Không bao giờ còn đơn 'paid' trên suất CANCELLED.
-- (Phần race confirm_pos_sale x hold_seats đã bỏ cùng POS.)
-- Dữ liệu commit thật qua dblink (không rollback được) nên tự dọn trước và sau.
-- ============================================================================
begin;
select plan(4);

create extension if not exists dblink with schema extensions;

create function public.tap54_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.affected_order_cases where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.price_rules   where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-00000540e001';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000054000c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000054000a1';
    delete from public.profiles      where id = '00000000-0000-0000-0000-0000054000d1';
    delete from auth.users           where id = '00000000-0000-0000-0000-0000054000d1';
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000054000c1'
       or record_id in ('00000000-0000-0000-0000-00000540e001', '00000000-0000-0000-0000-0000054000a1',
                        '00000000-0000-0000-0000-0000054000d1');
  $c$;
$$;

create function public.tap54_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000054000a1', 'T54', 'Tỉnh Test 54');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000054000c1', 'T541', 'Rạp T54-1', '00000000-0000-0000-0000-0000054000a1', '1 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000540e001', 'phim-test-54', 'Phim 54', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000540f101', '00000000-0000-0000-0000-0000054000c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-00000540b101', '00000000-0000-0000-0000-00000540f101', '00000000-0000-0000-0000-0000054000c1', 'A', 1, 'NORMAL', 'A1');
    insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
      select 'CINEMA', '00000000-0000-0000-0000-0000054000c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
        from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000054000d1', 'u54@example.com', '{}', now());
    update public.profiles set date_of_birth = '1995-05-15' where id = '00000000-0000-0000-0000-0000054000d1';
  $s$;
$$;

-- (starts_at mỗi vòng cách nhau 1 ngày: exclusion constraint chồng suất cùng phòng; ngày 3..14)
-- Vòng i: suất MỚI + đơn MỚI để các vòng không đụng nhau
create function public.tap54_round_sql(p_i int) returns text language plpgsql as $$
declare
  nn text := to_char(p_i, 'FM00');
  v_st text; v_o text; v_os text;
begin
  v_st := '00000000-0000-0000-0000-00000540a5' || nn;
  v_o  := '00000000-0000-0000-0000-5400000000' || nn;
  v_os := '00000000-0000-0000-0000-5400000060' || nn;
  return format($r$
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      (%1$L, '00000000-0000-0000-0000-0000054000c1', '00000000-0000-0000-0000-00000540f101',
       '00000000-0000-0000-0000-00000540e001', now() + make_interval(days => %4$s), '2D', 'ON_SALE');
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
      (%2$L, 'WEB', %1$L, 'holding', 100000, 100000, 0, now() + interval '10 minutes', 'z54@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      (%3$L, %2$L, '00000000-0000-0000-0000-00000540b101', 'A1', 'NORMAL', 100000);
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
      (%1$L, '00000000-0000-0000-0000-00000540b101', 'HELD', 'WEB', now() + interval '10 minutes', %2$L);
  $r$, v_st, v_o, v_os, p_i + 2);
end;
$$;

-- Lấy kết quả một phiên dblink; trả sqlstate nếu phiên lỗi ('ok' nếu thành công)
create function public.tap54_get(p_conn text) returns text language plpgsql as $$
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

create function public.tap54_run() returns jsonb language plpgsql as $$
declare
  v_conn      text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                             coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_a_delay   numeric[] := array[0, 0.05, 0.02, 0.1, 0, 0.07, 0.03, 0.12, 0.01, 0.06, 0.09, 0.04];
  v_b_delay   numeric[] := array[0.05, 0, 0.04, 0, 0.08, 0.02, 0.1, 0.01, 0.06, 0.03, 0, 0.07];
  v_user      text := '00000000-0000-0000-0000-0000054000d1';
  i           integer;
  v_a text; v_b text;
  z_dead integer := 0; z_bad integer := 0; z_paid integer := 0; z_cancelled integer := 0;
  v_st text; v_o text; v_log text := '';
  v_ord_status text; v_tickets integer; v_seat_rows integer; v_st_status text;
begin
  perform extensions.dblink_connect('t54_setup', v_conn);
  perform extensions.dblink_exec('t54_setup', public.tap54_cleanup_sql());
  perform extensions.dblink_exec('t54_setup', public.tap54_setup_sql());
  perform extensions.dblink_connect('t54_a', v_conn);
  perform extensions.dblink_connect('t54_b', v_conn);

  -- confirm_zero_amount (A) vs cancel_showtimes (B)
  for i in 1..array_length(v_a_delay, 1) loop
    v_st := '00000000-0000-0000-0000-00000540a5' || to_char(i, 'FM00');
    v_o  := '00000000-0000-0000-0000-5400000000' || to_char(i, 'FM00');
    perform extensions.dblink_exec('t54_setup', public.tap54_round_sql(i));
    perform extensions.dblink_send_query('t54_a',
      format($q$select pg_sleep(%s)::text as r, public.confirm_zero_amount(%L)::text as s$q$, v_a_delay[i], v_o));
    perform extensions.dblink_send_query('t54_b',
      format($q$select pg_sleep(%s)::text as r, public.cancel_showtimes(array[%L]::uuid[], 'test 54', %L::uuid)::text as s$q$,
             v_b_delay[i], v_st, v_user));
    v_a := public.tap54_get('t54_a');
    v_b := public.tap54_get('t54_b');
    z_dead := z_dead + (v_a = '40P01')::int + (v_b = '40P01')::int;

    select t.s, t.t, t.r, t.st into v_ord_status, v_tickets, v_seat_rows, v_st_status from extensions.dblink('t54_setup',
      format($q$select (select status::text from public.orders where id = %1$L),
                       (select count(*)::int from public.tickets where order_id = %1$L),
                       (select count(*)::int from public.showtime_seat_states where order_id = %1$L),
                       (select status::text from public.showtimes where id = %2$L)$q$, v_o, v_st))
      as t(s text, t int, r int, st text);
    if v_ord_status = 'affected' then z_paid := z_paid + 1; elsif v_ord_status = 'cancelled' then z_cancelled := z_cancelled + 1; end if;
    if v_a not in ('ok', '23514') or v_b <> 'ok' or v_st_status <> 'CANCELLED'
       or v_ord_status not in ('affected', 'cancelled')
       or (v_ord_status = 'cancelled' and (v_tickets > 0 or v_seat_rows > 0))
       or (v_ord_status = 'affected' and v_a <> 'ok') then
      z_bad := z_bad + 1;
      v_log := v_log || format('{bad zero %s: A=%s B=%s order=%s tickets=%s seats=%s showtime=%s}',
                               i, v_a, v_b, v_ord_status, v_tickets, v_seat_rows, v_st_status);
    end if;
  end loop;

  perform extensions.dblink_exec('t54_setup', public.tap54_cleanup_sql());
  perform extensions.dblink_disconnect('t54_a');
  perform extensions.dblink_disconnect('t54_b');
  perform extensions.dblink_disconnect('t54_setup');

  return jsonb_build_object('z_rounds', array_length(v_a_delay, 1), 'z_dead', z_dead, 'z_bad', z_bad,
                            'log', format('zero: affected=%s cancelled=%s %s', z_paid, z_cancelled, v_log));
exception when others then
  begin perform extensions.dblink_exec('t54_setup', public.tap54_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t54_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t54_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t54_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table tap54_result as select public.tap54_run() as j;
grant select on tap54_result to public;

select is((select (j->>'z_rounds')::int from tap54_result), 12, 'chạy đủ 12 vòng confirm_zero_amount vs cancel_showtimes');
select is((select (j->>'z_dead')::int from tap54_result), 0, 'Phần 1: không deadlock 40P01 (M4)');
select is((select (j->>'z_bad')::int from tap54_result), 0,
  'Phần 1: suất CANCELLED, đơn affected/cancelled (không còn paid), đơn cancelled không vé/không ghế, A chỉ ok hoặc 23514');
select is(
  (select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000054000c1'),
  0::bigint, 'Dữ liệu fixture đồng thời đã được dọn sạch');

select diag((select j->>'log' from tap54_result));
select * from finish();
rollback;
