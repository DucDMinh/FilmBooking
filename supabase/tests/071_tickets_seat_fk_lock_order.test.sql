-- ============================================================================
-- pgTAP Test: 071_tickets_seat_fk_lock_order.test.sql
-- bug tickets-seat-fk phase-1 task-01 (CR-002): race đa phiên THẬT (dblink) confirm_paid x hold_seats cùng ghế, khi đã có
-- FK tickets.seat_id -> seats(id). Tái hiện deadlock 40P01 trong repro của reviewer (bug-layer34-review phase-2 task-03 round 3)
-- và chứng minh sell_order_seats khoá seats TRƯỚC showtime_seat_states (cùng chiều hold_seats) thì không còn chu trình.
-- Kịch bản: đơn A (WEB) đã 'expired', tiền về muộn; ghế S có dòng HELD ĐÃ HẾT HẠN của đơn D (chưa bị quét); cùng lúc khách C
-- gọi hold_seats đúng ghế S. Phiên B giữ order_seats(A) FOR UPDATE ~1.5s để A dừng ở FK tickets.order_seat_id SAU khi đã khoá
-- seat_state (nới cửa sổ giữa sell_order_seats và INSERT tickets); B nhả trước khi có chu trình nên không nằm trong chu trình.
--   * Trước sửa (FK có, sell_order_seats cũ): A giữ seat_state chờ seats(S) của C; C giữ seats(S) chờ seat_state => 40P01 (ĐỎ).
--   * Sau sửa (sell_order_seats khoá seats key share trước): C chờ A ở seats, không chu trình (XANH).
-- Dữ liệu commit thật qua dblink => tự dọn trước và sau (không đụng dữ liệu demo).
-- ============================================================================
begin;
select plan(7);

create extension if not exists dblink with schema extensions;

create function public.t71_cleanup_sql() returns text language sql as $$
  select $c$
    delete from public.email_outbox  where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.payment_events where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.payments      where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.tickets       where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.orders        where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.price_rules   where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.showtimes     where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.seats         where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.rooms         where cinema_id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.movies        where id = '00000000-0000-0000-0000-0000710000e1';
    delete from public.cinemas       where id = '00000000-0000-0000-0000-0000710000c1';
    delete from public.provinces     where id = '00000000-0000-0000-0000-0000710000a1';
    delete from public.profiles      where id in ('00000000-0000-0000-0000-0000710000d1', '00000000-0000-0000-0000-0000710000d2');
    delete from auth.users           where id in ('00000000-0000-0000-0000-0000710000d1', '00000000-0000-0000-0000-0000710000d2');
    delete from public.audit_logs    where cinema_id = '00000000-0000-0000-0000-0000710000c1'
       or record_id in ('00000000-0000-0000-0000-0000710000e1', '00000000-0000-0000-0000-0000710000a1',
                        '00000000-0000-0000-0000-0000710000d1', '00000000-0000-0000-0000-0000710000d2');
  $c$;
$$;

