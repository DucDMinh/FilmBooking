# Independent Review — Layer 5 · Nhóm F (task-10 Web auth/OAuth · task-12 Web bảo mật & liên kết)

Agent: reviewer · Ngày: 2026-11-13 · Branch: `staging` (range `7583bc1..7574049`) · Commit: `a65ca4e` (task-10), `11dcd88` (task-12)

## Review level
**STRICT**

## Reason
Hai task này đụng auth/session/cookie, OAuth callback (open redirect), liên kết identity (chặn tự gộp tài khoản), chống dò email (R-12) và CAPTCHA. Đều thuộc nhóm rủi ro đỏ.

## Blast radius
- Mọi luồng vào hệ thống: đăng nhập, đăng ký, xác nhận email, quên/đặt lại mật khẩu, OAuth Google/Facebook, liên kết/huỷ liên kết MXH, đăng xuất phiên khác.
- Cookie phiên (`proxy.ts`, `lib/supabase/server.ts`) và giới hạn tần suất theo IP ở Nest (`auth-ext`) bị ảnh hưởng gián tiếp.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @filmbooking/web exec vitest run src/components/auth/__tests__/auth-forms.test.tsx src/components/account/__tests__/linked-accounts.test.tsx` | **Blocked**: hook `agent-guard` chặn vì lệnh không nằm trong allowlist. Tôi không chạy biến thể khác. |
| `pnpm typecheck` / `lint` / `test` / `build` | Không chạy (session chính tự chạy). |
| aislop / oxlint / ocr | Không chạy (không có trong allowlist của reviewer ở lượt này). |

Mọi kết luận dưới đây đến từ việc đọc code, migration, config và schema thật, không đến từ kết quả test.

## Findings

### F-01 · MAJOR · đã xác minh: callback OAuth gộp mọi lỗi thành `?error=oauth`, nên AC-04/R-20, R-23 và R-19 không bao giờ hiện ra (task-10 + task-12)
- **Vị trí:** `apps/web/src/app/auth/callback/route.ts:12-16` và `:28-30`.
- **Bằng chứng:**
  - Mọi `error`/`error_description` từ GoTrue đều bị redirect về `/dang-nhap?error=oauth`. Tham số `next` bị bỏ, mã lỗi cũng bị bỏ.
  - DB trigger `guard_identity_insert` (`supabase/migrations/20261113090000_identity_link_intent_hardening.sql:38,72,88`) ném `OAUTH_IDENTITY_ALREADY_LINKED` (23505), `OAUTH_AUTO_MERGE_BLOCKED` (23514) hoặc `OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED` (23514). Callback không phân loại được lỗi nào trong số này.
  - Grep toàn repo: không có code nào redirect tới `/bo-sung-email?status=email_exists`. Chuỗi `email_exists` chỉ xuất hiện trong `bo-sung-email/page.tsx:26` và trong test.
  - Luồng liên kết dùng `redirectTo=/auth/callback?next=/tai-khoan/bao-mat` (`bao-mat/page.tsx:22`). Khi lỗi, người dùng bị đẩy về `/dang-nhap`, nên `callbackError` của `LinkedAccounts` (`linked-accounts.tsx:53-59`, `bao-mat/page.tsx:43`) không bao giờ có giá trị. Nhánh R-23 là code chết.
  - Không có code nào sinh `providerAccessToken`/`oauthStateToken` hoặc redirect tới `/bo-sung-email`. Luồng R-19 (Facebook không trả email) không vào được.
  - Endpoint `POST /auth/oauth/callback-check` (docs/API_SPEC.md:50, "Lớp 2" trong identity.service.ts:22-25) không được web gọi ở đâu.
- **Tái hiện:**
  1. Đã có tài khoản mật khẩu `a@x.com`.
  2. Bấm "Tiếp tục với Google" bằng `a@x.com`.
  3. GoTrue báo lỗi DB, callback chuyển về `/dang-nhap?error=oauth` với câu "Đăng nhập với Google/Facebook không thành công". Câu R-20 "Email này đã có tài khoản — hãy đăng nhập bằng phương thức cũ để liên kết" không xuất hiện.
- **Test tạo tự tin giả:** `linked-accounts.test.tsx:113-125` và `:221-229` tự gán `callbackError`/`status=email_exists` bằng tay, nên kiểm tra một trạng thái mà ứng dụng thật không bao giờ tạo ra.
- **Đề xuất sửa:**
  - Callback route đọc `error_code`/`error_description` và chỉ map theo **allowlist** (không phản chiếu nguyên văn):
    - `*AUTO_MERGE_BLOCKED*` hoặc `*EMAIL_COLLISION*` → `/bo-sung-email?status=email_exists` (hoặc một màn AC-04 riêng).
    - `identity_already_exists` hoặc `*ALREADY_LINKED*` → `next` (đã sanitize) kèm `?error=identity_taken`.
    - Facebook không có email → màn bổ sung email.
  - Giữ `next` khi lỗi để luồng liên kết quay lại `/tai-khoan/bao-mat`.
  - Thêm test cho route handler.

### F-02 · MAJOR · đã xác minh: không có link email nào dẫn tới `/dat-lai-mat-khau` hay `/xac-nhan-email?status=…` (task-10)
- **Bằng chứng:**
  - `auth-ext.service.ts:151` gọi `resetPasswordForEmail(input.email)` và `:293` gọi `resend({type:"signup", email})`, cả hai **không truyền `redirectTo`**.
  - `supabase/config.toml:162` đặt `site_url = "http://localhost:3000"`. Template email đều bị comment, thư mục `supabase/templates/` không tồn tại (git ls-files rỗng).
  - Grep web: không chỗ nào xử lý hash `type=recovery` hay `access_token` ở `/`.
  - Link khôi phục vì vậy rơi về trang chủ với `#access_token=…&type=recovery`. `dat-lai-mat-khau/page.tsx:13,26-35` chỉ đọc token nếu người dùng đã đứng ở `/dat-lai-mat-khau`.
  - Không gì tạo `status=success|expired|error` cho `xac-nhan-email/page.tsx:22,42`, nên màn B3 "kết quả link xác nhận" không vào được.
