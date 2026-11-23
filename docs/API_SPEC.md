# API Specification (as-built)

> Tài liệu **as-built** của `apps/api` (NestJS). Nguồn sự thật là controller trong `apps/api/src/modules/**` và `apps/api/src/health`; nếu doc lệch code thì **code thắng**.
> Kiểm tra tự động: `node scripts/check-api-routes.mjs` (so mọi route `@Get/@Post/@Put/@Patch/@Delete` trong controller với các code span `` `METHOD /path` `` ở file này; `--list` in route + guard rút từ decorator). Mỗi route phải xuất hiện đúng dạng `` `METHOD /path` `` ở bảng dưới.
> Kiểu dữ liệu request/response: `packages/shared/src` (zod schema + `ERROR_CODES`).

## Quy ước chung

- **Base URL**: `http://localhost:3001` (dev, `PORT` mặc định 3001). **Không có global prefix** (`/api` không tồn tại ở Nest). Web gọi Nest qua proxy Next `/api/proxy/[...path]` (cùng origin); production dùng `API_URL`/`NEXT_PUBLIC_API_URL`.
- **CORS**: chỉ origin trong `WEB_ORIGIN` (danh sách phân tách bằng dấu phẩy), không credentials. `helmet()` bật.
- **Xác thực**: `Authorization: Bearer <JWT Supabase>`; xác thực HS256 (`SUPABASE_JWT_SECRET`) hoặc JWKS RS256/ES256 (`SUPABASE_JWKS_URL`). Route không gắn `@Public()` đều yêu cầu JWT (`AuthGuard` global). Thiếu/sai token -> 401 `UNAUTHENTICATED`.
- **Thứ tự guard global**: `AuthGuard` -> `RolesGuard` -> `CinemaScopeGuard` -> `ThrottlerGuard` (100 req/phút/IP, vượt -> 429 `RATE_LIMITED`).
- **Vai trò** (`@Roles`): bậc `STAFF < MANAGER < ADMIN`. `Roles(STAFF)` cho Staff/Manager/Admin; `Roles(MANAGER)` cho Manager/Admin; `Roles(ADMIN)` chỉ Admin (vai trò Admin toàn chuỗi, `user_roles`). Staff/Manager gán theo rạp (`staff_assignments`). `CinemaScope` kiểm quyền với `cinemaId` lấy từ path/body/query; ngoài phạm vi -> 403 (`FORBIDDEN_CINEMA`).
- **Response thành công**: trả thẳng payload JSON (không bọc `{success,data}`); `204` cho thao tác không trả nội dung.
- **Response lỗi** (mọi lỗi qua `AllExceptionsFilter`): `{ "error": { "code": "<ERROR_CODE>", "message": "...", "details": { } } }`. Lỗi 5xx che chi tiết nội bộ (`INTERNAL_ERROR`).
- Nhiều nhóm có **alias route** (cùng handler); mỗi alias liệt kê riêng bên dưới.
- **Đã gỡ POS** (CR remove-pos, spec 2.0.0): không còn POS API / API key / endpoint `/pos/*`; kênh đơn duy nhất là `WEB` (`hold_seats` từ chối kênh khác -> `INVALID_CHANNEL`). Spec 3.0.0: huỷ suất **không** còn đổi suất; khách liên hệ CSKH, nhân sự chỉ ghi hoàn tiền thủ công / gửi lại email.

## Mã lỗi (`packages/shared/src/errors.ts`)

