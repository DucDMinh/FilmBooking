# Review Report: build-filmbooking-layer-4-task-08 (Round 1)

**Reviewer:** `pro` (Adversarial Reviewer)  
**Task:** `tasks/build-filmbooking/layer-4-task-08.md` — API bảng giá & ngày lễ (quản trị) + báo giá  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-08`  
**Review Level:** `STRICT` (Bảng giá 2 cấp, RPC báo giá, RBAC phân quyền rạp, kiểm thử tài chính)  
**Verdict:** **STRICT PASS**

---

## 1. Tóm tắt phạm vi & Verification Commands

### Files in Scope (Surgical Diff Audit)
Đã đối chiếu `git status` trong worktree, chỉ tạo đúng 5 file được giao trong scope, không đụng chạm file ngoài:
- `packages/shared/src/schemas/pricing.ts` (New)
- `apps/api/src/modules/pricing/pricing.module.ts` (New)
- `apps/api/src/modules/pricing/pricing.controller.ts` (New)
- `apps/api/src/modules/pricing/pricing.service.ts` (New)
- `apps/api/test/pricing.e2e-spec.ts` (New)

### Kết quả chạy Verify Commands (Allowlist)
- `pnpm lint`: **PASS** (Exit 0, 0 errors, 0 warnings across monorepo)
- `pnpm typecheck`: **PASS** (Exit 0, tsc passed across `@filmbooking/shared`, `@filmbooking/api`, `@filmbooking/web`)
- `pnpm test`: **PASS** (Exit 0, 12 test files passed, 182 tests passed trong `apps/api`, 25/25 tests passed trong `pricing.e2e-spec.ts`)
- `pnpm build`: **PASS** (Exit 0, compiled NestJS API + Next.js App Router)
- `oxlint / aislop`: Skip (chưa cấu hình trong repo)

---

## 2. Adversarial Cross-Boundary Audit (Database Schema ↔ NestJS Implementation)

### 2.1 Bảng `holidays`
- **Schema đối chiếu (`20261111030000_pricing.sql` dòng 23-27):**
  - Cột: `holiday_date date primary key`, `name text not null`, `created_at timestamptz`.
- **NestJS Service & Controller:**
  - `listHolidays`: Truy vấn `holiday_date, name, created_at` sắp xếp `holiday_date asc`. Endpoint public `@Public()`.
  - `createHoliday`: `@Roles("ADMIN")`, validate date định dạng `YYYY-MM-DD`. Bắt mã lỗi Postgres `23505` (unique_violation) chuyển thành `AppException(ERROR_CODES.CONFLICT, ...)` (HTTP 409).
  - `deleteHoliday`: `@Roles("ADMIN")`. Kiểm tra số dòng bị xoá; nếu không tìm thấy trả về HTTP 404 NOT_FOUND.
  - Phân quyền khớp 100% với RLS policy: chỉ `ADMIN` mới được INSERT/DELETE `holidays`. `MANAGER` gọi POST/DELETE đều bị chặn HTTP 403 FORBIDDEN.

### 2.2 Bảng `price_rules` & Quy tắc 2 cấp (R-52)
- **Schema đối chiếu (`20261111030000_pricing.sql` dòng 30-56):**
  - Cột: `id`, `scope`, `cinema_id`, `showtime_id`, `seat_type`, `format`, `day_type`, `time_band`, `amount`, `created_at`, `updated_at`.
  - Ràng buộc CHECK:
    - `CHAIN`: `cinema_id IS NULL`, `showtime_id IS NULL`, `format/day_type/time_band NOT NULL`.
    - `CINEMA`: `cinema_id NOT NULL`, `showtime_id IS NULL`, `format/day_type/time_band NOT NULL`.
    - `SHOWTIME`: `showtime_id NOT NULL`, `format/day_type/time_band NULL`.
  - Check constraint `seat_type in ('NORMAL', 'VIP', 'SWEETBOX')` (chặn `AISLE`, `BROKEN`).
- **Shared Schema (`packages/shared/src/schemas/pricing.ts`):**
  - Zod schema `createPriceRuleSchema` sử dụng `.superRefine()` khớp hoàn hảo với database CHECK constraints cho cả 3 scope `CHAIN`, `CINEMA`, `SHOWTIME`.
  - `updatePriceRuleSchema` chỉ cho phép cập nhật `amount` (`grant update (amount) on public.price_rules to authenticated`).
- **NestJS Service & Access Control (`pricing.service.ts`):**
  - `createPriceRule`:
    - `CHAIN`: Bắt buộc `isAdmin` (nếu Manager tạo -> HTTP 403 `FORBIDDEN`).
    - `CINEMA`: Kiểm tra `access.cinemaRoles.get(cinemaId) === 'MANAGER'` hoặc `isAdmin`. Manager HN01 tạo rule cho HN02 -> HTTP 403 `FORBIDDEN_CINEMA`.
    - `SHOWTIME`: Truy vấn DB lấy `cinema_id` thực của suất chiếu `showtimes.cinema_id`, sau đó kiểm tra quyền `MANAGER` trên rạp đó. Manager HN01 tạo rule cho suất của HN02 -> HTTP 403 `FORBIDDEN_CINEMA`.
    - Xử lý mã lỗi `23505` trả về HTTP 409 CONFLICT khi trùng rule (khớp với 3 unique index: `price_rules_chain_key`, `price_rules_cinema_key`, `price_rules_showtime_key`).
  - `updatePriceRule` & `deletePriceRule`:
    - Hàm bảo vệ `assertRuleMutationAccess`: Lookup rule thực tế từ DB để lấy `scope` và `cinema_id`. Manager không thể can thiệp vào rule CHAIN hay rule của rạp khác -> HTTP 403. Ngăn chặn triệt để BOLA / IDOR.

### 2.3 Báo giá suất chiếu & Nghiệm thu AC-15
- **RPC `price_quote` (`20261111030000_pricing.sql` dòng 95-165):**
  - Service gọi `this.supabase.admin().rpc('price_quote', { p_showtime_id, p_seat_ids })`. Tên hàm và tên tham số khớp 100%.
  - Kết quả trả về gồm `seat_id`, `seat_type`, `seat_count`, `amount`. Ghế `SWEETBOX` tính `seat_count = 2` đúng chuẩn spec #19.
- **Tính toán báo giá `GET /showtimes/:showtimeId/prices`:**
  - `resolveDayTypeAndTimeBand`: Dùng `toVnParts` chuyển đổi sang giờ Việt Nam (UTC+7). Mốc 17:00 trở đi là `AFTER_17`, trước 17:00 là `BEFORE_17`. Thứ 7 / Chủ nhật là `WEEKEND`. Ngày lễ trong bảng `holidays` được ưu tiên cao nhất (`HOLIDAY` > `WEEKEND`).
  - Thứ tự ưu tiên ghi đè: `SHOWTIME` > `CINEMA` > `CHAIN`.
  - **Nghiệm thu AC-15 qua Test e2e:**
    - Giá mặc định VIP 2D tối thứ Bảy (CHAIN) = 120.000đ.
    - HN02 ghi đè CINEMA = 100.000đ.
    - Suất tại HN02 trả về 100.000đ; suất tại HN01 (không ghi đè) trả về 120.000đ. Đạt 100%.
- **Validation Giá âm / không nguyên -> 422:**
  - Pipe `Unprocessable422Pipe` bắt các lỗi liên quan đến `amount` / `integer` và ném HTTP status 422 (`HttpStatus.UNPROCESSABLE_ENTITY`) với mã lỗi `VALIDATION_ERROR`, đúng theo yêu cầu AC.

---

## 3. Mock Fidelity Audit (`apps/api/test/pricing.e2e-spec.ts`)
- Bộ test không sử dụng false-confidence shortcuts:
  - `FakeDb` cài đặt `beforeWrite` kiểm tra trùng lặp cho `holidays` và `price_rules` (3 unique keys), trả về đúng mã lỗi Postgres `23505`.
  - Mock `rpc('price_quote')` kiểm tra sự tồn tại của showtime (`23503`) và tính đúng `seat_count: 2` cho ghế `SWEETBOX`.
  - Bao phủ 25 kịch bản e2e: phân quyền CRUD holidays, phân quyền CRUD price_rules, validation 422 cho số âm/thập phân trên cả POST và PATCH, nghiệm thu AC-15, độ ưu tiên SHOWTIME > CINEMA > CHAIN, HOLIDAY > WEEKEND, và khung giờ 16:59 vs 17:00.

---

## 4. Code Quality & AI-Readable Gate
- Tên biến, class, function rõ ràng, tự giải thích (self-descriptive).
- Không có indirection thừa thãi hoặc magic numbers.
- AI-chaos indicators: Có 2 phương thức (`createPriceRule`: 73 dòng, `getShowtimePrices`: 73 dòng) vượt mốc 50 dòng do chứa logic truy vấn DB và mapping chi tiết, nhưng số lượng indicators < 3 và cấu trúc code rất mạch lạc, dễ đọc.

---

## 5. Kết luận
Task 08 đáp ứng trọn vẹn toàn bộ Acceptance Criteria (AC-15, RBAC 403, Validation 422), đối chiếu chéo 100% với Database Migration và Domain Models.

**Verdict:** **STRICT PASS**
