# Task 07: API hồ sơ khách: xem/sửa, đổi email, ảnh đại diện, xoá tài khoản, tuỳ chọn email, rạp yêu thích, khu vực

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-26, R-27, R-28, R-29, R-30, R-31, R-35
- AC-xx: —

## Description
`GET/PATCH /me/profile`, `POST /me/email` (Supabase đổi email có xác nhận), `POST /me/avatar` (signed upload, giới hạn loại/kích thước), `DELETE /me` (xác nhận lại mật khẩu/OTP; ẩn danh hoá PII, giữ đơn/vé cho kế toán), `PUT /me/preferences` (email khuyến mãi), `PUT/DELETE /me/favorites/:cinemaId`, `PUT /me/province`. Dùng `forUser(jwt)` (RLS).

## Dependencies
- layer-1-task-03 (Migration lõi: profiles, vai trò & gán rạp, rạp, cấu hình, consent, yê)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] Sửa SĐT sai định dạng → 422; ngày sinh tương lai → 422.
- [ ] Avatar > 2MB hoặc không phải ảnh → 422.
- [ ] Xoá tài khoản: profile ẩn danh, không đăng nhập lại được, đơn cũ vẫn còn cho rạp tra cứu (không PII).
- [ ] Khách A không sửa được profile khách B (RLS).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/profile/profile.module.ts`
- `apps/api/src/modules/profile/profile.controller.ts`
- `apps/api/src/modules/profile/profile.service.ts`
- `packages/shared/src/schemas/profile.ts`
- `apps/api/test/profile.e2e-spec.ts`

## Notes
R-28 avatar MVP theo quyết định brainstorm #1.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