| HTTP | Code |
|---|---|
| 400 | `VALIDATION_ERROR`, `CAPTCHA_FAILED` |
| 401 | `UNAUTHENTICATED`, `REAUTH_REQUIRED`, `PAYMENT_SIGNATURE_INVALID`, `JOB_SECRET_INVALID` |
| 403 | `FORBIDDEN`, `FORBIDDEN_CINEMA`, `EMAIL_NOT_CONFIRMED`, `AGE_RESTRICTED` |
| 404 | `NOT_FOUND`, `VOUCHER_NOT_FOUND`, `TICKET_NOT_FOUND` |
| 409 | `CONFLICT`, `SEAT_TAKEN`, `SALES_CLOSED`, `HOLD_EXISTS`, `SHOWTIME_CANCELLED`, `SHOWTIME_NOT_OPEN`, `CINEMA_NOT_OPEN`, `MOVIE_NOT_PUBLISHED`, `CONSENT_REQUIRED`, `CONSENT_VERSION_INVALID`, `WRONG_CINEMA`, `TICKET_USED`, `TICKET_NOT_PAID`, `CHECKIN_OUTSIDE_WINDOW` |
| 410 | `HOLD_EXPIRED` |
| 422 | `DISPOSABLE_EMAIL`, `ORPHAN_SEAT`, `HOLD_LIMIT`, `DOB_REQUIRED`, `SEAT_REQUIRED`, `DUPLICATE_SEATS`, `INVALID_SEATS`, `VOUCHER_EXPIRED`, `VOUCHER_EXHAUSTED`, `VOUCHER_MIN_ORDER`, `VOUCHER_NOT_APPLICABLE_SHOWTIME`, `VOUCHER_NOT_APPLICABLE_CINEMA`, `PAYMENT_AMOUNT_MISMATCH` (một số route nghiệp vụ cũng trả 422 cho dữ liệu sai: giá/ghi hoàn tiền thiếu trường) |
| 423 | `ACCOUNT_LOCKED` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |

Lỗi HTTP "trần" (Nest/Express) được map: 400->`VALIDATION_ERROR`, 401, 403, 404, 409, 429; 4xx khác -> `VALIDATION_ERROR`.

## Route (145 route, 23 file controller)

Cột Guard: `Public` = không cần JWT; `JWT` = chỉ cần đăng nhập; `Roles(...)` = vai trò tối thiểu; `+Scope` = có `@CinemaScope()`.

### Health

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /health` | Public | `{status:"ok"}` |

### Auth mở rộng (`AuthExtModule`, `@Public` cả controller)

| Route | Guard | Ghi chú |
|---|---|---|
| `POST /auth/register` | Public | 202 `{status:"CHECK_EMAIL"}` (cả khi email tồn tại); Turnstile, chặn disposable (422), tạo user `created_via='nest'` |
| `POST /auth/login` | Public | 200 session; 401 sai thông tin, 403 `EMAIL_NOT_CONFIRMED`, 423 `ACCOUNT_LOCKED` (5 lần sai/15') |
| `POST /auth/resend-confirmation` | Public | 202; 429 `RATE_LIMITED` (cooldown 60s) |
| `POST /auth/forgot-password` | Public | 202 trung tính (không lộ email) |
| `POST /auth/reset-password` | Public | 200; 401 nếu link khôi phục > 1 giờ |

### Tài khoản `/me`, hồ sơ, định danh

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /me` | JWT | `{id,email,emailConfirmed,isAdmin,cinemas:[{cinemaId,role}]}` |
| `POST /me/identities/link-intent` | JWT | 204; body `{provider:"google"\|"facebook"}`; cần đăng nhập gần đây <= 5' (`amr`), quá hạn -> 401 `REAUTH_REQUIRED`; intent TTL 10', dùng 1 lần |
| `GET /me/profile` | JWT | Hồ sơ khách |
| `PATCH /me/profile` | JWT | SĐT VN / ngày sinh hợp lệ (422 nếu sai) |
| `POST /me/email` | JWT | Đổi email |
| `POST /me/avatar` | JWT | Avatar <= 2MB (422) |
| `PUT /me/preferences` | JWT | Tuỳ chọn thông báo |
| `PUT /me/favorites/:cinemaId` | JWT | Thêm rạp yêu thích |
| `DELETE /me/favorites/:cinemaId` | JWT | Bỏ rạp yêu thích |
| `PUT /me/province` | JWT | Tỉnh/thành ưa thích |
| `DELETE /me` | JWT | Xoá tài khoản (xác thực lại, ẩn danh hoá PII, giữ đơn/vé cho kế toán). 409 `CONFLICT` nếu người gọi là Admin hoạt động cuối cùng của chuỗi (kiểm trước mọi thay đổi dữ liệu; DB `FB409` là hàng rào cuối, race cũng ra 409) |
| `GET /me/identities` | JWT | Danh sách phương thức đăng nhập |
| `DELETE /me/identities/:provider` | JWT | Gỡ MXH; chặn gỡ phương thức đăng nhập cuối / `email`; 409 `LAST_ADMIN` khi Admin hoạt động cuối cùng chưa xác nhận email gỡ Facebook (trigger DB `FB409`) |
| `POST /me/password` | JWT | Đặt mật khẩu lần đầu cho tài khoản OAuth (200) |
| `POST /auth/oauth/missing-email` | Public | Facebook không trả email (200, trung tính) |
| `POST /auth/oauth/callback-check` | JWT | Đối chiếu trùng email theo user đang đăng nhập (200) |

