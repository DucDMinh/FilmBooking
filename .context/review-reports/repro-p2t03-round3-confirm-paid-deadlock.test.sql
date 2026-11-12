-- ============================================================================
-- Reviewer repro (round 3, bug-layer34-review phase-2 task-03): confirm_paid x hold_seats deadlock do FK tickets.seat_id.
-- Kịch bản (thực tế): đơn A (WEB) đã 'expired' (job đã quét, không còn dòng ghế) => tiền về muộn. Ghế S đang có dòng HELD
-- ĐÃ HẾT HẠN của đơn D (chưa bị quét). Cùng lúc khách C gọi hold_seats đúng ghế S.
--   A: confirm_paid -> sell_order_seats khoá dòng seat_state của D (FOR UPDATE, ON CONFLICT DO UPDATE -> SOLD) -> ... ->
--      INSERT tickets -> FK tickets.seat_id lấy KEY SHARE trên seats(S).
--   C: hold_seats -> §3.8b khoá đơn D (A không giữ) -> §3.9 seats(S) FOR UPDATE -> §3.14 DELETE dòng HELD hết hạn của D
--      FOR UPDATE -> chờ A.
--   => A chờ C (seats), C chờ A (seat_state) => 40P01. Trước FK (task-03) A không đụng seats sau sell_order_seats => không chu trình.
-- Để ép interleaving: phiên B giữ order_seats(A) FOR UPDATE ~1.5s => A dừng ở FK tickets.order_seat_id (KEY SHARE order_seats)
-- SAU khi đã khoá dòng seat_state, cho C kịp khoá seats; B nhả => A đi tiếp tới FK seat_id. B KHÔNG nằm trong chu trình
-- (đã nhả trước khi deadlock xảy ra), chỉ nới rộng cửa sổ giữa sell_order_seats và INSERT tickets.
-- Dữ liệu commit thật qua dblink => tự dọn trước/sau. Kỳ vọng hiện tại: FAIL ở assert "không 40P01" (defect tái hiện).
-- ============================================================================
begin;
select plan(3);

create extension if not exists dblink with schema extensions;

create function public.r3_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.price_rules   where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-0000a3d000e1';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000a3d000c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000a3d000a1';
    delete from public.profiles      where id in ('00000000-0000-0000-0000-0000a3d000d1', '00000000-0000-0000-0000-0000a3d000d2');
    delete from auth.users           where id in ('00000000-0000-0000-0000-0000a3d000d1', '00000000-0000-0000-0000-0000a3d000d2');
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000a3d000c1'
       or record_id in ('00000000-0000-0000-0000-0000a3d000e1', '00000000-0000-0000-0000-0000a3d000a1',
                        '00000000-0000-0000-0000-0000a3d000d1', '00000000-0000-0000-0000-0000a3d000d2');
  $c$;
$$;

-- order A = ...a3d00a01 (expired, tiền về muộn), order D = ...a3d00d01 (holding, HELD hết hạn sau 0.3s)
create function public.r3_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000a3d000a1', 'TR3', 'Tỉnh R3');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000a3d000c1', 'TR31', 'Rạp R3', '00000000-0000-0000-0000-0000a3d000a1', '1 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-0000a3d000e1', 'phim-r3', 'Phim R3', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-0000a3d000f1', '00000000-0000-0000-0000-0000a3d000c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-0000a3d000b1', '00000000-0000-0000-0000-0000a3d000f1', '00000000-0000-0000-0000-0000a3d000c1', 'A', 1, 'NORMAL', 'A1');
    insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
      select 'CINEMA', '00000000-0000-0000-0000-0000a3d000c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
        from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000a3d000d1', 'r3c@example.com', '{}', now()),
      ('00000000-0000-0000-0000-0000a3d000d2', 'r3d@example.com', '{}', now());
    update public.profiles set date_of_birth = '1995-05-15'
     where id in ('00000000-0000-0000-0000-0000a3d000d1', '00000000-0000-0000-0000-0000a3d000d2');
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      ('00000000-0000-0000-0000-0000a3d00051', '00000000-0000-0000-0000-0000a3d000c1', '00000000-0000-0000-0000-0000a3d000f1',
       '00000000-0000-0000-0000-0000a3d000e1', now() + interval '5 days', '2D', 'ON_SALE');
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
      ('00000000-0000-0000-0000-0000a3d00a01', 'WEB', '00000000-0000-0000-0000-0000a3d00051', 'expired', 100000, 0, 100000, null, 'r3a@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-0000a3d00a61', '00000000-0000-0000-0000-0000a3d00a01', '00000000-0000-0000-0000-0000a3d000b1', 'A1', 'NORMAL', 100000);
    insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at) values
      ('00000000-0000-0000-0000-0000a3d00d01', 'WEB', '00000000-0000-0000-0000-0000a3d00051', '00000000-0000-0000-0000-0000a3d000d2',
       'holding', 100000, 0, 100000, clock_timestamp() + interval '0.3 seconds');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-0000a3d00d61', '00000000-0000-0000-0000-0000a3d00d01', '00000000-0000-0000-0000-0000a3d000b1', 'A1', 'NORMAL', 100000);
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
      ('00000000-0000-0000-0000-0000a3d00051', '00000000-0000-0000-0000-0000a3d000b1', 'HELD', 'WEB',
       clock_timestamp() + interval '0.3 seconds', '00000000-0000-0000-0000-0000a3d00d01');
  $s$;
