# Báo Cáo Thẩm Định Độc Lập (Adversarial Review)

- **Agent:** reviewer
- **Task:** `tasks/bug-layer5-review/phase-2-task-06.md` — Admin Audit Actor, Voucher Deletion & Scoping (D/M1..M6)
- **Round:** 1
- **Review Level:** STRICT (Cổng kiểm tra Admin / Audit / Security)
- **Verdict:** STRICT PASS

---

## 1. Tổng Quan Thẩm Định

Task 06 (Phase 2) giải quyết toàn diện 6 khiếm khuyết bảo mật và nghiệp vụ quản trị (D/M1 đến D/M6) được phát hiện trong đợt rà soát Layer 5:
- **D/M1:** Ghi nhận thiếu `actor_id` trong audit log khi cấp/thu quyền Admin và thiếu audit log khi khoá tài khoản.
- **D/M2:** `audit.controller.ts` cho phép `MANAGER` xem audit log hệ thống (vi phạm R-107 và `design-spec.md`).
- **D/M3:** Xoá cứng voucher làm cascade xoá sạch lịch sử `voucher_redemptions` và cắt `orders.voucher_id` thành NULL.
- **D/M4:** PATCH voucher một phần bỏ qua kiểm tra ràng buộc chéo (`PERCENT` <= 100, `validTo` > `validFrom`) làm nổ lỗi DB 500.
- **D/M5:** Phân quyền scoping cho Staff: Staff xem được danh sách `needs-manual-review` và nhận `failedEmails` trong todo.
- **D/M6:** Lịch sử trạng thái đơn hàng (`statusHistory`) trong `getOrderDetail` dùng heuristic giả thay vì truy vấn `audit_logs`.

---

## 2. Chi Tiết Thẩm Định Từng Mục (Cross-Boundary & Adversarial Audit)

### 2.1. D/M1: Ghi nhận actor_id & Audit Log khoá tài khoản
- **Thực tế mã nguồn (`users.controller.ts`):**
  - Trong `applyAdminRole`: Đã thay thế việc dùng `this.supabase.admin()` (service role làm mất `auth.uid()`) bằng `userDb = this.supabase.forUser(jwt)`. Nhờ đó, Postgres session nhận JWT của Admin thực hiện, trigger `user_roles_audit` (được định nghĩa trong migration `20261111010000_core_identity_chain.sql:311`) đọc được `auth.uid()` và ghi chính xác `actor_id` vào `audit_logs`.
  - Trong `lockUser`: Vì `adminClient.auth.admin.updateUserById` là GoTrue API (không kích hoạt trigger trên public tables), controller đã chủ động chèn thêm bản ghi audit log qua `adminClient.from("audit_logs").insert({ action: "UPDATE", actor_id: user.id, table_name: "users", record_id: userId, after_data: { locked: body.locked } })`.
- **Đối chiếu Schema Postgres (`audit_logs`):**
  - Cột `actor_id` (uuid), `table_name` (text), `record_id` (text), `action` (check in ('INSERT', 'UPDATE', 'DELETE')), `after_data` (jsonb) đều khớp chính xác kiểu dữ liệu và ràng buộc CHECK.
- **Đánh giá:** Đạt chuẩn bảo mật và audit trail (R-107).

### 2.2. D/M2: Phân quyền Audit Log chỉ dành cho ADMIN
- **Thực tế mã nguồn (`audit.controller.ts`):**
  - Cả hai endpoint `@Get("admin/audit-logs")` và `@Get("admin/audit")` đều được cấu hình `@Roles("ADMIN")` duy nhất, loại bỏ hoàn toàn quyền của `MANAGER`.
  - `RolesGuard` chặn các vai trò khác (`MANAGER`, `CUSTOMER`) với mã lỗi `403 Forbidden`.
- **Kiểm tra Test (`admin.e2e-spec.ts`):**
  - Test case: Manager gọi `/admin/audit-logs` -> trả về 403.
  - Test case: Customer gọi `/admin/audit-logs` -> trả về 403.