- **Tái hiện:** Quên mật khẩu → mở link trong email → đến `/` thay vì `/dat-lai-mat-khau`; không có form đặt mật khẩu mới. Tương tự với link xác nhận đăng ký.
- **Đề xuất sửa:**
  - API truyền `redirectTo: <WEB_URL>/dat-lai-mat-khau` và `emailRedirectTo: <WEB_URL>/auth/confirm` (hoặc dùng email template có `token_hash`).
  - Web thêm route xác nhận (`verifyOtp`/`token_hash`) để redirect `xac-nhan-email?status=success|expired`.
  - Phần sửa API vượt scope task-10, nên cần ghi task follow-up.

### F-03 · MAJOR · đã xác minh: IP khách không được chuyển tới Nest, nên mọi rate limit "theo IP" thành giới hạn toàn site (task-10)
- **Bằng chứng:**
  - `auth-ext.controller.ts:20-22` ghi rõ "follow-up layer 5 phải truyền IP khách (X-Forwarded-For + trust proxy)".
  - `api/proxy/[...path]/route.ts:12` có `FORWARD_REQUEST_HEADERS` không gồm `x-forwarded-for`.
  - Server action đăng nhập (`dang-nhap/page.tsx:29`) gọi `apiFetch` mà không kèm header IP.
  - Grep `x-forwarded-for|trust proxy` trong `apps/*/src`: 0 kết quả.
  - Hậu quả: `register:ip` thành 5 lượt/giờ cho **cả site**, `login:ip` 10 lượt/phút, `forgot:ip` 10 lượt/giờ, `resend:ip` 20 lượt/giờ. Turnstile cũng nhận sai `remoteip`.
