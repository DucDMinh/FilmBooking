# Task 02: Job đối soát PayOS 5' + lịch pg_cron/pg_net gọi Nest /jobs

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: R-78, R-80
- AC-xx: AC-11

## Description
`POST /jobs/reconcile`: truy vấn PayOS các đơn pending_payment quá hạn/không có webhook → đi lại đường confirm_paid / tiền về muộn / huỷ. Migration: pg_cron mỗi phút gọi `/jobs/send-emails`, mỗi 5' gọi `/jobs/reconcile` bằng pg_net, **URL + secret đọc từ Supabase Vault** (không hardcode), timeout đủ dài cho Render cold start.

## Dependencies
- layer-5-task-02 (API thanh toán PayOS: tạo link, webhook (checksum, idempotent, đối chi)
- layer-5-task-03 (Mail (Resend) + worker email_outbox (retry) + job endpoint gửi email)

## Acceptance Criteria
- [ ] Đơn pending có giao dịch PAID trên PayOS (mock) mà webhook lỡ → sau reconcile thành paid, đúng 1 vé.
- [ ] Đơn pending đã CANCELLED trên PayOS → nhả ghế.
- [ ] Migration không chứa URL/secret literal; thiếu vault secret → job log lỗi, không crash.
- [ ] Test local gọi trực tiếp `/jobs/*` (không phụ thuộc pg_net).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/jobs/reconcile.service.ts`
- `apps/api/src/modules/jobs/jobs.controller.ts`
- `apps/api/src/modules/jobs/jobs.module.ts`
- `supabase/migrations/20261111060000_cron_http_jobs.sql`
- `apps/api/test/reconcile.e2e-spec.ts`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
