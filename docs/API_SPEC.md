# API Specification — Overview & Pointers

> ⚠️ **Không nhúng code/schema tay ở đây** — sẽ lệch với code thật.
> File này là **overview + pointer** tới source of truth.

## Source of truth (theo thứ tự ưu tiên)

1. **Code thật** — route/controller/validation trong `source_roots` (xem `.context/project-config.md`).
2. **Shared contract types** — `src/shared/types/api.ts` (client & server cùng import).
3. **Generated inventory** — `docs/generated/` (tạo bằng `check_commands.docs_inventory`; chỉ chạy lại, không sửa tay).
4. **OpenAPI/Swagger** (nếu có) — file do tooling sinh, không sửa tay.

> Nếu overview này khác code → **code thắng**. Cập nhật overview hoặc chạy lại inventory.

## Base URL

```
Development: http://localhost:3000/api
Production:  https://<domain>/api
```

## Authentication

`Authorization: Bearer <JWT>` — chi tiết hardening: `skills/security/jwt-security.md`.

## Response contract (bất biến)

Mọi response đi qua helper chung `ok()` / `fail()` (không viết tay `res.json()`):

```typescript
// Success
{ "success": true, "data": <payload> }

// Error
{ "success": false, "error": "<message>", "details": [...] }
```

## Endpoint overview

> Bảng dưới chỉ liệt kê **nhóm endpoint**; request/response chi tiết lấy từ code + `src/shared/types/api.ts`.

