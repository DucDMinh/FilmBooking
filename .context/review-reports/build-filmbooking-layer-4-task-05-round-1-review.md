# Báo cáo Review Độc lập: Layer 4 / Task 05 (Round 1)

**Agent:** reviewer  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-05`  
**Review Level:** STRICT (liên quan trực tiếp Database Migrations, RLS, Audit Logging, Doanh thu và Soát vé)  
**Thời gian review:** 2026-11-11  
**Verdict:** **FAIL**  

---

## 1. Tổng quan Đánh giá & Scope Review

Task 05 của Layer 4 triển khai:
- RPC `checkin_ticket(p_token_or_code, p_cinema_id, p_staff_id)`: Kiểm tra rạp trước (AC-13, R-102), vé đã dùng -> `USED` (AC-12, R-98), suất huỷ/affected -> `AFFECTED` (R-101), cửa sổ soát vé 30 phút trước chiếu đến hết phim (R-99, R-102), ghi `checkin_logs`.
- Các Views & RPCs Báo cáo:
  - `v_report_revenue_daily` & `report_revenue`: Doanh thu theo ngày/rạp/kênh (R-112).
  - `v_report_showtime_sales` & `report_by_movie_showtime`: Doanh thu & lấp đầy theo phim/suất/rạp (R-113).
  - `v_report_payos_reconciliation` & `report_payos_reconciliation`: Báo cáo đối soát PayOS (R-116, R-134).
  - `v_report_cancelled_showtimes` & `report_cancelled_showtimes`: Báo cáo suất bị huỷ & đơn ảnh hưởng (lát MVP của R-119).
- Bộ test pgTAP: `supabase/tests/044_checkin_reports.test.sql` (29 tests).

---

## 2. Đối chiếu Yêu cầu & Acceptance Criteria (Adversarial Audit)

| Tiêu chí / Yêu cầu | Trạng thái | Đánh giá chi tiết |
|---|:---:|---|
| **AC-13 / R-99 / R-102: Kiểm tra rạp trước** | **PASS** | BƯỚC 1 dòng 137 kiểm tra `v_ticket.showtime_cinema_id <> p_cinema_id`. Trả `WRONG_CINEMA` chỉ gồm `correct_cinema_id`, `correct_cinema_code`, `correct_cinema_name`, `correct_cinema_address`. Tuyệt đối không lộ PII (tên khách, SĐT, ghế, phòng). Vé giữ nguyên chưa check-in và ghi log `WRONG_CINEMA`. |
| **AC-12 / R-98: Quét lại vé đã check-in** | **PASS** | BƯỚC 3 dòng 172 kiểm tra `v_ticket.checked_in_at is not null`. Trả `USED` / `ALREADY_USED` kèm `checked_in_at` và `checked_in_by_name` (lấy từ `profiles.full_name`). Ghi `checkin_logs` với result `ALREADY_USED`. |
| **R-101: Suất huỷ / đơn affected** | **PASS** | BƯỚC 2 dòng 155 kiểm tra `showtime_status = 'CANCELLED' or order_status in ('affected', 'cancelled', 'refunded_manual', 'exchanged')`. Trả `CANCELLED` / `AFFECTED`, ghi `checkin_logs`, vé không check-in. |
| **R-102 / #11: Cửa sổ thời gian soát vé** | **PASS** | BƯỚC 4 dòng 198 tính `starts_at + duration_minutes`. Quét sau giờ kết thúc phim trả `EXPIRED`, quét trước giờ chiếu > 30 phút trả `TOO_EARLY`. Ghi log `OUTSIDE_WINDOW`. |
| **Phân quyền Báo cáo (RLS & Scope)** | **PASS** | Cả 4 Views đều dùng `with (security_invoker = true)`. Các hàm RPC đều có guard `has_cinema_scope(p_cinema_id)` (ném lỗi `42501`) và lọc `(is_admin() or has_cinema_scope(cinema_id))` trong query. Manager HN01 không xem được dữ liệu HN02; Admin xem toàn chuỗi. |
| **Fan-out số liệu khi Join** | **PASS** | `v_report_revenue_daily` dùng CTE `group by o.id` trước khi sum; `v_report_showtime_sales` dùng lateral subquery độc lập theo `showtime_id`. Không bị nhân bản số liệu khi orders join tickets/payments. |

---

## 3. Danh sách Defect & Điểm mù (Findings)

### Finding 1: [MAJOR / SECURITY] Lỗ hổng Spoofing `p_staff_id` — Vi phạm Non-Repudiation trong Audit Log
- **Tập tin**: `supabase/migrations/20261111040400_rpc_checkin_reports.sql`
- **Dòng**: 38, 58
- **Chi tiết**:
  ```sql
  create or replace function public.checkin_ticket(
    p_token_or_code text,
    p_cinema_id uuid,
    p_staff_id uuid default auth.uid()
  ) ...
    v_staff_id := coalesce(p_staff_id, auth.uid());
  ```
- **Hành vi sai lệch & Nguy cơ**:
  - Khi caller là người dùng đã đăng nhập (`auth.uid() is not null`), hàm cho phép truyền tham số `p_staff_id` tuỳ ý. Do `coalesce` ưu tiên `p_staff_id`, một nhân viên có quyền tại rạp có thể truyền ID của một nhân viên khác hoặc của Admin.
  - Khi đó, bảng `tickets` ghi nhận `checked_in_by = p_staff_id` và bảng `checkin_logs` ghi nhận `scanned_by = p_staff_id`.
  - Hậu quả: Vi phạm nguyên tắc chống chối bỏ (non-repudiation); nhân viên có thể đổ vạ cho đồng nghiệp khi soát vé trái quy định; khi quét lại vé (AC-12), hệ thống trả về thông tin người soát lần đầu là người bị đổ vạ.
  - Ngoài ra, nếu truyền một `p_staff_id` ngẫu nhiên không tồn tại trong `auth.users`, Postgres sẽ nổ exception `23503` (foreign_key_violation) làm sập API.
- **Khắc phục bắt buộc**:
  Khi caller là `authenticated` và không phải `is_admin()` / `service_role`, bắt buộc cưỡng chế `v_staff_id := auth.uid();` (lờ đi hoặc ném lỗi nếu `p_staff_id` khác `auth.uid()`). Chỉ cho phép `service_role` (hoặc `admin`) truyền `p_staff_id` ủy quyền.

---

### Finding 2: [MAJOR / DOMAIN LOGIC] Sai lệch Sức chứa Phòng chiếu & Tỷ lệ Lấp đầy do đếm cả Lối đi (`AISLE`) và Ghế hỏng (`BROKEN`)
- **Tập tin**: `supabase/migrations/20261111040400_rpc_checkin_reports.sql`
- **Dòng**: 419–423
- **Chi tiết**:
  ```sql
  left join lateral (
    select count(*)::bigint as capacity
    from public.seats st
    where st.room_id = s.room_id
  ) cap on true
  ```
- **Hành vi sai lệch & Nguy cơ**:
  - Đối chiếu với schema bảng `public.seats` trong `20261111020000_catalog.sql:26, 92`, kiểu dữ liệu `public.seat_type` bao gồm: `'NORMAL', 'VIP', 'SWEETBOX', 'AISLE', 'BROKEN'`. Bảng `seats` lưu trữ toàn bộ lưới ma trận phòng, bao gồm cả ô lối đi (`AISLE`) và ghế hỏng cố định (`BROKEN`).
  - Phép tính `count(*)` trên bảng `seats` đếm cả ô lối đi và ghế hỏng vào `room_capacity`.
  - Hệ quả: Cột `occupancy_rate` ở dòng 410–412:
    ```sql
    round((coalesce(sales.sold_seats, 0)::numeric / cap.capacity::numeric) * 100, 2)
    ```
    bị chia cho toàn bộ ô lưới thay vì số ghế thực tế có thể bán. Ví dụ một phòng có 20 ghế thường/VIP và 10 ô lối đi (tổng 30 ô trong `seats`), khi bán hết sạch 20 ghế thì tỷ lệ lấp đầy hiển thị chỉ là `20 / 30 * 100 = 66.67%` thay vì `100%`.
- **Khắc phục bắt buộc**:
  Subquery tính `capacity` phải loại bỏ ô lối đi và ghế hỏng:
  ```sql
  select count(*)::bigint as capacity
  from public.seats st
  where st.room_id = s.room_id
    and st.seat_type not in ('AISLE', 'BROKEN')
  ```
  *(Khuyến nghị: Với ghế đôi `SWEETBOX` chiếm 2 chỗ, có thể tính theo số ghế thực tế: `coalesce(sum(case when st.seat_type = 'SWEETBOX' then 2 when st.seat_type in ('NORMAL', 'VIP') then 1 else 0 end), 0)::bigint`).*

---

### Finding 3: [MINOR / TEST COVERAGE] Điểm mù trong Bộ Test pgTAP — Thiếu Test Case Đơn Đa Vé
- **Tập tin**: `supabase/tests/044_checkin_reports.test.sql`
- **Dòng**: 111–139
- **Chi tiết**:
  Toàn bộ fixture dữ liệu đơn hàng trong file test (`O1` đến `O9`) chỉ gồm các đơn hàng có duy nhất 1 vé (1 ghế).
- **Hành vi sai lệch & Nguy cơ**:
  Không kiểm thử trường hợp đơn mua 2–8 ghế:
  - Khi vé thứ 1 check-in -> `orders.status` đổi sang `'checked_in'`.
  - Khi soát vé thứ 2 của cùng đơn đó (qua QR hoặc nhập `booking_code`), liệu vé thứ 2 có check-in trơn tru không và `order by (case when checked_in_at is null then 0 else 1 end)` có hoạt động đúng kỳ vọng khi nhập mã đặt vé lần 2 không.
- **Khắc phục bắt buộc**:
  Bổ sung vào `044_checkin_reports.test.sql` một kịch bản đơn hàng có ≥ 2 vé, kiểm thử check-in tuần tự cả 2 vé bằng QR và bằng `booking_code`.

---

## 4. Kết luận & Hướng giải quyết

- **Verdict:** **FAIL**
- Builder cần thực hiện các sửa đổi sau trong worktree:
  1. **Sửa Finding 1**: Cưỡng chế `v_staff_id := auth.uid()` trong `checkin_ticket` khi caller là authenticated (không phải admin/service_role), chống spoofing.
  2. **Sửa Finding 2**: Cập nhật lateral subquery `capacity` trong `v_report_showtime_sales` để loại bỏ `seat_type in ('AISLE', 'BROKEN')`.
  3. **Sửa Finding 3**: Bổ sung test case đơn đa vé vào `044_checkin_reports.test.sql`.
  4. Chạy lại `pnpm db:test` và các check commands để đảm bảo toàn bộ test case xanh sạch trước khi yêu cầu review vòng 2.
