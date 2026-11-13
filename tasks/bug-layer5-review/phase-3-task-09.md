# Bug layer5-review · phase-3-task-09 — Web Account Session, Password Change & Deletion

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-G-web-account-admin.md` (G/M11-1..M11-4)
- Root cause:
  1. **G/M11-1**: `/tai-khoan/page.tsx` gọi `createBrowserSupabase().auth.getUser()` trong khi browser client đặt `persistSession: false` -> luôn trả `null`, `hasPassword` luôn `true` -> tài khoản OAuth-only vẫn thấy form Đổi mật khẩu và bị bắt nhập mật khẩu giả khi Xoá tài khoản.
  2. **G/M11-2**: Đăng xuất sau khi xoá tài khoản gọi `createBrowserSupabase().auth.signOut()` -> no-op trên client không có session, cookie HttpOnly `sb-*` vẫn còn.
  3. **G/M11-3**: Lỗi 403 khi xoá tài khoản chỉ hiện câu chung chung -> người dùng OAuth không biết cần đăng nhập lại trong 5 phút, người dùng mật khẩu không biết nhập sai mật khẩu.
  4. **G/M11-4**: Đổi mật khẩu gọi thẳng GoTrue từ trình duyệt -> bỏ qua lockout, captcha, rate-limit, bỏ qua `checkPasswordPolicy`, UI báo sai "đã gửi email thông báo" (trái R-14).
- Files to Create/Modify:
  - `apps/web/src/app/(public)/tai-khoan/page.tsx`
  - `apps/web/src/components/account/delete-account-dialog.tsx`
  - `apps/web/src/components/account/change-password-form.tsx`
  - `apps/web/src/app/auth/actions.ts`
  - `apps/web/src/components/account/__tests__/account.test.tsx`
- Status: done

## Repro Verification
- Original repro:
  1. Đăng nhập bằng Google -> vào `/tai-khoan` -> vẫn thấy form "Đổi mật khẩu", mở hộp thoại xoá tài khoản bị bắt buộc gõ mật khẩu.
  2. Xoá tài khoản thành công -> chuyển về trang chủ nhưng cookie `sb-*` vẫn còn dùng được.
  3. Xoá tài khoản bị 403 do quá 5 phút -> chỉ hiện "Bạn không có quyền...", không hướng dẫn đăng nhập lại.
  4. Đổi mật khẩu gọi trực tiếp GoTrue client -> thử mật khẩu cũ sai vô hạn không bị lockout/captcha; mật khẩu mới 8 ký tự toàn chữ thường vẫn được chấp nhận.
- Expected:
  - Lấy thông tin phương thức đăng nhập từ `/me/identities` hoặc server component; tài khoản OAuth không hiện form đổi mật khẩu và không bắt nhập mật khẩu khi xoá tài khoản.
  - Xoá tài khoản gọi server action `signOut` xoá sạch cookie HttpOnly trước khi redirect.
  - Phân biệt thông điệp 403: có mật khẩu báo "Mật khẩu không đúng", OAuth báo "Vui lòng đăng nhập lại rồi thử lại".
  - Đổi mật khẩu áp dụng `checkPasswordPolicy`, có lockout/rate limit và thông báo chuẩn.
- Actual before fix: Giả định sai phiên browser, cookie không bị xoá, lỗi 403 chung chung, đổi mật khẩu bypass bảo mật.
- Actual after fix:
  1. `/tai-khoan/page.tsx` fetch đồng thời `/me/profile` và `/me/identities`, lấy flag `hasPassword`. Với tài khoản OAuth-only (`hasPassword = false`), form "Đổi mật khẩu" bị ẩn hoàn toàn và `DeleteAccountDialog` không bắt nhập mật khẩu.
  2. `delete-account-dialog.tsx` gọi `signOutAction()` sau khi xoá tài khoản thành công qua API `/me`, dọn sạch tất cả cookie `sb-*` HttpOnly trước khi chuyển về trang chủ.
  3. `delete-account-dialog.tsx` phân biệt chính xác lỗi 403 theo phương thức đăng nhập: tài khoản mật khẩu báo "Mật khẩu hiện tại không đúng, vui lòng kiểm tra lại."; tài khoản OAuth báo "Phiên đăng nhập đã quá 5 phút. Vui lòng đăng nhập lại để xác thực xoá tài khoản" kèm nút "Đăng nhập lại".
  4. `change-password-form.tsx` kiểm tra `checkPasswordPolicy` (tối thiểu 8 ký tự, chữ hoa, thường, số), gọi server action `changePasswordAction` xác thực mật khẩu cũ qua `POST /auth/login` (kích hoạt lockout 15 phút khi sai nhiều lần và rate-limit), đổi mật khẩu an toàn và thông báo lỗi tiếng Việt thân thiện.
- Evidence:
  - `pnpm --filter @filmbooking/web test src/components/account/__tests__/account.test.tsx` PASS (21/21 tests, bao gồm test kiểm tra OAuth-only ẩn đổi mật khẩu, phân biệt 403 xóa tài khoản, lockout đổi mật khẩu, gọi signOutAction).
  - `pnpm typecheck` PASS (tsc --noEmit không có lỗi).
  - `pnpm lint` PASS (eslint src không có lỗi).
- Status: PASS
