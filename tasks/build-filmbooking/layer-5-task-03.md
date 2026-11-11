# Task 03: Mail (Resend) + worker email_outbox (retry) + job endpoint gửi email

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-11, R-24, R-78, R-86, R-109
- AC-xx: —

## Description
MailService gửi qua Resend; template tiếng Việt: vé (mã đặt vé + QR + rạp/địa chỉ + nhắc 'chỉ dùng tại rạp ghi trên vé', 'không huỷ/không hoàn' — lớp cảnh báo email R-133), cảnh báo khoá đăng nhập, thông báo liên kết MXH, tiền về muộn cần liên hệ rạp, huỷ suất (hướng dẫn đổi suất/hoàn tiền). `POST /jobs/send-emails` (JobSecretGuard): lấy batch PENDING (FOR UPDATE SKIP LOCKED qua RPC/service role), gửi, cập nhật SENT/FAILED, retry backoff, max attempts.

## Dependencies
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] Job không có `x-job-secret` đúng → 401.
- [ ] Outbox 3 email PENDING → gọi job → 3 SENT (Resend mock); lỗi gửi → FAILED sau max attempts, có last_error.
- [ ] Gọi job 2 lần song song không gửi trùng (SKIP LOCKED).
- [ ] Template vé không chứa dữ liệu nhạy cảm ngoài cần thiết; QR là qr_token.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/mail/mail.module.ts`
- `apps/api/src/modules/mail/mail.service.ts`
- `apps/api/src/modules/mail/templates.ts`
- `apps/api/src/modules/jobs/jobs.module.ts`
- `apps/api/src/modules/jobs/jobs.controller.ts`
- `apps/api/test/outbox-job.e2e-spec.ts`

## Notes
jobs.module.ts: layer-6-task-02 thêm reconcile.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
