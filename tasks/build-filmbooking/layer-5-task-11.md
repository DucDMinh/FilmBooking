# Task 11: Web tài khoản: hồ sơ, đổi email/mật khẩu, avatar, rạp yêu thích, tuỳ chọn email, xoá tài khoản + banner chưa xác nhận

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-05, R-06, R-14, R-26, R-27, R-28, R-29, R-30, R-31
- AC-xx: AC-01

## Description
Màn 15 + B7/B8/B11: hồ sơ, đổi email (xác nhận), đổi mật khẩu (Supabase updateUser, yêu cầu mật khẩu cũ), avatar, rạp yêu thích, tuỳ chọn email khuyến mãi, xoá tài khoản nhiều bước. UnverifiedEmailBanner gắn vào (public)/layout.tsx: nhắc xác nhận + nút gửi lại (dùng resend-confirm từ API).

## Dependencies
- layer-3-task-07 (API hồ sơ khách: xem/sửa, đổi email, ảnh đại diện, xoá tài khoản, tuỳ )
- layer-4-task-07 (Wiring API #2: đăng ký catalog, cinema-ops, auth-ext, profile + sinh l)
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)
- layer-2-task-05 (Web shell công khai + component chung + trang pháp lý)

## Acceptance Criteria
- [ ] Banner hiện khi emailConfirmed=false, ẩn khi đã xác nhận (AC-01 phần UI).
- [ ] Xoá tài khoản yêu cầu gõ xác nhận + mật khẩu; xong → đăng xuất về trang chủ.
- [ ] Avatar sai định dạng hiển thị lỗi; xem trước trước khi lưu.
- [ ] Đổi mật khẩu sai mật khẩu cũ → lỗi rõ ràng.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/tai-khoan/layout.tsx`
- `apps/web/src/app/(public)/tai-khoan/page.tsx`
- `apps/web/src/app/(public)/tai-khoan/rap-yeu-thich/page.tsx`
- `apps/web/src/app/(public)/tai-khoan/thong-bao/page.tsx`
- `apps/web/src/components/account/profile-form.tsx`
- `apps/web/src/components/account/avatar-upload.tsx`
- `apps/web/src/components/account/change-password-form.tsx`
- `apps/web/src/components/account/delete-account-dialog.tsx`
- `apps/web/src/components/shell/unverified-email-banner.tsx`
- `apps/web/src/app/(public)/layout.tsx`

## Notes
Task duy nhất sửa (public)/layout.tsx ở layer 5.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
