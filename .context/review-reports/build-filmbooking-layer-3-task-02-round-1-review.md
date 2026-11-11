# Review Report: Layer 3 — Task 02 (Round 1)

**Task:** Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn ảnh hưởng, check-in log + RLS + Realtime  
**Worktree:** `E:\FilmBooking\.worktrees\layer-3__task-02`  
**Review Level:** `STRICT` (liên quan trực tiếp đến schema, booking/payment integrity, RLS, và Realtime security)  
**Verdict:** `STRICT PASS`  
**Reviewer:** `reviewer` (Independent Subagent)  
**Date:** 2026-11-11  

---

## 1. Scope & Surgical Diff Review

- **Files in scope:**
  - `supabase/migrations/20261111030100_booking_tables.sql` (New)
  - `supabase/tests/031_booking_rls.test.sql` (New)
- **Git status check:** Only the two target files are present (untracked in worktree, no unintended files or drive-by refactorings).
- **Scope boundaries respected:** Migration không can thiệp vào `showtimes_derive_end` hay `showtimes_select` (được phân định cho Task 01).
- **AI-Readable Codebase & Simplicity:**
  - Cấu trúc migration phân đoạn rõ ràng: Kiểu dữ liệu -> Bảng -> Hàm nghiệp vụ/Trigger -> RLS/GRANT -> Realtime Publication.
  - Các hàm nghiệp vụ tuân thủ `search_path = ''` tuyệt đối, độ dài mỗi hàm ≤ 40 dòng.
  - File test pgTAP 299 dòng (≤ 300 dòng), tổ chức theo từng nhóm nghiệp vụ rõ ràng, dễ bảo trì.

---

## 2. Requirements & Acceptance Criteria Verification

| Requirement / AC | Yêu cầu | Kết quả kiểm tra mã nguồn & pgTAP | Đánh giá |
|---|---|---|---|
| **NFR-04 / R-62** | Ràng buộc chống bán trùng ở database: `UNIQUE(showtime_id, seat_id)` trên `showtime_seat_states` | Có `constraint showtime_seat_states_showtime_seat_key unique (showtime_id, seat_id)`. Composite FK tham chiếu `(showtime_id, room_id)` và `(seat_id, room_id)` đảm bảo cùng phòng. Insert trùng ghế cùng suất ném lỗi `23505`. Ghế bị khoá trong `showtime_seat_locks` ném lỗi `23514`. | **PASS** |
| **AC-16 / NFR-05** | Cách ly rạp: Staff/Manager rạp A không SELECT/sửa đơn, thanh toán của rạp B | Policy `orders_select` dùng `has_cinema_role(cinema_id, ['STAFF', 'MANAGER'])`. Helper `can_view_order(p_order_id)` kiểm tra quyền sở hữu theo rạp. Test pgTAP kiểm tra Manager HN01 vs HN02, Staff HN01 vs HN02 (đều 0 rows khi truy vấn chéo). | **PASS** |
| **AC-17 / NFR-05** | Cách ly khách: Khách A không SELECT được đơn, vé, thanh toán, ghế của khách B | Policy `orders_select` cho phép `user_id = auth.uid()`. Các bảng `order_seats`, `tickets`, `payments` đều áp dụng `can_view_order(order_id)`. Test pgTAP kiểm tra truy vấn chéo giữa `cust1` và `cust2` đều trả về 0 rows. | **PASS** |
| **NFR-05 / R-60** | Realtime an toàn: `seat_status_public` công khai, đưa vào publication `supabase_realtime`, không rò rỉ `user_id`/`order_id` | Bảng `seat_status_public` chỉ có 4 cột: `(showtime_id, seat_id, state, expires_at)`. Không có `user_id` hay `order_id` (được verify qua `information_schema.columns`). `replica identity full` hỗ trợ client filter DELETE event. Trigger `seat_status_public_sync` đồng bộ nguyên tử ngay trong transaction. | **PASS** |
| **R-54** | Bảo vệ suất đã bán vé: Không xoá, không đổi giờ (`starts_at`, `ends_at`), phòng, phim, định dạng | Hàm `showtime_has_sales(p_showtime_id)` (security definer) và trigger `showtimes_protect_sold` chặn DELETE/UPDATE các thuộc tính cốt lõi khi đã có vé hoặc đơn `paid/checked_in/affected...`. Cho phép đổi `status` sang `CLOSED` hoặc `CANCELLED`. Bảng `orders` và `tickets` đều có `ON DELETE RESTRICT` trên `showtime_id`. | **PASS** |
| **R-81** | Không lưu dữ liệu thẻ / tài khoản ngân hàng | Kiểm tra schema các bảng `payments`, `payment_events`, `orders`: không có bất kỳ cột nào chứa `card`, `pan`, `cvv`, `bank`, `account`. Bảng `payment_events` có `transaction_ref UNIQUE` phục vụ idempotent webhook. | **PASS** |
| **R-85** | QR token ngẫu nhiên 128-bit, không PII | Cột `qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex') check (qr_token ~ '^[0-9a-f]{32}$')`. Không lưu PII trong `tickets`. | **PASS** |
| **§8.5 Máy trạng thái đơn** | Quy tắc chuyển trạng thái đơn hàng chặt chẽ | Trigger `orders_guard_transition` chặn mọi chuyển dịch trạng thái không hợp lệ, chặn sửa `channel`, `showtime_id`, `cinema_id`. Cho phép chuyển tiền về muộn cho đơn `cancelled/expired` theo quyết định MVP. Mã `booking_code` bắt buộc khớp tiền tố mã rạp (`HN01-XXXXXX`). | **PASS** |
| **R-64** | Mỗi khách tối đa 1 đơn holding trên toàn chuỗi | Unique partial index `orders_one_holding_per_user_key on public.orders (user_id) where status = 'holding' and user_id is not null;`. | **PASS** |
| **R-110 / Quyết định #6** | Staff/Manager ghi nhận đơn `affected` tại quầy rạp mình | Bảng `affected_order_actions` cấp quyền INSERT cho Staff/Manager rạp của đơn. Trigger kiểm tra đơn phải ở `affected`, bắt buộc có `refund_reference` và `refunded_amount` nếu hoàn tiền thủ công. Cập nhật tự động đơn sang `exchanged` hoặc `refunded_manual`. | **PASS** |
| **R-101 / R-102** | Check-in logs cách ly, không PII | `checkin_logs` lưu kết quả quét, chỉ cho phép xem theo rạp của máy quét hoặc rạp sở hữu vé (Manager). | **PASS** |
| **Snapshot suất (follow-up L2-T01)** | Khách vẫn xem được thông tin vé khi phim bị archive/ẩn RLS | Trigger `orders_fill_snapshot` tự động chụp `movie_title`, `cinema_code`, `cinema_name`, `room_name`, `showtime_starts_at`, `showtime_ends_at` vào bản ghi đơn hàng khi tạo đơn. Test xác nhận phim đổi sang `ARCHIVED` khách vẫn xem đủ snapshot đơn. | **PASS** |

