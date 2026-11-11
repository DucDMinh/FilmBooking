# Task 06: API quản trị: người dùng & vai trò, gán rạp, cấu hình chuỗi, khoá API POS, audit log, voucher CRUD

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-17, R-39, R-90, R-105, R-106, R-107, R-111
- AC-xx: AC-16

## Description
Admin: tìm user, cấp/thu hồi vai trò Manager/Staff + gán rạp, khoá tài khoản; Manager: chỉ thêm/bớt Staff rạp mình (R-17/R-105). Cấu hình chuỗi (thời gian giữ ghế web, nội dung cảnh báo, phiên bản điều khoản). Khoá API POS: tạo (trả secret **một lần**, lưu hash), thu hồi, xem log. Audit log có lọc. Voucher CRUD (Admin; Manager chỉ xem).

## Dependencies
- layer-3-task-03 (Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.typ)
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)

## Acceptance Criteria
- [ ] Manager cấp vai trò MANAGER/ADMIN → 403; thêm Staff cho rạp khác → 403.
- [ ] Tạo khoá POS trả plaintext 1 lần; GET sau đó chỉ có prefix.
- [ ] Đổi thời gian giữ ghế → hold mới dùng giá trị mới; ghi audit.
- [ ] Manager tạo/sửa voucher → 403; xem được.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/admin/admin.module.ts`
- `apps/api/src/modules/admin/users.controller.ts`
- `apps/api/src/modules/admin/settings.controller.ts`
- `apps/api/src/modules/admin/pos-keys.controller.ts`
- `apps/api/src/modules/admin/audit.controller.ts`
- `apps/api/src/modules/admin/vouchers.controller.ts`
- `packages/shared/src/schemas/admin.ts`
- `apps/api/test/admin.e2e-spec.ts`

## Notes
Đăng ký app.module ở layer-6-task-01.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
