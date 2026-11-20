---
id: tickets-seat-fk
type: bug
status: done
created: 2026-11-12
---

# FK tickets.seat_id -> seats(id) (hoãn từ bug-layer34-review phase-2-task-03)

## Yêu cầu
Thêm FK `tickets.seat_id -> seats(id) ON DELETE RESTRICT` (scan Defect #2). Đã thử ở task-03 và phải gỡ: kiểm tra FK khi INSERT tickets lấy KEY SHARE trên `seats` SAU khi `sell_order_seats` đã khoá `showtime_seat_states`, ngược chiều `hold_seats` (seats FOR UPDATE -> seat_states) => deadlock 40P01 trên `confirm_paid` (F11, reviewer round 3 đã tái hiện).

## Bối cảnh / tái hiện (bug)
- Repro: `.context/review-reports/repro-p2t03-round3-confirm-paid-deadlock.test.sql`
- Report: `.context/review-reports/bug-layer34-review-phase-2-task-03-round-3-review.md`

## Acceptance (bắt buộc)
- [x] `sell_order_seats` khoá `seats ... order by id for key share` ở đầu hàm (trước seat_states, ngoài subtransaction) — phủ mọi caller.
- [x] Test race dblink `confirm_paid` × `hold_seats`: không 40P01, tối đa 1 vé.
- [x] Sau đó mới thêm FK (precheck vé mồ côi, lock_timeout), HIGH_RISK_MIGRATION.

## Ghi chú
Không chặn MVP: `order_seats.seat_id` đã có FK RESTRICT nên ghế có vé không xoá được.
