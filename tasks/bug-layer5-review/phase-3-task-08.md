# Bug layer5-review · phase-3-task-08 — Web Auth, OAuth Callback Error Mapping & IP Forwarding

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-F-web-auth-security.md` (F-01..F-05)
- Root cause:
  1. **F-01**: `/auth/callback/route.ts` gộp mọi lỗi OAuth thành `/dang-nhap?error=oauth` và bỏ `next`, khiến các luồng AC-04 (trùng email), R-23 (MXH đã thuộc user khác), R-19 (Facebook thiếu email) bị hỏng; `LinkedAccounts` không bao giờ nhận được lỗi.
  2. **F-02**: `resetPasswordForEmail` và `resend` thiếu `redirectTo`; link email đặt lại mật khẩu và xác nhận email rơi về trang chủ `/` thay vì `/dat-lai-mat-khau` hoặc `/xac-nhan-email`.
  3. **F-03**: Proxy Next (`/api/proxy/[...path]`) và server action `/dang-nhap` không forward IP khách tới Nest, khiến rate limit theo IP ở Nest trở thành giới hạn toàn site (10 req/phút có thể chặn toàn hệ thống).
  4. **F-04**: "Ghi nhớ đăng nhập" (R-15) bị `proxy.ts` / `lib/supabase/server.ts` ghi đè thành `maxAge: 400 ngày` sau lần refresh token đầu tiên.
  5. **F-05**: Token Turnstile không được clear/reset widget sau khi submit lỗi, khiến người dùng bị `CAPTCHA_FAILED` liên tục trong 300s.
- Files to Create/Modify:
  - `apps/web/src/app/auth/callback/route.ts`
  - `apps/web/src/app/api/proxy/[...path]/route.ts`
  - `apps/web/src/app/(auth)/dang-nhap/page.tsx`
  - `apps/web/src/components/auth/login-form.tsx`
  - `apps/web/src/components/auth/register-form.tsx`
  - `apps/web/src/app/(auth)/quen-mat-khau/page.tsx`
  - `apps/web/src/lib/supabase/cookie-options.ts`
  - `apps/api/src/modules/auth-ext/auth-ext.service.ts`
  - `apps/web/src/components/auth/__tests__/auth-forms.test.tsx`
  - `apps/web/src/components/auth/turnstile-field.tsx`
  - `apps/web/src/components/account/linked-accounts.tsx`
  - `apps/web/src/app/(auth)/bo-sung-email/page.tsx`
  - `apps/web/src/lib/auth/safe-next.ts`
  - `apps/web/src/proxy.ts`
  - `apps/web/src/lib/supabase/server.ts`
  - `apps/web/src/app/auth/actions.ts`
- Status: completed

## Repro Verification
- Original repro:
  1. Đăng nhập Google với email đã tồn tại mật khẩu -> bị đẩy về `/dang-nhap?error=oauth` câu chung chung, không vào luồng AC-04/R-20.
  2. Mở link reset mật khẩu từ email -> rơi về `/` thay vì `/dat-lai-mat-khau`.
  3. Gửi 11 request đăng nhập sai từ 1 IP -> các IP khác trên toàn mạng bị 429.
  4. Đăng nhập không tick "Ghi nhớ" -> sau 1h refresh token, cookie chuyển thành `Max-Age: 400 ngày`.
  5. Giải Turnstile rồi nhập sai mật khẩu -> nhập lại mật khẩu đúng thì bị báo "Xác minh không thành công" liên tục.
- Expected:
  - Callback map lỗi OAuth theo allowlist, giữ `next`, dẫn đúng màn liên kết/bổ sung email.
  - Email reset/confirm có `redirectTo` chuẩn.
  - Forward IP khách qua `X-Forwarded-For`.
  - Giữ cờ `remember-me` qua các lần refresh token.
  - Reset Turnstile token và widget sau mỗi lần submit lỗi.
- Actual before fix: Mất flow OAuth, link rơi về trang chủ, rate limit toàn site, mất cờ session, kẹt captcha.
- Actual after fix:
  - F-01: `/auth/callback/route.ts` phân loại lỗi theo allowlist (`identity_taken`, `email_exists`, `missing_email`), giữ param `next`. Lỗi `identity_taken` khi gọi từ ngoài về `/dang-nhap?error=identity_taken` (hiển thị thông báo "Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác"), khi ở `/tai-khoan` thì về `next?error=identity_taken`. Lỗi `email_exists` về `/dang-nhap?error=email_exists` (câu R-20) hoặc `/tai-khoan/bao-mat?error=email_exists`.
  - F-02: `auth-ext.service.ts` truyền `redirectTo: `${webOrigin}/dat-lai-mat-khau`` cho `resetPasswordForEmail` và `emailRedirectTo: `${webOrigin}/auth/callback?next=/tai-khoan`` cho `resend`.
  - F-03: Next.js API proxy (`/api/proxy/[...path]`) và Server Action `/dang-nhap` forward IP khách qua header `x-forwarded-for` (lấy từ `x-forwarded-for` hoặc `x-real-ip`).
  - F-04: `cookie-options.ts` giữ cờ `fb-remember=0|1`. `proxy.ts` và `server.ts` đọc cờ `fb-remember` từ cookie trong `setAll` và áp dụng khi refresh token. `signOutAction` trong `actions.ts` dọn dẹp `fb-remember`.
  - F-05: `login-form.tsx`, `register-form.tsx`, `quen-mat-khau/page.tsx`: reset widget Turnstile (`turnstileRef.current?.reset()`) và clear captcha token (`setCaptchaToken(null)`) sau mỗi lần submit thất bại.
- Evidence:
  - `pnpm --filter @filmbooking/web test src/components/auth/__tests__/auth-forms.test.tsx`: 34/34 tests PASS.
  - `pnpm --filter @filmbooking/web test src/components/account/__tests__/linked-accounts.test.tsx`: 16/16 tests PASS.
  - `pnpm typecheck` (@filmbooking/web & @filmbooking/api): PASS.
  - `pnpm lint` (@filmbooking/web): PASS (0 error, 0 warning).
- Status: PASS
