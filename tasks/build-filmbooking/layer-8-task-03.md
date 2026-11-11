# Task 03: Test webhook PayOS: chữ ký, idempotent, tiền về muộn, đối soát

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-74, R-75, R-78, R-80
- AC-xx: AC-09, AC-10, AC-11

## Description
Integration với PayOS mock + chữ ký HMAC thật: sai chữ ký, lặp webhook 3 lần song song, tiền về cho đơn expired (ghế còn trống → paid; ghế đã bán → needs_manual_review), lệch tiền, webhook lỡ được reconcile bù.

## Dependencies
- layer-6-task-07 (Harness integration test API ↔ Supabase local (helpers tạo user/role/r)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-6-task-02 (Job đối soát PayOS 5' + lịch pg_cron/pg_net gọi Nest /jobs)

## Acceptance Criteria
- [ ] AC-09: chữ ký sai → đơn không đổi + log cảnh báo.
- [ ] AC-10: 3 webhook song song → 1 payment, 1 vé, 1 email.
- [ ] AC-11: tiền về muộn khi ghế đã bán → needs_manual_review + email khách + hiện cho Admin/Manager.
- [ ] Webhook lỡ → `/jobs/reconcile` đưa đơn về paid đúng 1 lần.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/test/integration/payos-webhook.int-spec.ts`

## Notes
NFR-17. Reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
