-- ============================================================================
-- pgTAP Test: 067_cinema_status_apply_concurrency.test.sql
-- feature cinema-status-notice phase-1 task-01, review F1 (race đa phiên THẬT, dblink):
--   1) apply_due_cinema_status_changes x hold_seats: phiên A giữ `showtimes FOR SHARE` rồi mới insert order
--      (FK cinema_id -> FOR KEY SHARE trên dòng rạp) trong lúc job đã khoá dòng rạp và chờ showtimes.
--      Nếu job khoá rạp bằng FOR UPDATE -> chu trình chờ -> 40P01. Với FOR NO KEY UPDATE: không deadlock,
--      hold ok, job chờ A commit rồi huỷ suất + đơn holding vừa tạo.
--   2) schedule_cinema_status KHÔNG bị treo bởi hold_seats đang mở (không chặn bán vé lúc enqueue email).
-- Dữ liệu commit thật qua dblink -> tự dọn trước và sau (kể cả email_outbox CINEMA_STATUS_NOTICE của fixture).
-- ============================================================================
begin;
select plan(8);

create extension if not exists dblink with schema extensions;

create function public.tap67_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.affected_order_cases where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.email_outbox  where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.payment_events where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.payments      where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.tickets       where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.orders        where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.price_rules   where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.showtimes     where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.seats         where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.rooms         where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.movies        where id = '00000000-0000-0000-0000-00000670e001';
    delete from public.cinemas       where id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000067000a1';
    delete from public.profiles      where id in ('00000000-0000-0000-0000-0000067000d1', '00000000-0000-0000-0000-0000067000d2');
    delete from auth.users           where id in ('00000000-0000-0000-0000-0000067000d1', '00000000-0000-0000-0000-0000067000d2');
    delete from public.audit_logs    where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2')
       or record_id in ('00000000-0000-0000-0000-00000670e001', '00000000-0000-0000-0000-0000067000a1',
                        '00000000-0000-0000-0000-0000067000d1', '00000000-0000-0000-0000-0000067000d2',
                        '00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2');
  $c$;
$$;

