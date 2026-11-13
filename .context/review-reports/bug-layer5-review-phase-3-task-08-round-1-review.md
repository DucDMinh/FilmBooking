# Báo cáo Thẩm định Độc lập (Adversarial Review)
## Task: Bug layer5-review · Phase 3 · Task 08 — Web Auth, OAuth Callback Error Mapping & IP Forwarding (F-01..F-05)
- **Reviewer**: Adversarial Reviewer (Agent: reviewer)
- **Mức độ thẩm định**: STRICT (Web Auth / Security / OAuth / Session Management)
- **Vòng thẩm định**: Round 1
- **Ngày**: 2026-11-13
- **Verdict**: **FAIL**

---

## 1. Tổng quan & Kết quả chạy Verify Commands (Allowlist)

Tất cả các lệnh kiểm tra tự động cấu hình trong `.context/project-config.md` đều cho kết quả xanh:

| Lệnh kiểm tra | Kết quả | Chi tiết |
|---|---|---|
| `pnpm --filter @filmbooking/web test src/components/auth/__tests__/auth-forms.test.tsx src/components/account/__tests__/linked-accounts.test.tsx` | **PASS** | 48/48 tests passed (2 test files, 13.95s) |
| `pnpm --filter @filmbooking/web typecheck` | **PASS** | Exit code 0, không có lỗi type |
| `pnpm --filter @filmbooking/web lint` | **PASS** | Exit code 0, 0 error, 0 warning |
| `pnpm --filter @filmbooking/api typecheck` | **PASS** | Exit code 0, không có lỗi type |

> ⚠️ **Cảnh báo từ nguyên tắc Adversarial Review**:
> Bộ test xanh chỉ phản ánh các giả định trong unit test của Builder. Qua đối chiếu chéo giữa code middleware, server client và state machine của session cookie, phát hiện **1 lỗi mức High/Major làm gãy luồng "Ghi nhớ đăng nhập" 30 ngày khi refresh token** và **1 edge case điều hướng OAuth callback**.

---

## 2. Chi tiết các phát hiện (Findings)

### Finding 1: [MAJOR / HIGH] F-04 — Refresh Token trong `proxy.ts` và `server.ts` xoá sạch `maxAge` của phiên "Ghi nhớ đăng nhập 30 ngày" (False-Confidence Test)