Liên kết MXH: API không tự tạo identity; web gọi link-intent rồi `supabase.auth.linkIdentity`; trigger `guard_identity_insert` chặn auto-merge (`OAUTH_AUTO_MERGE_BLOCKED`, SQLSTATE 23514) nếu không có intent hợp lệ.

### Catalog công khai & quản trị phim/rạp (`CatalogModule`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /provinces` | Public | |
| `GET /cinemas` | Public | Chỉ rạp `OPEN` cho khách (`CinemaDto` có thêm `scheduledStatus`, `scheduledEffectiveAt`, nullable, và `effectiveOnlineCutoffMinutes` (mốc đóng bán online hiệu lực, phút trước giờ chiếu: mốc riêng của rạp, hoặc mặc định chuỗi `app_settings.default_online_cutoff_minutes`, hoặc 15 nếu thiếu; R-56, R-67)) |
| `GET /cinemas/:code` | Public | Theo mã rạp. **200 cho mọi rạp tồn tại** kèm `cinema.status` (R-137); rạp không `OPEN` -> `rooms: []`, `showtimes: []`; mã không tồn tại -> 404. `cinema` có `scheduledStatus`/`scheduledEffectiveAt` (lịch đổi trạng thái đang chờ, R-136; `null` khi không có) cho banner trang rạp; `cinema.effectiveOnlineCutoffMinutes` như `GET /cinemas`. Tra rạp bằng client anon (policy `cinemas_select` cho đọc mọi rạp), chỉ chọn cột công khai |
| `GET /home` | Public | Banner + phim đang/sắp chiếu |
| `GET /movies` | Public | Lọc/tìm phim `PUBLISHED` |
| `GET /movies/:slug` | Public | Lịch theo rạp `schedule[].cinema` gồm `code`, `name`, `effectiveOnlineCutoffMinutes` (cùng ý nghĩa như `CinemaDto`) |
| `GET /admin/movies` | Roles(ADMIN) | |
| `POST /admin/movies` | Roles(ADMIN) | |
| `PATCH /admin/movies/:id` | Roles(ADMIN) | |
| `DELETE /admin/movies/:id` | Roles(ADMIN) | 204 |
| `GET /admin/cinemas` | Roles(MANAGER) | Admin: tất cả; Manager: rạp mình; kèm `roomCount` |
| `GET /admin/cinemas/:cinemaId` | Roles(MANAGER)+Scope | |
| `POST /admin/cinemas` | Roles(ADMIN) | |
| `PATCH /admin/cinemas/:cinemaId` | Roles(MANAGER)+Scope | Manager chỉ sửa cột cho phép (trigger `cinemas_guard_manager_columns`). **`status` khác trạng thái hiện tại -> 400 `VALIDATION_ERROR`** (đổi trạng thái chỉ qua `/status`, hiệu lực sau 7 ngày); `status` bằng hiện tại bị bỏ qua. `authenticated` không còn quyền cột `status`/`scheduled_*` ở DB |
| `POST /admin/uploads` | Roles(MANAGER) | Body `{bucket: posters\|banners\|cinema-images, cinemaId?, contentType: image/jpeg\|png\|webp, sizeBytes <= 5MB}` -> `{path,token,signedUrl,publicUrl}`; posters/banners chỉ Admin, cinema-images Admin hoặc Manager của rạp; client `PUT` file lên `signedUrl` |

