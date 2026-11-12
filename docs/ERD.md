# ERD — Overview & Pointers

> ⚠️ **Không nhúng schema tay ở đây** — sẽ lệch với migration thật.
> File này là **overview + pointer** tới source of truth.

## Source of truth

1. **Migration files** — versioned, đã commit (tool: `.context/project-config.md` → `migrations.tool`).
2. **Schema file** — vd `prisma/schema.prisma` / `drizzle/schema.ts` / model files trong `source_roots`.
3. **Generated inventory** — `docs/generated/` (chạy lại, không sửa tay).

> Nếu overview này khác migration/schema → **migration/schema thắng**.

## Database

**Type:** PostgreSQL (Supabase) · **Migration tool:** Supabase CLI (`supabase/migrations/*.sql`, versioned) · **ORM:** không (supabase-js + RPC)

## Entity overview (as-built — cập nhật theo layer)

> Chỉ mô tả **mục đích + quan hệ**; cột/kiểu/index/policy chi tiết lấy từ migration. Mọi bảng `public` bật RLS.

| Entity | Mục đích | Quan hệ chính | Migration |
|--------|----------|---------------|-----------|
| `provinces` | Tỉnh/thành (lọc khu vực) | has many `cinemas` | 20261111010000 |
| `profiles` | Hồ sơ người dùng (1-1 `auth.users`, tự tạo bằng trigger; email citext unique, nullable cho Facebook không email) | belongs to `auth.users` | 20261111010000 |
| `user_roles` | Vai trò toàn chuỗi (ADMIN) — chỉ Admin ghi | belongs to `profiles` | 20261111010000 |
| `cinemas` | Rạp (mã duy nhất, trạng thái COMING_SOON/OPEN/TEMP_CLOSED/CLOSED, cấu hình dọn phòng/đóng bán online) | belongs to `provinces` | 20261111010000 |
| `staff_assignments` | Gán user ↔ rạp ↔ vai trò (STAFF/MANAGER); Manager chỉ thêm/bớt STAFF rạp mình | belongs to `profiles`, `cinemas` | 20261111010000 |
| `app_settings` | Cấu hình toàn chuỗi (key/value, đọc công khai — không chứa secret) | has many `cinema_settings` | 20261111010000 |
| `cinema_settings` | Override cấu hình theo rạp (chỉ Admin ghi) | belongs to `cinemas`, `app_settings` | 20261111010000 |
| `consents` | Bằng chứng đồng ý điều khoản/chính sách (bất biến, `accepted_at` do DB đặt) | belongs to `profiles` | 20261111010000 |
| `favorite_cinemas` | Rạp yêu thích của khách | belongs to `profiles`, `cinemas` | 20261111010000 |
| `audit_logs` | Nhật ký thay đổi (actor, cinema_id, before/after) — ghi bằng trigger `audit_row_change` | (không FK, giữ lâu hơn dữ liệu gốc) | 20261111010000 |

