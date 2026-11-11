# Task 03: Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, JobSecretGuard, throttler

## Layer
2

## Type
build (initial)

## Requirements
- R-xx: R-17, R-39
- AC-xx: AC-16

## Description
AuthGuard verify JWT Supabase (jose, JWKS/secret), gắn `req.user` {id, email, emailConfirmed, jwt}; `@Public()` bỏ qua. RolesGuard đọc user_roles/staff_assignments. CinemaScopeGuard: lấy cinemaId từ param/query/body/entity, đối chiếu rạp được gán (Admin pass). JobSecretGuard so `x-job-secret` timing-safe. Throttler mặc định theo IP.

## Dependencies
- layer-1-task-02 (Scaffold NestJS: config env, exception filter mã lỗi, SupabaseService,)
- layer-1-task-03 (Migration lõi: profiles, vai trò & gán rạp, rạp, cấu hình, consent, yê)

## Acceptance Criteria
- [ ] Token hết hạn/sai chữ ký → 401; thiếu role → 403 `FORBIDDEN`.
- [ ] Manager HN01 gọi handler gắn `@CinemaScope()` với cinemaId HN02 → 403 `FORBIDDEN_CINEMA` (AC-16 lớp Nest).
- [ ] Staff không qua được `@Roles('MANAGER')`; Admin qua mọi scope.
- [ ] `x-job-secret` sai → 401, so sánh timing-safe.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/common/auth/auth.module.ts`
- `apps/api/src/common/auth/auth.guard.ts`
- `apps/api/src/common/auth/roles.guard.ts`
- `apps/api/src/common/auth/cinema-scope.guard.ts`
- `apps/api/src/common/auth/job-secret.guard.ts`
- `apps/api/src/common/auth/decorators.ts`
- `apps/api/test/auth-guards.spec.ts`

## Notes
Chưa đăng ký global ở app.module (wiring ở layer-3-task-03).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
