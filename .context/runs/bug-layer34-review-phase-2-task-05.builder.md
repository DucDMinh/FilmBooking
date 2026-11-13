# Builder Run Summary — bug/layer34-review · phase-2-task-05

- **Task**: RBAC theo §5.3: đóng/mở rạp chỉ Admin, báo cáo chỉ Manager/Admin (M7).
- **Status**: PASS (attempt 0).
- **Phương pháp**: TDD (Red -> Green -> Refactor/Verify).

## Các thay đổi chính
1. **Migration additive** `supabase/migrations/20261112160000_rbac_cinema_reports_hardening.sql`:
   - `set_cinema_status`: Chỉ cho phép `public.is_admin()` hoặc `service_role`. Caller khác bị chặn 42501 `FORBIDDEN_ADMIN_REQUIRED`.
   - `public.has_cinema_manager_scope(p_cinema_id uuid)`: Helper mới kiểm tra Manager rạp hoặc Admin/service_role.
   - `public.v_report_*` (4 view): Bổ sung điều kiện `where (public.is_admin() or public.has_cinema_manager_scope(...))` để Staff đọc ra 0 dòng.
   - 4 RPC báo cáo (`report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes`): Đổi sang `has_cinema_manager_scope`, chặn Staff 42501 `FORBIDDEN_CINEMA_SCOPE`.
2. **Tests**:
   - `supabase/tests/043_cancel.test.sql`: Sửa test Manager gọi `set_cinema_status` bị chặn 42501 `FORBIDDEN_ADMIN_REQUIRED`; chuyển AC-26 sang Admin; sửa assert Staff & Manager rạp khác nhận lỗi `FORBIDDEN_ADMIN_REQUIRED`; plan(33).
   - `supabase/tests/044_checkin_reports.test.sql`: Thêm TEST 15 kiểm tra Staff bị chặn 42501 trên 4 RPC báo cáo và đọc 4 view ra 0 dòng; plan(47).
   - `supabase/tests/048_function_privileges.test.sql`: Cập nhật allowlist authenticated thêm `has_cinema_manager_scope(uuid)`.
3. **Database Types**: `packages/shared/src/database.types.ts` cập nhật qua `pnpm db:types`.

## Verification Result
- Red Phase:
  - `043_cancel.test.sql` FAIL (3 tests).
  - `044_checkin_reports.test.sql` FAIL (8 tests).
  - `048_function_privileges.test.sql` FAIL (1 test).
- Green Phase:
  - `pnpm db:test`: PASS 26/26 files, 771/771 tests (043, 044, 048 đều PASS).
  - `pnpm typecheck`: PASS 100% (shared, api, web).
  - `pnpm test`: PASS 100% (shared: 14/14, api: 210/210, web: 93/93, scripts: 16/16).