- **Tái hiện:** 6 người khác nhau đăng ký trong 1 giờ thì người thứ 6 nhận `RATE_LIMITED`. 11 lần đăng nhập/phút trên toàn site thì người dùng hợp lệ bị 429. Kẻ tấn công có thể chặn đăng nhập của mọi người chỉ với 10 request/phút.
- **Đề xuất sửa:**
  - Proxy và server action chuyển IP khách (lấy từ `x-forwarded-for` của hop tin cậy, hoặc `request.ip`) qua header riêng.
  - Nest bật `trust proxy` đúng hop.
  - Gắn owner rõ ràng (layer-2 proxy + task-10 server action).

### F-04 · MAJOR · đã xác minh: "Ghi nhớ đăng nhập" bị ghi đè sau lần refresh đầu tiên (task-10, R-15)
- **Bằng chứng:**
  - `dang-nhap/page.tsx:45-56` đặt `maxAge` 30 ngày hoặc cookie phiên chỉ một lần lúc đăng nhập.
  - Khi token refresh (`jwt_expiry=3600`), `proxy.ts:23-25` và `lib/supabase/server.ts:15-16` ghi lại cookie bằng `sessionCookieOptions(options)` với `options` mặc định của `@supabase/ssr`, tức `maxAge: 400*24*60*60` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:10`).
  - Kết quả: bỏ tick "Ghi nhớ" thì sau khoảng 1 giờ cookie thành cookie bền 400 ngày, không "hết khi đóng trình duyệt". Có tick thì thời hạn cookie là 400 ngày. `config.toml:296-302` có `timebox="720h"`, nhưng comment ở đó nói tham số này chỉ có hiệu lực trên gói trả phí.
- **Tái hiện:** Đăng nhập không tick "Ghi nhớ" → chờ quá 1 giờ, tải trang để refresh → kiểm tra cookie `sb-*-auth-token`: đã có `Max-Age=34560000`.
- **Đề xuất sửa:** Lưu lựa chọn remember (ví dụ cookie cờ HttpOnly `fb-remember=0|1`). `sessionCookieOptions` đọc cờ đó để đặt `maxAge` 30 ngày hoặc bỏ `maxAge` ở mọi lần `setAll`.

### F-05 · MAJOR · đã xác minh logic (hành vi Cloudflare: token Turnstile dùng một lần): token CAPTCHA đã dùng không được reset (task-10)
- **Bằng chứng:**
  - Token chỉ được set qua `onSuccess`/`onExpire` và không được xoá hay reset widget sau khi submit lỗi: `login-form.tsx:40,110,208`, `register-form.tsx:44,124,259`, `quen-mat-khau/page.tsx:17,39,117`.
  - API xác minh token **trước** khi kiểm tra disposable email hay mật khẩu (`auth-ext.service.ts:74,113,149`).
  - Vì vậy sau một lỗi bất kỳ (DISPOSABLE_EMAIL, UNAUTHENTICATED sau lần sai thứ 3, RATE_LIMITED), lần gửi lại dùng token cũ và nhận `CAPTCHA_FAILED` cho tới khi token hết hạn (khoảng 300 giây).
- **Tái hiện:** Đăng nhập sai 3 lần để widget hiện → giải CAPTCHA → sai mật khẩu lần 4 → nhập đúng mật khẩu → nhận "Xác minh không thành công" liên tục.
- **Đề xuất sửa:** Sau mỗi response lỗi: `setCaptchaToken(null)` và reset widget (`ref.current?.reset()` của `@marsidev/react-turnstile`). Thêm test cho hành vi này.

### MINOR
- **M-01:** `oauth-buttons.tsx:79` hiện nguyên văn `oauthError.message` của Supabase (tiếng Anh) thay vì thông điệp tiếng Việt.
- **M-02:** `linked-accounts.tsx:137` và `add-password-form.tsx:36`: API trả `CONFLICT` với `details.code` là `LAST_LOGIN_METHOD`/`PASSWORD_ALREADY_SET` (identity.service.ts:91-95,114-118), nhưng web hiện câu chung "Dữ liệu vừa thay đổi…". Ở nhánh race của AC-05 thông điệp này sai nghĩa. Nên map theo `details.code`.
- **M-03:** Gửi `?next=a&next=b` thì Next trả mảng, `sanitizeNext` gọi `.startsWith` trên mảng và ném lỗi khi render `/dang-nhap` (`dang-nhap/page.tsx:19`, `login-form.tsx:50`). Nên chuẩn hoá `Array.isArray`.
- **M-04:** `turnstile-field.tsx:5` có comment "thiếu key thì API tự quyết". Thực tế `turnstile.service.ts:16-19` fail-closed, và `.env.example:10,32` để trống cả hai key, nên đăng ký và quên mật khẩu ở môi trường dev luôn `CAPTCHA_FAILED`. Nên ghi Cloudflare test keys vào `.env.example`/docs.
- **M-05:** `dat-lai-mat-khau/page.tsx:13` nhận `?token=`/`?access_token=` từ query (token có thể lộ qua log/Referer), và token trong hash không được xoá khỏi URL sau khi đọc.
- **M-06:** `login-form.tsx:52-87` có `defaultLogin` gọi `/auth/login` qua proxy, trả `success` mà không đặt phiên, đồng thời nhận token vào JS. Hiện là code chết (page luôn truyền `onLogin`), nên xoá.
- **M-07:** `bao-mat/page.tsx:16` dựng `redirectTo` từ `x-forwarded-host`/`host`. Rủi ro được giảm nhờ allowlist redirect của GoTrue, nhưng nên dùng biến môi trường `NEXT_PUBLIC_SITE_URL`.
- **M-08:** `register-form.tsx:43,245-255` thu checkbox "nhận email ưu đãi" nhưng không gửi lên API (dữ liệu đồng ý bị bỏ). Form cũng không gửi `termsVersion`.
- **M-09:** `register-form.tsx:220-232` có link `target="_blank"` không kèm `rel="noopener noreferrer"`. Link nội bộ nên rủi ro thấp.
- **M-10:** `callback/route.ts:21` có `if (!error)` thừa (code chết).
- **M-11:** `login-form.tsx:144-146` đưa email vào query của link quên mật khẩu (PII trong URL/log). `xac-nhan-email/page.tsx:89-91` hiện email lấy từ query (giả mạo nội dung nhẹ; React đã escape).
- **M-12:** `login-form.tsx:131-135` không có lời nhắc kèm nút "Gửi lại email xác nhận" khi gặp `EMAIL_NOT_CONFIRMED`.
- **M-13:** Test `auth-forms.test.tsx:144-164` "hiển thị Turnstile…" chỉ assert `mockLogin` được gọi, không kiểm CAPTCHA (thiếu site key nên widget luôn trả null). Không có test cho `callback/route.ts`, cho server action đăng nhập/cookie, cho click OAuth, hay cho các ký tự điều khiển trong `sanitizeNext`.
- **M-14 · AI-readable gate:** đếm được 2 indicator, chưa tới ngưỡng FAIL (≥3):
  1. Component vượt `max_function_lines: 50`: `LoginForm` khoảng 200 dòng, `RegisterForm` khoảng 255, `LinkedAccounts` khoảng 220, `ResetPasswordContent` khoảng 185.
  2. Magic number: `30 * 24 * 3600` (`dang-nhap/page.tsx:52`) và `setCountdown(60)` (`resend-confirm-button.tsx:53`).
  
  Mọi file đều ≤ 300 dòng.
- **M-15:** `h1` dùng `text-2xl` thay cho token `text-h2`/`text-h1` (`login-form.tsx:151` và các trang khác). Các token màu đều có trong `globals.css`. Màu hex chỉ xuất hiện ở logo Google/Facebook (chấp nhận được với tài sản thương hiệu).

### Đã xác minh không lỗi
- **`sanitizeNext` (`lib/auth/safe-next.ts:6-10`):** chặn `//evil`, `/\evil`, URL tuyệt đối `https://…`, `javascript:`, chuỗi rỗng/null, ký tự điều khiển (<32, 127, gồm tab/CR/LF). Chuỗi double-encode `%252F%252F` chỉ ra path nội bộ.
- Callback, login (`window.location.href`), OAuth `redirectTo` và proxy đều gọi `sanitizeNext` trước khi redirect.
- Callback **không** phản chiếu `error_description` ra trang (không có XSS hay giả mạo nội dung). Không dùng `dangerouslySetInnerHTML`, không lưu token/mật khẩu vào localStorage, không `console.log`.
- **Luồng liên kết (task-12):** `POST /me/identities/link-intent {provider}` chạy trước. Chỉ khi call này thành công mới gọi server action `linkIdentity`. Lỗi `REAUTH_REQUIRED` thì hiện link đăng nhập lại và return trước khi gọi `linkIdentity` (`linked-accounts.tsx:96-108`). Có test cho nhánh 401 (`linked-accounts.test.tsx:75-89`).
- Web **không** gọi endpoint đã gỡ `POST /me/identities/link`.
- `linkIdentity` chạy phía server (cookie HttpOnly) với `skipBrowserRedirect` và PKCE. Sau callback, trang `bao-mat` mount lại và gọi `GET /me/identities`.
- Đăng xuất phiên khác dùng `signOut({ scope: "others" })` (`bao-mat/page.tsx:33`).
- Quên mật khẩu / bổ sung email dùng thông báo trung tính. Đăng nhập dùng "Email hoặc mật khẩu không đúng". Đăng ký trùng email nhận 202 trung tính từ API.

