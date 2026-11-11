# Task 04: API soát vé: quét QR/nhập mã theo rạp làm việc

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-97, R-98, R-99, R-101, R-102, R-132
- AC-xx: AC-12, AC-13

## Description
`POST /checkin/scan {cinemaId, token|bookingCode}` cho Staff/Manager/Admin; CinemaScopeGuard kiểm rạp làm việc thuộc rạp được gán; gọi checkin_ticket; trả kết quả màu (OK/USED/WRONG_CINEMA/CANCELLED/EXPIRED/NOT_FOUND).

## Dependencies
- layer-4-task-05 (RPC check-in vé + view báo cáo MVP (doanh thu, theo phim/suất/rạp, đối)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-12 & AC-13 qua API (như RPC) với dữ liệu seed.
- [ ] Staff gửi cinemaId không được gán → 403.
- [ ] Phản hồi WRONG_CINEMA không chứa tên khách, ghế, email.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/checkin/checkin.module.ts`
- `apps/api/src/modules/checkin/checkin.controller.ts`
- `apps/api/src/modules/checkin/checkin.service.ts`
- `packages/shared/src/schemas/checkin.ts`
- `apps/api/test/checkin.e2e-spec.ts`

## Notes
Đăng ký app.module ở layer-6-task-01.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
