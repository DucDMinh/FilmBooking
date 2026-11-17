# builder summary - feature-mail-smtp phase-1-task-01
- MailService chuyển Resend -> SMTP (nodemailer): MAIL_TRANSPORT + createMailTransport (mail.transport.ts), env SMTP_*, gỡ resend.
- Test mới apps/api/test/mail-service.spec.ts (đỏ -> xanh); cập nhật outbox-job.e2e-spec, app-harness, cancel-showtime.int-spec (chỉ chữ).
- Docs: .env.example, README, dev-setup (mục Gửi mail thật), DESIGN, API_SPEC, gaps, decisions.md.
- Verify: typecheck, lint, test PASS (shared 31, api 496, web 570). Chờ reviewer.
