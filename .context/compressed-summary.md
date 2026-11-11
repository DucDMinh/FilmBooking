# Compressed Context Summary — FilmBooking (sau Layer 3)

- **Cập nhật lúc:** 2026-11-11T16:37:00+07:00
- **Work item:** `build/build-filmbooking` (`mode: initial-build`, `currentLayer: 4 / totalLayers: 9`)
- **Branch chính:** `staging` (tag: `layer-3-done`)

## 1. Các Layer đã hoàn thành (Layers 0 → 3)

### Layer 0 — Bootstrap & Hạ tầng (`layer-0-done`)
- `layer-0/task-01`: Monorepo `pnpm` (`packages/shared`, `apps/api`, `apps/web`), TypeScript/Biome/Vitest, CI workflows.
- `layer-0/task-02`: Supabase local config (`supabase/config.toml`), scripts `db:start`, `db:reset`, `db:test`, `db:types`.

### Layer 1 — Nền tảng App & DB Core (`layer-1-done`)
- `layer-1/task-01`: Next.js 16 App Router + Tailwind v4 + design tokens (`Cinematic Amber & Velvet Nocturne`) + Supabase SSR clients.
- `layer-1/task-02`: NestJS 11 core (`ConfigModule`, `SupabaseModule`, `ProblemExceptionFilter` RFC 7807, `ZodValidationPipe`, `/api/v1/health`).
- `layer-1/task-03`: Migration `20261111010000_core_foundation.sql` (`enums`, `profiles`, `role_assignments`, `user_identities`, helper functions `current_app_role()`, `has_cinema_Optimized()`, `is_staff_or_above()`, RLS).

### Layer 2 — Catalog Schema, Security Ops, Guards & Web Shell (`layer-2-done`)
- `layer-2/task-01`: Migration `20261111020000_catalog_cinema.sql` (`genres`, `movies`, `movie_genres`, `cinemas`, `auditoriums`, `seats`, `showtimes`, RLS).
- `layer-2/task-02`: Migration `20261111020100_security_ops.sql` (`login_attempts`, `rate_limit_buckets`, `disposable_email_domains`, `audit_logs`, `email_outbox`, `record_login_failure()`, `hit_rate_limit()`).
- `layer-2/task-03`: NestJS `AuthGuard` (JWT), `RolesGuard` (`@Roles`), `CinemaScopeGuard` (`@CinemaScoped`), `RateLimitGuard`, `AuditInterceptor`.
- `layer-2/task-04`: `packages/shared` schemas/constants (`auth`, `catalog`, `booking`, `admin`, `problem`) + `apps/web/src/lib/api-client.ts`.
- `layer-2/task-05`: Web Shell (`Header`, `Footer`, `CountdownBadge`, `PriceBreakdownDrawer`, `PosterCard`, route groups `(public)`, `(auth)`, `(account)`, `(staff)`, `(admin)`).

### Layer 3 — Pricing, Booking Schema & Core API Modules (`layer-3-done`)
- `layer-3/task-01`:
  - `20261111030000_pricing.sql`: `holidays`, `price_rules` (2 cấp chuỗi/rạp), `compute_day_type()` (mốc 17:00 `Asia/Ho_Chi_Minh`), `resolve_seat_unit_price()`, `price_quote()`.
  - `20261111030010_security_ops_hardening.sql`: subdomain match cho `is_disposable_email`, bounds check `hit_rate_limit`, `cleanup_expired_ops_data()`.
  - `20261111030020_catalog_fixes.sql`: chốt 1 nguồn `cinemas.cleaning_minutes` (G1), ẩn suất rạp `CLOSED` cho khách/anon (G2), trigger recalculating `showtimes.ends_at`.
- `layer-3/task-02`:
  - `20261111030100_booking_tables.sql`: `vouchers`, `booking_orders` (kèm snapshot suất/phim/rạp), `booking_order_items`, `showtime_seat_states` (kèm ` supabase_realtime`), `tickets`, `payment_attempts`, `voucher_redemptions`, trigger snapshot & RLS cô lập theo khách/rạp.
- `layer-3/task-03`: Wiring API #1 (`AuthModule` global với `APP_GUARD`: `AuthGuard` [hỗ trợ HS256 + JWKS RS256/ES256] → `RolesGuard` → `CinemaScopeGuard`, `MeModule` `/api/v1/me` & `/api/v1/me/Scope`, `@Public()` cho `/api/v1/health`, sinh `database.types.ts`).
- `layer-3/task-04`: `CatalogModule` (`/api/v1/movies`, `/api/v1/cinemas`, `/api/v1/showtimes`, `/api/v1/admin/movies`, `/api/v1/admin/cinemas`).
- `layer-3/task-05`: `CinemaOpsModule` (auditoriums, seat-map batch upsert khóa khi có ghế `HOLD`/`SOLD`, showtimes chống chồng giờ `SHOWTIME_OVERLAP`, `price-rules`, `holidays`).
- `layer-3/task-06`: `AuthExtModule` (`register`, `login` khóa 5 lần sai trong 15 phút `ACCOUNT_LOCKED` 423, `resend-confirmation` 60s/5h, `forgot-password`, `reset-password` kiểm tra `recovery_sent_at <= 1h` theo quyết định G5=C).
- `layer-3/task-07`: `ProfileModule` (`GET/PATCH /me/profile`, `POST /me/change-email`, `POST /me/delete-account` ẩn danh PII khi còn đơn trong 24 tháng).

## 2. Trạng thái Verify sau Layer 3
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (16 files, 224/224 tests)
- `pnpm build`: PASS (`apps/api` + `apps/web`)
- `pnpm db:test`: PASS (8 pgTAP suites, 329/329 tests)

## 3. Kế hoạch tiếp theo — Layer 4 (7 tasks)
- `layer-4-task-01`: RPC nguyên tử giữ ghế (`hold_seats`, `release_hold`, `release_expired_holds`)
- `layer-4-task-02`: RPC áp mã giảm giá & chốt đơn thanh toán (`apply_voucher`, `confirm_order_paid`, `expire_order`)
- `layer-4-task-03`: RPC huỷ suất chiếu hàng loạt + tự động hoàn tiền (`cancel_showtimes_and_refund`)
- `layer-4-task-04`: RPC soát vé QR tại quầy (`checkin_ticket` — quy tắc -30' → +20')
- `layer-4-task-05`: Seed dữ liệu mẫu (`supabase/seed.sql` — 3 rạp, 6 phòng, ghế, 10 phim, ~120 suất chiếu, bảng giá, ngày lễ, 3 voucher, tài khoản mẫu)
- `layer-4-task-06`: UI công khai xem phim/rạp/lịch chiếu (`apps/web/src/app/(public)/*`)
- `layer-4-task-07`: Wiring API #2 (đăng ký `CatalogModule`, `CinemaOpsModule`, `AuthExtModule`, `ProfileModule` vào `AppModule` + cập nhật `database.types.ts` cho bảng Layer 3/4 + smoke e2e)
