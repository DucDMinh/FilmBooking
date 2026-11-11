# Task 10: Web đăng nhập/đăng ký/xác nhận email/quên & đặt lại mật khẩu + OAuth

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-01, R-02, R-03, R-04, R-06, R-07, R-11, R-12, R-13, R-15, R-16, R-18
- AC-xx: AC-02, AC-03

## Description
Màn 12/13/14/33 + B2/B3: form đăng nhập gọi `POST /auth/login` của Nest (không gọi signInWithPassword trực tiếp — để đếm lockout), checkbox 'Ghi nhớ' (30 ngày vs phiên trình duyệt), đăng ký có Turnstile + checkbox điều khoản (link trang pháp lý) + chỉ báo mật khẩu, kết quả link xác nhận, gửi lại có đếm ngược 60s, quên/đặt lại mật khẩu, nút Google/Facebook (Supabase OAuth) + callback route, quay về `next` an toàn.

## Dependencies
- layer-3-task-06 (API auth mở rộng: đăng ký (Turnstile, rate limit, chặn email dùng 1 lầ)
- layer-4-task-07 (Wiring API #2: đăng ký catalog, cinema-ops, auth-ext, profile + sinh l)
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)
- layer-2-task-05 (Web shell công khai + component chung + trang pháp lý)

## Acceptance Criteria
- [ ] AC-02 (UI): sau khi gửi lại, nút disabled + đếm ngược 60s; bấm trong lúc đếm không gọi API.
- [ ] AC-03 (UI): API trả ACCOUNT_LOCKED → thông báo khoá 15', không lộ thêm.
- [ ] Đăng ký thiếu tick điều khoản → không submit được; lỗi email trùng hiển thị chung chung.
- [ ] Đăng nhập thành công quay về `next` (chỉ path nội bộ).
- [ ] Form a11y: label, aria-invalid, thông báo lỗi aria-live.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(auth)/dang-nhap/page.tsx`
- `apps/web/src/app/(auth)/dang-ky/page.tsx`
- `apps/web/src/app/(auth)/xac-nhan-email/page.tsx`
- `apps/web/src/app/(auth)/quen-mat-khau/page.tsx`
- `apps/web/src/app/(auth)/dat-lai-mat-khau/page.tsx`
- `apps/web/src/app/auth/callback/route.ts`
- `apps/web/src/components/auth/login-form.tsx`
- `apps/web/src/components/auth/register-form.tsx`
- `apps/web/src/components/auth/resend-confirm-button.tsx`
- `apps/web/src/components/auth/oauth-buttons.tsx`
- `apps/web/src/components/auth/__tests__/auth-forms.test.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
