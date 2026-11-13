# Review Report: bug-layer5-review · phase-1-task-02

**Reviewer**: Adversarial Reviewer (Độc lập)  
**Date**: 2026-11-13  
**Review Level**: STRICT  
**Verdict**: STRICT PASS  

---

## 1. Mục tiêu Review & Phạm vi

Review nghiệm thu mức **STRICT** cho task `phase-1-task-02` (xử lý hai defect trọng yếu từ báo cáo độc lập `.context/review-reports/independent-review-layer-5-D-admin-orders.md`):
- **C1 / K5-2**: Khắc phục lỗi vi phạm máy trạng thái DB tại `resolveManualReview` khi đơn `needs_manual_review` bị cập nhật thành `paid` (lỗi Postgres 23514); loại bỏ hoàn toàn việc upsert `showtime_seat_states` (tạo ghế ma) và insert `affected_order_actions` (nuốt lỗi trigger); đóng gói toàn bộ quy trình giải quyết đơn thành một RPC `resolve_manual_review` nguyên tử, giữ nguyên trạng thái `needs_manual_review` theo `SPECIFICATIONS.md:311` và R-104; siết chặt quyền hạn (chỉ Manager rạp hoặc Admin).
- **D / M7**: Khắc phục lỗi thiếu dependency `AccessService` khi wire `OrdersModule` và `ReportModule` do thiếu `imports: [AuthModule]`.

### Blast Radius & Files Touched:
- `supabase/migrations/20261113170000_resolve_manual_review_rpc.sql` (New)
- `apps/api/src/modules/orders/orders.module.ts`
- `apps/api/src/modules/orders/orders.service.ts`
- `apps/api/src/modules/orders/orders.controller.ts`
- `apps/api/src/modules/report/report.module.ts`
- `packages/shared/src/database.types.ts`
- `apps/api/test/orders-report.e2e-spec.ts`

---

## 2. Kết quả Xác minh Lệnh (Verify Commands)

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `pnpm --filter @filmbooking/api test test/orders-report.e2e-spec.ts` | **PASS** (28/28 tests) | Toàn bộ test case RBAC, status transition, M7 DI đều xanh |
| `pnpm test` | **PASS** (568/568 tests) | 382 API tests, 156 Web tests, 14 Shared tests, 16 Scripts tests |
| `pnpm typecheck` | **PASS** (100%) | Không có lỗi type ở tất cả workspace packages |
| `pnpm lint` | **PASS** (100%) | ESLint pass 100%, không cảnh báo |

---

## 3. Đánh giá Chi tiết theo Tiêu chí STRICT (Adversarial Audit)

### 3.1. K5-2: Tính nguyên tử, Máy trạng thái DB & Ghế ma (RPC `resolve_manual_review`)
1. **Tính nguyên tử & Row Locking**:
   - RPC `public.resolve_manual_review` được định nghĩa bằng PL/pgSQL với `security definer` và `set search_path = public, pg_temp`.
   - Dòng 59: `select * into v_order from public.orders where id = p_order_id for update;` khoá cứng bản ghi đơn hàng với `FOR UPDATE`, đảm bảo xử lý tuần tự, chặn triệt để race condition khi có nhiều request đồng thời.
2. **Tuân thủ Máy trạng thái DB & SPECIFICATIONS.md:311**:
   - `SPECIFICATIONS.md:311` và R-104 quy định: `needs_manual_review` là trạng thái kết thúc sau khi Manager/Admin đánh dấu đã giải quyết.
   - RPC thực hiện: `update public.orders set manual_review_resolved_at = v_now where id = v_order.id;`.
   - Cột `status` của đơn **hoàn toàn được giữ nguyên** là `needs_manual_review`, không đổi thành `paid`.
   - Đối chiếu với trigger `orders_guard_transition` (`20261112150000_cancel_showtimes_hardening.sql:29-37`): Do `new.status is distinct from old.status` là `false`, trigger không can thiệp, không còn bị vấp mã lỗi `23514`.
3. **Loại bỏ Ghế ma và Nuốt lỗi**:
   - Toàn bộ đoạn code cũ tại `orders.service.ts` tự ý upsert `showtime_seat_states` (từng ghế không transaction) và upsert `tickets` đã bị xoá bỏ hoàn toàn. Đơn giải quyết thủ công không sinh ghế ma `SOLD` sai quy trình.
   - Đoạn code cũ insert vào `affected_order_actions` (vốn bị trigger `affected_order_actions_validate` chặn 23514 và bị nuốt lỗi) đã bị loại bỏ triệt để.