| `movies` | Danh mục phim dùng chung (DRAFT/PUBLISHED/ARCHIVED; chỉ Admin ghi; nhân sự đọc cả phim nháp) | has many `showtimes` | 20261111020000 |
| `rooms` | Phòng chiếu thuộc 1 rạp (lưới hàng×cột, định dạng hỗ trợ, bảo trì) | belongs to `cinemas`; has many `seats`, `showtimes` | 20261111020000 |
| `seats` | Ghế trong phòng (Thường/VIP/Sweetbox/lối đi/hỏng; Sweetbox 1 dòng `col_span=2`, exclusion theo dải cột) | belongs to `rooms` | 20261111020000 |
| `showtimes` | Suất chiếu (`ends_at` do trigger tính = giờ bắt đầu + thời lượng phim + dọn phòng; exclusion chống chồng giờ trong phòng, bỏ suất CANCELLED; chỉ phim PUBLISHED; anon chỉ thấy suất của phim PUBLISHED) | belongs to `cinemas`, `rooms`, `movies` | 20261111020000 |
| `showtime_seat_locks` | Khoá ghế theo suất do Manager (ghế hỏng/khách mời) | belongs to `showtimes`, `seats` | 20261111020000 |
| `login_attempts` | Đếm đăng nhập sai (khoá 15' sau 5 lần) — chỉ service_role | (theo email) | 20261111020100 |
| `rate_limit_buckets` | Giới hạn tần suất theo khoá/cửa sổ — chỉ service_role | — | 20261111020100 |
| `disposable_email_domains` | Danh sách đen email dùng một lần (seed 50) | — | 20261111020100 |
| `email_outbox` | Hàng đợi email giao dịch (trạng thái gửi, retry) — chỉ service_role | — | 20261111020100 |
| `pos_api_keys` | Khoá API POS theo rạp (chỉ lưu hash + prefix, thu hồi được) | belongs to `cinemas` | 20261111020100 |
| `pos_api_logs` | Nhật ký gọi API POS | belongs to `pos_api_keys` | 20261111020100 |
| `price_rules` | Bảng giá 2 cấp (`CHAIN` / `CINEMA` / `SHOWTIME`; loại ghế, 2D/3D, ngày thường/cuối tuần/lễ, trước/sau 17h VN; VND int) | belongs to `cinemas`, `showtimes` (nullable theo scope) | 20261111030000 |
| `holidays` | Ngày lễ toàn chuỗi (ưu tiên hơn cuối tuần trong `price_quote`) | — | 20261111030000 |
| `orders` | Đơn đặt vé (`WEB`/`POS`, máy trạng thái §8.5, `booking_code` `<MÃRẠP>-XXXXXX` unique, snapshot suất/phim/rạp/phòng) | belongs to `cinemas`, `showtimes`, `profiles` | 20261111030100 |
| `order_seats` | Ghế thuộc đơn hàng + giá chốt từng ghế (Sweetbox 1 dòng cặp) | belongs to `orders`, `seats` | 20261111030100 |
| `showtime_seat_states` | Trạng thái ghế theo suất (`HELD` / `SOLD`), **UNIQUE(showtime_id, seat_id)** chống bán trùng (NFR-04) | belongs to `showtimes`, `seats`, `orders` | 20261111030100 |
| `seat_status_public` | Bảng Realtime công khai (`showtime_id`, `seat_id`, `state`, `expires_at` — không chứa `user_id`/`order_id`, NFR-05; đồng bộ qua trigger) | belongs to `showtimes`, `seats` | 20261111030100 |
| `tickets` | Vé điện tử (`qr_token` 128-bit hex ngẫu nhiên, không PII, trạng thái check-in; `seat_id` denormalize từ `order_seats` bằng trigger, **UNIQUE(showtime_id, seat_id)** — một ghế × một suất tối đa một vé, lớp chặn cuối chống bán trùng, K4) | belongs to `orders`, `showtimes`, `seats`, `cinemas` | 20261111030100, 20261112060000 |
| `payments` | Giao dịch thanh toán PayOS/POS (không lưu số thẻ/tài khoản ngân hàng — R-81) | belongs to `orders`, `cinemas` | 20261111030100 |
| `payment_events` | Sự kiện webhook/thanh toán idempotent (`UNIQUE(provider, provider_event_id)`, không lưu raw payload) | belongs to `payments`, `orders` | 20261111030100 |
| `vouchers` | Mã giảm giá (PERCENT / FIXED, phạm vi chuỗi hoặc rạp, giới hạn lượt/ngân sách) | belongs to `cinemas` (nullable) | 20261111030100 |
| `voucher_redemptions` | Lịch sử áp dụng voucher theo đơn | belongs to `vouchers`, `orders`, `profiles` | 20261111030100 |
| `affected_order_actions` | Xử lý đơn bị ảnh hưởng khi huỷ suất/đóng rạp (đổi suất / hoàn tiền thủ công bởi Staff/Manager rạp đó) | belongs to `orders`, `cinemas`, `showtimes` | 20261111030100 |
| `checkin_logs` | Nhật ký soát vé tại rạp | belongs to `tickets`, `orders`, `showtimes`, `cinemas` | 20261111030100 |
| `pos_requests` | Idempotency key cho giữ ghế / thanh toán POS theo rạp (`UNIQUE(cinema_id, request_id)` + `payload_hash` — AC-25) | belongs to `cinemas`, `orders`, `profiles` | 20261111040000 |
| `affected_order_cases` | Hồ sơ đơn bị ảnh hưởng khi huỷ suất chiếu hàng loạt (`counter_contact` cho đơn POS không email — AC-24) | belongs to `orders`, `showtimes`, `cinemas` | 20261111040300 |
| `oauth_missing_email_requests` | Token một lần xác thực email bổ sung cho đăng nhập Facebook không có email (R-21, #18) | belongs to `profiles` | 20261111040500 |

Views báo cáo MVP (`security_invoker = true`, lọc theo `has_cinema_scope(cinema_id)` / `is_admin()` — `20261111040400`):
- `v_report_revenue_daily`: doanh thu theo ngày/rạp/kênh (`WEB`/`POS`), tổng đơn, số vé, gross/discount/net VND.
- `v_report_showtime_sales`: doanh thu & tỷ lệ lấp đầy theo phim/suất/rạp (`room_capacity` loại trừ `AISLE`/`BROKEN`).
- `v_report_payos_reconciliation`: đối soát PayOS (lệch tiền `AMOUNT_MISMATCH`, pending quá hạn, `NEEDS_MANUAL_REVIEW`).
- `v_report_cancelled_showtimes`: thống kê suất bị huỷ & số đơn `affected` / đã đổi / hoàn thủ công (lát MVP của R-119).

Storage buckets: `posters`, `banners` (Admin ghi), `cinema-images` (Admin hoặc Manager đúng thư mục `<cinema_id>/`), `avatars` (thư mục `<uid>/`). Cron: `delete-unconfirmed-users` (mỗi giờ; bỏ qua user Facebook), `purge-expired-ops-data` (dọn `rate_limit_buckets`, `login_attempts`, `pos_api_logs` quá hạn). Auth hook & triggers: `public.hook_before_user_created` (chỉ cho `app_metadata.created_via='nest'` hoặc Google/Facebook), `trg_guard_identity_insert` (chặn auto-merge OAuth vào tài khoản mật khẩu AC-04 & chặn 1 MXH gắn 2 user R-23), `trg_on_identity_change` (enqueue email thông báo liên kết/huỷ liên kết R-24).

Hàm RLS & RPC nghiệp vụ dùng chung:
- Lõi & Giá (Layer 1–3): `is_admin()`, `has_cinema_role(cinema_id, staff_role[])`, `has_cinema_scope(cinema_id)`, `price_quote(showtime_id, seat_ids[])`, `showtime_has_sales(showtime_id)`.
- Đặt vé & Thanh toán (Layer 4): `hold_seats`, `release_seats`, `extend_pos_hold`, `expire_overdue_holds` (`20261111040000`); `confirm_paid`, `mark_payment_cancelled`, `confirm_zero_amount`, `confirm_pos_sale` (`20261111040100`); `apply_voucher`, `remove_voucher` (`20261111040200`); K5 `20261112070000`: `apply_voucher` thành wrapper đếm rate limit R-95 (10 lần/phút/khách, đếm cả lần sai) trả jsonb `{ok, error_code}` cho lỗi nghiệp vụ (không raise; FORBIDDEN vẫn raise 42501), logic nằm ở `apply_voucher_core` (không grant cho client).
- Vận hành, Soát vé & Báo cáo (Layer 4): `preview_cancel_showtimes`, `cancel_showtimes`, `set_cinema_status` (`20261111040300`); `checkin_ticket`, `report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes` (`20261111040400`).
- Định danh OAuth (Layer 4): `check_oauth_collision`, `get_user_identities`, `link_user_identity`, `unlink_user_identity`, `mark_password_set` (`20261111040500`); `20261112050000_identity_rpc_hardening`: chỉ `service_role` được EXECUTE (revoke anon/authenticated/public), thân hàm fail-closed qua `assert_identity_rpc_caller`.
- Seed demo local (`supabase/seed.sql` + `supabase/seed/README.md`): idempotent 5 rạp (`HN01..DN01`), 16 phòng, 1.056 ghế, 12 phim đủ 5 nhãn tuổi, bảng giá chuỗi + override `HN02` (AC-15), 298 suất chiếu (có suất mở bán trong 2 giờ tới), 6 tài khoản mẫu, 5 POS API keys.

Ghi chú thiết kế (G1 & G2 — Layer 3):
- Nguồn override thời gian dọn phòng theo rạp duy nhất là `cinemas.cleaning_minutes` (fallback `app_settings['default_cleaning_minutes']`); key `default_cleaning_minutes` bị cấm trong `cinema_settings` để tránh 2 nguồn xung đột. Khi đổi `movies.duration_minutes` hoặc `cinemas.cleaning_minutes`, trigger tự tính lại `ends_at` cho các suất tương lai chưa bán vé (nếu gây chồng giờ → raise `23P01`).
- Policy `showtimes_select` chỉ cho anon/khách thấy suất của phim `PUBLISHED` thuộc rạp `OPEN` (R-33); nhân sự/Admin vẫn thấy theo quyền. Trigger `showtimes_protect_sold` (R-54) chặn sửa giờ/phòng/phim hoặc xoá suất đã có vé/đơn bán.

## Relationships

```
cinemas ──< rooms ──< seats · rooms ──< showtimes >── movies · showtimes ──< showtime_seat_locks >── seats
provinces ──< cinemas ──< staff_assignments >── profiles ── auth.users
cinemas ──< cinema_settings >── app_settings
profiles ──< consents · profiles ──< favorite_cinemas >── cinemas · profiles ──< user_roles
```

## Notes (business rules dữ liệu)

- Soft delete? (`deleted_at`) — nếu có, ghi rõ ở đây.
- Archival / retention policy.
- Index đặc biệt: mô tả **lý do**; định nghĩa index nằm ở migration/schema.
