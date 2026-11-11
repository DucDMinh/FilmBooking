# Review Report: Layer 3 — Task 01 (Round 1)

**Task:** Migration bảng giá 2 cấp + ngày lễ + hàm price_quote (và follow-up Layer 2)  
**Worktree:** `E:\FilmBooking\.worktrees\layer-3__task-01`  
**Reviewer:** Independent Reviewer  
**Review Level:** `STRICT` (schema/migration/database/RLS/pricing)  
**Verdict:** `STRICT PASS`

---

## 1. Scope & Surgical Diff Analysis

Các file được tạo mới trong worktree khớp 100% với danh sách `Files to Create/Modify` trong task file, không có file thừa hay ngoài scope:
- `supabase/migrations/20261111030000_pricing.sql` (211 dòng)
- `supabase/migrations/20261111030010_security_ops_hardening.sql` (100 dòng)
- `supabase/migrations/20261111030020_catalog_fixes.sql` (134 dòng)
- `supabase/tests/030_pricing.test.sql` (214 dòng)
- `supabase/tests/032_security_ops_hardening.test.sql` (83 dòng)
- `supabase/tests/033_catalog_fixes.test.sql` (155 dòng)

Tất cả các file đều tuân thủ chặt chẽ giới hạn kích thước (mỗi file ≤ 300 dòng; mọi hàm PL/pgSQL ≤ 50 dòng logic).

---

## 2. Requirements & Acceptance Criteria Verification

### 2.1. AC-15 & Thứ tự ưu tiên giá (R-52, R-53, R-57, R-72)
- **Thứ tự ưu tiên:** Hàm `price_quote(p_showtime_id, p_seat_ids)` sử dụng `coalesce` chính xác theo 3 cấp:
  1. `SHOWTIME` (ghi đè theo suất chiếu cụ thể).
  2. `CINEMA` (ghi đè theo rạp cụ thể, format, day_type, time_band).
  3. `CHAIN` (mặc định toàn chuỗi).
- **Kiểm chứng pgTAP AC-15 (`030_pricing.test.sql`):** Suất 2D Thứ 7 19:00 tại rạp HN02 áp dụng rule override của HN02 = 100.000 VNĐ; rạp HN01 kế thừa giá CHAIN = 120.000 VNĐ; khi thêm rule SHOWTIME 80.000 VNĐ thì ưu tiên giá SHOWTIME.

### 2.2. Khung giờ & Múi giờ Việt Nam
- **Biên 17:00:** Chuyển đổi chính xác `v_local := v_st.starts_at at time zone 'Asia/Ho_Chi_Minh'`. Suất bắt đầu lúc `17:00:00` tính là `AFTER_17`, lúc `16:59:00` tính là `BEFORE_17`.
- **Lịch ngày theo giờ Việt Nam:** Suất chiếu 00:30 VN vào ngày lễ (vốn là 17:30 UTC ngày hôm trước) được tính chính xác theo ngày Việt Nam (`v_local::date`).

### 2.3. Ưu tiên ngày lễ (HOLIDAY > WEEKEND)
- Biểu thức đánh giá `day_type` đặt điều kiện `exists (select 1 from public.holidays ...)` trước `extract(isodow from v_local) in (6, 7)`.
- Test case ngày lễ rơi vào Chủ nhật khẳng định giá áp dụng là HOLIDAY (150.000 VNĐ), không bị áp nhầm giá WEEKEND.

### 2.4. Ghế Sweetbox & Định dạng tiền tệ
- Ghế `SWEETBOX` trả về 1 dòng với giá cặp và `seat_count = 2` (chuẩn bị cho rule giới hạn 8 ghế/đơn ở task orders).
- Đơn vị tiền tệ `amount` là số nguyên VND (`integer check (amount >= 0)`). Không cho phép bán giá 0 hoặc thiếu rule giá (ném lỗi `P0002`).

