# Task 03: Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.types

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-39
- AC-xx: —

## Description
Đăng ký guards toàn cục (Auth → Roles → CinemaScope → Throttler), SupabaseModule; `GET /me` trả profile, emailConfirmed, vai trò, danh sách rạp được gán (dùng cho admin shell, staff chọn rạp). Chạy `pnpm db:types` sinh types sau schema layer 2.

## Dependencies
- layer-2-task-01 (Migration catalog: phim, phòng, sơ đồ ghế, suất chiếu (chống chồng giờ)
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] `GET /me` không token → 401; có token → đúng roles + cinemas.
- [ ] Route không gắn `@Public()` mặc định yêu cầu đăng nhập (test 1 route giả).
- [ ] database.types.ts sinh tự động (header 'generated'), typecheck toàn repo PASS.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/me/me.module.ts`
- `apps/api/src/modules/me/me.controller.ts`
- `packages/shared/src/database.types.ts`
- `packages/shared/src/schemas/me.ts`
- `apps/api/test/me.e2e-spec.ts`

## Notes
Task wiring: chỉ sửa app.module.ts + types; không thêm logic nghiệp vụ khác.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
