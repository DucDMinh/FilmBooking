# Task 01: Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admin, orders, report, cancellation

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Import 9 module layer 5 vào AppModule; mở rộng smoke e2e; regen types nếu có thay đổi.

## Dependencies
- layer-5-task-01 (API booking: sơ đồ ghế, giữ/nhả ghế, đơn, tóm tắt, đồng ý điều khoản, )
- layer-5-task-02 (API thanh toán PayOS: tạo link, webhook (checksum, idempotent, đối chi)
- layer-5-task-03 (Mail (Resend) + worker email_outbox (retry) + job endpoint gửi email)
- layer-5-task-04 (API soát vé: quét QR/nhập mã theo rạp làm việc)
- layer-5-task-05 (API POS `/pos/v1/*` (khoá API theo rạp, idempotent, log + rate limit) )
- layer-5-task-06 (API quản trị: người dùng & vai trò, gán rạp, cấu hình chuỗi, khoá API )
- layer-5-task-07 (API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo M)
- layer-5-task-08 (API huỷ suất / đóng rạp / đơn bị ảnh hưởng (+ CSV, gửi lại email))
- layer-5-task-09 (Wiring API #3: đăng ký identity + pricing, sinh lại types)

## Acceptance Criteria
- [ ] App khởi động; smoke: `GET /showtimes/:id/seatmap` 200, `POST /payos/webhook` thiếu chữ ký → bị từ chối, `/pos/v1/showtimes` không key → 401, `/jobs/send-emails` không secret → 401.
- [ ] `pnpm -w lint|typecheck|test|build` PASS.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/app.module.ts`
- `packages/shared/src/database.types.ts`
- `apps/api/test/app.e2e-spec.ts`

## Notes
Task wiring.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
