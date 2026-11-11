# Task 07: Harness integration test API ↔ Supabase local (helpers tạo user/role/rạp, client song song)

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Cấu hình `pnpm test:int` chạy với Supabase local (`pnpm db:start`): helper tạo user (customer đã/chưa xác nhận, staff/manager gán rạp, admin), lấy JWT, tạo suất/ghế/khoá POS từ factory, mở N kết nối song song, dọn dữ liệu theo prefix.

## Dependencies
- layer-3-task-03 (Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.typ)
- layer-4-task-09 (Seed demo: 5 rạp, phòng, sơ đồ ghế, phim, bảng giá, ngày lễ, suất 7 ng)

## Acceptance Criteria
- [ ] `pnpm test:int` chạy smoke (tạo user → gọi /me) PASS trên Supabase local; bỏ qua có thông báo khi Docker không chạy (CI có job db).
- [ ] Factory sinh dữ liệu cô lập theo test (không phụ thuộc seed).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/vitest.integration.config.ts`
- `apps/api/test/integration/helpers/supabase-test.ts`
- `apps/api/test/integration/helpers/factories.ts`
- `apps/api/test/integration/smoke.int-spec.ts`

## Notes
Layer 8 dùng harness này.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
