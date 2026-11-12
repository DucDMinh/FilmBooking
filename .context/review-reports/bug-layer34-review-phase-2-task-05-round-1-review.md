# Review Report — bug/layer34-review · phase-2-task-05 (Round 1)

**Agent:** reviewer  
**Verdict:** STRICT PASS  
**Review Level:** STRICT  
**Work Item:** bug/layer34-review  
**Task ID:** phase-2-task-05  
**Nguồn defect gốc:** `.context/review-reports/independent-review-layer-3-4-db.md` (M7)  

---

## 1. Tổng quan & Phạm vi Đánh giá

Task `phase-2-task-05` xử lý defect **M7** về việc RBAC của rạp và báo cáo bị lệch so với ma trận phân quyền §5.3 (`SPECIFICATIONS.md:460, 465, 467`):
1. `set_cinema_status` trước đó cho phép role `MANAGER` thay đổi trạng thái rạp, trong khi đặc tả quy định Manager chỉ được cập nhật thông tin rạp mình; đóng/mở rạp (`TEMP_CLOSED`, `CLOSED`, `OPEN`) thuộc thẩm quyền độc quyền của `Admin` (R-32, AC-26).
2. Helper `public.has_cinema_scope(p_cinema_id)` cấp quyền cho cả `STAFF` và `MANAGER`. Việc dùng chung helper này cho 4 RPC báo cáo (`report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes`) và các view báo cáo cho phép Staff xem được số liệu doanh thu, đối soát thanh toán.
3. 4 view báo cáo `public.v_report_*` dùng `security_invoker = true` nhưng thiếu mệnh đề lọc phạm vi quyền của Manager/Admin, khiến Staff đọc được dữ liệu báo cáo qua RLS của bảng `orders`.
4. Test `043_cancel.test.sql` và `044_checkin_reports.test.sql` trước đây hợp thức hoá hành vi sai, cần được cập nhật và siết chặt.

---

## 2. Kiểm tra Chi tiết Yêu cầu (Adversarial Audit)

### 2.1. RPC `set_cinema_status`
- **Kiểm soát quyền gọi hàm:**
  - Định nghĩa tại `supabase/migrations/20261112160000_rbac_cinema_reports_hardening.sql:17-96`.
  - Biến `v_is_caller_admin` kiểm tra:
    ```sql
    v_is_caller_admin := (select auth.role()) = 'service_role'
      or public.is_admin()
      or (
        nullif(current_setting('request.jwt.claims', true), '') is null
        and session_user in ('postgres', 'supabase_admin')
      );
    ```
  - Nếu `not v_is_caller_admin`, ném ngoại lệ chuẩn `raise exception 'FORBIDDEN_ADMIN_REQUIRED' using errcode = '42501'`.
  - Đã loại bỏ hoàn toàn nhánh cho phép `MANAGER` tự ý đổi trạng thái rạp. Khớp 100% với trigger bảng `cinemas_guard_manager_columns` và đặc tả §5.3 (`SPECIFICATIONS.md:460`).
- **Bảo vệ quy tắc nghiệp vụ AC-26 (R-33):**
  - Khi Admin đặt trạng thái `TEMP_CLOSED` hoặc `CLOSED`, hệ thống kiểm tra các suất chiếu tương lai (`starts_at > now()`) chưa bị huỷ (`status <> 'CANCELLED'`) mà đã có ghế `SOLD` hoặc đơn hàng `paid`/`checked_in`.
  - Nếu tồn tại, ném lỗi `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES` kèm errcode `23514` và danh sách showtime IDs trong detail JSON.
  - Sau khi huỷ các suất này qua `cancel_showtimes`, Admin gọi lại `set_cinema_status` thành công cập nhật trạng thái rạp.

### 2.2. Tách helper scope & Siết quyền Báo cáo
- **`public.has_cinema_scope(p_cinema_id uuid)`:**
  - Giữ nguyên định nghĩa tại `20261111040400_rpc_checkin_reports.sql:11-24`, cho phép `STAFF`, `MANAGER`, `Admin`, `service_role`.
  - Được dùng độc quyền cho tính năng soát vé `checkin_ticket(text, uuid, uuid)` (phù hợp §5.3: Staff soát vé tại rạp mình).
- **Helper mới `public.has_cinema_manager_scope(p_cinema_id uuid)`:**
  - Định nghĩa tại `20261112160000_rbac_cinema_reports_hardening.sql:104-117`.
  - Chỉ trả về `true` khi caller là:
    - `service_role`
    - Phiên nội bộ postgres/supabase_admin không có JWT claims
    - `public.is_admin()`
    - `p_cinema_id is not null` và caller có role `'MANAGER'` tại rạp đó qua `public.has_cinema_role(p_cinema_id, array['MANAGER']::public.staff_role[])`.
  - Nhân viên `STAFF` luôn nhận kết quả `false`.
- **4 View `public.v_report_*` (`v_report_revenue_daily`, `v_report_showtime_sales`, `v_report_payos_reconciliation`, `v_report_cancelled_showtimes`):**
  - Đều có cấu hình `with (security_invoker = true)`.
  - Bổ sung mệnh đề WHERE: `(public.is_admin() or public.has_cinema_manager_scope(...))`.
  - Khi nhân viên `STAFF` hoặc khách hàng truy vấn trực tiếp vào 4 view này, kết quả trả về đúng 0 dòng.