4. **Phân quyền 3 Lớp (Defense in Depth)**:
   - **Lớp 1 (Controller Guard)**: Endpoint đổi từ `@Roles("STAFF", "MANAGER")` thành `@Roles("MANAGER")` trên cả `OrdersController` và `AdminOrdersController`. Staff gọi bị `RolesGuard` chặn ngay với `403 FORBIDDEN`.
   - **Lớp 2 (Service Layer)**: `OrdersService.resolveManualReview` kiểm tra `heldRole !== "MANAGER"` và `cinemaRoles.get(order.cinema_id)` -> ném `403 FORBIDDEN` / `FORBIDDEN_CINEMA`.
   - **Lớp 3 (Database RPC)**: `if not (public.has_cinema_manager_scope(v_order.cinema_id) or public.has_role('ADMIN')) then raise exception 'FORBIDDEN_SCOPE' using errcode = '42501';`. Đảm bảo ngay cả khi gọi trực tiếp RPC qua PostgREST, chỉ Manager của rạp hoặc Admin mới được phép thực thi.
5. **Ghi nhận Audit Log Đầy đủ (R-107)**:
   - Thao tác insert trực tiếp vào `public.audit_logs`:
     + `action`: `'UPDATE'` (khớp CHECK constraint `action in ('INSERT', 'UPDATE', 'DELETE')`).
     + `actor_id`: `coalesce(auth.uid(), v_order.user_id)`.
     + `cinema_id`: `v_order.cinema_id`.
     + `table_name`: `'orders'`.
     + `record_id`: `v_order.id::text`.
     + `after_data`: ghi nhận chi tiết `{ action_detail: 'RESOLVE_MANUAL_REVIEW', action, note, refund_reference, refunded_amount, resolved_at }`.
   - Kèm theo trigger `orders_audit` tự động bắt sự kiện cập nhật trên bảng `orders`.

### 3.2. D / M7: Module DI Hardening (`OrdersModule` & `ReportModule`)
1. **Khắc phục Dependency Injection**:
   - `apps/api/src/modules/orders/orders.module.ts`: đã thêm `imports: [AuthModule]`.
   - `apps/api/src/modules/report/report.module.ts`: đã thêm `imports: [AuthModule]`.
   - `AccessService` được cung cấp và export bởi `AuthModule`. Khi wire `OrdersModule` và `ReportModule` vào bất kỳ module nào (kể cả `AppModule`), NestJS giải quyết trơn tru dependency graph, không còn lỗi thiếu `AccessService`.
2. **Kiểm chứng bằng Test E2E**:
   - `apps/api/test/orders-report.e2e-spec.ts` (lines 1143-1167) đã bổ sung test suite `M7: Module DI Hardening` compile trực tiếp `Test.createTestingModule({ imports: [OrdersModule, ReportModule] })`.
   - Kết quả test khẳng định cả `OrdersService`, `ReportService`, và `AccessService` đều được resolve hợp lệ.

### 3.3. Đối chiếu Chéo Schema Thật & Bộ Mock (Cross-Boundary Check)
1. **Kiểm tra Mock trong `orders-report.e2e-spec.ts`**:
   - Đã khắc phục điểm mù `m10`: Mock RPC đã decode chính xác token JWT base64 để trích xuất `sub` làm `callerId`, kiểm tra quyền hạn thực tế với `staff_assignments` và `user_roles`.
   - Mô phỏng chính xác các mã lỗi DB chuẩn Postgres:
     + `42501` / `FORBIDDEN_SCOPE` (hoặc `FORBIDDEN_CINEMA_SCOPE`)
     + `P0002` / `ORDER_NOT_FOUND`
     + `P0003` / `INVALID_ORDER_STATUS`
     + `P0004` / `ALREADY_RESOLVED`
     + `23514` (Check constraint trên `audit_logs.action`)
   - Đã bổ sung test case xác minh:
     + Staff gọi -> 403 FORBIDDEN.
     + Manager rạp khác gọi -> 403 FORBIDDEN_CINEMA.
     + Gọi lần thứ hai khi đã giải quyết -> 409 CONFLICT (`ALREADY_RESOLVED`).
     + REFUND_MANUAL thiếu trường bắt buộc -> 400 VALIDATION_ERROR.
     + REFUND_MANUAL đủ trường -> 201 Thành công, status giữ nguyên `needs_manual_review`, không tạo ghế ma, không insert vào `affected_order_actions`.
2. **Database Types**:
   - `packages/shared/src/database.types.ts:1084-1086` đã được cập nhật chữ ký RPC `resolve_manual_review` khớp hoàn toàn với migration.

---

## 4. Kết luận

- Toàn bộ các yêu cầu khắt khe của K5-2 và D/M7 đã được giải quyết triệt để và chuẩn xác.
- Không phát hiện bất kỳ regression hay lỗ hổng bảo mật nào trong diff.
- Quy định máy trạng thái DB và `SPECIFICATIONS.md:311` được bảo toàn tuyệt đối.

**Verdict: STRICT PASS**