- **Đánh giá:** Đạt chuẩn phân quyền nghiêm ngặt theo `design-spec.md:747`.

### 2.3. D/M3: Chặn xoá cứng Voucher đã có Redemption
- **Thực tế mã nguồn (`vouchers.controller.ts`):**
  - Trong `delete()`: Thực hiện kiểm tra trước `voucher_redemptions` với `{ count: "exact", head: true }` theo `voucher_id`.
  - Nếu `count > 0`: ném `AppException(ERROR_CODES.CONFLICT, "Không thể xoá voucher đã có lượt áp dụng/sử dụng. Vui lòng chuyển trạng thái active = false để ngừng sử dụng.")` trả về HTTP 409 Conflict.
- **Đối chiếu Schema Postgres:**
  - Bảng `voucher_redemptions` có FK `references public.vouchers (id) on delete cascade`. Nhờ tầng controller chặn 409, dữ liệu redemption trong DB được bảo toàn toàn vẹn, không bao giờ bị cascade xoá mất dấu vết kiểm toán.
- **Kiểm tra Test (`admin.e2e-spec.ts`):**
  - Test case: Admin xoá voucher đã có redemption -> trả về 409 `CONFLICT`, voucher không bị xoá khỏi DB.
  - Test case: Admin xoá voucher chưa có redemption -> trả về 200 OK.
- **Đánh giá:** Đạt chuẩn toàn vẹn dữ liệu kế toán/tài chính.

### 2.4. D/M4: Validate chéo khi PATCH Voucher
- **Thực tế mã nguồn (`vouchers.controller.ts`):**
  - Trong `saveUpdate()`: Đọc bản ghi hiện có từ DB và thực hiện merge với payload cập nhật:
    - `mergedDiscountType = body.discountType ?? current.discount_type`
    - `mergedDiscountValue = body.discountValue ?? current.discount_value`
    - `mergedValidFrom = body.validFrom !== undefined ? body.validFrom : current.valid_from`
    - `mergedValidTo = body.validTo !== undefined ? body.validTo : current.valid_to`
  - Thực hiện kiểm tra ràng buộc chéo trên bản ghi đã merge:
    - Nếu `mergedDiscountType === "PERCENT" && mergedDiscountValue > 100` -> ném 400 `VALIDATION_ERROR` ("Percent discount value must be <= 100").
    - Nếu `mergedValidFrom && mergedValidTo && Date.parse(mergedValidTo) <= Date.parse(mergedValidFrom)` -> ném 400 `VALIDATION_ERROR` ("validTo must be after validFrom").
  - Đã có khối `catch` chuyển đổi các mã lỗi Postgres `23514` (check constraint), `23505` (unique), `23503` (foreign key) thành `AppException` 400/409, ngăn chặn lỗi 500 lọt ra ngoài.
- **Kiểm tra Test (`admin.e2e-spec.ts`):**
  - Tạo voucher FIXED 50.000đ, gửi PATCH `{ discountType: "PERCENT" }` không kèm value -> trả về 400 `VALIDATION_ERROR`.
- **Đánh giá:** Đạt chuẩn validation và chống nổ lỗi hệ thống.

### 2.5. D/M5: Phân quyền & Scoping Staff trên Orders & Todo
- **Thực tế mã nguồn (`orders.controller.ts` & `orders.service.ts`):**
  - Cả `OrdersController` (`@Get("needs-manual-review")`) và `AdminOrdersController` (`@Get("orders/needs-manual-review")`) đều đã được cấu hình `@Roles("MANAGER")` (Staff gọi bị chặn 403).
  - Trong `getAdminTodo()`: Xác định `isManagerOrAdmin = access.isAdmin || managerCinemas.length > 0`. Nếu là Staff thuần tuý, `nmrPromise` và `emailPromise` trả về rỗng ngay lập tức (`data: [], count: 0`).
  - Staff không bao giờ nhìn thấy `needs_manual_review` và `failedEmails` của hệ thống; Staff chỉ thấy các đơn `affected` và suất chiếu sắp tới thuộc rạp mình phụ trách.
