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
- [ ] (HIGH, từ phase review L2) AuthGuard hỗ trợ JWKS: nếu header JWT `alg` là HS256 → verify bằng `SUPABASE_JWT_SECRET`; nếu RS256/ES256 → verify bằng `createRemoteJWKSet(<SUPABASE_URL>/auth/v1/.well-known/jwks.json)` (cache). `SUPABASE_JWT_SECRET` thành optional nếu có JWKS (ít nhất một trong hai phải có; env fail-fast kiểm). Cho phép cấu hình issuer qua env (`SUPABASE_JWT_ISSUER`, mặc định `<SUPABASE_URL>/auth/v1`) để tránh 401 khi localhost/127.0.0.1/custom domain. Test: token ES256/RS256 ký thử + JWKS mock; HS256 vẫn chạy; alg lạ/none → 401.
- [ ] Wiring: `trust proxy` cho throttler (Render/Vercel), thứ tự APP_GUARD: Auth → Roles → CinemaScope → Throttler; `database.types.ts` sinh từ DB local đã áp migration layer 0–2 (layer-3 migrations song song sẽ được regen ở layer 4).

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
- `apps/api/src/common/auth/auth.guard.ts`
- `apps/api/src/config/env.ts`
- `apps/api/test/auth-jwks.spec.ts`

## Notes
Task wiring: chỉ sửa app.module.ts + types; không thêm logic nghiệp vụ khác.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
- DB dùng chung với task-01/02: chỉ cần DB khi chạy `pnpm db:types` (lấy khoá `.worktrees/.dblock`, `supabase stop --no-backup`, `pnpm db:start`, `pnpm db:types`, `pnpm db:stop`, nhả khoá). Chỉ task này sửa `app.module.ts`, `auth.guard.ts`, `env.ts` trong layer 3.
