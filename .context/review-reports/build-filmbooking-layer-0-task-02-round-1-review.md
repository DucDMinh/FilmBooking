Agent: reviewer

# Review — build-filmbooking layer-0 task-02 (round 1)

Task: Supabase init + migration extension + pgTAP smoke + CI GitHub Actions + docs/dev-setup.md
Worktree: `E:\FilmBooking\.worktrees\layer-0__task-02` (branch `wt/layer-0__task-02`, file untracked, chưa commit)

## Review level
STRICT

## Reason
Diff đụng cấu hình Supabase Auth (mật khẩu, xác nhận email, captcha, phiên, OAuth, identity linking), migration DB và CI. Theo AGENTS.md, auth/session/migration là risk đỏ nên bắt buộc STRICT.

## Blast radius
- `supabase/config.toml` [auth.*]: hành vi đăng ký/đăng nhập/xác nhận email/OAuth/phiên của mọi luồng auth ở các layer sau (R-01..R-25). Chỉ áp dụng cho local; staging/prod phải cấu hình bằng tay trên Dashboard theo đúng giá trị này.
- `supabase/migrations/20261111000000_extensions.sql`: nền extension cho mọi migration sau (citext, btree_gist exclusion, pg_cron/pg_net jobs).
- `.github/workflows/ci.yml`: gate CI cho mọi push/PR vào `staging`.
- `docs/dev-setup.md`: hướng dẫn onboarding.

## Verify commands + result
- `cd "/e/FilmBooking/.worktrees/layer-0__task-02" && npx supabase@3.1.0 start` (để sau đó chạy `test db`, `stop`): **Blocked**. Hook `agent-guard` chặn ("reviewer/spec-validator: chỉ được `cd "<worktree>" && <lệnh>` với thư mục trong .worktrees/"). Lệnh đã đúng dạng đó nhưng vẫn bị chặn. Tôi đã dừng, không thử biến thể khác.
- `pnpm -w lint|typecheck|test|build`: skip. Worktree này chưa có root `package.json` (thuộc task-01, chưa merge).
- Kết quả runtime chỉ có từ Builder (`supabase start` PASS, `supabase test db` 7/7 PASS). Reviewer không tự kiểm chứng được, xem Residual risk.

## Responsive Checklist Gate
N/A. Diff không đụng UI (route/component/CSS).

## Skill gates
- aislop: N/A. Không có code TS/JS trong diff (chỉ SQL/TOML/YAML/MD).
- oxlint (anti-slop): N/A. Không có TS/JS.
- ocr (open-code-review): skip, không chạy được vì Bash bị chặn.
- AI-readable: OK. Comment giải thích WHY (lý do bật/tắt captcha, SMTP, email_optional), không có magic number lạ, file ngắn. 0 indicator.
- ai-friendly-web: N/A. Task hạ tầng nội bộ, không public-facing.
- blitzstrike: N/A. Không có môi trường được phép.

## Kiểm theo AC
- AC1 `pnpm db:start` + migration apply + `pnpm db:test` PASS: chỉ có evidence của Builder (residual risk). Đọc tĩnh: migration và smoke test đúng cú pháp; `plan(7)` khớp 7 assertion.
- AC2 config.toml không có secret thật: OK. Mọi secret dùng `env(...)` (Google/Facebook/Turnstile/Resend/Twilio/OpenAI/S3). Chuỗi `1x000…AA` chỉ xuất hiện trong comment/doc, là secret test công khai của Cloudflare.
- AC3 CI: trigger `staging` OK, `--frozen-lockfile` OK, pnpm cache OK, `pnpm -w lint|typecheck|test|build` OK, job db-test OK, `permissions: contents: read` OK, không có deploy, placeholder env không phải secret. **Có lỗi cấu hình pnpm version (F1).**
- AC4 dev-setup.md: có Docker Desktop, lệnh `pnpm db:*`, cách điền `.env.local`, cấm `db push`/`reset` ngoài local. OK, còn 1 nit (F6).
- Migration: chỉ `create extension if not exists`, không DROP/đổi kiểu/backfill → không cần `HIGH_RISK_MIGRATION`. OK.
- R-02: `minimum_password_length = 8` và `password_requirements = "lower_upper_letters_digits"` → OK. Trần ≤72 do bcrypt/GoTrue tự giới hạn.
- R-15: `timebox = "720h"`, `jwt_expiry = 3600`, có refresh rotation → OK.
- R-16: `site_url` + `additional_redirect_urls` → OK nhưng mong manh (F4).
- R-19: Facebook `email_optional = true`, Google `false` → OK.
- Manual linking (R-20/R-21): `enable_manual_linking = true` → OK.
- R-04: **sai thời hạn link** (F2).

## Findings

### [MAJOR] F1 — CI sẽ lỗi khi gộp với task-01: trùng khai báo phiên bản pnpm
`.github/workflows/ci.yml:23-25` và `:50-52` dùng `pnpm/action-setup@v4` với `version: 10`. Trong khi đó root `package.json` của task-01 (`E:\FilmBooking\.worktrees\layer-0__task-01\package.json:5`) khai báo `"packageManager": "pnpm@10.28.0"`. Với action-setup v4, nếu cả hai nguồn cùng có và không khớp chính xác thì action báo lỗi "Multiple versions of pnpm specified". Khi đó cả job `verify` lẫn `db-test` đều fail ngay bước setup, sau khi L0 merge.
**Fix:** bỏ khối `with: version: 10` ở cả hai job để action đọc `packageManager`. Cách khác là ghi đúng `10.28.0`, nhưng cách đó dễ lệch về sau.