-- order A = ...71000a01 (expired, tiền về muộn), order D = ...71000d01 (holding, HELD hết hạn sau 0.3s)
create function public.t71_setup_sql() returns text language sql as $$
  select $s$
    insert into public.provinces (id, code, name) values ('00000000-0000-0000-0000-0000710000a1', 'T71', 'Tỉnh T71');
    insert into public.cinemas (id, code, name, province_id, address, online_cutoff_minutes) values
      ('00000000-0000-0000-0000-0000710000c1', 'T711', 'Rạp T71', '00000000-0000-0000-0000-0000710000a1', '1 Test', 15);
    insert into public.movies (id, slug, title_vi, duration_minutes, release_date, age_rating, status) values
      ('00000000-0000-0000-0000-0000710000e1', 'phim-t71', 'Phim T71', 120, '2026-12-01', 'T13', 'PUBLISHED');
    insert into public.rooms (id, cinema_id, name, supported_formats, grid_rows, grid_cols) values
      ('00000000-0000-0000-0000-0000710000f1', '00000000-0000-0000-0000-0000710000c1', 'P1', '{2D}', 3, 3);
    insert into public.seats (id, room_id, cinema_id, row_label, col_number, seat_type, label) values
      ('00000000-0000-0000-0000-0000710000b1', '00000000-0000-0000-0000-0000710000f1', '00000000-0000-0000-0000-0000710000c1', 'A', 1, 'NORMAL', 'A1');
    insert into public.price_rules (scope, cinema_id, seat_type, format, day_type, time_band, amount)
      select 'CINEMA', '00000000-0000-0000-0000-0000710000c1', 'NORMAL', '2D', d::public.price_day_type, t::public.price_time_band, 100000
        from unnest(array['NORMAL','WEEKEND','HOLIDAY']) d, unnest(array['BEFORE_17','AFTER_17']) t;
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-0000-0000-0000710000d1', 't71c@example.com', '{}', now()),
      ('00000000-0000-0000-0000-0000710000d2', 't71d@example.com', '{}', now());
    update public.profiles set date_of_birth = '1995-05-15'
     where id in ('00000000-0000-0000-0000-0000710000d1', '00000000-0000-0000-0000-0000710000d2');
    insert into public.showtimes (id, cinema_id, room_id, movie_id, starts_at, format, status) values
      ('00000000-0000-0000-0000-000071000051', '00000000-0000-0000-0000-0000710000c1', '00000000-0000-0000-0000-0000710000f1',
       '00000000-0000-0000-0000-0000710000e1', now() + interval '5 days', '2D', 'ON_SALE');
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
      ('00000000-0000-0000-0000-000071000a01', 'WEB', '00000000-0000-0000-0000-000071000051', 'expired', 100000, 0, 100000, null, 't71a@example.com');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-000071000a61', '00000000-0000-0000-0000-000071000a01', '00000000-0000-0000-0000-0000710000b1', 'A1', 'NORMAL', 100000);
    insert into public.orders (id, channel, showtime_id, user_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at) values
      ('00000000-0000-0000-0000-000071000d01', 'WEB', '00000000-0000-0000-0000-000071000051', '00000000-0000-0000-0000-0000710000d2',
       'holding', 100000, 0, 100000, clock_timestamp() + interval '0.3 seconds');
    insert into public.order_seats (id, order_id, seat_id, seat_label, seat_type, price_amount) values
      ('00000000-0000-0000-0000-000071000d61', '00000000-0000-0000-0000-000071000d01', '00000000-0000-0000-0000-0000710000b1', 'A1', 'NORMAL', 100000);
    -- đơn E (cancelled, không liên quan): chỗ bám của payment mà phiên B chèn để chặn A (không dùng đơn A/D để B không khoá chéo)
    insert into public.orders (id, channel, showtime_id, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, contact_email) values
      ('00000000-0000-0000-0000-000071000e01', 'WEB', '00000000-0000-0000-0000-000071000051', 'cancelled', 100000, 0, 100000, null, 't71e@example.com');
    insert into public.showtime_seat_states (showtime_id, seat_id, state, source, expires_at, order_id) values
      ('00000000-0000-0000-0000-000071000051', '00000000-0000-0000-0000-0000710000b1', 'HELD', 'WEB',
       clock_timestamp() + interval '0.3 seconds', '00000000-0000-0000-0000-000071000d01');
  $s$;
$$;

create function public.t71_get(p_conn text) returns text language plpgsql as $$
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

create function public.t71_run() returns jsonb language plpgsql as $$
declare
  v_conn text := format('host=%s port=5432 dbname=%s user=postgres password=postgres',
                        coalesce(host(inet_server_addr()), '127.0.0.1'), current_database());
  v_a text; v_b text; v_c text; v_after jsonb;