create function public.tap67_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000067000a1', 'T67', 'Tỉnh Test 67');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000067000c1', 'T671', 'Rạp T67-1', '00000000-0000-0000-0000-0000067000a1', '1 Test', 15),
      ('00000000-0000-0000-0000-0000067000c2', 'T672', 'Rạp T67-2', '00000000-0000-0000-0000-0000067000a1', '2 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-00000670e001', 'phim-test-67', 'Phim 67', 120, '2026-12-01', 'P', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-00000670f101', '00000000-0000-0000-0000-0000067000c1', 'P1', '{2D}', 2, 2),
      ('00000000-0000-0000-0000-00000670f102', '00000000-0000-0000-0000-0000067000c2', 'P1', '{2D}', 2, 2);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-00000670b101', '00000000-0000-0000-0000-00000670f101', '00000000-0000-0000-0000-0000067000c1', 'A', 1, 'NORMAL', 'A1'),
      ('00000000-0000-0000-0000-00000670b201', '00000000-0000-0000-0000-00000670f102', '00000000-0000-0000-0000-0000067000c2', 'A', 1, 'NORMAL', 'A1');
    insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
      select 'CINEMA', c.id, 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
        from (values ('00000000-0000-0000-0000-0000067000c1'::uuid), ('00000000-0000-0000-0000-0000067000c2'::uuid)) c(id),
             unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      ('00000000-0000-0000-0000-00000670a501', '00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-00000670f101',
       '00000000-0000-0000-0000-00000670e001', now() + interval '3 days', '2D', 'ON_SALE'),
      ('00000000-0000-0000-0000-00000670a502', '00000000-0000-0000-0000-0000067000c2', '00000000-0000-0000-0000-00000670f102',
       '00000000-0000-0000-0000-00000670e001', now() + interval '3 days', '2D', 'ON_SALE');
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000067000d1', 'u67a@example.com', '{}', now()),
      ('00000000-0000-0000-0000-0000067000d2', 'u67b@example.com', '{}', now());
    -- C1 có lịch đóng cửa CHƯA tới hạn (cron thật mỗi phút không đụng); test mới đẩy về quá khứ ngay trước khi chạy job.
    update public.cinemas set scheduled_status = 'CLOSED', scheduled_effective_at = now() + interval '7 days'
     where id = '00000000-0000-0000-0000-0000067000c1';
  $s$;
$$;

-- Kết quả một phiên async: 'ok:<giá trị>' hoặc '<sqlstate>:<10 ký tự đầu thông báo>'
create function public.tap67_get(p_conn text) returns text language plpgsql as $$
declare v_res text;
begin
  select t.r into v_res from extensions.dblink_get_result(p_conn) as t(r text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text);  -- rút nốt kết quả rỗng cuối
  return 'ok:' || coalesce(v_res, '');
exception when others then
  v_res := sqlstate || ':' || left(sqlerrm, 10);
  begin
    perform 1 from extensions.dblink_get_result(p_conn) as t(r text);
  exception when others then null;
  end;
  return v_res;
end;
$$;

create function public.tap67_run() returns jsonb language plpgsql as $fn$
declare
  v_conn text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                        coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_s1   text := '00000000-0000-0000-0000-00000670a501';
  v_s2   text := '00000000-0000-0000-0000-00000670a502';
  v_c1   text := '00000000-0000-0000-0000-0000067000c1';
  v_c2   text := '00000000-0000-0000-0000-0000067000c2';
  v_a_err text := 'ok';
  v_b1 text; v_b2 text;
  v_busy integer;
  v_state record;
begin
  perform extensions.dblink_connect('t67_setup', v_conn);
  perform extensions.dblink_exec('t67_setup', public.tap67_cleanup_sql());
  perform extensions.dblink_exec('t67_setup', public.tap67_setup_sql());
  perform extensions.dblink_connect('t67_a', v_conn);
  perform extensions.dblink_connect('t67_b', v_conn);

  -- ===== Phần 1: job áp dụng lịch x hold_seats =====
  -- A: giữ showtimes FOR SHARE (bước đầu của hold_seats), chưa insert order.
  perform extensions.dblink_exec('t67_a', 'begin');
  perform extensions.dblink_exec('t67_a',
    format($q$do $d$ begin perform 1 from public.showtimes where id = %L for share; end $d$$q$, v_s1));
  -- Đẩy lịch C1 tới hạn rồi chạy job ở phiên B: job khoá dòng rạp, huỷ suất -> chờ showtimes của A.
  perform extensions.dblink_exec('t67_setup',
    format($q$update public.cinemas set scheduled_effective_at = now() - interval '1 minute' where id = %L$q$, v_c1));
  perform extensions.dblink_send_query('t67_b', 'select public.apply_due_cinema_status_changes()::text as r');
  perform pg_sleep(0.5);
  -- A: phần còn lại của hold_seats insert order -> FK cinema_id lấy KEY SHARE trên dòng rạp đang bị job khoá.
  begin
    perform extensions.dblink_exec('t67_a', format(
      $q$do $d$ begin perform public.hold_seats(%L::uuid, array['00000000-0000-0000-0000-00000670b101']::uuid[], 'WEB',
          '00000000-0000-0000-0000-0000067000d1'::uuid); end $d$$q$, v_s1));
    perform extensions.dblink_exec('t67_a', 'commit');
  exception when others then
    v_a_err := sqlstate || ':' || left(sqlerrm, 10);
    begin perform extensions.dblink_exec('t67_a', 'rollback'); exception when others then null; end;
  end;
  v_b1 := public.tap67_get('t67_b');

  select t.cs, t.sc, t.ss, t.st, t.ord, t.states into v_state from extensions.dblink('t67_setup', format(
    $q$select (select status::text from public.cinemas where id = %1$L),
              (select scheduled_status::text from public.cinemas where id = %1$L),
              (select status::text from public.showtimes where id = %2$L),
              (select status::text from public.showtimes where id = %2$L),
              (select string_agg(status::text, ',') from public.orders where showtime_id = %2$L),
              (select count(*)::int from public.showtime_seat_states where showtime_id = %2$L)$q$, v_c1, v_s1))
    as t(cs text, sc text, ss text, st text, ord text, states int);

  -- ===== Phần 2: schedule_cinema_status không bị treo bởi hold_seats đang mở =====
  perform extensions.dblink_exec('t67_a', 'begin');
  perform extensions.dblink_exec('t67_a', format(
    $q$do $d$ begin perform public.hold_seats(%L::uuid, array['00000000-0000-0000-0000-00000670b201']::uuid[], 'WEB',
        '00000000-0000-0000-0000-0000067000d2'::uuid); end $d$$q$, v_s2));
  perform extensions.dblink_send_query('t67_b',
    format($q$select (public.schedule_cinema_status(%L::uuid, 'CLOSED'::public.cinema_status)->>'scheduled_status') as r$q$, v_c2));
  perform pg_sleep(0.5);
  v_busy := extensions.dblink_is_busy('t67_b');
  perform extensions.dblink_exec('t67_a', 'commit');
  v_b2 := public.tap67_get('t67_b');

  perform extensions.dblink_exec('t67_setup', public.tap67_cleanup_sql());
  perform extensions.dblink_disconnect('t67_a');
  perform extensions.dblink_disconnect('t67_b');
  perform extensions.dblink_disconnect('t67_setup');

  return jsonb_build_object('a_err', v_a_err, 'b1', v_b1, 'b2', v_b2, 'busy2', v_busy,
    'cinema_status', v_state.cs, 'cinema_sched', v_state.sc, 'showtime', v_state.ss, 'orders', v_state.ord, 'states', v_state.states);
exception when others then
  begin perform extensions.dblink_exec('t67_a', 'rollback'); exception when others then null; end;
  begin perform extensions.dblink_exec('t67_setup', public.tap67_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t67_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t67_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t67_setup'); exception when others then null; end;
  raise;
end;
$fn$;

create temp table tap67_result as select public.tap67_run() as j;
grant select on tap67_result to public;

select is((select j->>'a_err' from tap67_result), 'ok', '1. hold_seats (phiên A) không deadlock/không lỗi khi job đang khoá rạp');
select is((select j->>'b1' from tap67_result), 'ok:1', '2. job apply_due_cinema_status_changes không 40P01, áp dụng đúng 1 rạp');
select is((select j->>'cinema_status' from tap67_result), 'CLOSED', '3. rạp C1 đã CLOSED, lịch đã xoá');
select is((select j->>'cinema_sched' from tap67_result), null, '4. scheduled_status của C1 = null sau khi áp dụng');
select is((select j->>'showtime' from tap67_result), 'CANCELLED', '5. suất của C1 bị job huỷ');
select is((select j->>'orders' || '|' || (j->>'states') from tap67_result), 'cancelled|0',
  '6. đơn holding vừa tạo trong lúc job chờ bị huỷ, ghế nhả sạch');
select is((select (j->>'busy2') || '|' || (j->>'b2') from tap67_result), '0|ok:CLOSED',
  '7. schedule_cinema_status không bị hold_seats đang mở chặn (FOR NO KEY UPDATE) và hẹn thành công');
select is(
  (select count(*) from public.orders where cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2'))
  + (select count(*) from public.email_outbox where kind = 'CINEMA_STATUS_NOTICE' and cinema_id in ('00000000-0000-0000-0000-0000067000c1', '00000000-0000-0000-0000-0000067000c2')),
  0::bigint, '8. dữ liệu fixture đồng thời (đơn, email thông báo) đã được dọn sạch');

select * from finish();
rollback;
