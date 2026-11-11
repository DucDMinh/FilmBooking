# Task 07: Wiring API #2: đăng ký catalog, cinema-ops, auth-ext, profile + sinh lại types

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Import CatalogModule, CinemaOpsModule, AuthExtModule, ProfileModule vào AppModule; `pnpm db:types` sau migration layer 3; smoke e2e liệt kê route chính.

## Dependencies
- layer-3-task-01 (Migration bảng giá 2 cấp + ngày lễ + hàm price_quote)
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )
- layer-3-task-03 (Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.typ)
- layer-3-task-04 (API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ,)
- layer-3-task-05 (API vận hành rạp: phòng, sơ đồ ghế, suất chiếu (đơn lẻ + hàng loạt), đ)
- layer-3-task-06 (API auth mở rộng: đăng ký (Turnstile, rate limit, chặn email dùng 1 lầ)
- layer-3-task-07 (API hồ sơ khách: xem/sửa, đổi email, ảnh đại diện, xoá tài khoản, tuỳ )

## Acceptance Criteria
- [ ] App khởi động, smoke e2e: `GET /cinemas`, `GET /movies` 200 (public); `GET /me/profile` 401 khi không token.
- [ ] database.types.ts cập nhật bảng layer 3; `pnpm -w typecheck` PASS.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/app.module.ts`
- `packages/shared/src/database.types.ts`
- `apps/api/test/app.e2e-spec.ts`

## Notes
Task wiring.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
