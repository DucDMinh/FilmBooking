# Review Report: build-filmbooking-layer-5-task-10 (Round 1)

**Review Level:** `STRICT`  
**Verdict:** `STRICT PASS`  
**Reviewer:** `reviewer` (Adversarial Reviewer)  
**Task:** `layer-5-task-10` — Web đăng nhập/đăng ký/xác nhận email/quên & đặt lại mật khẩu + OAuth  
**Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-10`  
**Commit/Diff Scope:**
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
- `apps/web/src/components/auth/auth-ui.tsx`
- `apps/web/src/components/auth/turnstile-field.tsx`
- `apps/web/src/components/auth/__tests__/auth-forms.test.tsx`

---

## 1. Requirements Coverage & Acceptance Criteria Verification

| Tiêu chí | Trạng thái | Đánh giá chi tiết |
|---|---|---|
| **AC-02 (UI): Nút gửi lại xác nhận email** | **PASS** | `ResendConfirmButton` kiểm tra điều kiện `countdown > 0 \|\| loading \|\| !email` để vô hiệu hoá nút. Khi gửi thành công, nút bị disabled và bắt đầu đếm ngược 60s. Click trong lúc đếm không kích hoạt API call. Đã kiểm chứng qua unit test với fake timers và fireEvent. |
| **AC-03 (UI): Trạng thái ACCOUNT_LOCKED** | **PASS** | `LoginForm` bắt mã lỗi `ACCOUNT_LOCKED` từ API Nest (`/auth/login`), hiển thị thông báo tài khoản bị khoá tạm 15 phút do nhập sai nhiều lần. Tuyệt đối không để lộ thông tin nhạy cảm (email, user ID hay thông tin xác thực) ra UI. |
| **Đăng ký: Checkbox điều khoản & Chặn duplicate email (R-03, R-12)** | **PASS** | `RegisterForm` áp dụng `disabled={!acceptTerms \|\| loading}` trên nút Tạo tài khoản. Khi trùng email, backend Nest trả về phản hồi trung tính `{ status: "CHECK_EMAIL" }`, frontend điều hướng tới `/xac-nhan-email` với thông báo kích hoạt chung, không để lộ email đã tồn tại. |
| **Redirect an toàn (`sanitizeNext`)** | **PASS** | `sanitizeNext` lọc bỏ toàn bộ URL tuyệt đối, protocol injection (`javascript:`), open redirect (`//host`, `/\host`), và control characters. Áp dụng tại `LoginForm`, `RegisterForm`, `OAuthButtons`, `LoginPage`, và `auth/callback/route.ts`. |
| **Form a11y & Design tokens** | **PASS** | Tất cả input đều có `<Label htmlFor={id}>` kết nối qua `useId()`. Trạng thái lỗi gắn `aria-invalid="true"` và `aria-describedby` trỏ đến `<p role="alert">`. Nút ẩn/hiện mật khẩu có `aria-label`, `aria-pressed`, kích thước touch target đạt chuẩn 44px trên mobile. Design tokens tuân thủ bảng màu dark mode: `bg-surface-*`, `text-fg`, `shadow-cta-glow`. |

---

## 2. Cross-Boundary & Security Audit

1. **Giao tiếp Nest API vs Client Auth:**
   - `apps/web/src/app/(auth)/dang-nhap/page.tsx`: Sử dụng Server Action gọi `POST /auth/login` trên NestJS API thay vì gọi trực tiếp `signInWithPassword` của Supabase, đảm bảo kích hoạt cơ chế đếm số lần đăng nhập sai, chống brute-force và kích hoạt lockout 15 phút (`is_login_locked`).
   - Token phiên (`accessToken`, `refreshToken`) được đồng bộ vào `cookieStore` thông qua `sessionCookieOptions` (`httpOnly: true`, `sameSite: "lax"`, `secure` ở môi trường production). Thời gian sống của cookie được cấu hình: 30 ngày nếu chọn "Ghi nhớ", hoặc session cookie (phiên trình duyệt) nếu không chọn.
2. **Khôi phục mật khẩu (Reset Password Flow):**
   - Hỗ trợ token từ cả search params lẫn URL hash (`window.location.hash`), tương thích cơ chế implicit/PKCE recovery link của GoTrue.
   - Khi token không có hoặc đã hết hạn (quá 1 giờ theo R-13), giao diện đưa ra cảnh báo rõ ràng và link điều hướng yêu cầu lại mã.
3. **Chống dò quét tài khoản (Account Enumeration):**
   - Form quên mật khẩu luôn hiển thị thông báo thành công trung tính bất kể email có tồn tại trong hệ thống hay không.
   - Form đăng ký xử lý mã phản hồi trung tính từ Nest AuthExtService, ngăn kẻ tấn công phát hiện email đã đăng ký.

---

## 3. Automated Verification & Gates

- **TypeScript (`pnpm -w typecheck`):** PASS (0 error).
- **ESLint (`pnpm -w lint`):** PASS (0 warning, 0 error).
- **Unit / Component Tests (`pnpm --filter @filmbooking/web test`):** PASS (9/9 test files passed, 109/109 tests passed, trong đó bộ test `auth-forms.test.tsx` đạt 16/16 tests).
- **Production Build (`pnpm --filter @filmbooking/web build`):** PASS (Tất cả static/dynamic routes của auth build thành công: `/auth/callback`, `/dang-ky`, `/dang-nhap`, `/dat-lai-mat-khau`, `/quen-mat-khau`, `/xac-nhan-email`).
- **Oxlint (`npx oxlint`):** PASS (Found 0 warnings and 0 errors trên 14 files auth).
- **Open Code Review (`ocr review`):** Thử nghiệm chạy OCR, kết quả bị rate-limited do quota Google Gemini API free-tier. Reviewer đã thực hiện full manual adversarial audit thay thế.
- **Code Size & Quality:** Mọi file đều ≤ 300 dòng (dài nhất là `register-form.tsx` 294 dòng), không có hàm > 50 dòng, không có dead code hay swallow errors.

---

## 4. Kết luận

Mã nguồn của `layer-5-task-10` đáp ứng trọn vẹn yêu cầu chức năng, ràng buộc bảo mật và tiêu chuẩn kiểm thử. Task sẵn sàng để hoàn tất và bàn giao.

**Verdict: STRICT PASS**
