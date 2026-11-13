# Báo cáo Review Độc lập: layer-5-task-09 (Wiring API #3)

- **Work item:** `build-filmbooking`
- **Task:** `layer-5-task-09` (Wiring API #3: đăng ký identity + pricing, sinh lại types)
- **Review round:** Round 1
- **Review Level:** `STRICT`
- **Reviewer:** Adversarial Reviewer (Agent: reviewer)
- **Ngày review:** 2026-11-13
- **Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-09`

---

## 1. Kết luận tổng quan (Verdict)

**`STRICT PASS`**

Task thực hiện chính xác và tối giản đúng phạm vi được giao:
1. Đăng ký `IdentityModule` và `PricingModule` vào `AppModule` trong `apps/api/src/app.module.ts`.
2. Giữ nguyên thứ tự và cấu hình các global filter (`AllExceptionsFilter`) và global guards (`AuthGuard` -> `RolesGuard` -> `CinemaScopeGuard` -> `ThrottlerGuard`).
3. Đồng bộ hoàn chỉnh signatures các RPCs và tables trong `packages/shared/src/database.types.ts` khớp 100% với các migration PostgreSQL thực tế.
4. Toàn bộ verify commands: typecheck, lint, test (230/230 tests pass trên 15 test suites) đều xanh.

---

## 2. Kết quả kiểm tra Verify Commands

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `pnpm -w typecheck` | **PASS** (Exit 0) | Cả 3 workspace (`@filmbooking/shared`, `@filmbooking/api`, `@filmbooking/web`) sạch type error. |
| `pnpm -w lint` | **PASS** (Exit 0) | Eslint không phát hiện lỗi lint nào trên toàn workspace. |
| `pnpm --filter @filmbooking/api test` | **PASS** (Exit 0) | 15 test files passed, 230 tests passed (18.47s), bao gồm `app.e2e-spec.ts`, `identity.e2e-spec.ts`, `pricing.e2e-spec.ts`. |
| `npx oxlint apps/api/src/app.module.ts` | **PASS** (Exit 0) | 0 warnings, 0 errors với 96 rules. |
| `ocr review --format json` (Open Code Review) | **PASS** (Exit 0) | 0 finding(s) across selected items. |
| `aislop` | *Skip* | Công cụ chưa cài đặt trong môi trường. |

---

## 3. Đối chiếu chéo Database Schema & RPC Signatures (Cross-Boundary Audit)

Đã kiểm tra đối chiếu trực tiếp giữa `packages/shared/src/database.types.ts` và các file migration thực tế dưới `supabase/migrations/*.sql`:

| RPC / Function | Migration nguồn | Trạng thái trong database.types.ts | Đánh giá |
|---|---|---|---|
| `hold_seats` | `20261112140000_hold_seats_hardening.sql` | `Args: { p_showtime_id, p_seat_ids, p_channel?, p_user_id?, p_request_id? }`<br>`Returns: { order_id, booking_code, hold_expires_at, subtotal_amount, discount_amount, total_amount, seat_count }[]` | Khớp 100% |
| `confirm_paid` | `20261112110000_confirm_paid_hardening.sql` | `Args: { p_order_id, p_amount, p_transaction_ref, p_order_code? }`<br>`Returns: Json` | Khớp 100% |
| `confirm_zero_amount`| `20261112120000_zero_amount_sell_hardening.sql`| `Args: { p_order_id }`<br>`Returns: Json` | Khớp 100% |
| `apply_voucher` | `20261111040200_rpc_voucher.sql` | `Args: { p_order_id, p_code }`<br>`Returns: Json` | Khớp 100% |
| `price_quote` | `20261111030000_pricing.sql` | `Args: { p_showtime_id, p_seat_ids }`<br>`Returns: { seat_id, seat_type, seat_count, amount }[]` | Khớp 100% |
| `cancel_showtimes` | `20261112150000_cancel_showtimes_hardening.sql` | `Args: { p_showtime_ids, p_reason, p_actor_id? }`<br>`Returns: Json` | Khớp 100% |
| `checkin_ticket` | `20261111040400_rpc_checkin_reports.sql` | `Args: { p_token_or_code, p_cinema_id, p_staff_id? }`<br>`Returns: Json` | Khớp 100% |
| `set_cinema_status`| `20261112160000_rbac_cinema_reports_hardening.sql`| `Args: { p_cinema_id, p_status }`<br>`Returns: Json` | Khớp 100% |
| `get_user_identities`| `20261112050000_identity_rpc_hardening.sql`| `Args: { p_user_id }`<br>`Returns: Json` | Khớp 100% |
| `unlink_user_identity`| `20261112050000_identity_rpc_hardening.sql`| `Args: { p_provider, p_user_id }`<br>`Returns: Json` | Khớp 100% |

---

## 4. Kiểm tra Acceptance Criteria & Invariants

1. **App khởi động bình thường:**
   - Đã verify qua `app.e2e-spec.ts`: `AppModule` compile, initialize, inject thành công `IdentityModule` và `PricingModule`.
2. **`GET /me/identities` trả về 401 khi không token:**
   - `IdentityController.getIdentities` không dùng `@Public()`.
   - Global `AuthGuard` xử lý request không bearer token -> ném `AppException(ERROR_CODES.UNAUTHENTICATED)` -> HTTP 401. Đã được test xác nhận trong `identity.e2e-spec.ts`.
3. **`GET /showtimes/:id/prices` trả về 200:**
   - `PricingController.getShowtimePrices` gắn `@Public()`, bypass AuthGuard và trả về cấu trúc giá suất chiếu (AC-15). Đã được test xác nhận trong `pricing.e2e-spec.ts`.
4. **Surgical Diff:**
   - Chỉ thay đổi 4 dòng trong `apps/api/src/app.module.ts` (thêm 2 import lines và 2 module entries vào `imports: [...]`).
   - Không drive-by refactor, không sửa đổi trái phép các module khác.
   - File length: `app.module.ts` = 57 dòng (tuân thủ quy tắc <= 300 dòng/file).
5. **Anti-chaos & Code Quality:**
   - Tên module rõ ràng, tự giải thích.
   - 0 AI-chaos indicators.
   - Không có silent swallow error hoặc stub unfinished.

---

## 5. Kiến nghị cho Dispatcher / Tiếp theo

- Cho phép merge worktree `layer-5__task-09` về branch tích hợp.
- Có thể tiếp tục thực hiện các task tiếp theo của Layer 5.