## Bảng đối chiếu lệnh gọi API (web ↔ API thật)
| Web (file:line) | Method + path | Body web gửi | API thật | Khớp? |
|---|---|---|---|---|
| `dang-nhap/page.tsx:29` (server action) | POST `/auth/login` | `{email,password,captchaToken}` | `auth-ext.controller.ts:44` `loginSchema`, 200 `AuthSessionResponse` | Khớp (nhưng không chuyển IP, xem F-03) |
| `login-form.tsx:59` (`defaultLogin`, code chết) | POST `/auth/login` qua proxy | như trên | như trên | Khớp nhưng không đặt phiên (M-06) |
| `register-form.tsx:62` | POST `/auth/register` | `{email,password,fullName,acceptTerms,captchaToken}` | `:34` `registerSchema` 202 | Khớp (thiếu `termsVersion`, là optional) |
| `resend-confirm-button.tsx:49` | POST `/auth/resend-confirmation` | `{email}` | `:50` 202 | Khớp |
| `quen-mat-khau/page.tsx:35` | POST `/auth/forgot-password` | `{email,captchaToken}` | `:59` 202 | Khớp |
| `dat-lai-mat-khau/page.tsx:63` | POST `/auth/reset-password` | `{accessToken,newPassword}` | `:68` 200 | Khớp (nhưng trang không nhận được token, xem F-02) |
| `linked-accounts.tsx:85` | GET `/me/identities` | — | `identity.controller.ts:25` `IdentityListResponse` | Khớp |
| `linked-accounts.tsx:102` | POST `/me/identities/link-intent` | `{provider}` | `me.controller.ts:42` 204 / 401 `REAUTH_REQUIRED` | Khớp |
| `linked-accounts.tsx:132` | DELETE `/me/identities/:provider` | — | `identity.controller.ts:30` 200; 409 `CONFLICT{code:LAST_LOGIN_METHOD}` | Khớp path; thông điệp lỗi sai nghĩa (M-02) |
| `add-password-form.tsx:33` | POST `/me/password` | `{password}` | `identity.controller.ts:39` 200 | Khớp |
| `bo-sung-email/page.tsx:56` | POST `/auth/oauth/missing-email` | `{provider:"facebook",email,providerAccessToken?,oauthStateToken?}` | `identity.controller.ts:48` 200 | Khớp, nhưng trang không vào được (F-01) |
| Supabase `signInWithOAuth` (`oauth-buttons.tsx:71`) | GoTrue | `redirectTo=/auth/callback?next=` | — | OK |
| Supabase `linkIdentity` (`bao-mat/page.tsx:19`) | GoTrue | — | cần `enable_manual_linking` | OK |
| Supabase `signOut({scope:'others'})` (`bao-mat/page.tsx:33`) | GoTrue | — | — | OK |
| (không gọi) | POST `/auth/oauth/callback-check` | — | `identity.controller.ts:59` | **Không dùng**: lớp phát hiện xung đột thứ 2 không được nối (F-01) |
| (không gọi) | POST `/me/identities/link` (đã gỡ) | — | không tồn tại | Đúng: web không gọi |