begin
  perform extensions.dblink_connect('t71_setup', v_conn);
  perform extensions.dblink_exec('t71_setup', public.t71_cleanup_sql());
  perform extensions.dblink_exec('t71_setup', public.t71_setup_sql());
  perform extensions.dblink_connect('t71_a', v_conn);
  perform extensions.dblink_connect('t71_b', v_conn);
  perform extensions.dblink_connect('t71_c', v_conn);

  -- B: chèn (chưa commit) một payment trùng transaction_ref 'T71_TXN_1' rồi giữ 2.5s và rollback => confirm_paid của A dừng ở
  -- INSERT payments (unique transaction_ref) SAU khi sell_order_seats đã chiếm seat_state, TRƯỚC khi INSERT tickets (FK seat_id).
  -- Cách này không phụ thuộc thứ tự bắn trigger FK (theo tên RI_ConstraintTrigger_c_<oid>, đổi theo OID).
  perform extensions.dblink_send_query('t71_b', $q$do $b$ begin
      insert into public.payments (order_id, cinema_id, order_code, amount, status, transaction_ref)
      values ('00000000-0000-0000-0000-000071000e01', '00000000-0000-0000-0000-0000710000c1', 710001, 100000, 'PENDING', 'T71_TXN_1');
      perform pg_sleep(2.5);
      raise exception 'T71_B_RELEASE' using errcode = 'P0001';
    end $b$ $q$);
  perform pg_sleep(0.6);
  perform extensions.dblink_send_query('t71_a', $q$select '0'::text as r,
      public.confirm_paid('00000000-0000-0000-0000-000071000a01', 100000, 'T71_TXN_1', null)::text as s$q$);
  perform pg_sleep(0.6);
  perform extensions.dblink_send_query('t71_c', $q$select '0'::text as r, (select count(*) from public.hold_seats(
      '00000000-0000-0000-0000-000071000051'::uuid, array['00000000-0000-0000-0000-0000710000b1']::uuid[], 'WEB',
      '00000000-0000-0000-0000-0000710000d1'::uuid))::text as s$q$);
  v_a := public.t71_get('t71_a');
  v_c := public.t71_get('t71_c');
  v_b := public.t71_get('t71_b');

  select t.x::jsonb into v_after from extensions.dblink('t71_setup', $q$select jsonb_build_object(
      'order_a', (select status::text from public.orders where id = '00000000-0000-0000-0000-000071000a01'),
      'tickets', (select count(*) from public.tickets where cinema_id = '00000000-0000-0000-0000-0000710000c1'),
      'seat_rows', (select count(*) from public.showtime_seat_states
                     where showtime_id = '00000000-0000-0000-0000-000071000051'))::text$q$) as t(x text);

  perform extensions.dblink_exec('t71_setup', public.t71_cleanup_sql());
  perform extensions.dblink_disconnect('t71_a');
  perform extensions.dblink_disconnect('t71_b');
  perform extensions.dblink_disconnect('t71_c');
  perform extensions.dblink_disconnect('t71_setup');
  return jsonb_build_object('a', v_a, 'b', v_b, 'c', v_c, 'after', v_after);
exception when others then
  begin perform extensions.dblink_exec('t71_setup', public.t71_cleanup_sql()); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t71_a'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t71_b'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t71_c'); exception when others then null; end;
  begin perform extensions.dblink_disconnect('t71_setup'); exception when others then null; end;
  raise;
end;
$$;

create temp table t71_result as select public.t71_run() as j;

select diag((select j::text from t71_result));
-- Ý nghĩa của race: FK tickets.seat_id phải tồn tại (không có FK thì cũng không có chu trình để kiểm).
select ok(exists (select 1 from pg_constraint where conrelid = 'public.tickets'::regclass
                    and conname = 'tickets_seat_id_fkey' and contype = 'f'),
  'FK tickets_seat_id_fkey tồn tại (điều kiện để race có ý nghĩa)');
select ok((select j->>'a' not like '40P01%' from t71_result), 'confirm_paid (tiền về muộn): không deadlock 40P01');
select ok((select j->>'c' not like '40P01%' from t71_result), 'hold_seats cùng ghế: không deadlock 40P01');
select ok((select j->>'b' like 'P0001 T71_B_RELEASE%' from t71_result), 'phiên chặn B giữ payment trùng ref rồi rollback đúng kịch bản');
select ok((select (j->'after'->>'tickets')::int <= 1 from t71_result), 'tối đa 1 vé cho ghế tranh chấp');
select ok((select (j->'after'->>'seat_rows')::int = 1 from t71_result), 'ghế tranh chấp đúng 1 dòng seat_state');
select is((select count(*) from public.orders where cinema_id = '00000000-0000-0000-0000-0000710000c1'), 0::bigint,
  'dữ liệu race đã dọn');
select * from finish();
rollback;
