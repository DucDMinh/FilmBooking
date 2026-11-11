# Dev setup

## Yêu cầu

- Node 22, pnpm 10.
- **Docker Desktop** đang chạy (Supabase local chạy bằng container). Không có Docker thì `pnpm db:*` không chạy được.
- Supabase CLI không cần cài global: gọi qua script `pnpm db:*` (đã chốt ở root `package.json`).

## Lệnh DB (chỉ local)

| Lệnh | Việc |
|---|---|
| `pnpm db:start` | `supabase start` — dựng Postgres/Auth/Storage local, apply migration trong `supabase/migrations/` + `seed.sql` |
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
