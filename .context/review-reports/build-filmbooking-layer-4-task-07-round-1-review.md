# Adversarial Code Review Report: Layer 4 Task 07 (Wiring API #2 & Database Types)

- **Work Item:** `build/build-filmbooking`
- **Task:** `layer-4/task-07` — Wiring API #2: đăng ký catalog, cinema-ops, auth-ext, profile + sinh lại types
- **Reviewer:** Independent Adversarial Reviewer (`Model: pro`)
- **Review Level:** `STRICT` (Chạm `app.module.ts` wiring toàn bộ API backend, `database.types.ts` shared toàn monorepo, và E2E smoke suite)
- **Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-07`
- **Round:** 1
- **Verdict:** **STRICT PASS**

---

## 1. Scope & Surgical Diff Audit

Kiểm tra `git status --short` trong worktree:
```text
 M apps/api/src/app.module.ts
 M packages/shared/src/database.types.ts
?? apps/api/test/app.e2e-spec.ts
```
- **Files touched:** Đúng chính xác 3 file được khai báo trong `tasks/build-filmbooking/layer-4-task-07.md`.
- Không có bất kỳ file rác, file tạm, file ngoài scope hay drive-by refactor nào.
- Dòng code thay đổi đều trace trực tiếp về mục tiêu wiring và cập nhật schema.

---

## 2. Cross-Boundary Schema Audit (Database ↔ TypeScript Types)

Đối chiếu chéo toàn bộ 8 migration SQL (`supabase/migrations/*.sql`) từ Layer 1 đến Layer 3 với `packages/shared/src/database.types.ts`:

### 2.1 Bảng (Tables)
- **Database Migration:** 34 bảng được tạo (`affected_order_actions`, `app_settings`, `audit_logs`, `checkin_logs`, `cinema_settings`, `cinemas`, `consents`, `disposable_email_domains`, `email_outbox`, `favorite_cinemas`, `holidays`, `login_attempts`, `movies`, `order_seats`, `orders`, `payment_events`, `payments`, `pos_api_keys`, `pos_api_logs`, `price_rules`, `profiles`, `provinces`, `rate_limit_buckets`, `rooms`, `seat_status_public`, `seats`, `showtime_seat_locks`, `showtime_seat_states`, `showtimes`, `staff_assignments`, `tickets`, `user_roles`, `voucher_redemptions`, `vouchers`).
- **`database.types.ts`:** Có đầy đủ chính xác 34 bảng trong `Database["public"]["Tables"]` (100% khớp danh sách).
- Các cột nhạy cảm/trạng thái (như `orders.status` enum `order_status`, `showtime_seat_states.state` enum `seat_state`, snapshot columns trong `orders`) khớp chính xác về type, nullability và default.

### 2.2 Kiểu liệt kê (Enums)
- **Database Migration:** 26 custom enums được định nghĩa.
- **`database.types.ts`:** Có đầy đủ chính xác 26 enums trong `Database["public"]["Enums"]` (100% khớp).

### 2.3 Hàm gọi được (Callable Functions / RPC)
- **Database Migration:** Các hàm callable (`price_quote`, `purge_expired_ops_data`, `recompute_future_showtime_ends`, `can_view_order`, `clear_login_failures`, `delete_unconfirmed_users`, `has_cinema_role`, `hit_rate_limit`, `hook_before_user_created`, `is_admin`, `is_disposable_email`, `is_login_locked`, `register_login_failure`, `showtime_has_sales`).
- **`database.types.ts`:** Đầy đủ 14 callable functions; các trigger functions trả về `trigger` được loại trừ chuẩn xác theo định dạng của Supabase CLI generator.
- Signature của `price_quote` khớp hoàn toàn:
  - `Args`: `{ p_seat_ids: string[]; p_showtime_id: string }`
  - `Returns`: `{ amount: number; seat_count: number; seat_id: string; seat_type: Database["public"]["Enums"]["seat_type"] }[]`

---

## 3. AppModule & Dependency Injection Audit

Đã kiểm tra kỹ `apps/api/src/app.module.ts`:
- **Module imports:**
  - `AppConfigModule` (global config)
  - `SupabaseModule` (global Supabase client)
  - `AuthModule` (cung cấp guards & throttler)
  - `MeModule` (cung cấp `/me`)
  - `CatalogModule` (mới wiring: `CinemasController`, `MoviesController`)
  - `CinemaOpsModule` (mới wiring: `RoomsController`, `ShowtimesController`)
  - `AuthExtModule` (mới wiring: `AuthExtController`)
  - `ProfileModule` (mới wiring: `ProfileController`)
- **Controllers:** `HealthController` (`/health`).
- **Thứ tự APP_GUARD:**
  1. `AuthGuard`
  2. `RolesGuard`
  3. `CinemaScopeGuard`
  4. `ThrottlerGuard`
  => Bảo đảm tính đúng đắn: Xác thực danh tính trước -> Kiểm tra quyền RBAC -> Kiểm tra phạm vi rạp CinemaScope -> Áp rate-limit theo IP/user.
- **`onModuleInit`:** Thiết lập `trust proxy` cho adapter instance từ `TRUST_PROXY_HOPS` / production flag để Throttler đọc đúng IP thực phía sau reverse proxy.
- **Không có xung đột route (Route Collision):**
  - Đã rà soát toàn bộ route decorators của cả 8 controllers. Các endpoint phân tách rõ ràng, không có namespace đè nhau giữa `ProfileController` (`/me/profile`, `/me/favorites`,...) và `MeController` (`/me`).

---

## 4. Test & Mock Quality Audit (Chống False Confidence)

Kiểm tra `apps/api/test/app.e2e-spec.ts`:
- Kiểm tra việc bootstrap thực tế `AppModule` qua `Test.createTestingModule({ imports: [AppModule] })`. Toàn bộ cây DI của tất cả 8 modules compile và khởi tạo sạch sẽ.
- Mock `createFakeSupabase`:
  - Dùng proxy pattern mô phỏng query builder `from(...)` và `getUserById(...)`.
  - Mock `profiles` trả về đủ 11 thuộc tính khớp `public.profiles` trong DB thật.
  - Không giả lập sai lệch mã lỗi hay bypass security filters.
- Đầy đủ các kịch bản smoke test:
  - `GET /health` -> 200 `{ status: "ok" }` + kiểm tra security header `x-content-type-options: nosniff` và `access-control-allow-origin`.
  - `GET /cinemas` -> 200 (route public của `CatalogModule`).
  - `GET /movies` -> 200 (route public của `CatalogModule`).
  - `GET /me/profile` -> 401 `UNAUTHENTICATED` khi không truyền Bearer token.
  - `GET /me/profile` -> 200 với token JWT hợp lệ sinh bởi `jose`.
  - `POST /auth/login` -> 400 `VALIDATION_ERROR` khi gửi body rỗng (chứng minh route `@Public` của `AuthExtModule` được mount và pipeline validation chạy đúng).
  - `GET /cinemas/:cinemaId/rooms` -> 401 `UNAUTHENTICATED` khi không truyền Bearer token (chứng minh route của `CinemaOpsModule` được bảo vệ chặt chẽ bởi `AuthGuard`).

---

## 5. Verification Commands Execution Results

Tất cả lệnh verify trong allowlist (`.context/project-config.md`) đều đã được thực thi trực tiếp trong worktree:

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `pnpm lint` | **PASS** | Sạch cả 3 workspace (`packages/shared`, `apps/web`, `apps/api`), không warning/error |
| `pnpm typecheck` | **PASS** | TypeScript compile thành công 100% không lỗi |
| `pnpm test` | **PASS** | 17 test files, **233 tests** across monorepo pass 100% |
| `pnpm build` | **PASS** | `apps/api` build 48 files, `apps/web` compile & export 6 static routes thành công |

---

## 6. Gates & Code Quality Checklist

- **File size rule:**
  - `apps/api/src/app.module.ts`: 53 dòng (≤ 300 dòng) — ĐẠT.
  - `apps/api/test/app.e2e-spec.ts`: 201 dòng (≤ 300 dòng) — ĐẠT.
  - `packages/shared/src/database.types.ts`: Code gen từ DB schema.
- **Function size rule:**
  - `onModuleInit`: 4 dòng (≤ 50 dòng) — ĐẠT.
- **Anti-slop / Oxlint gate:** `skip, oxlint not configured` (chưa có file cấu hình oxlint trong repo).
- **Aislop gate:** `skip, aislop not installed` (công cụ CLI chưa được cài).
- **Open Code Review gate:** `ocr review` đã chạy: 0 CRITICAL, 0 MAJOR finding — ĐẠT.
- **AI-readable gate:** Tên class, module, biến rõ ràng; không có narrative comment, không magic number vô cớ — ĐẠT (0 indicators).
- **Security & PII gate:** Không hardcode secret (JWT secret test nội bộ sinh ngẫu nhiên); security headers được kiểm tra; các protected routes từ chối request unauthenticated trả về 401.

---

## 7. Kết luận

Builder đã hoàn thành xuất sắc `layer-4/task-07` đúng phạm vi cho phép, không gây breaking change, khớp hoàn toàn schema cơ sở dữ liệu và wiring thành công toàn bộ các module backend.

**Verdict: STRICT PASS**
