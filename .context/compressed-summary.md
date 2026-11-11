# Compressed Context Summary — FilmBooking (sau Layer 4)

- **Cập nhật lúc:** 2026-11-11T22:00:00+07:00
- **Work item:** `build/build-filmbooking` (`mode: initial-build`, `currentLayer: 5 / totalLayers: 9`)
- **Branch chính:** `staging` (tag: `layer-4-done`)

## 1. Các Layer đã hoàn thành (Layers 0 → 4)

### Layer 0 — Bootstrap & Hạ tầng (`layer-0-done`)
- `layer-0/task-01`: Monorepo `pnpm` (`packages/shared`, `apps/api`, `apps/web`), TypeScript/ESLint/Vitest, CI workflows.
- `layer-0/task-02`: Supabase local config (`supabase/config.toml`), scripts `db:start`, `db:stop`, `db:test`, `db:types`.

### Layer 1 — Nền tảng App & DB Core (`layer-1-done`)
- `layer-1/task-01`: Next.js 16 App Router + Tailwind v4 + design tokens (`Cinematic Amber & Velvet Nocturne`) + Supabase SSR clients.
- `layer-1/task-02`: NestJS 11 core (`ConfigModule`, `SupabaseModule`, `AllExceptionsFilter`, `ZodValidationPipe`, `/health`).
- `layer-1/task-03`: Migration `20261111010000_core_auth_rls.sql` (`profiles`, `user_roles`, `cinemas`, `staff_assignments`, `consents`, `favorite_cinemas`, `audit_logs`, RLS).

### Layer 2 — Catalog Schema, Security Ops, Guards & Web Shell (`layer-2-done`)
- `layer-2/task-01`: Migration `20261111020000_catalog.sql` (`movies`, `rooms`, `seats`, `showtimes`, `showtime_seat_locks`, RLS).
- `layer-2/task-02`: Migration `20261111020100_security_ops.sql` (`login_attempts`, `rate_limit_buckets`, `disposable_email_domains`, `email_outbox`, `pos_api_keys`, `pos_api_logs`, `record_login_failure()`, `hit_rate_limit()`).
- `layer-2/task-03`: NestJS `AuthGuard` (JWT + JWKS), `RolesGuard` (`@Roles`), `CinemaScopeGuard` (`@CinemaScope`).
- `layer-2/task-04`: `packages/shared` schemas/constants (`auth`, `catalog`, `booking`, `errors`) + `apps/web/src/lib/api/client.ts` + proxy route.
- `layer-2/task-05`: Web Shell (`Header`, `Footer`, `CountdownBadge`, `PriceBreakdownDrawer`, `AgeBadge`, route groups `(public)`, `(auth)`, `(account)`, `(staff)`, `(admin)`).

### Layer 3 — Pricing, Booking Schema & Core API Modules (`layer-3-done`)
- `layer-3/task-01`: `20261111030000_pricing.sql` (`holidays`, `price_rules` 2 cấp `CHAIN`/`CINEMA`/`SHOWTIME`, `price_quote`), `20261111030010_security_ops_hardening.sql`, `20261111030020_catalog_fixes.sql`.
- `layer-3/task-02`: `20261111030100_booking_tables.sql` (`orders`, `order_seats`, `showtime_seat_states`, `seat_status_public`, `tickets`, `payments`, `payment_events`, `vouchers`, `voucher_redemptions`, `affected_order_actions`, `checkin_logs`, triggers & RLS).
- `layer-3/task-03..07`: `AuthModule` + `MeModule`, `CatalogModule` (thêm `id: row.id` vào `CinemaDto`), `CinemaOpsModule`, `AuthExtModule`, `ProfileModule`.