### Vận hành rạp: phòng, ghế, suất, khoá ghế, cấu hình rạp (`CinemaOpsModule`, `@CinemaScope`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /cinemas/:cinemaId/rooms` | Roles(STAFF)+Scope | |
| `POST /cinemas/:cinemaId/rooms` | Roles(MANAGER)+Scope | |
| `PATCH /cinemas/:cinemaId/rooms/:roomId` | Roles(MANAGER)+Scope | |
| `DELETE /cinemas/:cinemaId/rooms/:roomId` | Roles(MANAGER)+Scope | 204 |
| `GET /cinemas/:cinemaId/rooms/:roomId/seats` | Roles(STAFF)+Scope | Sơ đồ ghế |
| `PUT /cinemas/:cinemaId/rooms/:roomId/seats` | Roles(MANAGER)+Scope | Thay toàn bộ sơ đồ |
| `POST /cinemas/:cinemaId/rooms/:roomId/seats/copy` | Roles(MANAGER)+Scope | Sao chép sơ đồ phòng khác |
| `POST /showtimes/bulk` | Roles(MANAGER) | Tạo hàng loạt; body `{movieId, format, languageMode?, dates[], times[], targets:[{cinemaId, roomIds[]}] (nhiều rạp, tối đa 50 target), skipConflicts?}`; phạm vi rạp kiểm ở service từng target |
| `GET /cinemas/:cinemaId/showtimes` | Roles(STAFF)+Scope | |
| `GET /cinemas/:cinemaId/showtimes/:showtimeId` | Roles(STAFF)+Scope | `ShowtimeDto`; không lọc trạng thái (trả cả `CANCELLED`); 404 nếu suất không thuộc rạp |
| `POST /cinemas/:cinemaId/showtimes` | Roles(MANAGER)+Scope | 409 `CONFLICT` với `details.reason = "SHOWTIME_OVERLAP"` kèm `details.conflicts` (danh sách suất trùng) |
| `PATCH /cinemas/:cinemaId/showtimes/:showtimeId` | Roles(MANAGER)+Scope | Chặn sửa suất đã bán vé (R-54) |
| `DELETE /cinemas/:cinemaId/showtimes/:showtimeId` | Roles(MANAGER)+Scope | 204; chặn xoá suất đã bán |
| `POST /cinemas/:cinemaId/showtimes/:showtimeId/close` | Roles(MANAGER)+Scope | 200, đóng bán (`CLOSED`) |
| `POST /cinemas/:cinemaId/showtimes/:showtimeId/reopen` | Roles(MANAGER)+Scope | 200, mở bán lại |
| `GET /cinemas/:cinemaId/showtimes/:showtimeId/locks` | Roles(STAFF)+Scope | Khoá ghế theo suất |
| `POST /cinemas/:cinemaId/showtimes/:showtimeId/locks` | Roles(MANAGER)+Scope | |
| `DELETE /cinemas/:cinemaId/showtimes/:showtimeId/locks/:seatId` | Roles(MANAGER)+Scope | 204 |
| `GET /cinemas/:cinemaId/settings` | Roles(STAFF)+Scope | Cấu hình rạp (dọn phòng, cutoff bán online) |
| `PATCH /cinemas/:cinemaId/settings` | Roles(MANAGER)+Scope | |

### Bảng giá & ngày lễ (`PricingModule`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /holidays` | Public | |
| `POST /holidays` | Roles(ADMIN) | |
| `DELETE /holidays/:date` | Roles(ADMIN) | `date` dạng `YYYY-MM-DD` |
| `GET /price-rules` | Roles(STAFF) | Query lọc theo scope/rạp |
| `POST /price-rules` | Roles(MANAGER) | 422 khi dữ liệu sai; scope `CHAIN` chỉ Admin, `CINEMA`/`SHOWTIME` Manager rạp đó (kiểm ở service) |
| `PATCH /price-rules/:id` | Roles(MANAGER) | |
| `DELETE /price-rules/:id` | Roles(MANAGER) | |
| `GET /showtimes/:showtimeId/prices` | Public | Bảng giá theo loại ghế của suất (AC-15) |
| `POST /showtimes/:showtimeId/price-quote` | Public | 200; báo giá cho danh sách ghế |

