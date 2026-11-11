# Task 12: Web bảo mật & liên kết tài khoản + bước bổ sung email Facebook

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-15, R-18, R-19, R-20, R-21, R-22, R-23
- AC-xx: AC-04, AC-05

## Description
Màn 16 + B4: danh sách phương thức (email/mật khẩu, Google, Facebook), liên kết (Supabase linkIdentity), huỷ liên kết (API identity), thêm mật khẩu cho tài khoản OAuth, đăng xuất mọi phiên khác; luồng AC-04 (trùng email → hướng dẫn đăng nhập mật khẩu rồi liên kết); bước nhập email cho Facebook không email.

## Dependencies
- layer-4-task-06 (Identity/social: trigger email liên kết + API liên kết/huỷ liên kết, F)
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)
- layer-2-task-05 (Web shell công khai + component chung + trang pháp lý)

## Acceptance Criteria
- [ ] AC-05 (UI): chỉ còn Facebook → nút huỷ liên kết disabled/hiện hướng dẫn thêm phương thức.
- [ ] AC-04 (UI): callback báo trùng email → màn hướng dẫn đăng nhập mật khẩu + liên kết, không tạo tài khoản mới.
- [ ] Đăng xuất phiên khác gọi signOut({scope:'others'}).
- [ ] Thông báo không tiết lộ email tồn tại ở bước bổ sung email.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/tai-khoan/bao-mat/page.tsx`
- `apps/web/src/components/account/linked-accounts.tsx`
- `apps/web/src/components/account/add-password-form.tsx`
- `apps/web/src/components/account/sessions-card.tsx`
- `apps/web/src/app/(auth)/bo-sung-email/page.tsx`
- `apps/web/src/components/account/__tests__/linked-accounts.test.tsx`

## Notes
Phụ thuộc kết quả spike auto-linking ở layer-4-task-06.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