| Nhóm | Ví dụ | Auth | Ghi chú |
|------|-------|------|---------|
| Health | `GET /health` | `@Public()` | Kiểm tra sống còn API |
| Me / Wiring | `GET /me` | JWT (HS256 / JWKS RS256·ES256) | Trả profile, `emailConfirmed`, `roles`, `cinemas` được gán |
| Auth mở rộng | `POST /auth/register`, `POST /auth/login`, `POST /auth/resend-confirmation`, `POST /auth/forgot-password`, `POST /auth/reset-password` | `@Public()` | Turnstile, chặn disposable email, khoá 5 lần sai/15' (`ACCOUNT_LOCKED` 423 + `email_outbox`), cooldown resend 60s (`RATE_LIMITED` 429), hạn link reset 1h (G5=C), không lộ email tồn tại (R-12) |
| Hồ sơ khách (`ProfileModule`) | `GET/PATCH /me/profile`, `POST /me/email`, `POST /me/avatar`, `PUT /me/preferences`, `PUT/DELETE /me/favorites/:cinemaId`, `PUT /me/province`, `DELETE /me` | JWT (`forUser(jwt)` RLS) | SĐT VN / ngày sinh / avatar ≤2MB (422); xoá tài khoản xác thực lại mật khẩu/fresh token, ẩn danh hoá PII, giữ đơn/vé cho kế toán |
| Catalog công khai & Quản trị (`CatalogModule`) | `GET /provinces`, `GET /cinemas`, `GET /cinemas/:code`, `GET /home`, `GET /movies`, `GET /movies/:slug`, `POST/PATCH/DELETE /admin/movies`, `POST/PATCH /admin/cinemas` | Public / Admin / Manager (`@CinemaScope`) | Lọc rạp `OPEN` cho khách (AC-19, R-33); phân loại Đang chiếu / Sắp chiếu (#13); Manager chỉ sửa thông tin rạp mình |
| Vận hành rạp (`CinemaOpsModule`) | `GET/POST/PATCH/DELETE /admin/cinemas/:cinemaId/rooms`, `PUT /admin/rooms/:roomId/seats`, `POST /admin/rooms/:roomId/seats/copy`, `GET/POST/PATCH/DELETE /admin/cinemas/:cinemaId/showtimes`, `POST .../showtimes/bulk`, `POST .../showtimes/:id/close\|open`, `GET/POST/DELETE .../seat-locks`, `GET/PATCH .../settings` | Admin / Manager / Staff (`@CinemaScope`) | Chống trùng lịch chiếu phòng (409 `SHOWTIME_OVERLAP` kèm danh sách suất trùng — AC-14), bảo vệ suất đã bán vé (R-54), chọn cột tường minh cho `showtime_seat_locks` |
| Định danh & Liên kết MXH (`IdentityModule` — Layer 4) | `GET /me/identities`, `POST /me/identities/link-intent`, `DELETE /me/identities/:provider`, `POST /me/password`, `POST /auth/oauth/missing-email`, `POST /auth/oauth/callback-check` | JWT (riêng `POST /auth/oauth/missing-email` là `@Public()`; `callback-check` yêu cầu JWT, chỉ đối chiếu theo user đang đăng nhập — R-12) | Chặn tự gộp OAuth trùng email mật khẩu (AC-04), chặn gỡ phương thức đăng nhập cuối cùng hoặc gỡ `email` (AC-05), thêm mật khẩu lần đầu cho tài khoản OAuth (R-22), chống dò email khi Facebook không trả email (#18). Liên kết MXH (K2, F-2): API KHÔNG tự tạo identity (đã gỡ `POST /me/identities/link`, hàm `link_user_identity`). Luồng: web gọi `POST /me/identities/link-intent` body `{ provider: "google" | "facebook" }` → `204`; yêu cầu đăng nhập gần đây ≤ 5 phút tính theo `max(amr[].timestamp)` của JWT (giữ nguyên qua refresh token; KHÔNG dùng `iat`), thiếu/sai dạng `amr` hoặc quá hạn → `401 REAUTH_REQUIRED`; provider sai → `400`. Intent lưu ở `identity_link_intents`, TTL 10 phút, dùng 1 lần. Sau đó web gọi `supabase.auth.linkIdentity({ provider })` (cần `[auth] enable_manual_linking = true`; bật cả trên dashboard staging/prod), GoTrue xác thực OAuth rồi chèn identity; trigger `guard_identity_insert` chỉ cho chèn identity OAuth vào user đã tồn tại (có identity hoặc có mật khẩu) khi có intent khớp (user, provider), còn hạn, chưa dùng — không có thì 23514 `OAUTH_AUTO_MERGE_BLOCKED` (chặn mọi auto-merge, kể cả user OAuth-only — M-05); R-23 giữ nguyên. Sau callback web gọi lại `GET /me/identities` để refresh. Phần web gọi link-intent thuộc Layer 5. |
| Bảng giá & Ngày lễ (`PricingModule` — Layer 4) | `GET/POST/PATCH/DELETE /admin/pricing/holidays`, `GET/POST/PATCH/DELETE /admin/pricing/rules`, `GET/POST/PATCH/DELETE /admin/cinemas/:cinemaId/pricing/rules`, `GET /showtimes/:showtimeId/price-quote` | Public (`price-quote`) / Admin (`CHAIN` & `holidays`) / Manager (`@CinemaScope` cho `CINEMA`/`SHOWTIME`) | Giá 2 cấp + ưu tiên ngày lễ > cuối tuần > ngày thường (AC-15, R-51..R-53, R-60) |
| Jobs nội bộ (`JobsModule` — Layer 5/6) | `POST /jobs/send-emails`, `POST /jobs/reconcile` | `@Public()` + `JobSecretGuard` (header secret) | Gọi bởi pg_cron/pg_net qua `public.call_nest_job(path)` (URL + secret đọc từ Vault `api_base_url`, `job_secret`; mỗi phút send-emails, mỗi 5 phút reconcile). Reconcile (R-78, R-80, AC-11): payment PENDING 2 phút–24h (≤50) + EXPIRED ≤1h (≤20), hỏi PayOS; PAID → đi lại `handleWebhook` (record_payment_event → confirm_paid, idempotent với webhook); CANCELLED/EXPIRED → `cancel_stale_payment(p_payment_id)`. Trả `{checked, paid, alreadyPaid, needsReview, cancelled, expired, skipped, errors}` |
| Đặt vé (`BookingModule` — Layer 5) | `GET /showtimes/:id/seatmap`, `POST /bookings/holds`, `GET /bookings/:id`, `DELETE /bookings/:id/hold`, `POST /bookings/:id/age-confirm`, `POST /bookings/:id/consent`, `POST|DELETE /bookings/:id/voucher` | `GET seatmap` là `@Public()`; còn lại JWT khách (controller không gắn `@Roles`) | Sơ đồ ghế, giữ/nhả ghế, tóm tắt đơn, xác nhận tuổi, đồng ý điều khoản không huỷ/hoàn, áp/gỡ voucher |
| Thanh toán PayOS (`PaymentModule`) | `POST /bookings/:id/payment`, `GET /bookings/:id/payment-status`, `POST /bookings/:id/payment/cancel`, `POST /payos/webhook` | JWT chủ đơn / `@Public()` (webhook, xác thực checksum HMAC) | Cần consent (409 `CONSENT_REQUIRED`). Body tuỳ chọn `returnUrl`/`cancelUrl`: chỉ nhận path tương đối hoặc URL cùng origin `WEB_ORIGIN` (sai → 400 `VALIDATION_ERROR`); mặc định `/dat-ve/don/{id}/ket-qua` và `/dat-ve/don/{id}/xac-nhan`. Payment cũ được chốt CANCELLED trong DB trước khi huỷ link PayOS; đơn đổi trạng thái trong lúc tạo link → 409 `CONFLICT` và link vừa tạo bị huỷ. Webhook idempotent |
| Soát vé (`CheckinModule`) | `POST /checkin/scan` | `@Roles("STAFF")` + `@CinemaScope()` (Manager/Admin cũng qua) | Quét QR / nhập mã đặt vé theo rạp làm việc |
| Quản trị (`AdminModule`) | Users: `GET /admin/users`, `GET /admin/users/:userId`, `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role`, `PUT|DELETE /admin/users/:userId/roles/admin`. Staff: `GET|POST /admin/cinemas/:cinemaId/staff`, `PATCH|DELETE /admin/cinemas/:cinemaId/staff/:userId`. Settings: `GET /admin/settings[/:key]`, `PUT|PATCH /admin/settings/:key`. Vouchers: `GET|POST /admin/vouchers`, `GET|PATCH|PUT|DELETE /admin/vouchers/:id`. Audit: `GET /admin/audit`, `GET /admin/audit-logs` | Admin; Manager (`@CinemaScope`) chỉ được: `GET|POST` staff, `DELETE` staff/:userId, `GET` settings, `GET` vouchers | Người dùng & vai trò, gán rạp, cấu hình chuỗi, voucher, nhật ký audit |
| Đơn hàng (`OrdersModule`) | `GET /orders`, `GET /orders/:id`, `GET /orders/needs-manual-review`, `POST /orders/:id/resolve-manual-review`; alias `GET /admin/orders`, `GET /admin/orders/:id`, `GET /admin/orders/needs-manual-review`, `POST /admin/orders/:id/resolve-manual-review`, `GET /admin/todo` | Staff/Manager; `needs-manual-review` và `resolve-manual-review`: Manager | Tra cứu đơn theo rạp, đơn cần xử lý thủ công |
| Báo cáo (`ReportModule`) | `GET /reports/{revenue,showtimes,payos-reconciliation,cancelled-showtimes}` và alias `GET /admin/reports/...` | Manager (Admin qua) | Doanh thu, suất chiếu, đối soát PayOS, suất đã huỷ |
| Huỷ suất / đóng rạp / đơn bị ảnh hưởng (`CancellationModule`) | Huỷ suất (Manager + `@CinemaScope`): `POST /cinemas/:cinemaId/showtimes/cancel[/preview]` (alias `/admin/cinemas/:cinemaId/cancel-showtimes[/preview]`, `/showtimes/cancel[/preview]`). Đóng/mở rạp (Admin): `PATCH|POST /admin/cinemas/:cinemaId/status` (alias `/cinemas/:cinemaId/status`). Đơn bị ảnh hưởng (`@Roles("STAFF")`): `GET /admin/affected-orders` (alias `/affected-orders`, `/cinemas/:cinemaId/affected-orders`), `GET .../affected-orders/export` (CSV), `GET /admin/affected-orders/:orderId` (alias `/affected-orders/:orderId`, `/orders/:orderId/affected`), `POST .../:orderId/refund` (422 khi thiếu số tiền hoặc mã GD), `POST .../:orderId/resend-email` | Manager / Admin / Staff theo từng nhóm ở cột trước | Huỷ hàng loạt suất, đóng rạp, danh sách đơn bị ảnh hưởng + CSV, ghi hoàn tiền, gửi lại email. Báo cáo suất đã huỷ nằm ở `ReportModule` |
| Mail (`MailModule`) | — (không có route) | — | Resend + `email_outbox`; worker chạy qua `POST /jobs/send-emails` |
| Web Public Routes (`apps/web` — Layer 4) | `/`, `/phim`, `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`, `/sitemap.xml`, `/robots.txt` | Public SSR / Client | Chọn tỉnh/thành lưu cookie, lọc phim, lịch chiếu 7 ngày (disable suất hết ghế/qua cutoff 15'), bản đồ Leaflet client-only, nút rạp yêu thích, JSON-LD `Movie` & `MovieTheater` chống XSS |

## Chi tiết suất cho quản trị (layer-7 task-03)

`GET /cinemas/:cinemaId/showtimes/:showtimeId` — `@CinemaScope()` + `@Roles("STAFF")` (Admin, Manager, Staff của rạp). Trả `ShowtimeDto` (id, cinemaId, roomId, movieId, startsAt, endsAt, format, languageMode, status, createdAt, updatedAt). Khác `GET /showtimes/:id/seatmap` (công khai), endpoint này KHÔNG lọc theo trạng thái suất (trả cả `CANCELLED`), trạng thái rạp (`TEMP_CLOSED`/`INACTIVE`) hay phim. 404 `NOT_FOUND` khi suất không thuộc rạp trong path; 403 khi ngoài phạm vi rạp.

`cancel_showtimes` (RPC, migration `20261114000000_cancel_showtimes_skip_cancelled`): bỏ qua suất đã `CANCELLED` (không ghi đè `cancel_reason`/`cancelled_by`/`cancelled_at`, không đếm lại); `cancelled_showtimes_count` chỉ tính suất được huỷ ở lần gọi này.

## Error codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request — validation failed |
| 401 | Unauthorized — missing/invalid token |
| 403 | Forbidden — insufficient permissions |
| 404 | Not Found |
| 409 | Conflict — duplicate resource |
| 429 | Too Many Requests — rate limited |
| 500 | Internal Server Error |

## Rate limiting (policy)

- Auth endpoints: 10 req/phút/IP
- API endpoints: 100 req/phút/user

## Webhooks (nếu có)

> Payload shape lấy từ code publisher, không copy tay vào đây.