## Acceptance criteria

### Task-10
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-02: gửi lại → disabled + đếm ngược 60s, bấm khi đang đếm không gọi API | **Đạt** | `resend-confirm-button.tsx:44,69`; có test |
| AC-03: `ACCOUNT_LOCKED` → báo khoá 15', không lộ thêm | **Đạt** | `login-form.tsx:126-130` |
| Thiếu tick điều khoản → không submit; email trùng → thông báo chung | **Đạt** | nút disabled khi chưa tick; API trả 202 trung tính |
| Đăng nhập thành công về `next` (chỉ path nội bộ) | **Đạt** | `sanitizeNext`. Có lỗi phụ M-03 (`next` dạng mảng) |
| Form a11y: label, aria-invalid, aria-live | **Đạt** | `AuthField` dùng `role=alert`. Riêng ô email ở `xac-nhan-email` không có aria-invalid (chấp nhận) |
| R-15 "Ghi nhớ" 30 ngày / hết khi đóng trình duyệt | **Thiếu** | F-04 |
| Quên/đặt lại mật khẩu, kết quả link xác nhận (B3) | **Thiếu** (không vào được) | F-02 |
| R-07 CAPTCHA (đăng ký, quên mật khẩu, đăng nhập sau 3 lần sai) | **Một phần** | Có widget, nhưng không reset token sau lỗi (F-05) |
| Rate limit / lockout hoạt động đúng theo IP khách | **Thiếu** | F-03 |

