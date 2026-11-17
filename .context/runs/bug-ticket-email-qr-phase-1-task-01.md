# Run Journal — bug/ticket-email-qr · phase-1-task-01

```yaml
workItem: bug/ticket-email-qr
phaseTask: phase-1-task-01
step: done
agent: null
status: done
attempt: 1
interrupted: false
updatedAt: 2026-11-17T22:30:00+07:00
filesTouched:
  - apps/api/src/modules/jobs/jobs.controller.ts
  - apps/api/test/outbox-job.e2e-spec.ts
  - apps/api/src/modules/mail/templates.ts
  - apps/api/src/modules/mail/mail.service.ts
  - apps/api/test/mail-templates.spec.ts
  - apps/api/package.json   # CHỈ hunk dependency; hunk `start` là của USER
  - pnpm-lock.yaml
  - .context/decisions.md
  # USER dirty, KHÔNG thuộc task, KHÔNG stage: .claude/settings.json, .gitignore, CLAUDE.md, apps/api/package.json (hunk start; task chỉ thêm dependency), supabase/config.toml (Gmail cá nhân)
filesNew:
  - apps/api/test/mail-ticket-qr.spec.ts
  - .context/runs/bug-ticket-email-qr-phase-1-task-01.builder.md
  - tasks/bug-ticket-email-qr/phase-1-task-01.md
evidence:
  reportPath: .context/review-reports/bug-ticket-email-qr-phase-1-task-01-round-2-review.md
  round: 2
  verdict: PASS   # round 2 NORMAL PASS; round 1 FAIL (HIGH: mỗi ghế 1 vé, email chỉ 1 QR) đã sửa; report round 1: ...-round-1-review.md
next: "done — commit staging (không push). USER: build lại + restart API (pnpm --filter @filmbooking/api build) để mail vé có QR; gap R-86 link bản đồ cần change riêng."
loopSignal: none
approvals:
  - gate: phase_plan
    at: 2026-11-17T20:50:00+07:00
    ok: true   # user báo lỗi trực tiếp; plan tự duyệt theo memory autonomy
batchQueue: []
```

## Notes
- Classify BUG; spec R-86 đã yêu cầu QR => không bump spec_version. R-86 còn "link bản đồ" chưa có trong template: ngoài phạm vi, ghi residual.
- Cách nhúng: CID inline (Gmail chặn data: URI, localhost không có URL công khai). QR value = nguyên qr_token (khớp ticket-qr.tsx + qr-scanner.tsx), level M.
- apps/api/package.json có hunk `start` của USER: stage riêng hunk dependency khi commit.

## History
- 2026-11-17T20:50:00+07:00 journal created; ▶ START [agent: builder] phase-1-task-01 (cancel sẽ redo bước này)
- 2026-11-17T21:10:00+07:00 ✅ DONE [agent: builder] email vé có ảnh QR CID inline (qrcode, level M, width 440); api 589 PASS, web 594, lint/tsc sạch; giải mã PNG == qr_token (3 token mẫu 32 hex). Primary đối chiếu git status khớp, dòng start của USER còn nguyên, xem ảnh QR mẫu. ▶ START [agent: reviewer] NORMAL round 1 (cancel sẽ redo bước này)
- 2026-11-17T21:40:00+07:00 ✅ DONE [agent: reviewer] round 1 NORMAL FAIL (attempt 1): email đơn N ghế chỉ có QR của 1 vé (enrich limit(1)). Primary xác nhận trong code + DB local (đơn 4 vé). ▶ START [agent: builder] fix round 1 (cancel sẽ redo bước này)
- 2026-11-17T22:10:00+07:00 ✅ DONE [agent: builder] fix round 1: mỗi ghế một QR (jobs.controller enrich mọi vé + sort tự nhiên, N PNG cid ticket-qr-n, trần 10), api 599/web 594/shared 31 PASS, lint/tsc sạch, giải mã N QR đúng token. Primary verify PostgREST thật: embed order_seats(seat_label) trả dict, đơn seed 8 vé thứ tự DB lộn xộn. ▶ START [agent: reviewer] round 2 (cancel sẽ redo bước này)
- 2026-11-17T22:30:00+07:00 ✅ DONE [agent: reviewer] round 2 NORMAL PASS (LOW: primary đã thêm warn khi enrich trả error, api 599 PASS). Primary verify đầu-cuối: 8 vé thật -> 8 PNG giải mã == token DB. Repro Verification PASS. ▶ START [agent: spec-publisher] scope bug-fix (cancel sẽ redo bước này)
- 2026-11-17T22:45:00+07:00 ✅ DONE [agent: spec-publisher] scope v24 (không bump spec_version). progress.json cập nhật, commit.