- **Kiểm tra Test (`orders-report.e2e-spec.ts`):**
  - Staff gọi `/orders/needs-manual-review` và `/admin/orders/needs-manual-review` -> 403 `FORBIDDEN`.
  - Staff gọi `/admin/todo` -> `needsManualReviewCount: 0`, `needsManualReviewOrders: []`, `failedEmailCount: 0`, `failedEmails: []`.
- **Đánh giá:** Đạt chuẩn phân quyền tối thiểu (Least Privilege, AC-16, R-104).

### 2.6. D/M6: Lịch sử trạng thái đơn hàng từ Audit Logs
- **Thực tế mã nguồn (`orders.service.ts`):**
  - Trong `getOrderDetail()`: Thay vì dựng heuristic thời gian giả (`+1 phút`, `+2 phút`), service truy vấn bảng `audit_logs` với `table_name = 'orders'` và `record_id = orderId`, sắp xếp theo `occurred_at asc`.
  - Phân tích các sự kiện:
    - `INSERT` lấy trạng thái ban đầu (`holding`).
    - `UPDATE` lấy sự kiện đổi trạng thái (`pending_payment`, `paid`, `cancelled`, ...) hoặc giải quyết manual review (`RESOLVE_MANUAL_REVIEW`).
    - Gán `timestamp` bằng đúng `occurred_at` trong `audit_logs`.
    - Fallback hợp lý: nếu đơn hàng không có audit log (dữ liệu mock/seed cũ), gán mốc `created_at` và `updated_at` thật từ chính đơn hàng.
- **Kiểm tra Test (`orders-report.e2e-spec.ts`):**
  - Test case: Truy vấn `GET /orders/:id` với mock `audit_logs` -> kiểm tra `statusHistory` trả về đúng 3 trạng thái với timestamp từ log, khớp hoàn toàn.
- **Đánh giá:** Đạt chuẩn kiểm toán và hiển thị dữ liệu trung thực (R-103, R-107).

---

## 3. Kết Quả Kiểm Tra Thực Tế (Verification Commands)

Tất cả các lệnh kiểm tra được thực hiện độc lập tại workspace:

1. **Targeted E2E Tests:**
   - Lệnh: `vitest run test/admin.e2e-spec.ts test/orders-report.e2e-spec.ts`
   - Kết quả: **60/60 tests PASSED** (31 tests orders-report, 29 tests admin). Thời gian: 4.48s. Exit code: 0.
2. **Full API Test Suite:**
   - Lệnh: `pnpm --filter @filmbooking/api test`
   - Kết quả: **412/412 tests PASSED** trên toàn bộ 22 file test. Thời gian: 16.22s. Exit code: 0.
3. **API Typecheck:**
   - Lệnh: `pnpm --filter @filmbooking/api typecheck`
   - Kết quả: **Exit code 0** (không có lỗi kiểu dữ liệu).
4. **API Lint:**
   - Lệnh: `pnpm --filter @filmbooking/api lint`
   - Kết quả: **Exit code 0** (không có cảnh báo hoặc lỗi linting, no-explicit-any sạch).
5. **Shared Package Verify:**
   - Lệnh: `pnpm --filter @filmbooking/shared typecheck && pnpm --filter @filmbooking/shared lint`
   - Kết quả: **Exit code 0** cho cả hai lệnh.

---

## 4. Kết Luận

Các thay đổi trong Task 06 tuân thủ nguyên tắc surgical diff, giải quyết dứt điểm các vấn đề bảo mật và logic nghiệp vụ, đối chiếu chéo chặt chẽ với Database Schema và phân quyền hệ thống. Không có bất kỳ false-confidence test hay rủi ro tiềm ẩn nào.

**ĐÁNH GIÁ CUỐI CÙNG: STRICT PASS**