### 2.5. Follow-up Layer 2: Security & Ops Hardening (`20261111030010_security_ops_hardening.sql`)
- `is_disposable_email`: Lấy domain sau ký tự `@` cuối cùng, chia nhãn (labels), sinh các hậu tố để so khớp subdomain (hỗ trợ `mail.mailinator.com`), sử dụng index biểu thức `lower(domain::text)`. Chặn subdomain thật, không chặn nhầm tiền tố nhãn (vd `notmailinator.com`).
- `hit_rate_limit`: Thêm validation tham số chặt chẽ: `p_key` rỗng/null, `p_window` null hoặc ≤ 0, `p_max` null hoặc ≤ 0 đều ném lỗi rõ ràng với mã `22023`.
- `purge_expired_ops_data`: Hàm dọn dẹp định kỳ cho `rate_limit_buckets` (> 1 ngày), `login_attempts` (hết hạn khoá và last_failed_at > 1 ngày), `pos_api_logs` (> 90 ngày). Lên lịch `cron.schedule` hàng ngày lúc 03:17.
- Kiểm thử quyền hàm: `hook_before_user_created` chỉ cho phép `supabase_auth_admin` execute; các hàm vận hành/service_role bị revoke khỏi `anon` và `authenticated`. Sửa test "không gia hạn" thành công trong `032_security_ops_hardening.test.sql`.

### 2.6. Follow-up Layer 2: Catalog Fixes G1 & G2 (`20261111030020_catalog_fixes.sql`)
- **G1:** Quyết định nguồn override thời gian dọn phòng DUY NHẤT là `cinemas.cleaning_minutes`. Trigger `cinema_settings_reject_cleaning_key` từ chối key `default_cleaning_minutes` trong `cinema_settings`. Trigger tính lại `ends_at` của các suất tương lai khi đổi thời lượng phim hoặc thời gian dọn phòng. Bắt lỗi `exclusion_violation` (mã `23P01`) khi việc tính lại gây chồng giờ chiếu, tự động rollback toàn bộ thao tác.
- **G2 (R-33):** Sửa RLS policy cho `showtimes`: Khách và anon chỉ xem được suất chiếu của các rạp có trạng thái `OPEN`. Nhân sự rạp và Admin vẫn xem được mọi suất theo phân quyền.

---

## 3. Database Security & Migration Safety

- **set search_path = '':** Đã cấu hình trên 100% functions trong cả 3 file migration.
- **SECURITY DEFINER Hardening:** Đã revoke execute mặc định từ `public`, `anon`, `authenticated` trên tất cả các trigger function và procedure nhạy cảm.
- **RLS & Column-Level Grants:**
  - Bật RLS trên `holidays` và `price_rules`.
  - Trên `price_rules`, quyền `UPDATE` chỉ được cấp cho cột `amount`: `grant update (amount) on public.price_rules to authenticated;`. Điều này ngăn ngừa thay đổi trái phép discriminator keys (scope, rạp, suất, loại ghế, khung giờ).
  - Phân quyền RLS chặt chẽ: Manager chỉ được insert/update/delete các rule rạp mình quản lý (`scope <> 'CHAIN' and has_cinema_role(cinema_id, ['MANAGER'])`). Chỉ Admin mới có quyền thao tác với rule `CHAIN` và bảng `holidays`.
- **Migration Classification:** Hoàn toàn là additive changes (thêm bảng mới, hàm mới, trigger mới và thay thế policy). Không có `DROP TABLE`, `DROP COLUMN` hay biến đổi kiểu dữ liệu bảng cũ. Không phải `HIGH_RISK_MIGRATION`.

---

## 4. Verification Commands & Gate Checks

| Command | Kết quả | Ghi chú |
|---|---|---|
| `git status --short` | PASS | Đúng 6 file theo scope, working tree sạch |
| `pnpm lint` | PASS | 0 error, 0 warning trên toàn monorepo |
| `pnpm typecheck` | PASS | TypeScript biên dịch thành công 100% |
| `pnpm test` | PASS | 113/113 unit/component tests PASS |
| `pnpm build` | PASS | Next.js web + NestJS API build thành công |
| `pnpm db:test` (Builder) | PASS | 274/274 pgTAP tests PASS qua `.dblock` |
| Anti-slop / oxlint gate | N/A | `skip, oxlint not configured` |
| Open Code Review gate | N/A | `skip, ocr not installed` |
| AI-Friendly Web gate | N/A | Scope là database migrations |
| AI-Readable gate | PASS | Tên hàm/biến rõ nghĩa, cấu trúc module chuẩn, không magic number |

---

## 5. Kết luận

Toàn bộ các tiêu chí nghiệm thu của **Layer 3 — Task 01** và các follow-up từ Layer 2 đã được hiện thực chính xác, an toàn, có test pgTAP bảo vệ chặt chẽ và không có defect nào tồn đọng.

**Verdict:** `STRICT PASS`