### Đặt vé & giữ ghế (`BookingModule`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /showtimes/:id/seatmap` | Public | Sơ đồ + trạng thái ghế (HELD/SOLD, không lộ user) |
| `POST /bookings/holds` | JWT | Giữ ghế (RPC `hold_seats`, TTL `seat_hold_minutes_web`, mặc định 10'); 409 `SEAT_TAKEN`/`HOLD_EXISTS`/`SALES_CLOSED`/`SHOWTIME_*`; 422 `HOLD_LIMIT`/`ORPHAN_SEAT`/`DOB_REQUIRED` (chưa có ngày sinh khi đặt phim giới hạn tuổi)/`SEAT_REQUIRED`/`DUPLICATE_SEATS`/`INVALID_SEATS`; 403 `AGE_RESTRICTED`. `VALIDATION_ERROR` chỉ còn cho lỗi biểu mẫu (body sai schema) |
| `GET /bookings/:id` | JWT chủ đơn; Admin / nhân sự của rạp đó cũng đọc được | Tóm tắt đơn; không ném lỗi khi hết hạn giữ: trả 200 kèm `expiresInSeconds: 0` (`HOLD_EXPIRED` 410 chỉ ở các route ghi: nhả ghế, age-confirm, consent, voucher, thanh toán); người khác -> 403 |
| `DELETE /bookings/:id/hold` | JWT chủ đơn | Nhả ghế |
| `POST /bookings/:id/age-confirm` | JWT chủ đơn | Xác nhận độ tuổi |
| `POST /bookings/:id/consent` | JWT chủ đơn | Đồng ý điều khoản không huỷ/hoàn; phiên bản điều khoản lạ -> 409 `CONSENT_VERSION_INVALID` |
| `POST /bookings/:id/voucher` | JWT chủ đơn | Áp voucher; lỗi `VOUCHER_*` (404/422); mã lỗi RPC chưa ánh xạ hoặc lỗi RPC không mong đợi -> 500 `INTERNAL_ERROR` (không còn `VALIDATION_ERROR`); giới hạn 10 lần/phút/khách (R-95) |
| `DELETE /bookings/:id/voucher` | JWT chủ đơn | Gỡ voucher |

### Thanh toán PayOS (`PaymentModule`)

| Route | Guard | Ghi chú |
|---|---|---|
| `POST /bookings/:id/payment` | JWT chủ đơn | 200; cần consent (409 `CONSENT_REQUIRED`); body tuỳ chọn `returnUrl`/`cancelUrl` chỉ nhận path tương đối hoặc URL cùng origin `WEB_ORIGIN` (sai -> 400); đơn 0đ đi `confirm_zero_amount`; payment cũ chốt CANCELLED trước khi huỷ link PayOS; đơn đổi trạng thái giữa chừng -> 409 `CONFLICT` |
| `GET /bookings/:id/payment-status` | JWT chủ đơn | Trạng thái thanh toán/đơn |
| `POST /bookings/:id/payment/cancel` | JWT chủ đơn | 200; huỷ link PayOS + `mark_payment_cancelled` |
| `POST /payos/webhook` | Public | Xác thực checksum HMAC (`PAYOS_CHECKSUM_KEY`); envelope/chữ ký sai -> HTTP 200 `{success:false,message}` (đơn không đổi, log cảnh báo); xử lý lỗi -> 500 để PayOS gửi lại; idempotent qua `record_payment_event` (`UNIQUE(provider, provider_event_id)`) -> `confirm_paid` |

### Soát vé (`CheckinModule`)

| Route | Guard | Ghi chú |
|---|---|---|
| `POST /checkin/scan` | Roles(STAFF)+Scope | 200; quét QR cấp đơn (`orders.qr_token`; QR vé cũ `tickets.qr_token` vẫn được chấp nhận) hoặc nhập mã đặt vé theo rạp (RPC `checkin_ticket`); MỘT lần quét soát cả đơn. Thành công (`result: OK`) trả `order { orderId, bookingCode, movieTitle, cinemaName, roomName, seats: string[] (xếp tự nhiên), seatCount, startsAt, checkedInAt }` (đã bỏ `ticket.ticketId/seatLabel/seatType`); `WRONG_CINEMA` chỉ trả `correctCinema`, không có ghế/tên khách/mã đặt vé; lỗi/kết quả khác: `USED`, `CANCELLED`, `EXPIRED`, `TOO_EARLY`, `NOT_PAID`, `NOT_FOUND` |

### Đơn hàng (`OrdersModule`; alias `/admin/...`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /orders` | Roles(STAFF) | Tra cứu đơn theo rạp (Manager cũng qua) |
| `GET /orders/needs-manual-review` | Roles(MANAGER) | Đơn `needs_manual_review` |
| `GET /orders/:id` | Roles(STAFF) | `tickets[]` mỗi phần tử có `checkedIn: boolean` + `checkedInAt`; KHÔNG trả `qrToken` (credential soát vé không đi qua DTO admin) |
| `POST /orders/:id/resolve-manual-review` | Roles(MANAGER) | RPC `resolve_manual_review` |
| `GET /admin/todo` | Roles(STAFF) | Việc cần xử lý |
| `GET /admin/orders` | Roles(STAFF) | Alias `GET /orders` |
| `GET /admin/orders/needs-manual-review` | Roles(MANAGER) | Alias |
| `GET /admin/orders/:id` | Roles(STAFF) | Alias |
| `POST /admin/orders/:id/resolve-manual-review` | Roles(MANAGER) | Alias |

### Huỷ suất, đóng rạp, đơn bị ảnh hưởng (`CancellationModule`)

Bộ route có 3 dạng alias (`/admin/cinemas/:cinemaId/...`, `/cinemas/:cinemaId/...`, không có cinemaId).

| Route | Guard | Ghi chú |
|---|---|---|
| `POST /cinemas/:cinemaId/showtimes/cancel/preview` | Roles(MANAGER)+Scope | Xem trước (RPC `preview_cancel_showtimes`) |
| `POST /admin/cinemas/:cinemaId/cancel-showtimes/preview` | Roles(MANAGER)+Scope | Alias |
| `POST /showtimes/cancel/preview` | Roles(MANAGER)+Scope | Alias (cinemaId trong body) |
| `POST /cinemas/:cinemaId/showtimes/cancel` | Roles(MANAGER)+Scope | Huỷ hàng loạt (RPC `cancel_showtimes`): đơn `paid` -> `affected` + `affected_order_cases`, xếp email; bỏ qua suất đã `CANCELLED` |
| `POST /admin/cinemas/:cinemaId/cancel-showtimes` | Roles(MANAGER)+Scope | Alias |
| `POST /showtimes/cancel` | Roles(MANAGER)+Scope | Alias |
| `PATCH /admin/cinemas/:cinemaId/status` | Roles(ADMIN) | Body `{status}`. **Hẹn lịch đổi trạng thái +7 ngày** (RPC `schedule_cinema_status`, R-33/R-136): rạp giữ nguyên trạng thái, xếp email `CINEMA_STATUS_NOTICE` cho mọi tài khoản đã xác nhận email. **PATCH trả 200, POST (4 alias) trả 201** (mặc định Nest) với `{success, cinemaId, status (hiện tại), scheduledStatus, scheduledEffectiveAt (UTC ISO), scheduleCancelled, emailsEnqueuedCount}`. Hẹn đúng trạng thái hiện tại khi đang có lịch = huỷ lịch (`scheduleCancelled: true`, `scheduled*: null`, email đính chính); không có lịch -> 400 `VALIDATION_ERROR` (`STATUS_UNCHANGED`); rạp không có -> 404; không phải Admin -> 403. Đã bỏ 409 `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES` và RPC `set_cinema_status` |
| `PATCH /cinemas/:cinemaId/status` | Roles(ADMIN) | Alias; 200, cùng body/response |
| `POST /admin/cinemas/:cinemaId/status` | Roles(ADMIN) | Alias (POST); **201**, cùng body/response |
| `POST /cinemas/:cinemaId/status` | Roles(ADMIN) | Alias (POST); **201**, cùng body/response |
| `GET /admin/affected-orders/export` | Roles(STAFF) | CSV `don-bi-anh-huong.csv` |
| `GET /affected-orders/export` | Roles(STAFF) | Alias |
| `GET /cinemas/:cinemaId/affected-orders/export` | Roles(STAFF) | Alias |
| `GET /admin/affected-orders` | Roles(STAFF) | Danh sách đơn bị ảnh hưởng (lọc theo rạp được gán) |
| `GET /affected-orders` | Roles(STAFF) | Alias |
| `GET /cinemas/:cinemaId/affected-orders` | Roles(STAFF) | Alias |
| `GET /admin/affected-orders/:orderId` | Roles(STAFF) | Chi tiết |
| `GET /affected-orders/:orderId` | Roles(STAFF) | Alias |
| `GET /orders/:orderId/affected` | Roles(STAFF) | Alias |
| `POST /admin/affected-orders/:orderId/refund` | Roles(STAFF) | Ghi hoàn tiền thủ công (R-110). Body: `refundedAmount` (int ≥1), `refundReference` (mã GD ngân hàng), `refundMethod` (`BANK_TRANSFER`|`E_WALLET`|`CASH`|`OTHER`, bắt buộc), `refundedAt` (ngày hoàn `YYYY-MM-DD`, bắt buộc, không ở tương lai theo giờ VN), `note?`. 201 trả thêm `refundMethod`, `refundedAt`. Thiếu/sai bất kỳ trường bắt buộc, hoặc số tiền vượt giá trị đơn → 422 `VALIDATION_ERROR`; rạp khác 403; đơn đã hoàn 409. DTO chi tiết/danh sách đơn bị ảnh hưởng và CSV (cột "Phương thức hoàn", "Ngày hoàn") trả `refundMethod`, `refundedAt` (ngày người ghi nhập) và `processedAt` (lúc hệ thống ghi nhận); bản ghi cũ trước 2026-11-20 có `refundMethod`/`refundedAt` = null |
| `POST /affected-orders/:orderId/refund` | Roles(STAFF) | Alias |
| `POST /orders/:orderId/refund` | Roles(STAFF) | Alias |
| `POST /admin/affected-orders/:orderId/resend-email` | Roles(STAFF) | Gửi lại email thông báo |
| `POST /affected-orders/:orderId/resend-email` | Roles(STAFF) | Alias |
| `POST /orders/:orderId/resend-email` | Roles(STAFF) | Alias |

Không có endpoint đổi suất (spec 3.0.0). Phạm vi rạp của nhóm Staff do service kiểm theo `staff_assignments` (các route này không gắn `@CinemaScope`).

### Báo cáo (`ReportModule`; alias `/admin/reports/...`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /reports/revenue` | Roles(MANAGER) | Doanh thu theo ngày/rạp |
| `GET /reports/showtimes` | Roles(MANAGER) | Doanh thu & lấp đầy theo suất |
| `GET /reports/payos-reconciliation` | Roles(MANAGER) | Đối soát PayOS |
| `GET /reports/cancelled-showtimes` | Roles(MANAGER) | Suất đã huỷ & đơn bị ảnh hưởng |
| `GET /admin/reports/revenue` | Roles(MANAGER) | Alias |
| `GET /admin/reports/showtimes` | Roles(MANAGER) | Alias |
| `GET /admin/reports/payos-reconciliation` | Roles(MANAGER) | Alias |
| `GET /admin/reports/cancelled-showtimes` | Roles(MANAGER) | Alias |

### Quản trị hệ thống (`AdminModule`)

| Route | Guard | Ghi chú |
|---|---|---|
| `GET /admin/users` | Roles(ADMIN) | |
| `GET /admin/users/:userId` | Roles(ADMIN) | |
| `PATCH /admin/users/:userId/lock` | Roles(ADMIN) | Khoá/mở khoá. 409 `CONFLICT` khi tự khoá chính mình hoặc khoá Admin hoạt động cuối cùng (GAP-010, R-105) |
| `PATCH /admin/users/:userId/admin-role` | Roles(ADMIN) | 409 `CONFLICT` khi `isAdmin=false` với chính mình hoặc với Admin hoạt động cuối cùng |
| `PUT /admin/users/:userId/roles/admin` | Roles(ADMIN) | Cấp vai trò Admin |
| `DELETE /admin/users/:userId/roles/admin` | Roles(ADMIN) | Gỡ vai trò Admin. 409 `CONFLICT` khi gỡ chính mình hoặc Admin hoạt động cuối cùng |
| `GET /admin/cinemas/:cinemaId/staff` | Roles(MANAGER)+Scope | (decorator ghi `ADMIN, MANAGER`) |
| `POST /admin/cinemas/:cinemaId/staff` | Roles(MANAGER)+Scope | 201; tạo/gán nhân sự (Manager chỉ thêm STAFF rạp mình) |
| `PATCH /admin/cinemas/:cinemaId/staff/:userId` | Roles(ADMIN) | Đổi vai trò |
| `DELETE /admin/cinemas/:cinemaId/staff/:userId` | Roles(MANAGER)+Scope | |
| `GET /admin/settings` | Roles(MANAGER) | Cấu hình chuỗi (`app_settings`) |
| `GET /admin/settings/:key` | Roles(MANAGER) | |
| `PUT /admin/settings/:key` | Roles(ADMIN) | |
| `PATCH /admin/settings/:key` | Roles(ADMIN) | |
| `GET /admin/vouchers` | Roles(MANAGER) | |
| `GET /admin/vouchers/:id` | Roles(MANAGER) | |
| `POST /admin/vouchers` | Roles(ADMIN) | 201 |
| `PATCH /admin/vouchers/:id` | Roles(ADMIN) | |
| `PUT /admin/vouchers/:id` | Roles(ADMIN) | |
| `DELETE /admin/vouchers/:id` | Roles(ADMIN) | |
| `GET /admin/audit` | Roles(ADMIN) | Nhật ký audit |
| `GET /admin/audit-logs` | Roles(ADMIN) | Alias |

### Jobs nội bộ (`JobsModule`)

Gọi bởi pg_cron/pg_net qua `public.call_nest_job(path)` (URL + secret từ Vault `api_base_url`, `job_secret`). Guard: `@Public()` + `JobSecretGuard` (header `x-job-secret` so sánh timing-safe với `JOB_SECRET`; thiếu cấu hình -> luôn 401, fail-closed).

| Route | Guard | Ghi chú |
|---|---|---|
| `POST /jobs/send-emails` | JobSecret | Mỗi phút (`job-send-emails`). Worker gửi `email_outbox` qua SMTP (nodemailer), retry khi lỗi |
| `POST /jobs/reconcile` | JobSecret | Mỗi 5 phút (`job-reconcile-payos`). Payment PENDING 2 phút–24h (<= 50) + EXPIRED <= 1h (<= 20): hỏi PayOS; PAID -> `handleWebhook` (idempotent với webhook thật); CANCELLED/EXPIRED -> `cancel_stale_payment`. Trả `{checked, paid, alreadyPaid, needsReview, cancelled, expired, skipped, errors}` |

Mail (`MailModule`) và `ThrottlerModule` không có route.

## Web (apps/web) — route người dùng

Không thuộc API Nest, liệt kê để đối chiếu: public `/`, `/phim`, `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`, `/dat-ve/[showtimeId]`, `/dat-ve/don/...`, `/ve`, `/ve/[bookingCode]`, `/tai-khoan`, `/dieu-khoan`, `/chinh-sach-bao-mat`, `/huong-dan-xoa-du-lieu`, `/sitemap.xml`, `/robots.txt`; nhân sự `/staff/chon-rap`, `/staff/soat-ve`; quản trị `/admin/{rap,phim,lich-chieu,gia,ngay-le,voucher,don-hang,don-can-xu-ly,don-bi-anh-huong,bao-cao,nguoi-dung,cau-hinh,audit-log}`; proxy `/api/proxy/[...path]` (Route Handler chuyển tiếp tới Nest).

## Webhook & rate limit

- Webhook duy nhất: PayOS `POST /payos/webhook` (xem bảng Thanh toán). Không lưu raw payload (`payment_events`).
- Rate limit: Throttler 100 req/phút/IP (toàn cục; IP đúng cần `TRUST_PROXY_HOPS` sau proxy); thêm giới hạn nghiệp vụ: đăng nhập sai 5 lần/15' (`login_attempts`), resend xác nhận 60s, voucher 10 lần/phút/khách (`rate_limit_buckets`).
