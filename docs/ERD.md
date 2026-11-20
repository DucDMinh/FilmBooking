# ERD (as-built) — Overview & Pointers

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
| `cinemas` | Rạp (mã duy nhất, trạng thái COMING_SOON/OPEN/TEMP_CLOSED/CLOSED, cấu hình dọn phòng/đóng bán online). Lịch đổi trạng thái chờ hiệu lực: `scheduled_status` + `scheduled_effective_at` (cùng null hoặc cùng có, = lúc hẹn + đúng 7 ngày; `anon`/`authenticated` được `select`). `authenticated` KHÔNG `update`/`insert` được `scheduled_*` và KHÔNG `update` được `status` (UPDATE/INSERT là column-level; INSERT vẫn có `status` để tạo rạp mới); chỉ `schedule_cinema_status` / job `apply_due_cinema_status_changes` / `service_role` ghi | belongs to `provinces` | 20261111010000, 20261118100000 |
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
| `price_rules` | Bảng giá 2 cấp (`CHAIN` / `CINEMA` / `SHOWTIME`; loại ghế, 2D/3D, ngày thường/cuối tuần/lễ, trước/sau 17h VN; VND int) | belongs to `cinemas`, `showtimes` (nullable theo scope) | 20261111030000 |
| `holidays` | Ngày lễ toàn chuỗi (ưu tiên hơn cuối tuần trong `price_quote`) | — | 20261111030000 |
| `orders` | Đơn đặt vé (kênh `WEB`; enum còn giá trị `POS` là nợ kỹ thuật, `hold_seats` từ chối, máy trạng thái §8.5, `booking_code` `<MÃRẠP>-XXXXXX` unique, snapshot suất/phim/rạp/phòng; `qr_token` 128-bit hex UNIQUE NOT NULL, **một mã QR cho cả đơn** — nguồn token mail/trang vé/soát vé, bất biến sau khi cấp, không lưu vào `audit_logs`) | belongs to `cinemas`, `showtimes`, `profiles` | 20261111030100, 20261117120000, 20261117130000 |
| `order_seats` | Ghế thuộc đơn hàng + giá chốt từng ghế (Sweetbox 1 dòng cặp) | belongs to `orders`, `seats` | 20261111030100 |
| `showtime_seat_states` | Trạng thái ghế theo suất (`HELD` / `SOLD`), **UNIQUE(showtime_id, seat_id)** chống bán trùng (NFR-04) | belongs to `showtimes`, `seats`, `orders` | 20261111030100 |
| `seat_status_public` | Bảng Realtime công khai (`showtime_id`, `seat_id`, `state`, `expires_at` — không chứa `user_id`/`order_id`, NFR-05; đồng bộ qua trigger) | belongs to `showtimes`, `seats` | 20261111030100 |
| `tickets` | Vé điện tử (`qr_token` 128-bit hex ngẫu nhiên, không PII — chỉ giữ để tương thích QR vé cũ đã gửi, QR mới là `orders.qr_token`; trạng thái check-in; `seat_id` denormalize từ `order_seats` bằng trigger, **UNIQUE(showtime_id, seat_id)** — một ghế × một suất tối đa một vé, lớp chặn cuối chống bán trùng, K4) | belongs to `orders`, `showtimes`, `seats`, `cinemas` | 20261111030100, 20261112060000 |
| `payments` | Giao dịch thanh toán PayOS (không lưu số thẻ/tài khoản ngân hàng — R-81) | belongs to `orders`, `cinemas` | 20261111030100 |
| `payment_events` | Sự kiện webhook/thanh toán idempotent (`UNIQUE(provider, provider_event_id)`, không lưu raw payload) | belongs to `payments`, `orders` | 20261111030100 |
| `vouchers` | Mã giảm giá (PERCENT / FIXED, phạm vi chuỗi hoặc rạp, giới hạn lượt/ngân sách) | belongs to `cinemas` (nullable) | 20261111030100 |
| `voucher_redemptions` | Lịch sử áp dụng voucher theo đơn | belongs to `vouchers`, `orders`, `profiles` | 20261111030100 |
| `affected_order_actions` | Ghi nhận xử lý đơn bị ảnh hưởng khi huỷ suất/đóng rạp: hoàn tiền thủ công bởi Staff/Manager rạp đó (enum `affected_action` còn giá trị `EXCHANGED` là tàn dư — spec 3.0.0 không còn đổi suất) | belongs to `orders`, `cinemas`, `showtimes`. Cột hoàn tiền: `refund_reference`, `refunded_amount`, `refund_method` (text, CHECK `BANK_TRANSFER`/`E_WALLET`/`CASH`/`OTHER`), `refunded_at` (date, ngày hoàn do người ghi nhập); CHECK `affected_order_actions_refunded_manual_full_ck` (NOT VALID: hàng mới `REFUNDED_MANUAL` bắt buộc cả hai, dòng cũ giữ null) — R-110 | 20261111030100, 20261120100000 |
| `checkin_logs` | Nhật ký soát vé tại rạp | belongs to `tickets`, `orders`, `showtimes`, `cinemas` | 20261111030100 |
| `affected_order_cases` | Hồ sơ đơn bị ảnh hưởng khi huỷ suất chiếu hàng loạt (`counter_contact` chỉ còn dead code cho đơn kênh POS cũ — AC-24) | belongs to `orders`, `showtimes`, `cinemas` | 20261111040300 |
| `identity_link_intents` | Ý định liên kết MXH (dùng 1 lần, TTL 10', `consumed_at`; CHECK provider google/facebook); API ghi qua `POST /me/identities/link-intent`, chỉ `service_role` | belongs to `auth.users` | 20261112170000, 20261113090000 |
| `oauth_missing_email_requests` | Token một lần xác thực email bổ sung cho đăng nhập Facebook không có email (R-21, #18) | belongs to `profiles` | 20261111040500 |

Views báo cáo MVP (`security_invoker = true`, lọc theo `has_cinema_scope(cinema_id)` / `is_admin()` — `20261111040400`):
- `v_report_revenue_daily`: doanh thu theo ngày/rạp/kênh (`WEB`), tổng đơn, số vé, gross/discount/net VND.
- `v_report_showtime_sales`: doanh thu & tỷ lệ lấp đầy theo phim/suất/rạp (`room_capacity` loại trừ `AISLE`/`BROKEN`).
- `v_report_payos_reconciliation`: đối soát PayOS (lệch tiền `AMOUNT_MISMATCH`, pending quá hạn, `NEEDS_MANUAL_REVIEW`).
- `v_report_cancelled_showtimes`: thống kê suất bị huỷ & số đơn `affected` / đã đổi / hoàn thủ công (lát MVP của R-119).

Storage buckets: `posters`, `banners` (Admin ghi), `cinema-images` (Admin hoặc Manager đúng thư mục `<cinema_id>/`), `avatars` (thư mục `<uid>/`). Cron: `expire-overdue-holds` (mỗi phút, gọi `expire_overdue_holds()`), `apply-cinema-status-changes` (mỗi phút, gọi `apply_due_cinema_status_changes()`), `delete-unconfirmed-users` (mỗi giờ; bỏ qua user Facebook), `purge-expired-ops-data` (dọn `rate_limit_buckets`, `login_attempts` quá hạn). Auth hook & triggers: `public.hook_before_user_created` (chỉ cho `app_metadata.created_via='nest'` hoặc Google/Facebook), `trg_guard_identity_insert` (chặn 1 MXH gắn 2 user R-23; identity OAuth chèn vào user đã tồn tại — có identity hoặc có mật khẩu — chỉ qua khi có link-intent khớp, còn hạn, chưa dùng, rồi đánh dấu `consumed_at`; không có → 23514, chặn auto-merge AC-04/M-05). Bảng `public.identity_link_intents` (`id`, `user_id` → `auth.users` on delete cascade, `provider` CHECK in (`google`,`facebook`), `expires_at` mặc định now()+10 phút, `consumed_at`, `created_at`; index partial `(user_id, provider) where consumed_at is null`; RLS bật, chỉ `service_role`) do API ghi qua `POST /me/identities/link-intent`, `trg_on_identity_change` (enqueue email thông báo liên kết/huỷ liên kết R-24).

Hàm RLS & RPC nghiệp vụ dùng chung:
- Lõi & Giá (Layer 1–3): `is_admin()`, `has_cinema_role(cinema_id, staff_role[])`, `has_cinema_scope(cinema_id)`, `price_quote(showtime_id, seat_ids[])`, `showtime_has_sales(showtime_id)`.
- Đặt vé & Thanh toán (Layer 4): `hold_seats`, `release_seats`, `expire_overdue_holds` (`20261111040000`); `confirm_paid`, `mark_payment_cancelled`, `confirm_zero_amount` (`20261111040100`); `apply_voucher`, `remove_voucher` (`20261111040200`); K5 `20261112070000`: `apply_voucher` thành wrapper đếm rate limit R-95 (10 lần/phút/khách, đếm cả lần sai) trả jsonb `{ok, error_code}` cho lỗi nghiệp vụ (không raise; FORBIDDEN vẫn raise 42501), logic nằm ở `apply_voucher_core` (không grant cho client).
- Jobs & đối soát (Layer 6, `20261113180000_cron_http_jobs`): `call_nest_job(path)` (SECURITY DEFINER, path khớp `/jobs/[a-z-]+`, đọc Vault `api_base_url`/`job_secret`, thiếu secret → warning + null; `net.http_post` timeout 60s); `cancel_stale_payment(p_payment_id, p_reason)` (khoá đơn → payment, SKIPPED nếu payment không PENDING / đơn không `pending_payment` / có payment mới hơn, else `mark_payment_cancelled`). Cả hai chỉ `service_role`. Cron `job-send-emails` (mỗi phút), `job-reconcile-payos` (mỗi 5 phút). Vault secret phải tạo tay trên từng môi trường.
- Vận hành, Soát vé & Báo cáo (Layer 4): `preview_cancel_showtimes`, `cancel_showtimes` (`20261111040300`), `schedule_cinema_status` (`20261118100000`, thay `set_cinema_status` đã gỡ); `checkin_ticket`, `report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes` (`20261111040400`).
- Định danh OAuth (Layer 4): `check_oauth_collision`, `get_user_identities`, `unlink_user_identity`, `mark_password_set` (`20261111040500`); `20261112050000_identity_rpc_hardening`: chỉ `service_role` được EXECUTE (revoke anon/authenticated/public), thân hàm fail-closed qua `assert_identity_rpc_caller`; `20261112090000_drop_client_identity_link` DROP `link_user_identity` (K2: liên kết MXH chỉ qua GoTrue `linkIdentity`).
- Quyền EXECUTE (P0-08, `20261112080000_function_privileges_hardening`): default privileges của postgres không còn cấp EXECUTE cho PUBLIC/anon/authenticated (hàm mới phải GRANT tường minh). Lưu ý: revoke PUBLIC là **toàn cục** cho mọi hàm role postgres tạo sau này ở **mọi schema** (kể cả hàm của extension cài sau) — hàm nào client cần gọi phải GRANT rõ. anon chỉ `price_quote`; authenticated chỉ RPC khách/nhân sự (thân hàm tự kiểm quyền) + helper RLS; `record_payment_event`, `mark_payment_cancelled`, `confirm_paid`, `generate_booking_code` chỉ `service_role`; trigger function không client nào. Allowlist cứng trong `supabase/tests/048_function_privileges.test.sql`.
- CR remove-pos (`20261112130000_remove_pos`, HIGH_RISK_MIGRATION): DROP bảng `pos_api_keys`, `pos_api_logs`, `pos_requests`; DROP hàm `confirm_pos_sale`, `extend_pos_hold`; `hold_seats` chỉ nhận kênh `WEB` (kênh khác → `INVALID_CHANNEL`, tham số `p_request_id` giữ cho khớp chữ ký nhưng bị bỏ qua); `purge_expired_ops_data()` còn 2 cột. Enum `order_channel`/`showtime_seat_states.source` vẫn còn giá trị `POS` (không tạo lại enum — nợ kỹ thuật). `20261112120000_zero_amount_sell_hardening`: `confirm_zero_amount` chiếm ghế qua `sell_order_seats`, kiểm suất ON_SALE + rạp OPEN, khoá showtimes trước orders (FK `tickets.seat_id` chưa có — backlog CR-002).
- Seed demo local (`supabase/seed.sql` + `supabase/seed/README.md`): idempotent 5 rạp (`HN01..DN01`), 16 phòng, 1.056 ghế, 12 phim đủ 5 nhãn tuổi, bảng giá chuỗi + override `HN02` (AC-15), 298 suất chiếu (có suất mở bán trong 2 giờ tới), 6 tài khoản mẫu.

Ghi chú thiết kế (G1 & G2 — Layer 3):
- Nguồn override thời gian dọn phòng theo rạp duy nhất là `cinemas.cleaning_minutes` (fallback `app_settings['default_cleaning_minutes']`); key `default_cleaning_minutes` bị cấm trong `cinema_settings` để tránh 2 nguồn xung đột. Khi đổi `movies.duration_minutes` hoặc `cinemas.cleaning_minutes`, trigger tự tính lại `ends_at` cho các suất tương lai chưa bán vé (nếu gây chồng giờ → raise `23P01`).
- Policy `showtimes_select` chỉ cho anon/khách thấy suất của phim `PUBLISHED` thuộc rạp `OPEN` (R-33); nhân sự/Admin vẫn thấy theo quyền. Trigger `showtimes_protect_sold` (R-54) chặn sửa giờ/phòng/phim hoặc xoá suất đã có vé/đơn bán.

## Enum chính (đối chiếu migration)

`order_status`: `holding`, `pending_payment`, `paid`, `expired`, `cancelled`, `affected`, `needs_manual_review`, `refunded_manual`, `checked_in`, `exchanged` (`exchanged` là tàn dư, không còn luồng ghi). `payment_status`: PENDING/PAID/CANCELLED/EXPIRED/FAILED. `seat_state`: HELD/SOLD. `showtime_status`: ON_SALE/CLOSED/CANCELLED. `cinema_status`: COMING_SOON/OPEN/TEMP_CLOSED/CLOSED. `order_channel`: WEB/POS (POS tàn dư). `checkin_result`: SUCCESS, WRONG_CINEMA, OUTSIDE_WINDOW, ALREADY_USED, AFFECTED, INVALID.

## Migration muộn (đối chiếu tên file)

- `20261112100000_order_lifecycle_pending_payment`: vòng đời `pending_payment` (hết hạn -> `expired`, tạo đơn mới huỷ đơn holding/pending cũ, unique index một đơn đang giữ mỗi khách).
- `20261112110000_confirm_paid_hardening`, `20261113160000_confirm_paid_order_code_lookup`: siết `confirm_paid` (chỉ `service_role`); chọn payment theo `order_code`; thêm cột `payments.link_cancelled_at`.
- `20261112140000_hold_seats_hardening`: thứ tự khoá `showtimes FOR SHARE` -> orders -> payments -> seats -> seat_states.
- `20261112150000_cancel_showtimes_hardening`: `cancel_showtimes`/`preview_cancel_showtimes` tính cả đơn `checked_in`, email outbox idempotent. `20261112160000_rbac_cinema_reports_hardening`: `set_cinema_status` chỉ Admin (đã bị gỡ ở `20261118100000`, thay bằng `schedule_cinema_status`); thêm `has_cinema_manager_scope` cho báo cáo (chỉ Manager/Admin).
- `20261113170000_resolve_manual_review_rpc`: RPC `resolve_manual_review` chỉ gán `manual_review_resolved_at` (giữ status `needs_manual_review`).
- `20261114000000_cancel_showtimes_skip_cancelled`: `cancel_showtimes` bỏ qua suất đã `CANCELLED`.
- `20261114190000_showtimes_cinema_fk` (HIGH_RISK_MIGRATION, chỉ local): thêm FK `showtimes_cinema_id_fkey` `showtimes(cinema_id)` → `cinemas(id)` ON DELETE RESTRICT, ngoài FK ghép `(room_id, cinema_id)` → `rooms`. Cần để PostgREST embed `cinemas!…!inner` từ `showtimes` (trước đó `GET /movies` 500, PGRST200); các embed `movies`/`cinemas` ở catalog chỉ rõ tên FK. Rollback: `alter table showtimes drop constraint showtimes_cinema_id_fkey`.
- `20261118100000_cinema_status_schedule` (HIGH_RISK_MIGRATION, chỉ local; feature cinema-status-notice, R-33/R-136): thêm `cinemas.scheduled_status`/`scheduled_effective_at` (+ check cùng null/cùng có, partial index `cinemas_scheduled_due_idx`); thu `UPDATE` table-level của `authenticated` trên `cinemas`, cấp lại `UPDATE` theo cột (mọi cột thông tin rạp, trừ `status`, `scheduled_*`). RPC `schedule_cinema_status(p_cinema_id, p_status)` (Admin/`service_role`; Manager `42501 FORBIDDEN_ADMIN_REQUIRED`; rạp không có `P0002`): ghi lịch `now()+7 ngày` (hẹn lại = thay lịch cũ), xếp `email_outbox` kind `CINEMA_STATUS_NOTICE` (mỗi email 1 dòng, dedupe `lower(email)`, chỉ `auth.users` đã xác nhận email, chưa xoá/khoá; payload `cinema_name`, `cinema_code`, `cinema_address`, `hotline`, `target_status`, `current_status`, `effective_at` (ISO UTC), `customer_name`); `p_status` = trạng thái hiện tại: đang có lịch → huỷ lịch + email đính chính (`schedule_cancelled: true`), không có lịch → `22023 STATUS_UNCHANGED`. Gỡ `set_cinema_status` (đổi tức thì; không còn chặn khi còn suất đã bán). Hàm nội bộ `apply_due_cinema_status_changes()` (chỉ `service_role`/owner; pg_cron mỗi phút): tới hạn → đổi `status`, xoá lịch; đích khác `OPEN` → huỷ mọi suất tương lai còn lại, nhả ghế giữ, đơn `paid`/`checked_in` → `affected` (+ `affected_order_cases`), KHÔNG enqueue email từng đơn; lỗi 1 rạp chỉ cảnh báo, giữ lịch thử lại. Thân huỷ suất tách thành `cancel_showtimes_core(…, p_send_emails)` (nội bộ, không grant client); `cancel_showtimes` công khai gọi với `true` nên hành vi cũ giữ nguyên. Rollback: drop job + 2 hàm mới + core, khôi phục `cancel_showtimes` (`20261114000000`) và `set_cinema_status` (`20261112160000`), `grant update on cinemas to authenticated`, drop 2 cột.
- `20261118110000_cinema_status_schedule_fixes` (HIGH_RISK_MIGRATION, chỉ local; sửa theo review): `schedule_cinema_status` và `apply_due_cinema_status_changes` khoá dòng rạp bằng `FOR NO KEY UPDATE` (job thêm `SKIP LOCKED`) thay `FOR UPDATE` để không xung đột `FOR KEY SHARE` của FK `cinema_id` khi `hold_seats`/`confirm_paid` insert đơn/thanh toán/vé/outbox (tránh deadlock 40P01; thứ tự khoá job: cinemas no-key-update → showtimes → orders → seat_states); `schedule_cinema_status` kiểm quyền Admin TRƯỚC khi đọc/khoá rạp (người không quyền luôn nhận `42501`, không dò được rạp tồn tại); quyền INSERT của `authenticated` trên `cinemas` chuyển sang theo cột, không gồm `scheduled_status`/`scheduled_effective_at` (vẫn gồm `status` để tạo rạp COMING_SOON). Rollback: create or replace 2 hàm về `20261118100000`, `grant insert on public.cinemas to authenticated`.
- `20261119100000_last_active_admin_guard` (bug admin-self-lock-last-admin-guard, GAP-010/R-105; không destructive, chỉ thêm hàm + trigger): chuỗi luôn còn >= 1 "Admin hoạt động" = có `user_roles` ADMIN, `auth.users` chưa `deleted_at`, `banned_until` không còn hạn, `raw_app_meta_data.locked` khác `true`, VÀ (`email_confirmed_at` không null HOẶC có identity `facebook` trong `auth.identities`) — đúng điều kiện loại trừ của cron `delete_unconfirmed_users` (chưa xác nhận email + không facebook thì bị xoá sau 7 ngày, nên không được tính là Admin). 6 hàm: `auth_account_is_active(user_id, banned_until, app_metadata, deleted_at, email_confirmed_at)` (nội bộ; tra `auth.identities` cho facebook), `guard_last_active_admin(uuid)` (nội bộ; `pg_advisory_xact_lock(hashtextextended('filmbooking.admin_set', 0))` rồi đếm lại Admin hoạt động khác, không còn → `raise` SQLSTATE `FB409` message `LAST_ADMIN: ...`), `is_last_active_admin(uuid)` (tra cứu không khoá, chỉ `service_role`, API dùng báo lỗi sớm), `trg_guard_last_admin_user_roles()`, `trg_guard_last_admin_auth_users()`, `trg_guard_last_admin_identities()`. 5 trigger BEFORE ROW: `user_roles_last_admin_guard_delete`, `user_roles_last_admin_guard_update` (of role, user_id) trên `public.user_roles`; `auth_users_last_admin_guard_update` (of banned_until, raw_app_meta_data, deleted_at, email_confirmed_at), `auth_users_last_admin_guard_delete` trên `auth.users` (chỉ vào hàng rào khi tài khoản chuyển từ hoạt động sang không hoạt động hoặc bị xoá); `auth_identities_last_admin_guard_delete` trên `auth.identities` (gỡ liên kết facebook của Admin chưa xác nhận email). Phủ: gỡ/chuyển role ADMIN, khoá, xoá mềm/cứng user (cascade), bỏ xác nhận email, gỡ identity facebook. Rollback: drop 5 trigger + 6 hàm (xem header migration).
- POS đã gỡ (`20261112130000_remove_pos`): 3 bảng `pos_*` bị DROP, không còn trong schema.

## Relationships

```
cinemas ──< rooms ──< seats · rooms ──< showtimes >── movies · showtimes ──< showtime_seat_locks >── seats
provinces ──< cinemas ──< staff_assignments >── profiles ── auth.users
cinemas ──< cinema_settings >── app_settings
profiles ──< consents · profiles ──< favorite_cinemas >── cinemas · profiles ──< user_roles
profiles ──< orders ──< order_seats >── seats · orders ──< tickets · orders ──< payments ──< payment_events
showtimes ──< showtime_seat_states >── seats (UNIQUE showtime+seat) · showtimes ──< seat_status_public
orders ──< voucher_redemptions >── vouchers · orders ──< affected_order_cases / affected_order_actions
tickets ──< checkin_logs
```

## Notes (business rules dữ liệu)

- Không dùng soft delete; xoá tài khoản ẩn danh hoá PII (trigger `profiles_scrub_order_pii`), giữ đơn/vé.
- Retention: cron `purge-expired-ops-data` dọn `rate_limit_buckets`/`login_attempts`; `audit_logs` giữ lâu hơn dữ liệu gốc. Cron khác: `expire-overdue-holds` (mỗi phút), `apply-cinema-status-changes` (mỗi phút), `delete-unconfirmed-users`, `job-send-emails`, `job-reconcile-payos`.
- Chống bán trùng: `UNIQUE(showtime_id, seat_id)` trên `showtime_seat_states` và `tickets`; exclusion chống chồng suất trong phòng.
