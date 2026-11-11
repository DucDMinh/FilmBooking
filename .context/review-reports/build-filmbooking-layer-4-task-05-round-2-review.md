# Báo cáo Review Độc lập: Layer 4 / Task 05 (Round 2)

**Agent:** reviewer  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-05`  
**Review Level:** STRICT (Database Migrations, RLS Security, Audit Logging & Non-Repudiation, Báo cáo Doanh thu & Soát vé)  
**Thời gian review:** 2026-11-11  
**Verdict:** **STRICT PASS**  

---

## 1. Tổng quan Đánh giá Round 2

Tại Round 1, task đã bị đánh **FAIL** do 3 findings:
1. `[MAJOR / SECURITY]` Lỗ hổng Spoofing `p_staff_id` trong RPC `checkin_ticket` — Vi phạm Non-Repudiation trong Audit Log.
2. `[MAJOR / DOMAIN LOGIC]` Sai lệch sức chứa phòng chiếu (`room_capacity`) và tỷ lệ lấp đầy (`occupancy_rate`) trong `v_report_showtime_sales` do tính cả ô lối đi (`AISLE`) và ghế hỏng (`BROKEN`).
3. `[MINOR / TEST COVERAGE]` Bộ test pgTAP thiếu kịch bản kiểm thử đơn hàng đa vé (quét tuần tự bằng `booking_code`).

Tại Round 2, Reviewer đã đối chiếu toàn bộ source code migration và test case trong worktree `E:\FilmBooking\.worktrees\layer-4__task-05`, thực hiện xác minh chéo với database schema, và chạy kiểm thử tự động toàn diện.

---

## 2. Kết quả Xác minh Từng Finding từ Round 1

### Finding 1: Lỗ hổng Spoofing `p_staff_id` (Non-Repudiation)
- **Tập tin**: `supabase/migrations/20261111040400_rpc_checkin_reports.sql` (dòng 58–70)
- **Đánh giá triển khai**:
  ```sql
  if auth.uid() is not null and not public.is_admin() then
    if p_staff_id is not null and p_staff_id <> auth.uid() then
      raise exception 'FORBIDDEN_STAFF_SPOOFING' using errcode = '42501';
    end if;
    v_staff_id := auth.uid();
  else
    v_staff_id := coalesce(p_staff_id, auth.uid());
  end if;
  ```
  - **Cơ chế bảo vệ**: Khi caller là người dùng đã đăng nhập thông thường (`auth.uid() is not null and not public.is_admin()`), hàm bắt buộc cưỡng chế `v_staff_id := auth.uid()`. Nếu caller cố tình truyền một `p_staff_id` khác với tài khoản đang đăng nhập, hệ thống lập tức ném ngoại lệ `FORBIDDEN_STAFF_SPOOFING` với mã lỗi `42501`.
  - Chỉ cho phép `service_role` (hoặc caller nội bộ Postgres `auth.uid() is null`) và `ADMIN` ủy quyền truyền `p_staff_id`.
  - **Chứng minh bằng pgTAP Test** (`supabase/tests/044_checkin_reports.test.sql:182-188`):
    - Đã bổ sung `TEST 1B`: Giả lập Staff HN01 đăng nhập nhưng cố truyền Admin ID vào `p_staff_id`. Kết quả `throws_ok` bắt chính xác exception mã `42501` và thông báo `FORBIDDEN_STAFF_SPOOFING`.
- **Trạng thái**: **RESOLVED (PASS)**.

---

### Finding 2: `room_capacity` & `occupancy_rate` loại bỏ `AISLE` và `BROKEN`
- **Tập tin**: `supabase/migrations/20261111040400_rpc_checkin_reports.sql` (dòng 431–436)
- **Đánh giá triển khai**:
  ```sql
  left join lateral (
    select count(*)::bigint as capacity
    from public.seats st
    where st.room_id = s.room_id
      and st.seat_type not in ('AISLE', 'BROKEN')
  ) cap on true
  ```
  - Subquery tính `capacity` đã có điều kiện lọc tường minh `st.seat_type not in ('AISLE', 'BROKEN')`.
  - Cột `occupancy_rate` (dòng 421–425) tính tỷ lệ phần trăm chuẩn xác dựa trên số ghế thực tế có thể mở bán của phòng chiếu.
  - **Chứng minh bằng pgTAP Test** (`supabase/tests/044_checkin_reports.test.sql:409-424`):
    - Đã bổ sung phòng `f102` gồm 4 ô lưới (2 NORMAL, 1 AISLE, 1 BROKEN).
    - Suất chiếu `s106` bán 2 vé (đơn O10).
    - `TEST 13` kiểm tra `room_capacity = 2` (thay vì 4) và `occupancy_rate = 100.00%` (thay vì 50.00%).
- **Trạng thái**: **RESOLVED (PASS)**.

---

### Finding 3: Test Coverage cho Đơn Hàng Đa Vé
- **Tập tin**: `supabase/tests/044_checkin_reports.test.sql` (dòng 129, 139–140, 150–151, 426–474)
- **Đánh giá triển khai**:
  - Đã bổ sung fixture đơn O10 (`HN01-MLT001`) với 2 vé riêng biệt.
  - `TEST 14` mô phỏng đầy đủ chuỗi kiểm tra thực tế:
    1. Quét lần 1 bằng `booking_code`: Vé 1 chuyển sang `checked_in`, đơn hàng đổi sang `checked_in`, vé 2 vẫn còn hạn (`checked_in_at is null`).
    2. Quét lần 2 bằng cùng mã `booking_code`: Nhờ mệnh đề `order by (case when t.checked_in_at is null then 0 else 1 end), t.created_at asc`, hệ thống tự động ưu tiên nhặt vé thứ 2 chưa check-in và hoàn tất soát vé thành công (`status = OK`).
    3. Quét lần 3 khi toàn bộ vé trong đơn đã soát hết: Trả về trạng thái `status = USED` / `ALREADY_USED`.
- **Trạng thái**: **RESOLVED (PASS)**.

---

## 3. Kết quả Chạy Verify Commands

1. **pgTAP Database Test (`pnpm db:test`)**:
   - Chạy toàn bộ 9 file kiểm thử cơ sở dữ liệu Supabase:
     ```
     000_smoke.test.sql ................... ok
     010_core_rls.test.sql ................ ok
     020_catalog.test.sql ................. ok
     021_security_ops.test.sql ............ ok
     030_pricing.test.sql ................. ok
     031_booking_rls.test.sql ............. ok
     032_security_ops_hardening.test.sql .. ok
     033_catalog_fixes.test.sql ........... ok
     044_checkin_reports.test.sql ......... ok
     All tests successful.
     Files=9, Tests=372, Result: PASS
     ```
   - Riêng `044_checkin_reports.test.sql` đạt 39/39 test assertions thành công tuyệt đối.

2. **Workspace Unit / E2E Tests (`pnpm test`)**:
   - `packages/shared`: 1 test file (14 tests passed).
   - `apps/api`: 11 test files (157 tests passed).
   - `apps/web`: 4 test files (54 tests passed).
   - Tổng cộng: **225 tests passed (100%)**.

---

## 4. Kết luận

Mọi defect ở Round 1 đã được Builder xử lý triệt để, đúng chuẩn bảo mật, chính xác về logic nghiệp vụ và có bộ kiểm thử tự động chứng minh không còn blind spot.

- **Verdict:** **STRICT PASS**
- **Đề xuất bước tiếp theo:** Tiến hành hợp nhất (merge) worktree `layer-4__task-05` vào nhánh tích hợp Layer 4.