- **4 RPC Báo cáo (`report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes`):**
  - Nếu truyền `p_cinema_id is not null`: kiểm tra `not public.has_cinema_manager_scope(p_cinema_id)` -> ném `42501 FORBIDDEN_CINEMA_SCOPE`.
  - Nếu `p_cinema_id is null`: kiểm tra caller phải là Admin/service_role hoặc là Manager của ít nhất 1 rạp (`exists (select 1 from public.staff_assignments sa where sa.user_id = auth.uid() and sa.role = 'MANAGER')`). Nếu không thoả mãn (ví dụ Staff gọi không rạp), ném `42501 FORBIDDEN_CINEMA_SCOPE`.
  - Với Manager gọi `p_cinema_id is null`: mệnh đề trong view/query chỉ trả về số liệu của các rạp mà Manager đó được gán quyền quản lý, hoàn toàn không rò rỉ số liệu của rạp khác.
  - Với Admin: xem được báo cáo toàn chuỗi (tất cả các rạp).

### 2.3. Kiểm tra An ninh & Cấp quyền (Security Definer & Privileges)
- Tất cả các hàm PL/pgSQL và SQL được tạo/thay thế đều tuân thủ nguyên tắc an ninh:
  - `SECURITY DEFINER`
  - `SET search_path = ''`
  - `revoke all on function ... from public, anon;`
  - `grant execute on function ... to authenticated, service_role;`
  - 4 View: `grant select on public.v_report_* to authenticated, service_role;`
- Bảng allowlist trong `048_function_privileges.test.sql` đã cập nhật thêm `has_cinema_manager_scope(uuid)` vào danh sách 19 hàm được phép thực thi bởi `authenticated`. Quyền của `anon` giữ nguyên mức tối thiểu (chỉ `price_quote(uuid, uuid[])`).

### 2.4. Đánh giá Bộ Test & Kiểm chứng TDD
- **Kiểm chứng Red Phase (Test-first):**
  - Builder đã ghi nhận Red Phase chính xác:
    - `043_cancel.test.sql`: Failed 3 test cases trước khi sửa do Manager không bị chặn `FORBIDDEN_ADMIN_REQUIRED`.
    - `044_checkin_reports.test.sql`: Failed 8 test cases do Staff gọi được 4 RPC và đọc được dữ liệu trong 4 view báo cáo.
    - `048_function_privileges.test.sql`: Failed do thiếu `has_cinema_manager_scope` trong allowlist.
- **Kiểm chứng Green Phase:**
  - `043_cancel.test.sql` (33/33 tests PASS):
    - Manager gọi `set_cinema_status` bị chặn 42501 `FORBIDDEN_ADMIN_REQUIRED`.
    - Admin gọi kiểm tra AC-26 thành công (chặn khi còn suất chiếu đã bán vé, huỷ xong cho phép đổi sang `TEMP_CLOSED`).
    - Staff và Manager rạp khác gọi `set_cinema_status` bị chặn 42501 `FORBIDDEN_ADMIN_REQUIRED`.
  - `044_checkin_reports.test.sql` (47/47 tests PASS):
    - TEST 15 kiểm tra Staff HN01 gọi 4 RPC báo cáo đều bị chặn `42501 FORBIDDEN_CINEMA_SCOPE`.
    - Staff HN01 đọc 4 view `v_report_*` đều trả về chính xác `0` dòng.
  - `048_function_privileges.test.sql` (39/39 tests PASS):
    - Toàn bộ allowlist và default privileges đều được đảm bảo.

---

## 3. Kết quả Chạy Verify Commands

| Lệnh | Kết quả | Chi tiết |
|---|---|---|
| `cd E:\FilmBooking; pnpm db:test` | **PASS** | 26 test files, 771 tests PASS 100% (043: 33/33, 044: 47/47, 048: 39/39) |
| `cd E:\FilmBooking; pnpm typecheck` | **PASS** | 3/3 projects (packages/shared, apps/web, apps/api) sạch lỗi type |
| `cd E:\FilmBooking; pnpm test` | **PASS** | shared (14/14), api (210/210), web (93/93), node scripts (16/16) PASS 100% |
| `cd E:\FilmBooking; pnpm lint` | **PASS** | 0 error, 0 warning trên toàn monorepo |

---

## 4. Quality & Compliance Gates

- **Surgical Diff Check:** PASS. Diff chỉ tập trung vào:
  - 1 migration additive `20261112160000_rbac_cinema_reports_hardening.sql`.
  - 3 file test pgTAP (`043`, `044`, `048`).
  - 1 file generated types `packages/shared/src/database.types.ts`.
  - Không có drive-by refactor hay thay đổi ngoài scope.
- **Anti-slop / Oxlint Gate:** `skip, oxlint not configured`.
- **AI-Slop Gate:** `skip, aislop not installed`.
- **Open Code Review Gate:** `skip, ocr not installed`.
- **AI-Readable Gate:** PASS (Tên hàm/biến self-descriptive, không indirection thừa, không magic number, tài liệu hoá rõ ràng).

---

## 5. Kết luận

Triển khai của Builder cho task `phase-2-task-05` hoàn toàn chính xác, giải quyết dứt điểm defect M7, bảo đảm tính toàn vẹn của ma trận quyền §5.3 và quy tắc AC-26 mà không gây hồi quy.

**Verdict: STRICT PASS**
