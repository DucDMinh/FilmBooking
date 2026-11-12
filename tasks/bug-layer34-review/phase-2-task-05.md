# Bug layer34-review · phase-2-task-05 — RBAC theo §5.3: đóng/mở rạp chỉ Admin, báo cáo chỉ Manager/Admin

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M7)
- Yêu cầu: set_cinema_status chỉ Admin (R-32, AC-26); tách helper scope: check-in (STAFF+MANAGER) vs báo cáo (MANAGER); 4 report_* + view v_report_* không cho STAFF (sửa grant/RLS view); sửa test 043/044 đang hợp thức hoá hành vi sai; cập nhật allowlist 048 nếu đổi hàm.
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.

## Root Cause
- Theo ma trận phân quyền §5.3 (`SPECIFICATIONS.md:462, 467`):
  1. `set_cinema_status` trước đó cho phép role `MANAGER` thay đổi trạng thái rạp, trong khi spec quy định Manager chỉ được cập nhật thông tin rạp mình; đóng/mở rạp (`TEMP_CLOSED`, `CLOSED`, `OPEN`) là thẩm quyền độc quyền của Admin (R-32, AC-26).
  2. Helper `public.has_cinema_scope(p_cinema_id)` cấp quyền cho cả `STAFF` và `MANAGER`. Hàm này được dùng cho cả 4 RPC báo cáo (`report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes`), khiến nhân viên Staff xem được doanh thu và đối soát thanh toán.
  3. Bốn view báo cáo `public.v_report_*` (`v_report_revenue_daily`, `v_report_showtime_sales`, `v_report_payos_reconciliation`, `v_report_cancelled_showtimes`) được cấu hình `security_invoker = true` và `grant select to authenticated` nhưng không lọc quyền ở cấp rạp, dẫn đến Staff có thể đọc trực tiếp số liệu báo cáo thông qua RLS của orders/showtimes.
  4. Test `043_cancel.test.sql` cho Manager gọi `set_cinema_status` để test AC-26, hợp thức hóa việc Manager có quyền đổi trạng thái rạp; test `044_checkin_reports.test.sql` thiếu kiểm tra chặn Staff đối với 4 RPC và 4 view báo cáo.

## Fix
1. **Migration additive** `supabase/migrations/20261112160000_rbac_cinema_reports_hardening.sql`:
   - `set_cinema_status`: Thay đổi kiểm tra quyền thành chỉ cho phép `public.is_admin()` hoặc `service_role` (hoặc postgres/supabase_admin). Khi caller không phải Admin -> raise exception `'FORBIDDEN_ADMIN_REQUIRED'` using errcode = `'42501'`.
   - Helper mới `public.has_cinema_manager_scope(p_cinema_id uuid)`: Kiểm tra caller là `service_role`, `postgres`/`supabase_admin`, `is_admin()`, hoặc có role `'MANAGER'` tại `p_cinema_id` qua `public.has_cinema_role`. Cấp quyền: revoke public, anon; grant execute to authenticated, service_role.
   - Helper cũ `public.has_cinema_scope(p_cinema_id uuid)`: Giữ nguyên cho `checkin_ticket` (cho phép `STAFF` và `MANAGER`).
   - Cập nhật 4 View `public.v_report_*`: Thêm mệnh đề `where (public.is_admin() or public.has_cinema_manager_scope(...))` để Staff/khách đọc chỉ ra 0 dòng.
   - Cập nhật 4 RPC báo cáo: Đổi kiểm tra `has_cinema_scope` sang `has_cinema_manager_scope(p_cinema_id)`. Nếu `p_cinema_id` null, bắt buộc caller phải là admin/service_role hoặc là Manager tại ít nhất một rạp.
   - Bảo đảm đầy đủ `SECURITY DEFINER`, `SET search_path = ''`, revoke public/anon và grant execute cho authenticated, service_role.
2. **Cập nhật Test**:
   - `supabase/tests/043_cancel.test.sql`:
     - Sửa test Manager gọi `set_cinema_status` bị chặn 42501 `'FORBIDDEN_ADMIN_REQUIRED'`.
     - Di chuyển các bước test AC-26 (chặn đóng rạp khi còn suất bán và đổi trạng thái thành công sau khi huỷ hết suất) sang thực hiện dưới quyền Admin (`tap_as('000...000a01')`).
     - Sửa các assert Staff và Manager rạp khác gọi `set_cinema_status` mong đợi mã 42501 và message `'FORBIDDEN_ADMIN_REQUIRED'`.
     - Tăng test plan lên 33.
   - `supabase/tests/044_checkin_reports.test.sql`:
     - Thêm TEST 15: Kiểm tra Staff (`tap_as('000...000c01')`) gọi 4 RPC báo cáo bị chặn 42501 `'FORBIDDEN_CINEMA_SCOPE'`.
     - Kiểm tra Staff select 4 view `v_report_*` đều trả về 0 dòng.
     - Tăng test plan lên 47.
   - `supabase/tests/048_function_privileges.test.sql`:
     - Thêm `'has_cinema_manager_scope(uuid)'` vào allowlist authenticated.
3. **Database Types**: Chạy `pnpm db:types` cập nhật `packages/shared/src/database.types.ts` chứa `has_cinema_manager_scope`.

## Test & Evidence (TDD)
- **Đỏ trước khi fix (Red Phase)**:
  - `supabase/tests/043_cancel.test.sql`: Failed 3/33 tests (test 21, 28, 31) vì Manager không bị chặn với `FORBIDDEN_ADMIN_REQUIRED` mà ném `23514 CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`.
  - `supabase/tests/044_checkin_reports.test.sql`: Failed 8/47 tests (test 40-47) vì Staff gọi 4 RPC báo cáo không bị chặn và select 4 view trả về dữ liệu (>0 dòng).
  - `supabase/tests/048_function_privileges.test.sql`: Failed 1/39 tests (test 2) vì thiếu `has_cinema_manager_scope(uuid)` trong allowlist.
- **Xanh sau khi fix (Green Phase)**:
  - `pnpm db:test`: 26 files, 771 tests PASS 100% (043: 33/33, 044: 47/47, 048: 39/39).
  - `pnpm typecheck`: PASS 100% (shared, api, web).
  - `pnpm test`: PASS 100% (shared: 14/14, api: 210/210, web: 93/93, node scripts: 16/16).

## Residual Risk
- Không có rủi ro hồi quy. RLS và quyền truy cập báo cáo được thu hẹp về đúng đặc tả §5.3, không ảnh hưởng đến luồng soát vé của Staff (`checkin_ticket`).

## Doc Impact
- No doc impact (các view và RPC đã được định nghĩa trong `docs/ERD.md`, việc tách helper nội bộ và siết RBAC hoàn toàn khớp với ma trận quyền §5.3).

- Status: done (reviewer PASS round 1, report: .context/review-reports/bug-layer34-review-phase-2-task-05-round-1-review.md)
