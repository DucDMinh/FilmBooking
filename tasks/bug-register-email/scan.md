# Scan: luồng đăng ký tài khoản + gửi email — 2026-11-17

## Phạm vi đã soi
- Đăng ký email/mật khẩu: `RegisterForm` → `POST /auth/register` (Nest `AuthExtService`) → GoTrue Admin `createUser` → email xác nhận (`auth.resend`).
- Sau đăng ký: trang `/xac-nhan-email`, nút gửi lại, banner chưa xác nhận email, link xác nhận → `/auth/callback`.
- Kênh email nghiệp vụ: `email_outbox` → pg_cron/pg_net → `POST /jobs/send-emails` → `MailService` (Resend) + `templates.ts`.
- Các email phát sinh từ luồng tài khoản: xác nhận đăng ký, cảnh báo khoá đăng nhập, `password_set`, `oauth_missing_email_*`, `identity_linked/unlinked`; đối chiếu `forgot/reset password` ở mức link.
- Cấu hình: `supabase/config.toml` (auth/smtp/template), `apps/api/src/config/env.ts`, `.env.example`, `docs/dev-setup.md`.
- Đối chiếu spec: R-03, R-04, R-05, R-06, R-07, R-12, R-21, R-22, R-24 (theo comment trong code và `docs/dev-setup.md`).
- Chế độ READ-ONLY: không chạy server, không gửi mail thật, không đăng ký thử (sẽ ghi vào DB). Không đọc `.env.local`. Không chạy typecheck/lint/test (defect ghi ở đây là lỗi logic/cấu hình, không do build).

## Classification
- Type: SINGLE-SURFACE (một luồng: đăng ký → xác nhận email → email hệ thống). Có chạm cấu hình hạ tầng email.
- Source roots: `apps/web`, `apps/api`, `packages/shared`, `supabase`

## Coverage
- Enumerated surfaces: 20
- Đã soi: 20
- Coverage: 100%

