# Task 08: API bảng giá & ngày lễ (quản trị) + báo giá

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-52, R-53
- AC-xx: AC-15

## Description
CRUD price_rules theo scope (Admin: chuỗi; Manager: rạp/suất của mình), CRUD holidays (Admin), `GET /showtimes/:id/prices` (báo giá theo loại ghế cho sơ đồ).

## Dependencies
- layer-3-task-01 (Migration bảng giá 2 cấp + ngày lễ + hàm price_quote)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-15 qua API: báo giá VIP suất 2D T7 tối tại HN02 = 100.000, HN01 = 120.000.
- [ ] Manager tạo rule scope CHAIN → 403; rule CINEMA rạp khác → 403.
- [ ] Giá âm/không nguyên → 422.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/pricing/pricing.module.ts`
- `apps/api/src/modules/pricing/pricing.controller.ts`
- `apps/api/src/modules/pricing/pricing.service.ts`
- `packages/shared/src/schemas/pricing.ts`
- `apps/api/test/pricing.e2e-spec.ts`

## Notes
Đăng ký app.module ở layer-5-task-09.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
