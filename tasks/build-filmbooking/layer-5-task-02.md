# Task 02: API thanh toán PayOS: tạo link, webhook (checksum, idempotent, đối chiếu tiền), polling, huỷ, đơn 0đ

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-73, R-74, R-75, R-76, R-77, R-78, R-79, R-81, R-82, R-83, R-84
- AC-xx: AC-09, AC-10, AC-11

## Description
`POST /bookings/:id/payment` (cần consent): tạo payment link PayOS từ server, hạn = thời gian giữ còn lại, mô tả có mã rạp + mã đặt vé, orderCode lưu payments (cinema_id); đơn → pending_payment; tạo đơn mới khi đơn cũ pending → cancel link cũ (#10). Tổng 0đ → confirm_zero_amount không gọi PayOS. `POST /payos/webhook` (@Public): verify checksum HMAC; sai → bỏ qua + log WARN (Sentry sau); đúng → record_payment_event + confirm_paid (service role). `GET /bookings/:id/payment-status` cho màn 'Đang xác nhận' (polling, KHÔNG xác nhận dựa vào returnUrl). `POST /bookings/:id/payment/cancel` (cancelUrl). Khoá PayOS chỉ ở env server; PayOS demo theo env (R-84).

## Dependencies
- layer-4-task-02 (RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết h)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-09: webhook chữ ký sai → 200/400 theo chuẩn PayOS, đơn không đổi, log cảnh báo có orderCode.
- [ ] AC-10: cùng webhook hợp lệ 3 lần → 1 lần paid, 1 email vé (kiểm outbox).
- [ ] AC-11: webhook cho đơn expired + ghế đã bán → needs_manual_review.
- [ ] returnUrl không đổi trạng thái đơn; chỉ webhook/truy vấn PayOS từ server mới xác nhận (R-74).
- [ ] Không lưu/log dữ liệu thẻ/tài khoản (R-81); PayOS client mock trong test.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/payment/payment.module.ts`
- `apps/api/src/modules/payment/payos.client.ts`
- `apps/api/src/modules/payment/payment.controller.ts`
- `apps/api/src/modules/payment/webhook.controller.ts`
- `apps/api/src/modules/payment/payment.service.ts`
- `packages/shared/src/schemas/payment.ts`
- `apps/api/test/webhook.e2e-spec.ts`

## Notes
Bất biến #3 — reviewer STRICT. Đối soát 5' ở layer-6-task-02.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
