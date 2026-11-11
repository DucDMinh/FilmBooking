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
| Định danh & Liên kết MXH (`IdentityModule` — Layer 4) | `GET /me/identities`, `POST /me/identities/link`, `DELETE /me/identities/:provider`, `POST /me/password`, `POST /auth/oauth/missing-email`, `POST /auth/oauth/callback-check` | JWT / `@Public()` | Chặn tự gộp OAuth trùng email mật khẩu (AC-04), chặn gỡ phương thức đăng nhập cuối cùng hoặc gỡ `email` (AC-05), thêm mật khẩu lần đầu cho tài khoản OAuth (R-22), chống dò email khi Facebook không trả email (#18) |
| Bảng giá & Ngày lễ (`PricingModule` — Layer 4) | `GET/POST/PATCH/DELETE /admin/pricing/holidays`, `GET/POST/PATCH/DELETE /admin/pricing/rules`, `GET/POST/PATCH/DELETE /admin/cinemas/:cinemaId/pricing/rules`, `GET /showtimes/:showtimeId/price-quote` | Public (`price-quote`) / Admin (`CHAIN` & `holidays`) / Manager (`@CinemaScope` cho `CINEMA`/`SHOWTIME`) | Giá 2 cấp + ưu tiên ngày lễ > cuối tuần > ngày thường (AC-15, R-51..R-53, R-60) |
| Web Public Routes (`apps/web` — Layer 4) | `/`, `/phim`, `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`, `/sitemap.xml`, `/robots.txt` | Public SSR / Client | Chọn tỉnh/thành lưu cookie, lọc phim, lịch chiếu 7 ngày (disable suất hết ghế/qua cutoff 15'), bản đồ Leaflet client-only, nút rạp yêu thích, JSON-LD `Movie` & `MovieTheater` chống XSS |

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