| File | Surface type | Batch | Count | Kết luận |
|---|---|---:|---:|---|
| `apps/web/src/components/auth/register-form.tsx` | component | 1 | 1 | soi, có defect (#6) |
| `apps/web/src/app/(auth)/xac-nhan-email/page.tsx` | page | 1 | 1 | soi, có defect (#1: biến thể success/expired không ai dẫn tới) |
| `apps/web/src/components/auth/resend-confirm-button.tsx` | component | 1 | 0 | soi, no match |
| `apps/web/src/components/shell/unverified-email-banner.tsx` | component | 1 | 0 | soi, no match |
| `apps/web/src/app/auth/callback/route.ts` | route handler | 1 | 1 | soi, có defect (#1) |
| `apps/web/src/app/auth/callback/__tests__/route.test.ts` | test | 1 | 1 | soi, chỉ phủ điều hướng theo vai trò (#1 không có test) |
| `apps/web/src/app/(auth)/dang-nhap/page.tsx` | page | 1 | 0 | soi, no match |
| `apps/web/src/app/(auth)/bo-sung-email/page.tsx` | page | 1 | 1 | soi, liên quan #3 |
| `apps/web/src/components/auth/turnstile-field.tsx` | component | 1 | 1 | soi, có defect (#7) |
| `apps/api/src/modules/auth-ext/auth-ext.service.ts` | service | 2 | 2 | soi, có defect (#8, #9) |
| `apps/api/src/modules/auth-ext/auth-ext.controller.ts` | controller | 2 | 0 | soi, no match |
| `apps/api/src/modules/auth-ext/auth-ext.module.ts` | module | 2 | 1 | soi, liên quan #1 (anon client flow implicit) |
| `apps/api/src/modules/auth-ext/turnstile.service.ts` | service | 2 | 1 | soi, liên quan #7 |
| `apps/api/src/modules/identity/identity.service.ts` | service | 2 | 2 | soi, có defect (#2, #3) |
| `apps/api/src/modules/mail/mail.service.ts` | service | 3 | 1 | soi, có defect (#4) |
| `apps/api/src/modules/mail/templates.ts` | service | 3 | 3 | soi, có defect (#2, #3, #10) |
| `apps/api/src/modules/jobs/jobs.controller.ts` | controller/service | 3 | 1 | soi, có defect (#11) |
| `apps/api/src/config/env.ts` + `.env.example` | config | 3 | 2 | soi, có defect (#4, #5) |
| `supabase/config.toml` + `20261113180000_cron_http_jobs.sql` | config/data | 3 | 2 | soi, có defect (#12); chạm #1 |
| `packages/shared/src/schemas/auth.ts` + `docs/dev-setup.md` | schema/doc | 3 | 0 | soi, no match (doc khớp code, riêng điểm RESEND_FROM_EMAIL ghi ở #4) |

## Chưa soi
- Không có surface nào bỏ sót trong phạm vi (0% còn lại).
- Hành vi runtime chưa quan sát vì read-only: click link trong email thật (Mailpit), tải `/tai-khoan` khi chưa đăng nhập, gọi `/jobs/send-emails`. Các điểm phụ thuộc runtime đã đánh dấu "nghi ngờ" ở #1, #12.
- Không đọc `.env.local` (bị chặn); cấu hình thực tế của `RESEND_API_KEY` / `JOB_SECRET` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` trên máy bạn chưa xác minh.
- Luồng quên/đặt lại mật khẩu và đổi email trong hồ sơ chỉ soi ở mức link/template, chưa soi sâu (ngoài phạm vi "đăng ký").

## CRUD / Capability Matrix

| Module | Sub-resource/API | FE section/table | List | Create UI | Edit UI | Delete UI | Empty CTA | Evidence |
|---|---|---|---|---|---|---|---|---|
| auth | `POST /auth/register` | `/dang-ky` (`RegisterForm`) | Không áp dụng | Có | Không áp dụng | Không áp dụng | Không áp dụng | `register-form.tsx:67` |
| auth | `POST /auth/resend-confirmation` | `/xac-nhan-email`, banner chưa xác nhận | Không áp dụng | Có | Không áp dụng | Không áp dụng | Không áp dụng | `resend-confirm-button.tsx:49`, `unverified-email-banner.tsx:44` |
| auth | `GET /auth/callback` (Next route) | link trong email xác nhận | Không áp dụng | Không áp dụng | Không áp dụng | Không áp dụng | Không áp dụng | `callback/route.ts:118` |
| identity | `POST /auth/oauth/missing-email` | `/bo-sung-email` | Không áp dụng | Có | Không áp dụng | Không áp dụng | Không áp dụng | `bo-sung-email/page.tsx:56` |
| identity | (xác thực token `oauth_missing_email_requests.verification_token`) | không có | Không | **Không có endpoint/route** | Không | Không | Không | `identity.service.ts:209-215`, `templates.ts:466` |
| jobs | `POST /jobs/send-emails` | không có UI (pg_cron) | Không áp dụng | Không áp dụng | Không áp dụng | Không áp dụng | Không áp dụng | `jobs.controller.ts:285` |
| email_outbox | enqueue (`ACCOUNT_LOCKED_ALERT`, `password_set`, `oauth_missing_email_*`, `showtime_cancelled`, trigger `identity_*`) | không có | Không áp dụng | Không áp dụng | Không áp dụng | Không áp dụng | Không áp dụng | `auth-ext.service.ts:219`, `identity.service.ts:135,194,217` |

## Defects

| # | Mô tả | Tái hiện | Expected | Actual | Root cause (file:line) | Severity | File cần sửa | Ước lượng |
|---|-------|----------|----------|--------|------------------------|----------|--------------|-----------|
| 1 | **Bấm link xác nhận email trong thư không đăng nhập được và hiện lỗi "oauth"; màn "Email đã được xác nhận" / "hết hạn" không bao giờ hiện.** **Nghi ngờ cao, chưa quan sát runtime.** | Đăng ký → mở thư (Mailpit `:54324`) → bấm link xác nhận | Vào `/auth/callback`, xác nhận xong thì tới `/xac-nhan-email?status=success` (hoặc vào thẳng tài khoản). Link hết hạn/đã dùng → `status=expired` kèm nút gửi lại | `auth.resend` gọi bằng anon client không dùng PKCE nên GoTrue trả token ở **fragment** (`#access_token=…`); route handler chỉ đọc `code`/`error` ở query → rơi vào `buildRedirectForError("oauth", "/tai-khoan")` → `/tai-khoan?error=oauth`. Email thật ra đã xác nhận ở GoTrue nhưng user không có phiên. Link hết hạn cũng bị phân loại `oauth` thay vì `expired`. `xac-nhan-email` chỉ được dẫn tới từ `register-form.tsx:136` (không có `status`), nên biến thể `success`/`expired`/`error` là mã chết | `auth-ext.service.ts:299-304` (`emailRedirectTo` + anon client), `auth-ext.module.ts:18-20` (supabase-js mặc định implicit), `callback/route.ts:118-147` (không xử lý hash/`otp_expired`, không có nhánh type=signup), `xac-nhan-email/page.tsx:22-77` | high | `callback/route.ts` (+ có thể thêm trang client đọc hash, hoặc gửi bằng PKCE / `verifyOtp` với `token_hash`), `xac-nhan-email/page.tsx`, test callback | M |
| 2 | **Link trong 3 loại email trỏ tới route không tồn tại (404).** `password_set` → `/auth/set-password`; `oauth_missing_email_verify` → `/auth/oauth/verify-email?token=`; `oauth_missing_email_collision` → `/auth/login?redirect=/me/profile` và `/me/profile` | Tạo mail `password_set` (đặt mật khẩu cho tài khoản OAuth) / Facebook thiếu email → mở thư → bấm nút | Nút dẫn tới trang web có thật (`/tai-khoan`, `/dang-nhap`…) | Web chỉ có `/dang-nhap`, `/tai-khoan`, `/auth/callback`; không có `/auth/set-password`, `/auth/oauth/verify-email`, `/auth/login`, `/me/profile` | `templates.ts:355-359` (set-password), `templates.ts:411-412` (login + profile), `templates.ts:464-466` (verify-email); route web: `apps/web/src/app/auth/` chỉ có `callback` và `actions.ts` | high | `templates.ts` (sửa URL), test template | S |
| 3 | **Luồng Facebook thiếu email không thể hoàn tất:** token xác thực được tạo và gửi mail, nhưng **không có endpoint nào tiêu thụ** `verification_token` (không có route web, không có API). Mail xác thực email bổ sung vô dụng | `/bo-sung-email` → nhập email chưa tồn tại → nhận mail → bấm "Xác thực email" | Xác thực token → hoàn tất đăng ký/liên kết Facebook (R-21, #18) | Chỉ có insert `oauth_missing_email_requests` + gửi mail; không có chỗ đọc token; link 404 (#2). User kẹt, không tạo được tài khoản | `identity.service.ts:206-227` (chỉ ghi), controller chỉ có `auth/oauth/missing-email` và `callback-check` (`identity.controller.ts:49,59`); `grep verification_token` không có consumer | high | `identity.service.ts` + controller + web route mới (cần xác nhận phạm vi với spec R-21) | L |
| 4 | **Địa chỉ gửi mail cố định `onboarding@resend.dev`; biến `RESEND_FROM_EMAIL` ở `.env.example` không được code đọc.** Với domain sandbox của Resend, mail chỉ gửi được tới chủ tài khoản Resend, **khách thật không nhận được** vé / cảnh báo khoá / huỷ suất | Deploy staging/prod với `RESEND_API_KEY` thật, đặt vé thanh toán xong | Gửi từ domain đã xác minh, cấu hình qua env | Mọi mail outbox dùng from sandbox; env `RESEND_FROM_EMAIL` bị bỏ qua (đã ghi nhận ở gap register) | `mail.service.ts:24` (`defaultFrom` cứng), `env.ts:42` (không có `RESEND_FROM_EMAIL`), `.env.example:31`, `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md:52` | medium (high nếu chạy thật; dự án demo nên medium) | `mail.service.ts`, `env.ts` | S |
| 5 | **Thiếu cấu hình mail/job ở production vẫn boot được, lỗi chỉ lộ lúc runtime.** `RESEND_API_KEY`, `JOB_SECRET`, `TURNSTILE_SECRET_KEY` đều `optional`, chỉ PayOS bị siết ở production. Hậu quả: thiếu `JOB_SECRET` → cron `/jobs/send-emails` luôn 401; thiếu `RESEND_API_KEY` → mọi email outbox thất bại 3 lần rồi `FAILED`; thiếu `TURNSTILE_SECRET_KEY` → không ai đăng ký được (fail-closed) | Chạy API production thiếu một trong 3 biến | API từ chối khởi động (như PayOS) hoặc cảnh báo rõ lúc boot | Khởi động bình thường, lỗi âm thầm (chỉ log warn / alert `email_failed` sau 3 lần) | `env.ts:20-22` (comment "task sở hữu module siết thành required" nhưng mail/jobs/auth-ext đã tồn tại), `env.ts:57-68` (chỉ PayOS), `job-secret.guard.ts:22`, `mail.service.ts:43` | medium | `env.ts` (+ test env) | S |
| 6 | **Checkbox "Tôi muốn nhận email ưu đãi" không có tác dụng:** giá trị chỉ nằm trong state, không gửi lên API; `registerSchema` không có `marketingOptIn`, tạo profile luôn `marketing_opt_in: false` | Đăng ký, tick "nhận email ưu đãi" → vào `/tai-khoan/thong-bao` | Tuỳ chọn được lưu (hoặc không hiển thị nếu chưa hỗ trợ) | Luôn `false`; user tưởng đã đồng ý nhận ưu đãi | `register-form.tsx:48,258-266` (state không dùng), `register-form.tsx:67-76` (payload không có), `packages/shared/src/schemas/auth.ts:11-19` (thiếu field), `profile.service.ts:148` | medium | `register-form.tsx`, `auth.ts` (shared), `auth-ext.service.ts` (ghi cờ sau tạo user) | S |
| 7 | **Dev/test không có Turnstile thì không đăng ký được, nhưng UI không báo.** Form ẩn widget khi thiếu `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ("dev/test bỏ qua widget"), còn API fail-closed khi không có token → luôn `CAPTCHA_FAILED`. Khi có widget, nút "Tạo tài khoản" vẫn bấm được lúc chưa giải captcha | Chạy local không đặt site key / hoặc bấm Tạo tài khoản ngay khi widget đang tải | Thông báo yêu cầu xác minh, hoặc disable nút tới khi có token | Gửi request không token → 400 `CAPTCHA_FAILED`, hiện "Xác minh CAPTCHA không thành công" mà user không có gì để thao tác; comment ở `turnstile-field.tsx:6` trái với hành vi API | `turnstile-field.tsx:6,16`, `turnstile.service.ts:16`, `auth-ext.service.ts:76`, `register-form.tsx:278` (disabled chỉ theo `acceptTerms`/`loading`) | low | `register-form.tsx` (disable khi có site key mà chưa có token), sửa comment | S |
| 8 | **Đăng ký lại với email đã tồn tại nhưng chưa xác nhận: không gửi lại mail, mật khẩu mới bị bỏ qua.** Người quên mail xác nhận bấm "Tạo tài khoản" lần nữa được trả "Kiểm tra hộp thư" nhưng không có mail mới | Đăng ký email A (không xác nhận) → đăng ký lại email A với mật khẩu khác | Với user chưa xác nhận: gửi lại xác nhận (R-12 vẫn trung tính) | Trả `CHECK_EMAIL` ngay, không tạo user, không `sendConfirmation`; mật khẩu cũ vẫn có hiệu lực. Chỉ cứu được nếu user bấm "Gửi lại" ở trang kế tiếp | `auth-ext.service.ts:94-99` | low | `auth-ext.service.ts` | S |
| 9 | **Gửi email xác nhận lỗi vẫn báo thành công** (SMTP chưa cấu hình, vượt `email_sent`, `max_frequency`): lỗi GoTrue chỉ `logger.warn`, API trả `CHECK_EMAIL`, nút "Gửi lại" còn tiêu hao cooldown 60s. User không nhận được mail, không có tín hiệu, chỉ ngồi chờ | Staging chưa cấu hình SMTP trong Supabase Dashboard (mặc định SMTP chung giới hạn rất thấp) rồi đăng ký | Có alert/giám sát khi gửi xác nhận thất bại (vẫn trả trung tính cho client) | Chỉ có `warn` trong log, không `reportAlert` như outbox | `auth-ext.service.ts:297-307`, so với `jobs.controller.ts:254-259` | low | `auth-ext.service.ts` (gọi `reportAlert`) | S |
| 10 | **Email xác nhận đăng ký / đặt lại mật khẩu dùng template mặc định (tiếng Anh, thương hiệu Supabase) và không có template tiếng Việt.** Template tuỳ biến bị comment; templates tiếng Việt trong `templates.ts` chỉ phủ email outbox | Đăng ký → xem thư trong Mailpit | Thư xác nhận tiếng Việt, đúng thương hiệu CINEMO (sender_name đã đặt `CINEMO`) | Nội dung mặc định "Confirm your signup" | `supabase/config.toml:268-270` (template bị comment), `config.toml:259-266` | low | `supabase/config.toml` + file template `supabase/templates/*.html` | S |
| 11 | **RPC `claim_email_outbox_batch` không tồn tại trong migration** nhưng `JobsService` luôn gọi trước, bắt lỗi rồi dùng fallback. Mỗi phút tạo 1 lỗi RPC thừa; cơ chế "SKIP LOCKED" ghi trong comment không có, chỉ có claim thủ công 2 bước (đủ cho 1 instance, race nếu chạy ≥ 2) | Chạy cron mỗi phút; xem log PostgREST (`PGRST202`) | RPC tồn tại hoặc bỏ lời gọi | `grep claim_email_outbox` chỉ có `jobs.controller.ts` và test e2e, không có `supabase/migrations/*` | `jobs.controller.ts:134-137,144-159` | low | `jobs.controller.ts` (bỏ RPC) hoặc thêm migration | S |
| 12 | **Chạy local, email outbox không bao giờ được gửi nếu chưa nạp Vault secret** (`api_base_url`, `job_secret`) — `call_nest_job` chỉ `raise warning` rồi bỏ qua; vé/cảnh báo kẹt ở `PENDING`. Dev setup chỉ nhắc `JOB_SECRET`, không nhắc bước Vault và không nêu cách API (host) được DB container gọi tới. **Nghi ngờ, chưa quan sát runtime.** | `pnpm db:start`, đặt vé xong, kiểm `email_outbox.status` | Có hướng dẫn / script để dev gọi job (hoặc lệnh `curl` thủ công) | Hàng đợi `PENDING` mãi | `20261113180000_cron_http_jobs.sql:29-35`, `docs/dev-setup.md` (không có mục Vault) | low | `docs/dev-setup.md` | S |

## Chưa xác minh / cần thêm info
- **#1 cần runtime để chốt**: bấm link xác nhận thật từ Mailpit và quan sát URL cuối. Nếu `GOTRUE` trả `?code=` (PKCE) thì #1 giảm xuống phần "link hết hạn bị phân loại `oauth`" và "màn success/expired mã chết".
- #1 phụ thuộc cả trang `/tai-khoan` khi chưa đăng nhập: chưa đọc `tai-khoan/layout.tsx` xem có chuyển sang `/dang-nhap` không (không thấy `redirect(` ở layout, có thể xử lý ở nơi khác — `[cần xác nhận]`).
- #4/#5 phụ thuộc môi trường chạy thật; dự án là bản demo nên mức độ có thể hạ.
- `.env.local` không được đọc: không biết máy bạn đã đặt `RESEND_API_KEY`, `JOB_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` hay chưa (liên quan #5, #7, #12).
- Không có unit test cho `templates.ts` nên #2 không bị bắt tự động (đã `git ls-files` không thấy file test cho templates/mail).
- Phần tốt đã xác nhận: R-12 (trả trung tính khi email tồn tại), rate limit IP/email, Turnstile fail-closed, chặn disposable email, ghi consent kèm rollback, escape HTML trong template, retry/backoff tối đa 3 lần + `reportAlert` khi `FAILED`, cooldown gửi lại 60s đúng spec R-06.
- Gợi ý nhóm xử lý nếu bạn chọn: **#2 + #3** (cùng vùng email Facebook/password_set, cùng sửa `templates.ts`; #3 cần thêm endpoint, L); **#1** độc lập (callback); **#4 + #5** (cấu hình mail, S); **#6** độc lập (S).
