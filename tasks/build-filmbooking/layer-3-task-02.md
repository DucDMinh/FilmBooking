# Task 02: Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn ảnh hưởng, check-in log + RLS + Realtime

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-54, R-59, R-60, R-62, R-81, R-83, R-85, R-102, R-103
- AC-xx: AC-16, AC-17

## Description
orders (channel WEB/POS, cinema_id, showtime_id, user_id, trạng thái §8.5: holding/pending_payment/paid/expired/cancelled/affected/needs_manual_review/refunded_manual, tổng tiền chốt, booking_code `<MÃRẠP>-XXXXXX` unique, consent_at, age_confirmed), order_seats (giá chốt từng ghế), **showtime_seat_states** (showtime_id, seat_id, state HELD/SOLD, source WEB/POS, expires_at, order_id) **UNIQUE (showtime_id, seat_id)**, tickets (qr_token ngẫu nhiên 128-bit, không PII), payments (order_code PayOS, amount, cinema_id, trạng thái), payment_events (UNIQUE mã giao dịch), vouchers + voucher_redemptions, affected_order_actions, checkin_logs. Trigger R-54: chặn sửa giờ/phòng/xoá suất đã có ghế SOLD. Realtime an toàn: bảng public `seat_status_public` (showtime_id, seat_id, state, expires_at — không user_id/order_id) do trigger từ showtime_seat_states duy trì, đưa vào publication `supabase_realtime`, RLS cho anon SELECT (postgres_changes tôn trọng RLS; publication không chứa được view). Phương án thay thế chấp nhận được: Realtime broadcast từ trigger DB trên kênh `showtime:<id>`.

## Dependencies
- layer-2-task-01 (Migration catalog: phim, phòng, sơ đồ ghế, suất chiếu (chống chồng giờ)

## Acceptance Criteria
- [ ] UNIQUE(showtime_id, seat_id) tồn tại; insert trùng ghế cùng suất lỗi (NFR-04).
- [ ] pgTAP AC-17: khách A không SELECT được orders/tickets/payments của khách B.
- [ ] pgTAP AC-16: Manager/Staff HN01 không SELECT được orders/payments HN02.
- [ ] `seat_status_public` có trong publication `supabase_realtime`, anon SELECT được, **không có cột user_id/order_id** (NFR-05); insert/delete ở showtime_seat_states phản ánh sang bảng này trong cùng transaction.
- [ ] Sửa starts_at của suất có ghế SOLD → lỗi (R-54); không có cột số thẻ/tài khoản ngân hàng (R-81).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111030100_booking_tables.sql`
- `supabase/tests/031_booking_rls.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