$$;

create function public.r3_get(p_conn text) returns text language plpgsql as $$
declare v_state text; v_msg text; v_det text; v_ctx text;
begin
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text);
  return 'ok';
exception when others then
  v_state := sqlstate; v_msg := sqlerrm;
  get stacked diagnostics v_det = pg_exception_detail, v_ctx = pg_exception_context;
  begin perform 1 from extensions.dblink_get_result(p_conn) as t(r text, s text); exception when others then null; end;
  return v_state || ' ' || left(v_msg, 160) || ' | DETAIL: ' || coalesce(v_det, '') || ' | CONTEXT: ' || left(coalesce(v_ctx, ''), 700);
end;
$$;

create function public.r3_run() returns jsonb language plpgsql as $$
declare
  v_conn text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                        coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_a text; v_b text; v_c text; v_after text;
begin
  perform extensions.dblink_connect('r3_setup', v_conn);
  perform extensions.dblink_exec('r3_setup', public.r3_cleanup_sql());
  perform extensions.dblink_exec('r3_setup', public.r3_setup_sql());
  perform extensions.dblink_connect('r3_a', v_conn);
  perform extensions.dblink_connect('r3_b', v_conn);
  perform extensions.dblink_connect('r3_c', v_conn);

  perform pg_sleep(0.4);  -- hold của D đã hết hạn (chưa bị quét)
  -- B: giữ order_seats(A) FOR UPDATE 1.5s => A dừng ở FK tickets.order_seat_id SAU khi đã khoá dòng seat_state
  perform extensions.dblink_send_query('r3_b', $q$select '0'::text as r, (select pg_sleep(1.5)::text from
      (select 1 from public.order_seats where id = '00000000-0000-0000-0000-0000a3d00a61' for update) x) as s$q$);
  perform pg_sleep(0.1);
  perform extensions.dblink_send_query('r3_a', $q$select '0'::text as r,
      public.confirm_paid('00000000-0000-0000-0000-0000a3d00a01', 100000, 'R3_TXN_1', null)::text as s$q$);
  perform pg_sleep(0.3);
  perform extensions.dblink_send_query('r3_c', $q$select '0'::text as r, (select count(*) from public.hold_seats(
      '00000000-0000-0000-0000-0000a3d00051'::uuid, array['00000000-0000-0000-0000-0000a3d000b1']::uuid[], 'WEB',
      '00000000-0000-0000-0000-0000a3d000d1'::uuid))::text as s$q$);
  v_a := public.r3_get('r3_a');
  v_c := public.r3_get('r3_c');
  v_b := public.r3_get('r3_b');

  select t.x into v_after from extensions.dblink('r3_setup', $q$select format('A=%s tickets=%s seat=%s',
      (select status::text from public.orders where id = '00000000-0000-0000-0000-0000a3d00a01'),
      (select count(*) from public.tickets where order_id = '00000000-0000-0000-0000-0000a3d00a01'),
      (select string_agg(state::text || ':' || order_id::text, ',') from public.showtime_seat_states
        where showtime_id = '00000000-0000-0000-0000-0000a3d00051'))$q$) as t(x text);

  perform extensions.dblink_exec('r3_setup', public.r3_cleanup_sql());
  perform extensions.dblink_disconnect('r3_a');
  perform extensions.dblink_disconnect('r3_b');
  perform extensions.dblink_disconnect('r3_c');
  perform extensions.dblink_disconnect('r3_setup');
  return jsonb_build_object('a', v_a, 'b', v_b, 'c', v_c, 'after', v_after);
exception when others then
  begin perform extensions.dblink_exec('r3_setup', public.r3_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('r3_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('r3_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('r3_c'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('r3_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table r3_result as select public.r3_run() as j;

select diag((select j::text from r3_result));
select diag((select string_agg(t.tgname || ' -> ' || c.conname, ', ' order by t.tgname)
               from pg_trigger t join pg_constraint c on c.oid = t.tgconstraint
              where t.tgrelid = 'public.tickets'::regclass and c.contype = 'f'));
select ok((select j->>'a' not like '40P01%' and j->>'c' not like '40P01%' from r3_result),
  'confirm_paid (tiền về muộn) đồng thời hold_seats cùng ghế: không deadlock 40P01');
select ok((select j->>'b' = 'ok' from r3_result), 'phiên chặn B chạy xong');
select is((select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000a3d000c1'), 0::bigint,
  'dữ liệu repro đã dọn');
select * from finish();
rollback;
