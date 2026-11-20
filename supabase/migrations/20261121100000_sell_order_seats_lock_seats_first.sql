-- ============================================================================
-- Migration: 20261121100000_sell_order_seats_lock_seats_first.sql
-- bug tickets-seat-fk phase-1 task-01 (CR-002), bước 1/2: sửa THỨ TỰ KHOÁ trước khi thêm FK tickets.seat_id -> seats(id).
--
-- Vấn đề (reviewer round 3, bug-layer34-review phase-2 task-03, deadlock 40P01 đã tái hiện):
--   hold_seats khoá seats FOR UPDATE (§3.9) rồi mới đụng showtime_seat_states (§3.14 DELETE hold hết hạn).
--   sell_order_seats (gọi từ confirm_paid / confirm_zero_amount; confirm_pos_sale đã bị DROP ở 20261112130000) khoá showtime_seat_states TRƯỚC,
--   rồi INSERT tickets -> kiểm tra FK tickets.seat_id lấy KEY SHARE trên seats SAU => ngược chiều hold_seats => chu trình.
--
-- Sửa: sell_order_seats khoá seats ... ORDER BY id FOR KEY SHARE ở ĐẦU hàm (ngoài subtransaction), TRƯỚC khi đụng
--   showtime_seat_states. Mọi caller đều đi qua sell_order_seats trước khi INSERT tickets nên thứ tự chuẩn toàn cục là:
--     orders -> payments -> seats (id tăng dần) -> showtime_seat_states (showtime_id, seat_id tăng dần) -> tickets.
--   KEY SHARE là chính khoá FK sẽ lấy sau này => khi INSERT tickets không phát sinh khoá mới trên seats.
--   (KEY SHARE xung đột với FOR UPDATE của hold_seats / DELETE seats; không xung đột với KEY SHARE của phiên khác
--   và với FOR NO KEY UPDATE, nên các lần bán đồng thời khác ghế/cùng ghế không chặn nhau ở bước này.)
--
-- Không đổi: chữ ký, kiểu trả về, SECURITY DEFINER, search_path = '', ACL (revoke all), hành vi nghiệp vụ.
-- Migration này KHÔNG đụng dữ liệu, không đổi schema (chỉ create or replace hàm).
-- Rollback: chạy lại thân hàm ở 20261112060000_prevent_double_sell.sql §2 (create or replace, bỏ khối khoá seats).
-- ============================================================================
create or replace function public.sell_order_seats(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_seat_cnt  integer;
  v_done_cnt  integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  select count(*) into v_seat_cnt from public.order_seats where order_id = p_order_id;
  if v_seat_cnt = 0 then
    return true;
  end if;

  -- Thứ tự khoá chuẩn (khớp hold_seats §3.9): seats TRƯỚC showtime_seat_states, theo id tăng dần. Khoá KEY SHARE ở đây
  -- (ngoài subtransaction bên dưới nên không bị nhả khi rollback savepoint) cũng là khoá mà FK tickets.seat_id sẽ cần.
  perform 1
     from public.seats s
    where s.id in (select seat_id from public.order_seats where order_id = p_order_id)
    order by s.id
      for key share;

  -- Khoá dòng ghế sẵn có theo thứ tự seat_id (thứ tự cố định giữa các phiên => không deadlock chéo).
  perform 1
     from public.showtime_seat_states sss
    where sss.showtime_id = v_order.showtime_id
      and sss.seat_id in (select seat_id from public.order_seats where order_id = p_order_id)
    order by sss.seat_id
      for update;

  begin
    -- Ghế chưa có dòng: insert; phiên khác insert trước thì chờ unique index rồi rơi vào DO UPDATE có WHERE.
    insert into public.showtime_seat_states as sss (
      showtime_id, seat_id, room_id, cinema_id, state, source, expires_at, order_id
    )
    select v_order.showtime_id, os.seat_id, s.room_id, v_order.cinema_id,
           'SOLD'::public.seat_state, v_order.channel, null, v_order.id
      from public.order_seats os
      join public.showtimes s on s.id = v_order.showtime_id
     where os.order_id = v_order.id
     order by os.seat_id
    on conflict (showtime_id, seat_id) do update set
      state = 'SOLD',
      expires_at = null,
      order_id = v_order.id
    where sss.order_id = v_order.id
       or (sss.state = 'HELD' and sss.expires_at <= now());
    get diagnostics v_done_cnt = row_count;

    if v_done_cnt <> v_seat_cnt then
      raise exception 'SEATS_TAKEN' using errcode = 'P0001';
    end if;
  exception
    -- P0001: có ghế thuộc đơn khác; 23514: ghế đang bị khoá vận hành (trigger fill). Subtransaction đã rollback.
    when sqlstate 'P0001' or sqlstate '23514' then
      return false;
  end;
  return true;
end;
$$;
revoke all on function public.sell_order_seats(uuid) from public, anon, authenticated, service_role;
