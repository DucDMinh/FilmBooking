# Design: FilmBooking — Web đặt vé chuỗi rạp (Initial build / MVP)
Date: 2026-11-10
Status: Approved (user, 2026-11-10)
Nguồn: `docs/BRD.md` v0.3 · `SPECIFICATIONS.md` 1.1.0 (R-01…R-134) · `.context/brainstorm-log.md`

## Overview
Website đặt vé cho chuỗi ~5 rạp (dự án demo/học tập): khách chọn khu vực → rạp/phim → suất → ghế (giữ realtime 10') → thanh toán PayOS → vé QR qua email. Quản trị 2 cấp (Admin chuỗi, Cinema Manager), soát vé QR, API khoá ghế cho POS + POS giả lập, huỷ suất/đóng rạp + email hàng loạt.
**Initial build = phạm vi MVP** (121 requirement tag `MVP`). 13 requirement `GĐ2` làm sau qua `/change`.

## Problem Statement
Ba bất biến quyết định kiến trúc:
1. **Không bán trùng ghế** giữa web ↔ web ↔ POS (BR-BKG-04, BR-POS-04, NFR-04).
2. **Cô lập dữ liệu theo rạp** cho Staff/Manager/khoá API POS (§5.3, NFR-05, AC-16, AC-23).
3. **Thanh toán đúng một lần** dù webhook lặp/lỡ/đến muộn (BR-PAY-03..09).

## Approach (đã chọn — user, 2026-11-10)
**Next.js (frontend) + NestJS (backend API) + Supabase**, pnpm monorepo.
- **Next.js** (App Router, TS): chỉ UI. Mọi dữ liệu đi qua REST của Nest (kể cả SSR trang phim/rạp). Phiên đăng nhập nằm trong **cookie HttpOnly** do server Next quản lý (BRD NFR-06; quyết định user 2026-11-11): đăng nhập/OAuth callback/đăng xuất chạy qua Route Handler phía server, lời gọi API từ trình duyệt đi qua **proxy mỏng của Next** (`/api/proxy/*`, gắn Bearer từ cookie) tới Nest. **Realtime sơ đồ ghế** chạy trực tiếp ở client bằng anon key trên kênh công khai (không cần token user).
- **NestJS** (TS): toàn bộ API nghiệp vụ, webhook PayOS, API POS, job endpoints, gửi email. Verify JWT Supabase ở guard; truy cập DB bằng **supabase-js mang JWT của user** → RLS vẫn thực thi theo user/rạp. **Service role** chỉ dùng trong: webhook PayOS, job, API POS (đã xác thực khoá API, cinema_id cố định), tác vụ admin cần vượt RLS có kiểm quyền ở Nest.
- **Postgres function** cho mọi thao tác nguyên tử: giữ/nhả/bán ghế, tính & chốt giá, giữ/hoàn lượt voucher, chuyển trạng thái đơn, xác nhận thanh toán, huỷ suất. Nest không tự viết transaction nhiều bước cho các bất biến trên.
- **Tác vụ nền** (Nest trên Render free sẽ ngủ sau 15'): việc thuần SQL (hết hạn giữ ghế, xoá tài khoản chưa xác nhận 7 ngày) chạy bằng **pg_cron** trong DB; việc cần HTTP (gửi email outbox, đối soát PayOS 5', email nhắc) → **pg_cron + pg_net** gọi `POST /jobs/*` của Nest (header `x-job-secret`, timeout đủ dài để đánh thức service).

Phương án bị loại: monolith Next.js (user đổi sang tách backend Nest); ORM kết nối Postgres trực tiếp (bypass RLS, lệch NFR-05).

## Architecture

```
Browser ─┬─► Next.js (Vercel)  ── REST ──►  NestJS (Render free)
         │     UI, SSR/ISR                    ├ AuthGuard (verify Supabase JWT)
         │                                    ├ CinemaScopeGuard (role + cinema được gán)
         │                                    ├ modules: auth-ext, chain, movie, cinema, booking,
         │                                    │          payment, ticket, promo, checkin, admin, report, pos
         │                                    ├ POST /payos/webhook   (verify checksum)
         │                                    ├ /pos/v1/*             (Bearer API key theo rạp)
         │                                    └ POST /jobs/*          (x-job-secret, gọi từ pg_net)
         │                                            │ supabase-js (JWT user | service role)
         ├─► Supabase Auth (login, OAuth Google/Facebook, linking, Turnstile)
         └─► Supabase Realtime (kênh theo showtime)   ▼
                                              Supabase Postgres
                                                ├ RLS (user / cinema_id được gán)
                                                ├ RPC: hold_seats, release, confirm_sale, confirm_paid,
                                                │      price_quote, apply_voucher, cancel_showtimes …
                                                ├ unique/exclusion constraints
                                                ├ pg_cron (+ pg_net → Nest /jobs)
                                                └ Storage (poster, banner, ảnh rạp, avatar)
External: PayOS · Resend (SMTP Auth + email giao dịch) · OpenStreetMap/Leaflet · Sentry (layer cuối)
```

### Cấu trúc monorepo
```
apps/
  web/        Next.js (app router: (public), (auth), account, booking, admin, staff, pos-sim)
  api/        NestJS (src/modules/<module>, common/guards, common/errors, jobs, payos, mail)
packages/
  shared/     contract dùng chung: DTO/zod schema, mã lỗi, enum trạng thái, database.types.ts (sinh từ Supabase)
supabase/
  migrations/ versioned SQL (nguồn sự thật schema, RLS, RPC, cron)
  seed.sql    5 rạp, phòng, sơ đồ ghế, phim, bảng giá, suất mẫu
  tests/      pgTAP (tuỳ chọn)
pnpm-workspace.yaml · turbo.json (tuỳ chọn)
```

## Components (theo module spec)

| Module | Trách nhiệm (Nest module + DB) | Điểm thiết kế |
|---|---|---|
| AUTH/SOCIAL/PROFILE | Supabase Auth là nguồn đăng nhập; Nest bổ sung: lockout 5 lần/15', rate limit, blocklist email dùng một lần, consent điều khoản, profile, vai trò & rạp được gán | Đăng ký email đi qua Nest (kiểm Turnstile + rate limit + blocklist) rồi gọi Supabase Admin API; OAuth/linking: khởi tạo ở client, hoàn tất (exchange code → cookie HttpOnly) ở Route Handler server |
| CHAIN/MOVIE | CRUD rạp, phim; API công khai cho SSR | Khu vực lưu cookie + profile; định vị chỉ ở client, không lưu toạ độ |
| CINEMA | Phòng, sơ đồ ghế, suất, bảng giá 2 cấp, ngày lễ | Exclusion constraint chống chồng giờ trong phòng; suất có vé → khoá sửa |
| BOOKING | Giữ ghế, đơn, đếm ngược, cảnh báo + consent | RPC `hold_seats` nguyên tử; 1 đơn giữ/khách; ≤ 8 ghế; quy tắc ghế lẻ kiểm trong RPC |
| PAYMENT | PayOS link, webhook, polling, đối soát, tiền về muộn | `payment_events` unique theo mã giao dịch → idempotent |
| TICKET | Mã đặt vé `<MÃRẠP>-XXXXXX`, QR token ngẫu nhiên, email vé, Vé của tôi | QR không chứa PII |
| PROMO | Voucher lõi toàn chuỗi (MVP) | Giữ lượt cùng đơn, hoàn khi hết hạn/huỷ; đếm chống race trong RPC |
| CHECKIN | Quét QR/nhập mã, kết quả màu, log | Kiểm rạp trước khi trả chi tiết ("Sai rạp" chỉ trả tên + địa chỉ rạp) |
| ADMIN | CRUD, gán vai trò/rạp, khoá API POS, huỷ suất, đơn ảnh hưởng, audit | Audit bằng trigger DB chung (before/after, actor, cinema_id) |
| REPORT (MVP) | Doanh thu; theo phim/suất/rạp; đối soát PayOS; báo cáo suất bị huỷ | SQL view/RPC lọc theo rạp được gán |
| POS | `/pos/v1/*` + POS giả lập | Khoá API lưu hash; `requestId` idempotent; log + rate limit theo khoá |

## Data Model (mức ý định — cột cụ thể do migration quyết định)
Entity: `profiles`, `staff_assignments` (user ↔ cinema ↔ role), `cinemas`, `rooms`, `seats` (Thường/VIP/Sweetbox/khoá), `movies`, `showtimes`, `price_rules` (scope chuỗi/rạp/suất), `holidays`, `orders` (kênh WEB/POS, cinema_id, showtime_id, trạng thái, tổng tiền chốt), `order_seats`, `showtime_seat_states` (giữ/bán), `payments` + `payment_events`, `tickets`, `vouchers` + `voucher_redemptions`, `consents`, `checkin_logs`, `pos_api_keys`, `pos_api_logs`, `affected_order_actions`, `email_outbox`, `audit_logs`, `settings` (chuỗi + override rạp), `login_attempts`/rate-limit store.

**Chống bán trùng:** **unique (showtime_id, seat_id)** trên trạng thái ghế đang hiệu lực; giữ/bán chỉ qua RPC trong transaction. Hold quá `expires_at` **được coi là trống** khi đọc và bị thay thế ở RPC kế tiếp; pg_cron dọn mỗi phút. UI tính trạng thái theo `expires_at` → ghế hiện trống ngay khi hết giờ (AC-07, AC-22 ≤ 2s) mà không cần cron theo giây.

**Sweetbox:** 1 seat chiếm 2 ô lưới, giá theo cặp, tính 2 ghế vào giới hạn 8.

## Data Flow — các luồng then chốt
1. **Giữ ghế (web/POS):** Nest → `hold_seats(showtime, seats[], channel, requestId)`: kiểm suất còn bán (web: trước mốc đóng bán online; POS: chưa huỷ/đóng bán) → huỷ đơn giữ cũ của khách (web) → insert hold mọi ghế (trùng ⇒ rollback toàn bộ, trả danh sách ghế trùng) → chốt giá (suất › rạp › chuỗi; loại ngày lễ › cuối tuần T7–CN › thường; khung giờ theo giờ bắt đầu suất, 17:00 thuộc "sau 17h") → trả `expires_at` (web 10' cấu hình được, POS 5'). Realtime phát trên kênh `showtime:<id>`.
2. **Thanh toán:** tóm tắt + consent (lưu bằng chứng) → Nest tạo payment link PayOS (hạn = thời gian giữ còn lại; mô tả có mã rạp + mã đặt vé) → `pending_payment` → webhook: verify checksum → insert `payment_events` (unique) → kiểm số tiền → RPC `confirm_paid`: ghế sold, sinh vé + QR, enqueue email. Return URL chỉ polling trạng thái qua Nest.
3. **Tiền về khi đơn không còn chờ** (#9/#10/#17): áp cho `expired` và `cancelled` (kể cả đơn cũ bị thay): tự chốt **chỉ khi** suất chưa huỷ/đóng bán, chưa qua mốc đóng bán online **và** mọi ghế còn trống; ngược lại → `needs_manual_review` + báo Admin/Manager rạp + email khách. Tạo đơn mới khi đơn cũ `pending_payment` → đơn cũ `cancelled` + huỷ payment link. Huỷ suất → đơn `holding`/`pending_payment` → `cancelled`.
4. **Đối soát:** pg_cron 5' → pg_net → `POST /jobs/reconcile` → truy vấn PayOS các đơn pending quá hạn → đi lại đường `confirm_paid`/tiền về muộn. Webhook lỡ khi Nest đang ngủ/khởi động được job này bù.
5. **POS:** `/pos/v1/*` xác thực Bearer key (hash) → cinema_id cố định → cùng RPC với channel `POS`; `confirm_sale` chỉ cho ghế đang được chính POS đó giữ hợp lệ. **POS giả lập** (#7): trang Staff ở Next → endpoint Nest dành cho Staff → server dùng khoá API của rạp gọi đúng service POS (khoá không ra client).
6. **Huỷ suất/đóng rạp:** preview số đơn → RPC `cancel_showtimes(ids, reason)`: suất `cancelled`, nhả hold, đơn paid (WEB **và** POS) → `affected`, vé vô hiệu check-in; enqueue email cho đơn có email; đơn POS đánh dấu "không có email — liên hệ tại quầy" (#8). Đóng rạp bị chặn nếu còn suất tương lai đã bán chưa huỷ.
7. **Email:** mọi email giao dịch qua `email_outbox` (trạng thái, retry, gửi lại) → job Nest gửi bằng Resend.

## Xác thực phía Nest & hook đăng ký (as-built layer 2)
- **AuthGuard**: verify JWT Supabase bằng `jose` (HS256 + `SUPABASE_JWT_SECRET`, `aud=authenticated`, `iss=<SUPABASE_URL>/auth/v1`); `AuthUser = {id, email, jwt}`. **Không tin `user_metadata`** (user tự sửa được): trạng thái xác nhận email lấy từ `auth.users.email_confirmed_at` qua `AccessService.isEmailConfirmed(req)` (service role, lazy, memo theo request).
- **AccessService** dùng service role để tra `user_roles`/`staff_assignments`/trạng thái email (chỉ đọc, phía server); RolesGuard → CinemaScopeGuard (fail-closed, mọi cinemaId phải thuộc rạp được gán) → throttler.
- **Hook `before_user_created`** (Postgres, `supabase/config.toml`): chỉ cho tạo user có `app_metadata.created_via='nest'` hoặc provider Google/Facebook → signup trực tiếp qua GoTrue bị chặn (bắt buộc đi qua Nest: Turnstile, consent, blocklist). Nest tạo user bằng Admin API `createUser` (không dùng `inviteUserByEmail`/`generateLink(signup)`).
- **Proxy `/api/proxy/*`** (Next): gắn Bearer từ cookie HttpOnly; không phải lớp authz (không session → forward ẩn danh, Nest quyết định).
- Giới hạn đã biết: chỉ HS256 (JWKS chưa hỗ trợ — xem PLAN).

## Phân quyền
- **RLS** (DB): khách chỉ đọc/ghi dữ liệu của mình; Staff/Manager theo `cinema_id ∈ assignments(auth.uid())`; Admin toàn chuỗi.
- **Nest guards** (lớp 2): `AuthGuard` → `RolesGuard` → `CinemaScopeGuard` → rate limit → validate DTO (zod/class-validator) → handler.
- Staff: chỉ đọc đơn rạp mình, **được ghi kết quả xử lý đơn `affected`** (#6). Manager: chỉ thêm/bớt Staff rạp mình (R-105).
- Service role key chỉ ở Nest (env server), không bao giờ ở `apps/web`.

## Error Handling
- Mã lỗi ổn định trong `packages/shared` (vd `SEAT_TAKEN`, `ORPHAN_SEAT`, `SALES_CLOSED`, `HOLD_LIMIT`, `VOUCHER_NOT_APPLICABLE_CINEMA`, `WRONG_CINEMA`) → Nest exception filter trả `{ error: { code, message, details } }` → Next map sang thông điệp tiếng Việt.
- Webhook sai chữ ký → bỏ qua + log cảnh báo. Sai số tiền → không xác nhận, vào báo cáo đối soát.
- Email lỗi → outbox `failed`, có nút gửi lại. Facebook không email nhập email trùng → thông báo chung + mail cho chủ tài khoản (#18).
- Thời gian lưu UTC, hiển thị Asia/Ho_Chi_Minh; tiền VND số nguyên.

## Testing Strategy
- **Unit (Vitest/Jest)**: tính giá, ghế lẻ, mã đặt vé, checksum PayOS, mapping lỗi, guards.
- **Integration trên Supabase local (Docker)**: hold đồng thời web↔web↔POS (AC-06, AC-21), hết hạn (AC-07, AC-22), RLS theo rạp & khách (AC-16, AC-17, AC-23), webhook idempotent/sai chữ ký/tiền về muộn (AC-09..11), huỷ suất (AC-24..26), chồng giờ (AC-14), giá 2 cấp (AC-15). Nest e2e (supertest) cho API + guards.
- **Playwright e2e**: đăng ký→xác nhận→đặt vé→thanh toán (PayOS mock)→vé; soát vé; POS giả lập ↔ web realtime (AC-20).
- PayOS/Resend mock trong test; PayOS thật chỉ ở bản demo (số tiền nhỏ).

## Config & môi trường (đã ghi `.context/project-config.md`)
pnpm monorepo · Supabase CLI migrations (`db_tool: other`, `migration_required: true`) · Web: Vercel · API: Render free · CI: GitHub Actions · branch `staging` (cấm push `main`, không auto-push) · models: builder `sonnet`, reviewer `opus`, spec-validator `haiku`, builder-strong `opus` (chỉ khi yêu cầu rõ).
Secrets (`.env.local` / Vercel / Render env): web — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; api — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `JOB_SECRET`, `SENTRY_DSN`. OAuth Google/Facebook cấu hình trong Supabase.

## Out of Scope (initial build)
13 requirement GĐ2 (combo theo rạp, voucher theo phạm vi rạp, báo cáo đầy đủ/so sánh rạp/CSV báo cáo, dashboard, gợi ý rạp gần nhất, nhắc lịch, `.ics`) + §4.2 BRD và Giai đoạn 3.

## Open Questions
Không còn câu hỏi chặn. Quyết định #1–#19 + kiến trúc ghi ở `.context/brainstorm-log.md` và § "Điểm cần xác nhận" của `SPECIFICATIONS.md` 1.1.0.

## Rủi ro kỹ thuật
- **Render free ngủ sau 15'**: lượt truy cập đầu cold start ~30–60s → SSR trang phim/rạp chậm, lệch NFR-01 (LCP ≤ 2,5s) ở lượt đầu; webhook PayOS có thể tới khi Nest đang khởi động → job đối soát 5' bù. Chấp nhận cho demo; nâng gói Render nếu cần.
- **BRD §10 ghi stack "Next.js + Supabase (Route Handlers/Server Actions)"** — đổi sang Next + Nest là thay đổi ràng buộc kỹ thuật trong intent doc → cần user duyệt tại checkpoint này để cập nhật BRD §10 (chỉ phần công nghệ, không đổi nghiệp vụ).
- Docker Desktop phải chạy cho `supabase start` (test DB local) — kiểm tra trước layer 0.
- Supabase free có thể pause project khi không hoạt động; pg_net cần URL public của Nest.
- Facebook App ở chế độ Development (chỉ tester) — đủ cho demo.