### Layer 4 — Core Transactional RPCs, Identity/Pricing APIs, Seed & Public Web (`layer-4-done`)
- `layer-4/task-01`: `20261111040000_rpc_hold.sql` + `040_hold.test.sql` (52 pgTAP tests): `hold_seats` (deterministic lock `ORDER BY seat_id`, chống mạo danh `user_id` & kiểm tra quyền POS, kiểm tra tuổi `T13`/`T16`/`T18` theo ngày chiếu VN, chống ghế lẻ `ORPHAN_SEAT` có miễn cho POS & khi phân đoạn còn `<= 2` ghế trống), `release_seats` (chống IDOR), `extend_pos_hold`, `expire_overdue_holds`.
- `layer-4/task-02`: `20261111040100_rpc_payment.sql` + `041_payment_rpc.test.sql` (54 pgTAP tests): `confirm_paid` (idempotent, xử lý tiền về muộn & lệch tiền `AMOUNT_MISMATCH` chuyển sang `needs_manual_review`), `mark_payment_cancelled`, `confirm_zero_amount` (bảo vệ BOLA), `confirm_pos_sale` (kiểm tra `SHOWTIME_CANCELLED`, sequence `internal_payment_order_code_seq`).
- `layer-4/task-03`: `20261111040200_rpc_voucher.sql` + `042_voucher.test.sql` (38 pgTAP tests): `apply_voucher` (`FOR UPDATE` chống race, rate limit `hit_rate_limit`, `ON CONFLICT (order_id) DO UPDATE`), `remove_voucher`, trigger `orders_voucher_status_sync`.
- `layer-4/task-04`: `20261111040300_rpc_cancel.sql` + `043_cancel.test.sql` (32 pgTAP tests): `preview_cancel_showtimes`, `cancel_showtimes` (`affected_order_cases`, `counter_contact` cho POS, `email_outbox` cho WEB), `set_cinema_status` (chặn đóng rạp còn suất tương lai đã bán — AC-26).
- `layer-4/task-05`: `20261111040400_rpc_checkin_reports.sql` + `044_checkin_reports.test.sql` (39 pgTAP tests): `checkin_ticket` (chống spoofing `p_staff_id`, kiểm rạp trước bảo vệ PII AC-13, vé đã dùng AC-12, cửa sổ thời gian, hỗ trợ đơn đa vé) + 4 View/RPC báo cáo (`v_report_revenue_daily`, `v_report_showtime_sales` loại `AISLE`/`BROKEN`, `v_report_payos_reconciliation`, `v_report_cancelled_showtimes`).
- `layer-4/task-06`: `20261111040500_identity_hooks.sql` + `045_identity_hooks.test.sql` (18 pgTAP tests) + `IdentityModule` + `identity.e2e-spec.ts` (19 tests): chặn auto-merge OAuth trùng email mật khẩu (AC-04), chặn huỷ phương thức cuối hoặc `'email'` (AC-05), thêm mật khẩu lần đầu (R-22), Facebook thiếu email (#18).
- `layer-4/task-07`: Wiring API #2 (`AppModule` + `database.types.ts` đầy đủ + `app.e2e-spec.ts` 8 tests).
- `layer-4/task-08`: `PricingModule` (`holidays`, `price_rules` 2 cấp, `price-quote` AC-15 + `pricing.e2e-spec.ts` 25 tests).
- `layer-4/task-09`: `supabase/seed.sql` + `supabase/seed/README.md` (idempotent 5 rạp, 16 phòng, 1.056 ghế, 12 phim, bảng giá chuỗi + override HN02, 298 suất chiếu có suất trong 2 giờ tới, 6 tài khoản mẫu, 5 POS keys).
- `layer-4/task-10`: Web `/` & `/phim` (`MovieCard`, `MovieFilters`, `ProvincePickerDialog`, `home.test.tsx` 17 tests).
- `layer-4/task-11`: Web `/phim/[slug]` & `/lich-chieu` (`ShowtimeSchedule`, `BookingStepper`, `movie-jsonld.ts`, `schedule.test.tsx` 9 tests).
- `layer-4/task-12`: Web `/rap` & `/rap/[code]` (`CinemaMap` Leaflet client-only, `FavoriteButton`, `cinema-jsonld.ts` chống XSS, `sitemap.ts`, `robots.ts`, `cinemas.test.tsx` 9 tests).

## 2. Trạng thái Verify sau Layer 4
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (22 files, 312/312 tests: `shared` 14, `api` 209, `web` 89)
- `pnpm build`: PASS (`apps/api` 56 files + `apps/web` 14 Next.js 16 Turbopack routes)
- `pnpm db:test`: PASS (14 pgTAP suites, 566/566 tests)

## 3. Kế hoạch tiếp theo — Layer 5 (13 tasks)
- `layer-5/task-01`: API booking: sơ đồ ghế, giữ/nhả ghế, đơn, tóm tắt, đồng ý điều khoản, voucher trên đơn
- `layer-5/task-02`: API thanh toán PayOS: tạo link, webhook (checksum, idempotent, đối chiếu tiền), polling, huỷ, đơn 0đ
- `layer-5/task-03`: Mail (Resend) + worker `email_outbox` (retry) + job endpoint gửi email
- `layer-5/task-04`: API soát vé: quét QR/nhập mã theo rạp làm việc
- `layer-5/task-05`: API POS `/pos/v1/*` (khoá API theo rạp, idempotent, log + rate limit) + endpoint POS giả lập cho Staff
- `layer-5/task-06`: API quản trị: người dùng & vai trò, gán rạp, cấu hình chuỗi, khoá API POS, audit log, voucher CRUD
- `layer-5/task-07`: API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo MVP, Việc cần làm
- `layer-5/task-08`: API huỷ suất / đóng rạp / đơn bị ảnh hưởng (+ CSV, gửi lại email)
- `layer-5/task-09`: Wiring API #3: đăng ký `IdentityModule` + `PricingModule`, sinh lại types
- `layer-5/task-10`: Web đăng nhập/đăng ký/xác nhận email/quên & đặt lại mật khẩu + OAuth
- `layer-5/task-11`: Web tài khoản: hồ sơ, đổi email/mật khẩu, avatar, rạp yêu thích, tuỳ chọn email, xoá tài khoản + banner chưa xác nhận
- `layer-5/task-12`: Web bảo mật & liên kết tài khoản + bước bổ sung email Facebook
- `layer-5/task-13`: Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm vi rạp
