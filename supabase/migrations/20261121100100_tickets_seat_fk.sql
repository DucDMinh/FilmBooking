-- ============================================================================
-- Migration: 20261121100100_tickets_seat_fk.sql
-- bug tickets-seat-fk phase-1 task-01 (CR-002), bước 2/2: FK tickets.seat_id -> seats(id) ON DELETE RESTRICT.
-- PHẢI áp SAU 20261121100000 (sell_order_seats đã khoá seats trước seat_states). Nếu thêm FK khi chưa đổi thứ tự khoá,
-- confirm_paid x hold_seats cùng ghế deadlock 40P01 (xem tests/071_tickets_seat_fk_lock_order.test.sql).
--
-- HIGH_RISK_MIGRATION: CÓ (thêm ràng buộc FK trên bảng dữ liệu thật tickets).
--   Bảng/cột : public.tickets.seat_id (uuid not null, điền bởi trigger tickets_fill_seat từ order_seats) -> public.seats(id).
--   Không destructive: không xoá/sửa dòng nào; chỉ thêm ràng buộc. Tác động: sau migration KHÔNG xoá được ghế còn vé
--   (RESTRICT; trước đó đã gián tiếp bị chặn bởi order_seats.seat_id RESTRICT, nên không đổi hành vi thực tế).
--   Dữ liệu: precheck đếm vé mồ côi (seat_id không còn trong seats); có => RAISE nêu số dòng, KHÔNG tự xoá/sửa.
--   Khoá: lock_timeout 5s (fail nhanh thay vì treo mọi truy vấn phía sau). ADD ... NOT VALID, VALIDATE CONSTRAINT và CREATE INDEX
--   chạy cùng một transaction (để `set local lock_timeout` có hiệu lực) nên khoá SHARE ROW EXCLUSIVE của ADD được giữ đến hết VALIDATE/CREATE INDEX
--   và CHẶN INSERT tickets trong lúc quét. NOT VALID không giảm khoá ở đây; bảng cỡ demo nên tác động không đáng kể. Bảng lớn: tách VALIDATE sang migration sau.
--   Áp ngoài giờ cao điểm; nếu timeout thì chạy lại.
--   Verify: select convalidated from pg_constraint where conname = 'tickets_seat_id_fkey' (phải true);
--           pgTAP tests/071_tickets_seat_fk_lock_order.test.sql.
--   Rollback: alter table public.tickets drop constraint tickets_seat_id_fkey;
--             (+ tuỳ chọn trả sell_order_seats về bản 20261112060000 §2; giữ bản mới cũng an toàn vì chỉ thêm khoá seats).
-- ============================================================================
set local lock_timeout = '5s';

do $$
declare
  v_orphans bigint;
begin
  select count(*) into v_orphans
    from public.tickets t
   where not exists (select 1 from public.seats s where s.id = t.seat_id);
  if v_orphans > 0 then
    raise exception 'tickets-seat-fk migration dừng: % vé có seat_id không tồn tại trong seats; xử lý thủ công (không tự xoá) trước khi áp migration', v_orphans
      using errcode = '23503';
  end if;
end;
$$;

alter table public.tickets
  add constraint tickets_seat_id_fkey
  foreign key (seat_id) references public.seats (id) on delete restrict
  not valid;

alter table public.tickets validate constraint tickets_seat_id_fkey;

-- Index hỗ trợ FK: ON DELETE RESTRICT trên seats phải tra tickets theo seat_id (unique (showtime_id, seat_id) không dẫn đầu bằng seat_id).
create index if not exists tickets_seat_id_idx on public.tickets (seat_id);
