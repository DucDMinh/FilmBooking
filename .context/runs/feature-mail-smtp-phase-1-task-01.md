# Run Journal — feature/mail-smtp · phase-1-task-01

```yaml
workItem: feature/mail-smtp
phaseTask: phase-1-task-01
step: done
agent: null
status: done
attempt: 0
interrupted: false
updatedAt: 2026-11-17T15:10:00+07:00
filesTouched:
  # USER dirty, KHÔNG thuộc task, KHÔNG stage: supabase/config.toml (enabled=true) + hunk `start` trong apps/api/package.json
  - .context/decisions.md
  - .env.example
  - README.md
  - apps/api/package.json            # chỉ hunk dependency (nodemailer, @types/nodemailer, gỡ resend)
  - apps/api/src/config/env.ts
  - apps/api/src/modules/jobs/jobs.controller.ts
  - apps/api/src/modules/mail/mail.module.ts
  - apps/api/src/modules/mail/mail.service.ts
  - apps/api/test/integration/cancel-showtime.int-spec.ts
  - apps/api/test/integration/helpers/app-harness.ts
  - apps/api/test/outbox-job.e2e-spec.ts
  - docs/API_SPEC.md
  - docs/DESIGN.md
  - docs/changes/TECHNICAL_REQUIREMENT_GAPS.md
  - docs/dev-setup.md
  - pnpm-lock.yaml
filesNew:
  - apps/api/src/modules/mail/mail.transport.ts
  - apps/api/test/mail-service.spec.ts
  - .context/runs/feature-mail-smtp-phase-1-task-01.builder.md
  - tasks/feature-mail-smtp/phase-1-task-01.md
  - tasks/bug-register-email/scan.md   # scan của /bug-check, commit kèm vì task tham chiếu
evidence:
  reportPath: .context/review-reports/feature-mail-smtp-phase-1-task-01-round-1-review.md
  round: 1
  verdict: PASS   # STRICT PASS, 0 CRITICAL/HIGH/MAJOR, 4 LOW + 2 INFO
next: "done — đã commit staging (không push). USER cần: điền SMTP_* vào .env.local + restart API (pnpm --filter @filmbooking/api build && start) và gọi tay POST /jobs/send-emails; đổi [auth.email.smtp] sang Gmail (config.toml của USER, chưa commit). Còn mở ngoài task: scan bug-register-email #1–#3, #5–#12; CI còn RESEND_API_KEY placeholder."
loopSignal: none
approvals:
  - gate: phase_plan
    at: 2026-11-17T14:12:00+07:00
    ok: true   # user: "làm đi, chuyển MailService sang SMTP"
batchQueue: []
```

## Notes / WIP reasoning

- Classify MODIFY (đổi nhà cung cấp mail), requirement KHÔNG đổi: SPEC §Tech Stack/NFR-10 ghi "SMTP riêng (vd Resend/SES)". → không bump `spec_version`, Spec Publisher chỉ sinh `spec/test-scope/current.json` (trigger feature-update, scope v21).
- Quyết định: một transport SMTP (nodemailer) thay Resend SDK, gỡ dependency `resend`. Resend vẫn dùng được qua `smtp.resend.com`.
- `supabase/config.toml`: USER đã tự sửa `enabled = true` (dirty, host Resend) → KHÔNG đụng, KHÔNG stage; chỉ ghi hướng dẫn đổi sang Gmail trong docs. Chỉ trường `pass` hỗ trợ `env()` trong Supabase CLI config.
- Close-out: `apps/api/package.json` có 2 loại thay đổi (hunk `start` của USER + dependency của task) → chỉ stage hunk của task bằng `git apply --cached`.
- Không đọc/ghi `.env.local`.

- 2026-11-17 (primary, evidence độc lập, không mock): dựng SMTP server giả `127.0.0.1:2525` (script trong scratchpad), chạy `createMailTransport({SMTP_HOST,SMTP_PORT:2525})` THẬT qua Node 22 `--experimental-strip-types` → `sendMail` thành công: server nhận `EHLO | MAIL FROM | RCPT TO | DATA`, `response: 250 2.0.0 queued`, header From/To đúng, Subject tiếng Việt mã hoá UTF-8 đúng, `rejected: []`; `createMailTransport({})` = `null`. Đường lỗi: cổng không có server → `ESOCKET ECONNREFUSED` sau 11 ms (outbox sẽ bắt và retry). Chưa gửi mail thật qua Gmail (cần App Password của USER).

- 2026-11-17 reviewer round 1 = STRICT PASS. Primary đã sửa F1 (dev-setup: câu "chỉ `pass` hỗ trợ env()" sai — config.toml dùng env() cho cả client_id/secret; câu này do primary đưa vào task), F2 (README "email Resend"), F3 (`.context/project-config.md` required: RESEND_API_KEY → SMTP_*). F4 (`.github/workflows/{ci,e2e}.yml` còn `RESEND_API_KEY: ci-placeholder`, vô hại) để nguyên, ngoài phạm vi. F5/F6 INFO chấp nhận (demo).

## History

- 2026-11-17T15:30:00+07:00 ✅ DONE [agent: reviewer] round 1 STRICT PASS; ✅ DONE [agent: spec-publisher] scope v21 (không bump spec_version); progress.json features[] cập nhật; commit.
- 2026-11-17T14:15:00+07:00 journal created; ▶ START [agent: builder] phase-1-task-01 (cancel sẽ redo bước này)
- 2026-11-17T14:45:00+07:00 ✅ DONE [agent: builder] — typecheck/lint PASS; test shared 31, api 496, web 570 PASS; primary đã đối chiếu git status/diff khớp báo cáo (dòng `start` + `supabase/config.toml` của USER còn nguyên). ▶ START [agent: reviewer] round 1 (cancel sẽ redo bước này)