- **Vị trí file**:
  - [cookie-options.ts](file:///E:/FilmBooking/apps/web/src/lib/supabase/cookie-options.ts#L36-L44)
  - [proxy.ts](file:///E:/FilmBooking/apps/web/src/proxy.ts#L23-L25)
  - [server.ts](file:///E:/FilmBooking/apps/web/src/lib/supabase/server.ts#L15-L17)
  - [auth-forms.test.tsx](file:///E:/FilmBooking/apps/web/src/components/auth/__tests__/auth-forms.test.tsx#L452-L455)
- **Nguyên nhân gốc & Bằng chứng**:
  1. Trong `src/app/(auth)/dang-nhap/page.tsx`, khi người dùng tick "Ghi nhớ đăng nhập" (`data.rememberMe: true`), hệ thống lưu cờ `REMEMBER_COOKIE_NAME = "fb-remember"` (`"1"`) và gán cookie `maxAge = REMEMBER_MAX_AGE` (30 ngày).
  2. Tuy nhiên, trong middleware toàn site `src/proxy.ts`:
     ```ts
     for (const { name, value, options } of items) {
       response.cookies.set(name, value, sessionCookieOptions(options));
     }
     ```
     và trong `src/lib/supabase/server.ts`:
     ```ts
     for (const { name, value, options } of items) {
       cookieStore.set(name, value, sessionCookieOptions(options));
     }
     ```
     Cả hai nơi đều gọi `sessionCookieOptions(options)` mà **hoàn toàn không đọc cookie `fb-remember`** và không truyền cờ `remember` vào hàm.
  3. Khi access token hết hạn sau ~1 giờ, `@supabase/ssr` tự động refresh token và truyền `options.maxAge: 400 * 24 * 60 * 60` (mặc định của Supabase).
  4. Trong `sessionCookieOptions`, vì `remember` là `undefined`, nó rơi vào khối `else`:
     ```ts
     if (base.maxAge && base.maxAge >= DEFAULT_SUPABASE_MAX_AGE) {
       delete base.maxAge;
     }
     ```
     Điều kiện `34560000 >= DEFAULT_SUPABASE_MAX_AGE` là `true`, dẫn đến `delete base.maxAge` được thực thi!
  5. **Hậu quả thực tế**: Người dùng đã chọn "Ghi nhớ đăng nhập 30 ngày" (R-15). Nhưng chỉ sau lần refresh token đầu tiên (sau 1 giờ lướt web), cookie xác thực bị hạ cấp thành **Session Cookie**. Khi người dùng đóng trình duyệt và mở lại, cookie bị trình duyệt xoá và người dùng bị **đăng xuất cưỡng bức**. Cờ `fb-remember=1` bị bỏ rơi thành Dead State.
  6. **False-Confidence Test**: Unit test `auth-forms.test.tsx` (dòng 452) chỉ khẳng định "xóa maxAge khi maxAge = 400 ngày" trong hàm độc lập, tạo cảm giác an tâm giả mà không kiểm tra xem phiên `remember: true` bị gãy khi qua `proxy.ts`.
- **Yêu cầu sửa đổi (Remediation)**:
  - Trong `src/proxy.ts`:
    ```ts
    const rememberFlag = request.cookies.get(REMEMBER_COOKIE_NAME)?.value;
    ...
    for (const { name, value, options } of items) {
      response.cookies.set(name, value, sessionCookieOptions(options, rememberFlag));
    }
    ```
  - Trong `src/lib/supabase/server.ts`:
    ```ts
    const rememberFlag = cookieStore.get(REMEMBER_COOKIE_NAME)?.value;
    ...
    for (const { name, value, options } of items) {
      cookieStore.set(name, value, sessionCookieOptions(options, rememberFlag));
    }
    ```
  - Bổ sung test case tích hợp mô phỏng refresh token với cookie `fb-remember=1` phải duy trì `maxAge = REMEMBER_MAX_AGE`.

---

### Finding 2: [MEDIUM] F-01 — Điều hướng lỗi `identity_taken` từ luồng đăng nhập công khai đẩy về `/?error=identity_taken`
- **Vị trí file**:
  - [route.ts](file:///E:/FilmBooking/apps/web/src/app/auth/callback/route.ts#L66-L70)
  - [login-form.tsx](file:///E:/FilmBooking/apps/web/src/components/auth/login-form.tsx#L50-L55)
- **Mô tả defect**:
  - Tại `buildRedirectForError`:
    ```ts
    if (category === "identity_taken") {
      const target = new URL(next, requestUrl);
      target.searchParams.set("error", "identity_taken");
      return NextResponse.redirect(target);
    }
    ```
  - Nếu người dùng đăng nhập bằng OAuth từ trang `/dang-nhap` (với `next = "/"`), khi bị lỗi MXH đã thuộc tài khoản khác (`identity_taken`), callback chuyển hướng về `/?error=identity_taken`.
  - Trang chủ `/` không hiển thị thông báo lỗi này, người dùng sẽ thấy mình bị đẩy về trang chủ mà không đăng nhập được và không có thông báo gì.
  - Đồng thời `LoginForm` chỉ xử lý `initialError === "oauth"` và `initialError === "email_exists"`, bỏ quên `identity_taken`.
- **Yêu cầu sửa đổi (Remediation)**:
  - Nếu `category === "identity_taken"`:
    - Nếu `next.startsWith("/tai-khoan")`: chuyển về `next?error=identity_taken` (đúng cho luồng liên kết trong tài khoản).
    - Ngược lại: chuyển về `/dang-nhap?error=identity_taken` (kèm `next` an toàn nếu có).
  - Bổ sung vào `LoginForm`:
    ```ts
    : initialError === "identity_taken"
      ? "Tài khoản mạng xã hội này đã được liên kết với một tài khoản khác."
    ```

---

### Finding 3: [MINOR] `signOutAction` không dọn cookie `fb-remember`
- **Vị trí file**: [actions.ts](file:///E:/FilmBooking/apps/web/src/app/auth/actions.ts#L24-L28)
- **Mô tả**:
  - `signOutAction()` chỉ dọn các cookie có tiền tố `sb-`. Cookie `fb-remember` vẫn tồn tại trên trình duyệt sau khi đăng xuất.
- **Yêu cầu sửa đổi (Remediation)**:
  - Thêm `cookieStore.delete(REMEMBER_COOKIE_NAME)` trong `signOutAction()` để tránh mang cờ ghi nhớ cũ sang phiên đăng nhập của người dùng khác.

---

## 3. Đánh giá các hạng mục đã hoàn thành tốt

1. **F-01 (OAuth Error Classification & Safe Next)**:
   - `classifyOAuthError` bắt chuẩn xác các chuỗi lỗi Postgres và trigger DB (`OAUTH_AUTO_MERGE_BLOCKED`, `OAUTH_EMAIL_COLLISION`, `OAUTH_IDENTITY_ALREADY_LINKED`, mã `23505`, `23514`).
   - Hàm chuẩn hóa chỉ trả về 4 category allowlist, loại bỏ hoàn toàn nguy cơ Reflected XSS hoặc rò rỉ chi tiết hệ thống.
   - `sanitizeNext` xử lý triệt để array query params `string[]`, backslash `\`, protocol relative `//`, và ký tự điều khiển (CRLF, null bytes).
2. **F-02 (Redirect URLs trong AuthExtService)**:
   - Inject `ENV` an toàn, trích xuất `webOrigin = this.env.WEB_ORIGIN[0]` đã strip trailing slashes.
   - Cả `resetPasswordForEmail` (`/dat-lai-mat-khau`) và `sendConfirmation` (`/auth/callback?next=/tai-khoan`) đều truyền redirect URL chuẩn xác, không còn rơi về `/`.
3. **F-03 (Client IP Forwarding)**:
   - Proxy handler forward đầy đủ `x-forwarded-for` và `x-real-ip`.
   - Server action `LoginPage` đọc client IP từ headers và truyền vào `apiFetch`, giải quyết triệt để nguy cơ rate limit toàn site ở Nest API.
4. **F-05 (Turnstile Reset & Clear State)**:
   - Cả 3 màn hình (`LoginForm`, `RegisterForm`, `ForgotPasswordContent`) đều tích hợp `turnstileRef.current?.reset()` và `setCaptchaToken(null)` ngay khi submit lỗi hoặc gặp ngoại lệ mạng, chấm dứt tình trạng kẹt `CAPTCHA_FAILED` do tái sử dụng token đã hết hạn/đã tiêu thụ.

---

## 4. Kết luận & Khuyến nghị

- **Trạng thái**: **FAIL**
- **Lý do**: Lỗi tại **Finding 1** (F-04) làm tê liệt tính năng "Ghi nhớ đăng nhập 30 ngày" (R-15) ngay sau lần refresh token đầu tiên trong `proxy.ts` và `server.ts`.
- **Hành động tiếp theo**: Chuyển lại cho Builder để chỉnh sửa `proxy.ts`, `server.ts`, `route.ts`, và `login-form.tsx` theo hướng dẫn tại Finding 1 và Finding 2.
