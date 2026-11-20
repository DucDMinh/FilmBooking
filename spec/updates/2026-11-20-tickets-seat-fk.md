# Spec Update — 2026-11-20 tickets-seat-fk
**spec_version:** 3.5.2 → 3.5.2 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · CR-002 · `tasks/bug-tickets-seat-fk/phase-1-task-01.md` (review STRICT PASS) · workItem `bug/tickets-seat-fk`

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Không đổi requirement; toàn vẹn dữ liệu, đóng CR-002 hoãn từ `bug-layer34-review` phase-2-task-03 (deadlock 40P01 giữa thanh toán xác nhận và giữ ghế, và thiếu FK `tickets.seat_id`). Liên quan **R-62** (giữ ghế nguyên tử, hai yêu cầu đồng thời), **R-76** (thanh toán thành công sinh vé), **R-78** (tiền về muộn chốt bán), **R-82** (đơn 0đ), **NFR-04**.
- HIGH_RISK_MIGRATION có rollback (xem dưới).

## Lỗi đã sửa
1. Deadlock: `sell_order_seats` (gọi từ `confirm_paid_order` / `confirm_zero_amount`) khoá `showtime_seat_states` trước, rồi INSERT `tickets` mới lấy KEY SHARE trên `seats` (qua kiểm tra FK) — ngược chiều `hold_seats` (khoá `seats` → `showtime_seat_states`) ⇒ 40P01 khi thanh toán đồng thời với giữ ghế cùng suất.
2. Sửa: migration `supabase/migrations/20261121100000_sell_order_seats_lock_seats_first.sql` — `sell_order_seats` khoá `seats ... order by id for key share` ở đầu hàm. Thứ tự khoá chuẩn nay là showtimes → orders → payments → seats → showtime_seat_states → tickets, cùng chiều với `hold_seats`.
3. Toàn vẹn: migration `supabase/migrations/20261121100100_tickets_seat_fk.sql` thêm FK `tickets.seat_id → seats(id) ON DELETE RESTRICT` (HIGH_RISK_MIGRATION: precheck vé mồ côi, `lock_timeout`, `NOT VALID` rồi `VALIDATE`, thêm index `tickets_seat_id_idx`; không destructive, không đổi dữ liệu). Ghế còn vé không xoá được.
4. Rollback: bỏ FK (`alter table tickets drop constraint`) + bỏ index `tickets_seat_id_idx`; khôi phục định nghĩa `sell_order_seats` của migration trước (bỏ dòng khoá `seats` đầu hàm).
5. Test: pgTAP 071 (`dblink` `confirm_paid` × `hold_seats`: không 40P01, tối đa 1 vé), pgTAP 072 (FK tồn tại, chặn xoá ghế còn vé). `docs/ERD.md` cập nhật FK + thứ tự khoá.

## Ảnh hưởng
- Module: supabase (RPC `sell_order_seats`, `confirm_paid_order`, `confirm_zero_amount`, bảng `tickets`). Không đổi API, DTO, web.
- Test: thanh toán xác nhận (`confirm_paid`) và `confirm_zero_amount` vẫn bán đúng vé; không deadlock khi đồng thời với giữ ghế; xoá ghế còn vé bị chặn (FK RESTRICT).
- Hồi quy: giữ ghế / hết hạn giữ, huỷ đơn, huỷ suất, soát vé, đặt vé end-to-end, thanh toán đồng thời.
- Residual: HIGH_RISK_MIGRATION đã áp trên DB local; test race 071 đồng bộ bằng sleep nên không đỏ ổn định 100% khi hoàn nguyên; pgTAP 040/041/043 chưa chạy lại được trên DB local bẩn (seed demo, có từ trước).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 32, specVersion 3.5.2.
