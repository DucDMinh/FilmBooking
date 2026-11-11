# Task 02: RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết hạn, đơn 0đ, xác nhận bán POS

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-75, R-76, R-77, R-78, R-82, R-85, R-86, R-125, R-128
- AC-xx: AC-10, AC-11

## Description
`record_payment_event(...)` insert payment_events (unique mã giao dịch ⇒ lần lặp no-op). `confirm_paid(order_id, amount, event_id)`: kiểm số tiền khớp; holding/pending_payment → paid, ghế SOLD, sinh ticket + qr_token + booking_code, enqueue email vé. Tiền về khi đơn expired/cancelled (#9/#10/#17): tự chốt chỉ khi suất chưa huỷ/đóng bán, chưa qua mốc đóng bán online và mọi ghế còn trống; ngược lại → needs_manual_review + enqueue email hướng dẫn khách. `mark_payment_cancelled` (huỷ/hết hạn PayOS → nhả ghế). `confirm_zero_amount` (đơn 0đ). `confirm_pos_sale(order, request_id)`: chỉ ghế đang được chính POS đó giữ hợp lệ (R-125/R-128).

## Dependencies
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)

## Acceptance Criteria
- [x] AC-10: gọi record_payment_event + confirm_paid 3 lần cùng mã → 1 payment, 1 ticket, 1 email trong outbox.
- [x] AC-11: đơn expired, ghế đã SOLD cho đơn khác, tiền về → needs_manual_review + 1 email khách; không sinh vé.
- [x] Tiền về cho đơn expired nhưng ghế còn trống & trước mốc đóng bán → paid tự động.
- [x] Số tiền lệch → không xác nhận, đơn giữ nguyên, ghi cờ mismatch cho báo cáo đối soát.
- [x] confirm_pos_sale với hold đã hết hạn/của nguồn khác → lỗi, không SOLD.

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111040100_rpc_payment.sql`
- `supabase/tests/041_payment_rpc.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod. Bất biến #3 (thanh toán đúng một lần) — reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