### [MAJOR] F2 — R-04: link xác nhận hết hạn sau 1 giờ, spec yêu cầu 24 giờ
`supabase/config.toml:244` đặt `otp_expiry = 3600`. Trong GoTrue, giá trị này (MAILER_OTP_EXP) quyết định thời hạn link xác nhận email, kể cả link sinh qua Admin `generateLink`. R-04 có trong danh sách requirement của task và ghi rõ "hết hạn sau 24 giờ".
**Fix:** đặt `otp_expiry = 86400` (mức tối đa cho phép). Lưu ý giá trị này cũng áp dụng cho link khôi phục mật khẩu (R-10/R-11). Nếu spec muốn link reset ngắn hơn thì Nest phải tự kiểm tra thêm; ghi chú điều đó trong comment.

### [MAJOR] F3 — Tắt captcha + `enable_signup = true` → đăng ký trực tiếp qua GoTrue bỏ qua Turnstile/consent/blocklist, và chưa task nào xử lý
`supabase/config.toml:221` (`[auth.captcha] enabled = false`) cùng `:178` (`enable_signup = true`). Bất kỳ ai có anon key công khai (có sẵn trong bundle web) đều gọi được `POST /auth/v1/signup` và `/auth/v1/recover` trực tiếp. Như vậy bỏ qua được Turnstile của Nest (R-07), consent điều khoản (R-03), blocklist email và rate limit. Lý do Builder đưa ra ("Supabase ép captcha mọi lần đăng nhập") đúng cho login, nhưng không giải quyết lỗ hổng signup/recover. Design doc dòng 37 còn đặt Turnstile trong Supabase Auth, nên lệch thiết kế này chưa được hoà giải. Grep `tasks/build-filmbooking/` không thấy task nào có `before_user_created`/chặn signup trực tiếp.
**Fix (chọn 1, cần ghi quyết định):**
- (a) Bật hook `[auth.hook.before_user_created]` (pg-function) từ chối user provider `email` không do Admin API tạo. Có thể làm ở task auth sau, nhưng phải tạo/gán task cụ thể và ghi tham chiếu vào comment config.toml + task file.
- (b) Giữ captcha Supabase bật và cho web luôn gửi token Turnstile. Cách này trái R-07 với login, nên không khuyến nghị.

Tối thiểu cho round 2: comment trong config.toml nêu rõ rủi ro + tên task sẽ đóng nó, và dispatcher/graph bổ sung task đó. Nếu không có owner thì giữ MAJOR.

### [MINOR] F4 — R-16 redirect allow-list dùng URL chính xác
`supabase/config.toml:165`: GoTrue chấp nhận redirect cùng hostname với `site_url` (localhost) nên `localhost:3000/auth/callback?next=...` vẫn qua. Riêng `127.0.0.1:3000` thì chỉ khớp chính xác, nên nếu có query `?next=` có thể bị rơi về `site_url`.
**Đề xuất:** dùng glob `http://127.0.0.1:3000/**`.

### [MINOR] F5 — R-06: `max_frequency = "1s"`
`supabase/config.toml:240`. Client SDK `auth.resend()` gọi thẳng GoTrue, không qua rate limit của Nest.
**Đề xuất:** đặt `max_frequency = "60s"` làm lớp phòng thủ thứ hai cho R-06.

### [MINOR] F6 — dev-setup.md lệch script thực tế
`docs/dev-setup.md:15` ghi `supabase migration up`, còn script của task-01 là `supabase migration up --local`.
**Fix:** sửa doc thành `--local` để khớp và nhấn mạnh chỉ dùng local.

### [MINOR] F7 — Scope file
`supabase/.gitignore` không nằm trong Files to Create/Modify. File do `supabase init` sinh và có thêm `.env` (đúng mục đích bảo vệ secret), nên chấp nhận được. Cần báo dispatcher khi merge.

## Residual risk
- Reviewer không tự chạy được `supabase start` / `test db` / `stop` (agent-guard chặn). Kết quả runtime 7/7 PASS chỉ dựa vào báo cáo Builder.
- R-20: Supabase tự động liên kết identity cùng email đã xác minh, trái với "không tự gộp". config.toml không tắt được việc này; cần xử lý ở layer auth (hook/Nest). Không chặn task này.
- CI chưa chạy thật trên GitHub (thiếu package.json/lockfile của task-01).
- Staging/prod: config.toml chỉ áp dụng cho local. Các giá trị auth (otp_expiry, password policy, timebox, SMTP, providers) phải được cấu hình tay trên Dashboard; chưa có checklist deploy.

## Verdict
❌ FAIL — 3 MAJOR (F1 CI pnpm version conflict, F2 R-04 otp_expiry, F3 signup bypass chưa có owner). Builder sửa F1, F2; F3 cần quyết định + task owner (hoặc hook). MINOR F4–F7 nên sửa cùng round.
