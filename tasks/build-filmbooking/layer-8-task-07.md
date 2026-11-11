# Task 07: Tài liệu as-built: API_SPEC, ERD, DESIGN current-state, README chạy dự án

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Reconcile tài liệu as-built theo code: liệt kê endpoint REST (method, path, guard, mã lỗi), POS API v1, webhook, jobs; ERD bảng/quan hệ/RLS/RPC chính; DESIGN current-state (kiến trúc Next+Nest+Supabase, luồng giữ ghế/thanh toán/huỷ suất); README: yêu cầu (Node, pnpm, Docker), lệnh dev/test/e2e, biến môi trường.

## Dependencies
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-6-task-02 (Job đối soát PayOS 5' + lịch pg_cron/pg_net gọi Nest /jobs)

## Acceptance Criteria
- [ ] Mọi controller trong apps/api/src/modules có trong API_SPEC (kiểm bằng script grep đơn giản hoặc checklist).
- [ ] ERD khớp migrations (tên bảng); không sửa intent docs (BRD/SPEC).
- [ ] README cho phép người mới chạy local trong ≤ 10 bước.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `docs/API_SPEC.md`
- `docs/ERD.md`
- `docs/DESIGN.md`
- `README.md`

## Notes
Chỉ as-built docs (AGENTS.md § Doc Impact).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
