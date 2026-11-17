# Dev setup

## Yêu cầu

- Node 22, pnpm 10.
- **Docker Desktop** đang chạy (Supabase local chạy bằng container). Không có Docker thì `pnpm db:*` không chạy được.
- Supabase CLI không cần cài global: gọi qua script `pnpm db:*` (đã chốt ở root `package.json`).

## Gửi mail thật (SMTP)

Có hai đường gửi mail, cấu hình riêng:

1. **Mail giao dịch của Nest** (vé, cảnh báo khoá tài khoản, huỷ suất, đặt mật khẩu…): API đọc `email_outbox` rồi gửi qua SMTP (nodemailer) khi job `POST /jobs/send-emails` chạy. Đặt trong `.env.local`: `SMTP_HOST`, `SMTP_PORT` (mặc định 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (tuỳ chọn). Thiếu `SMTP_HOST` thì job ghi `last_error` và retry (không mất mail).
2. **Mail của Supabase Auth** (xác nhận đăng ký, quên mật khẩu): do GoTrue gửi, cấu hình ở `[auth.email.smtp]`.

### Gmail (demo)

1. Bật xác minh 2 bước cho tài khoản Google, tạo **App Password** (Tài khoản Google -> Bảo mật -> Mật khẩu ứng dụng).
2. `.env.local`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<gmail của bạn>`, `SMTP_PASS=<App Password>`.
3. Lưu ý: Gmail **ghi đè from** thành chính tài khoản đăng nhập (bỏ qua `SMTP_FROM`); giới hạn khoảng 500 mail/ngày; chỉ dùng cho demo, **không dùng cho production**.
4. Resend hoặc SES qua SMTP vẫn dùng được, chỉ đổi biến: Resend = `smtp.resend.com` / 465 / user `resend` / pass = API key (`SMTP_FROM` phải thuộc domain đã xác minh).

### Chạy job gửi mail ở local

Local không có cron gọi job, nên mail trong `email_outbox` chỉ đi khi gọi tay (API chạy ở cổng 3001, `JOB_SECRET` lấy từ `.env.local`):

```bash
curl -X POST http://localhost:3001/jobs/send-emails -H "x-job-secret: <JOB_SECRET>"
```

Muốn pg_cron tự gọi mỗi phút, đặt Vault secret `api_base_url` (URL API mà container Postgres truy cập được) và `job_secret` (trùng `JOB_SECRET`). **Chưa đặt thì cron vẫn báo `succeeded` nhưng bỏ qua im lặng mọi lượt, mail không bao giờ rời `email_outbox`.** Local (Docker Desktop), chạy một lần trong psql của container (`docker exec -i supabase_db_filmbooking psql -U postgres`, dán `JOB_SECRET` thay `<JOB_SECRET>`; secret nằm trong Vault, mất khi `supabase db reset`):

```sql
select vault.create_secret('http://host.docker.internal:3001', 'api_base_url');
select vault.create_secret('<JOB_SECRET>', 'job_secret');
```

Kiểm tra sau ~1 phút: `select status_code, content from net._http_response order by created desc limit 1;` phải thấy `200` và `{"processed":…,"sent":…}`. API phải đang chạy ở cổng 3001 với `SMTP_*` (nhớ `pnpm --filter @filmbooking/api build` lại sau khi đổi code).

### SMTP cho Supabase Auth (local)

Mặc định email Auth local rơi vào **Mailpit** `http://127.0.0.1:54324`, không phải hộp thư thật. Muốn gửi thật, sửa khối `[auth.email.smtp]` trong `supabase/config.toml` (để mật khẩu `pass` đọc qua `env(SMTP_PASS)` từ `supabase/.env`, không ghi thẳng vào file; host/user/admin_email điền giá trị literal):

```toml
[auth.email.smtp]
enabled = true
host = "smtp.gmail.com"
port = 465
user = "<gmail của bạn>"
pass = "env(SMTP_PASS)"        # đặt SMTP_PASS=<App Password> trong supabase/.env (git ignore)
admin_email = "<gmail của bạn>"
sender_name = "CINEMO"
```

Rồi `pnpm db:stop && pnpm db:start` để GoTrue nạp lại. Dùng Resend thì `host = "smtp.resend.com"`, `user = "resend"`, `pass` = API key. Không commit thay đổi chứa tài khoản cá nhân của bạn vào `config.toml`.

**Template mail Auth (tiếng Việt, thương hiệu CINEMO):** 6 file HTML nằm ở `supabase/templates/` (`confirmation`, `recovery`, `magic_link`, `email_change`, `invite`, `reauthentication`), được nạp qua các khối `[auth.email.template.<tên>]` trong `supabase/config.toml`. Xem trước mail thật trong Mailpit `http://127.0.0.1:54324`. Sửa template xong chạy `pnpm db:stop && pnpm db:start` để GoTrue nạp lại. Chỉ dùng biến `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}`. Riêng `confirmation` trỏ `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup&amp;next=/` để bấm link là đăng nhập luôn (web gọi `verifyOtp`), nên `site_url` phải đúng domain web (local `http://localhost:3000`); staging/prod dán template này vào Dashboard Supabase và đặt Site URL đúng domain, **không có dấu `/` ở cuối** (nếu có, link thành `//auth/confirm`) (test tĩnh `apps/api/test/auth-email-templates.spec.ts` kiểm tra).

## Lệnh DB (chỉ local)

| Lệnh | Việc |
|---|---|
| `pnpm db:start` | `supabase start` — dựng Postgres/Auth/Storage local, apply migration trong `supabase/migrations/` (KHÔNG nạp seed) |
| `pnpm db:seed:demo` | nạp `supabase/seed.sql` vào DB local (chặn host không phải loopback) |
| `pnpm db:stop` | `supabase stop` — tắt stack local |
| `pnpm db:migrate` | `supabase migration up --local` — apply migration mới lên DB local |
| `pnpm test:int` | integration test API (app Nest thật) <-> Supabase local; tự bỏ qua + cảnh báo nếu stack chưa chạy. Không nằm trong `pnpm test` |
| `pnpm db:test` | `supabase test db` — chạy pgTAP trong `supabase/tests/*.test.sql` |
| `pnpm db:types` | sinh `packages/shared/src/database.types.ts` |

Sau `pnpm db:start`, CLI in URL/API key local (Studio `:54323`, API `:54321`, Postgres `:54322`, Mailpit `:54324` — email Auth local hiện ở đây, không gửi thật).

## Điền `.env.local`

1. Copy `.env.local.example` -> `.env.local` (đã được git ignore) và điền các biến app cần: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `SMTP_*` (xem "Gửi mail thật"), `JOB_SECRET`, `PAYOS_*`. URL/key local lấy từ output của `pnpm db:start`.
2. `supabase/config.toml` chỉ tham chiếu `env(...)`, không chứa secret. Các biến config.toml đọc (đặt trong `supabase/.env` — đã git ignore — hoặc export vào shell trước `pnpm db:start`):
   - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
   - `SUPABASE_AUTH_EXTERNAL_FACEBOOK_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_FACEBOOK_SECRET`
   - `TURNSTILE_SECRET_KEY` (local dùng secret test Cloudflare `1x0000000000000000000000000000000AA`)
   - `SMTP_PASS` (chỉ cần khi bật SMTP cho Auth ở `[auth.email.smtp]`; local mặc định dùng Mailpit)

   Chưa đặt biến nào vẫn chạy được `pnpm db:start` (đã kiểm chứng; CI đặt giá trị giả cho chắc). Đăng nhập Google/Facebook thật cần credential thật.
3. **Không commit** `.env.local`, `supabase/.env` hay bất kỳ secret nào.

## Cấm

- **Cấm `db push` và `db reset` của Supabase CLI ngoài local** (staging/prod). Staging/prod chỉ nhận migration versioned đã test, qua quy trình deploy.
- Không sửa migration đã apply; thay đổi schema = thêm migration mới. Migration phá hoại (`DROP`, đổi kiểu, `SET NOT NULL`, backfill) phải gắn `HIGH_RISK_MIGRATION`.
- Không sync dữ liệu giữa staging và prod.

## CI

`.github/workflows/ci.yml` chạy trên push/PR vào `staging`: job `verify` (install -> lint -> typecheck -> test -> build) và job `db-test` (`pnpm db:start` + `pnpm db:test`).

## Cấu hình staging/prod cần làm tay trên Supabase Dashboard

`config.toml` chỉ áp dụng cho local. Trên project staging/prod phải đặt tay (secret nhập trong Dashboard, không commit):

- **SMTP**: Authentication -> SMTP, host/port/user/pass của nhà cung cấp (Gmail: `smtp.gmail.com` / 465 / Gmail / App Password; Resend qua SMTP: `smtp.resend.com` / 465 / `resend` / API key), sender `CINEMO`.
- **OAuth providers**: bật Google và Facebook, điền client id/secret; Facebook cho phép thiếu email.
- **Email**: bật xác nhận email; `otp_expiry` = 86400 (24h, R-04); độ trễ gửi lại tối thiểu 60s (R-06); mật khẩu tối thiểu 8 ký tự, yêu cầu chữ hoa/thường/số.
- **URL Configuration**: Site URL và danh sách Redirect URLs của domain web staging/prod (dạng wildcard `https://<domain>/**`).
- **Extensions**: bật `pg_cron` (và `pg_net`) trước khi apply migration extensions.
- **Sessions**: timebox 30 ngày chỉ có ở gói trả phí; gói free dựa vào cookie phía web.

## Auth qua Nest (`apps/api/src/modules/auth-ext`)

Đường chuẩn cho email/mật khẩu (đã áp dụng đủ Turnstile R-07, rate limit R-08, khoá 5 lần R-11, chặn disposable R-09):

| Endpoint | Việc | Phản hồi |
|---|---|---|
| `POST /auth/register` | `{email, password, acceptTerms, termsVersion?, fullName?, captchaToken}` | 202 `{status:"CHECK_EMAIL"}` (cả khi email đã tồn tại) |
| `POST /auth/login` | `{email, password, captchaToken?}` (captcha bắt buộc sau 3 lần sai) | 200 session `{accessToken, refreshToken, expiresIn, expiresAt, tokenType, user}`; 401 / 403 `EMAIL_NOT_CONFIRMED` / 423 `ACCOUNT_LOCKED` |
| `POST /auth/resend-confirmation` | `{email}` | 202; 429 `RATE_LIMITED` + `details.retryAfter` (60s, 5 lần/giờ) |
| `POST /auth/forgot-password` | `{email, captchaToken}` | 202 trung tính |
| `POST /auth/reset-password` | `{accessToken, newPassword}` (accessToken = phiên khôi phục từ link email) | 200; 401 `details.reason = RECOVERY_LINK_EXPIRED` nếu link gửi quá 1 giờ |

Ghi chú vận hành:

- User tạo bằng Admin API `createUser` kèm `app_metadata.created_via='nest'` (hook `before_user_created` yêu cầu). Không dùng `inviteUserByEmail` / `generateLink({type:'signup'})`. Tài khoản nhân sự tạo qua `AuthExtService.createStaffAccount` với `email_confirm:true`; không có endpoint công khai nào tạo vai trò nhân sự (R-17).
- Link xác nhận email hiệu lực 24h (`otp_expiry=86400`, R-04). Link đặt lại mật khẩu hiệu lực 1 giờ do Nest kiểm `auth.users.recovery_sent_at` khi `reset-password` (quyết định G5 = C); đặt lại thành công đăng xuất mọi phiên khác (R-13).
- Rate limit IP đọc từ `req.ip`. Qua proxy Next `/api/proxy`, IP thấy được là của server Next nên mọi khách chung một bucket IP. Follow-up layer 5: Route Handler truyền IP khách (`X-Forwarded-For`) và đặt `trust proxy` đúng số hop ở `main.ts`.
- Email cảnh báo khoá tài khoản chỉ được xếp vào `email_outbox` (`kind='ACCOUNT_LOCKED_ALERT'`); job gửi thuộc task khác. Biến `TURNSTILE_SECRET_KEY` bắt buộc cho đăng ký / quên mật khẩu (thiếu = từ chối, fail-closed).

### Rủi ro đã chấp nhận

Quyết định G6 (bản demo): client vẫn gọi thẳng GoTrue bằng anon key được (`signInWithPassword`, `resetPasswordForEmail`/recover), nên đường đó **bỏ qua** lockout, rate limit và Turnstile của Nest. Không thêm biện pháp chặn ở bản demo. Signup trực tiếp đã bị hook `before_user_created` từ chối. Đường chuẩn qua Nest vẫn áp dụng đủ R-07 / R-08 / R-11. Cần xem lại trước khi chạy production thật.

## Integration test (`pnpm test:int`)

- Cần `pnpm db:start` đang chạy. Không chạy thì suite skip kèm cảnh báo `[test:int] Supabase local không chạy`, không fail.
- URL/key lấy từ biến `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` nếu có, không thì từ `pnpm exec supabase status -o env`.
- Harness ở `apps/api/test/integration/`: `helpers/supabase-test.ts` (env, client, chạy N client song song, `cleanupScope`) và `helpers/factories.ts` (user customer/admin/staff qua GoTrue admin API, rạp, phòng+ghế, phim, suất). Không phụ thuộc seed, không reset DB.
- Mỗi lần chạy có prefix riêng (`it_<runId>_`, code rạp `IT<RUNID>`, slug `it-<runId>-`) và tự dọn trong `afterAll`. Nếu test tạo đơn/thanh toán, xoá chúng trước `cleanupScope` (FK không cascade).
- GoTrue local ký token ES256, nên app test cấu hình `SUPABASE_JWKS_URL=<url>/auth/v1/.well-known/jwks.json`.
- Guard: `SUPABASE_URL` phải là loopback (127.0.0.1/localhost/::1), ngoài ra harness throw (không skip) để không ghi nhầm staging/prod. Khi `CI` được đặt, stack không chạy cũng throw thay vì skip.
- `cleanupScope` xoá user theo id factory đã ghi, xoá cả đơn/thanh toán của rạp test, và throw gộp nếu còn sót. Run bị kill giữa chừng để lại dữ liệu `it_*` (chưa có script dọn riêng).
