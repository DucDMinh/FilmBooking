# Task 02: Scaffold NestJS: config env, exception filter mã lỗi, SupabaseService, health

## Layer
1

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Khởi tạo apps/api: ConfigModule validate env bằng zod (fail-fast), helmet + CORS chỉ cho origin web, ValidationPipe/zod pipe, exception filter toàn cục trả `{ error: { code, message, details } }` dùng mã lỗi `@filmbooking/shared/errors`, SupabaseService: `forUser(jwt)` (anon key + JWT user → giữ RLS) và `admin()` (service role, chỉ dùng cho webhook/job/POS/admin đã kiểm quyền). `GET /health`.

## Dependencies
- layer-0-task-01 (Monorepo pnpm + tooling + packages/shared nền (mã lỗi, enum, tiền/giờ))

## Acceptance Criteria
- [ ] `GET /health` → 200 `{status:'ok'}` (supertest).
- [ ] Lỗi chưa biết → 500 `{error:{code:'INTERNAL'}}` không lộ stack; AppException(SEAT_TAKEN) → 409 đúng shape.
- [ ] Thiếu env bắt buộc → app không khởi động, log rõ tên biến (không log giá trị).
- [ ] `forUser()` không bao giờ dùng service role key (unit test).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/nest-cli.json`
- `apps/api/tsconfig.json`
- `apps/api/tsconfig.build.json`
- `apps/api/vitest.config.ts`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/common/errors/app-exception.ts`
- `apps/api/src/common/errors/all-exceptions.filter.ts`
- `apps/api/src/common/supabase/supabase.module.ts`
- `apps/api/src/common/supabase/supabase.service.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/test/health.e2e-spec.ts`
- `apps/api/test/errors.spec.ts`

## Notes
app.module.ts do task này tạo; về sau CHỈ các task 'wiring' được sửa. Module tính năng tự test bằng TestingModule riêng.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
