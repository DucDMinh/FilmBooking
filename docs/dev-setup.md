# Dev setup

## Yêu cầu

- Node 22, pnpm 10.
- **Docker Desktop** đang chạy (Supabase local chạy bằng container). Không có Docker thì `pnpm db:*` không chạy được.
- Supabase CLI không cần cài global: gọi qua script `pnpm db:*` (đã chốt ở root `package.json`).

## Lệnh DB (chỉ local)

| Lệnh | Việc |
|---|---|
| `pnpm db:start` | `supabase start` — dựng Postgres/Auth/Storage local, apply migration trong `supabase/migrations/` (KHÔNG nạp seed) |
| `pnpm db:seed:demo` | nạp `supabase/seed.sql` vào DB local (chặn host không phải loopback) |
| `pnpm db:stop` | `supabase stop` — tắt stack local |
| `pnpm db:migrate` | `supabase migration up --local` — apply migration mới lên DB local |
| `pnpm db:test` | `supabase test db` — chạy pgTAP trong `supabase/tests/*.test.sql` |
| `pnpm db:types` | sinh `packages/shared/src/database.types.ts` |

Sau `pnpm db:start`, CLI in URL/API key local (Studio `:54323`, API `:54321`, Postgres `:54322`, Mailpit `:54324` — email Auth local hiện ở đây, không gửi thật).

## Điền `.env.local`

1. Copy `.env.local.example` -> `.env.local` (đã được git ignore) và điền các biến app cần: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `JOB_SECRET`, `PAYOS_*`. URL/key local lấy từ output của `pnpm db:start`.
2. `supabase/config.toml` chỉ tham chiếu `env(...)`, không chứa secret. Các biến config.toml đọc (đặt trong `supabase/.env` — đã git ignore — hoặc export vào shell trước `pnpm db:start`):
   - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
   - `SUPABASE_AUTH_EXTERNAL_FACEBOOK_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_FACEBOOK_SECRET`
   - `TURNSTILE_SECRET_KEY` (local dùng secret test Cloudflare `1x0000000000000000000000000000000AA`)
   - `RESEND_API_KEY` (chỉ cần khi bật SMTP; local mặc định dùng Mailpit)

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

- **SMTP**: Authentication -> SMTP, host `smtp.resend.com`, port 465, user `resend`, pass = `RESEND_API_KEY`, sender `CINEMO`.
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