### Task-12
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-05: chỉ còn Facebook → huỷ liên kết bị chặn + hướng dẫn | **Đạt** | dialog dựa trên `canUnlink=false`; email không có nút gỡ; lỗi API được xử lý (thông điệp chưa đúng nghĩa, M-02) |
| AC-04: callback trùng email → màn hướng dẫn đăng nhập mật khẩu rồi liên kết | **Thiếu** | Màn có sẵn nhưng không vào được (F-01) |
| Đăng xuất phiên khác gọi `signOut({scope:'others'})` | **Đạt** | |
| Bổ sung email không lộ email tồn tại | **Đạt về UI**, nhưng luồng không vào được | F-01 |
| R-23 báo lỗi khi MXH đã thuộc user khác | **Thiếu** | Nhánh `callbackError` là code chết (F-01) |
| R-20 link-intent → linkIdentity, 401 → không gọi linkIdentity | **Đạt** | |

## Verdict
- **Task-10 (`a65ca4e`): FAIL.** MAJOR: F-01 (phần đăng nhập OAuth), F-02, F-03, F-04, F-05.
- **Task-12 (`11dcd88`): FAIL.** MAJOR: F-01 (AC-04, R-23, R-19 không vào được; test tạo tự tin giả).

Tôi không tìm thấy lỗi CRITICAL: open redirect, XSS và việc gọi `linkIdentity` khi chưa có link-intent đều đã được chặn đúng.
