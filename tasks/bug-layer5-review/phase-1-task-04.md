# Bug layer5-review · phase-1-task-04 — Transactional Mail Templates & Payload Completion

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-B-payment-mail.md` (B/M5, B/M6)
- Root cause:
  1. **B/M5**: Payload `TICKET_ISSUED` do DB enqueue (`confirm_paid_hardening.sql:321-330` và `zero_amount_sell_hardening.sql:162-171`) chỉ có `order_id, booking_code, cinema_id, cinema_name, movie_title, room_name, showtime_starts_at, total_amount` — không có `qr_token`, `cinema_address`, `seats`. Worker chuyển nguyên payload vào template mà không query bổ sung, dẫn tới template không render được mã QR, địa chỉ rạp và danh sách ghế thực tế cho khách.
  2. **B/M6**: 3 loại email mới của `IdentityModule` (`password_set`, `oauth_missing_email_collision`, `oauth_missing_email_verify`) thiếu template riêng, rơi vào fallback dump `JSON.stringify(payload)` làm lộ `user_id` và token, đồng thời không có link xác thực thân thiện.
- Files to Create/Modify:
  - `apps/api/src/modules/mail/templates.ts`
  - `apps/api/src/modules/jobs/jobs.controller.ts`
  - `apps/api/test/outbox-job.e2e-spec.ts`
- Status: completed

## Repro Verification
- Original repro:
  1. Worker gửi email vé thật (`TICKET_ISSUED`) -> email nhận được không có khối QR (`qr_token` null), không có địa chỉ rạp, không có ghế.
  2. Gửi email xác thực khi tạo mật khẩu hoặc collision OAuth -> nhận email chứa chuỗi JSON thô `{"user_id":"...","token":"..."}`.
- Expected:
  - Worker hoặc mail service khi xử lý `TICKET_ISSUED` truy vấn bổ sung danh sách ghế `seats` (từ `order_seats`), `qr_token` (từ `tickets`) và `cinema_address` (từ `cinemas`) nếu payload chưa có.
  - Template hỗ trợ đầy đủ 3 loại email của `IdentityModule` với giao diện HTML chuẩn, nút bấm/link xác thực, không dump JSON thô.
- Actual before fix: Email vé thiếu QR/ghế/địa chỉ; email identity dump JSON thô.
- Actual after fix:
  1. Worker trong `JobsService.enrichTicketPayload` tự động truy vấn song song bổ sung `qr_token` từ `tickets` (kèm `.limit(1)` để tránh lỗi PostgREST `PGRST116` khi đơn có nhiều vé/ghế), `cinema_address` từ `cinemas`, và danh sách ghế `seats` từ `order_seats` khi payload thiếu; template `renderTicketEmail` render đầy đủ khối QR token, địa chỉ rạp và danh sách ghế.
  2. Bổ sung 3 template HTML đẹp, an toàn (`renderPasswordSetEmail`, `renderOAuthMissingEmailCollisionEmail`, `renderOAuthMissingEmailVerifyEmail`) với nút bấm/link xác thực, loại bỏ hoàn toàn fallback dump JSON thô, ném lỗi `UNKNOWN_KIND` và đánh `FAILED` ngay đối với kind không hỗ trợ.
- Evidence:
  - `pnpm --filter api test test/outbox-job.e2e-spec.ts`: 19/19 tests PASS (có test mô phỏng PGRST116 và test đơn 2 ghế/2 vé).
  - `pnpm --filter api typecheck`: PASS (0 lỗi trên các file sửa).
  - `pnpm --filter api lint`: PASS (0 errors, 0 warnings trên các file sửa).
- Status: PASS