---

## 3. Migration Safety Analysis

- **Chính sách:** `destructive_migration_policy: HIGH_RISK_MIGRATION`
- **Thao tác trong file migration:**
  - `CREATE TYPE`: 8 enum types mới.
  - `CREATE TABLE`: 11 bảng mới (`vouchers`, `orders`, `order_seats`, `showtime_seat_states`, `seat_status_public`, `tickets`, `payments`, `payment_events`, `voucher_redemptions`, `affected_order_actions`, `checkin_logs`).
  - `CREATE INDEX`, `CREATE TRIGGER`, `CREATE FUNCTION`: Bổ sung triggers và indexes tương ứng.
  - `ALTER TABLE public.showtimes`: Chỉ thêm 1 trigger BEFORE UPDATE OR DELETE (`showtimes_protect_sold`). Hoàn toàn không sửa đổi cấu trúc cột hoặc kiểu dữ liệu của bảng `showtimes`.
  - Không có `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER TABLE ... DROP`, không backfill phá huỷ dữ liệu.
- **Kết luận an toàn:** Migration hoàn toàn mang tính bồi đắp (additive schema), an toàn khi áp dụng, **KHÔNG gắn cờ HIGH_RISK_MIGRATION**.

---

## 4. Security & Hardening Review

1. **RLS Fail-Closed:**
   - Cả 11 bảng đều được bật RLS (`alter table ... enable row level security`).
   - Lệnh `revoke all on ... from anon, authenticated` được thực thi trước khi cấp quyền tối thiểu.
   - Không cấp quyền INSERT/UPDATE/DELETE trực tiếp cho `authenticated` trên các bảng lõi (`orders`, `showtime_seat_states`, `tickets`, `payments`) — ghi dữ liệu bắt buộc qua RPC Security Definer hoặc Service Role ở backend.
2. **Search Path Hijacking Protection:**
   - Tất cả hàm `SECURITY DEFINER` đều có khai báo tường minh:
     ```sql
     security definer
     set search_path = ''
     ```
   - Tất cả các đối tượng bên trong thân hàm đều được qualify đầy đủ tiền tố schema (ví dụ: `public.orders`, `public.showtimes`, `auth.uid()`).
3. **Thu hồi quyền thực thi:**
   - Các hàm nghiệp vụ/trigger nội bộ đều được `REVOKE ALL ON FUNCTION ... FROM public, anon, authenticated;` để ngăn chặn việc người dùng gọi trực tiếp qua PostgREST RPC.
   - Chỉ duy nhất hàm kiểm tra `can_view_order(uuid)` được grant cho `authenticated, service_role`.
4. **Audit Triggers:**
   - 5 bảng quan trọng (`orders`, `payments`, `tickets`, `vouchers`, `affected_order_actions`) đều được gắn trigger kiểm toán `audit_row_change`.

---

## 5. Verification Commands Results

1. **`pnpm lint`:** PASS (3/3 workspace projects clean, 0 errors, 0 warnings).
2. **`pnpm typecheck`:** PASS (3/3 workspace projects clean, 0 type errors).
3. **`pnpm test`:** PASS (113/113 tests passed: 14 packages/shared, 45 apps/api, 54 apps/web).
4. **`pnpm build`:** PASS (apps/api build clean; apps/web Next.js Turbopack build clean).
5. **Database Tests (pgTAP):** 55/55 assertions trong `031_booking_rls.test.sql` PASS hoàn toàn.
6. **Open Code Review (`ocr delegate preview`):** 2 files reviewable, clean diff (+938 lines, 0 deletions).
7. **AI-Slop & Anti-Slop Gate:** N/A (chỉ có file SQL migration và test pgTAP, không có file TS/JS thay đổi).

---

## 6. Verdict

**Verdict: `STRICT PASS`**

Task 02 đã hoàn thành xuất sắc toàn bộ yêu cầu kỹ thuật và nghiệp vụ: schema đặt vé toàn diện, an toàn giao dịch chống bán trùng, RLS bảo mật tuyệt đối cho cả đa rạp và đa khách, realtime an toàn không lộ PII, bảo vệ suất đã bán vé và máy trạng thái đơn hàng chặt chẽ. Đủ điều kiện để dispatcher commit và tích hợp.
