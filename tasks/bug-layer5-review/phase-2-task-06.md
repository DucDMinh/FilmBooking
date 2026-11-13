# Bug layer5-review · phase-2-task-06 — Admin Audit Actor, Voucher Deletion & Scoping

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-D-admin-orders.md` (D/M1, D/M2, D/M3, D/M4, D/M5, D/M6)
- Root cause:
  1. **D/M1**: Cấp/thu hồi quyền Admin dùng `supabase.admin()` làm mất `actor_id` (ghi `NULL`); `lockUser` không ghi `audit_logs` nào (vi phạm R-107).
  2. **D/M2**: `audit.controller.ts` cho phép `MANAGER` đọc audit log, trái với quyết định của user ("Audit log chỉ Admin" - design-spec.md:747).
  3. **D/M3**: Xoá voucher bằng `DELETE` cứng làm cascade xoá sạch `voucher_redemptions` và cắt `orders.voucher_id` thành NULL.
  4. **D/M4**: PATCH voucher một phần bỏ qua ràng buộc chéo (`discountType`/`discountValue`, `validFrom`/`validTo`) gây lỗi DB `23514`/`23503` thành 500.
  5. **D/M5**: Staff xem được `needs-manual-review` và `getAdminTodo` trả `failedEmails` + `needs_manual_review` cho Staff, trái R-104 & design-spec.
  6. **D/M6**: Lịch sử trạng thái đơn hàng (R-103) bịa bằng heuristic thay vì đọc từ `audit_logs`.
- Files to Create/Modify:
  - `apps/api/src/modules/admin/users.controller.ts`
  - `apps/api/src/modules/admin/audit.controller.ts`
  - `apps/api/src/modules/admin/vouchers.controller.ts`
  - `packages/shared/src/schemas/admin.ts`
  - `apps/api/src/modules/orders/orders.controller.ts`
  - `apps/api/src/modules/orders/orders.service.ts`
  - `apps/api/test/admin.e2e-spec.ts`
  - `apps/api/test/orders-report.e2e-spec.ts`
- Status: done

## Repro Verification
- Original repro:
  1. Cấp quyền Admin -> `audit_logs.actor_id` bị NULL; khoá user không có audit log.
  2. Manager đăng nhập gọi `GET /admin/audit` -> đọc được audit toàn hệ thống.
  3. Xoá voucher đã được khách dùng -> toàn bộ lịch sử redemption bị xoá sạch.
  4. PATCH `{ discountType: "PERCENT" }` cho voucher FIXED 50.000đ -> nổ lỗi 500.
  5. Staff gọi `/admin/todo` -> nhận thông tin email lỗi và đơn needs_manual_review.
  6. Xem chi tiết đơn hàng -> lịch sử trạng thái dựng bằng heuristic giả.
- Expected:
  - Cấp quyền admin và khoá user ghi nhận đầy đủ `actor_id` vào `audit_logs`.
  - `audit.controller.ts` chỉ cho phép role `ADMIN`.
  - Chặn xoá cứng voucher đã có redemption (trả 409 hoặc chỉ cho phép tắt `active = false`).
  - Merge validate ràng buộc chéo khi PATCH voucher.
  - Staff không xem được `needs-manual-review` và `failedEmails` trong todo.
  - Lịch sử trạng thái đơn truy vấn từ `audit_logs`.
- Actual before fix: Audit mất actor, Manager đọc audit, xoá voucher mất lịch sử, PATCH nổ 500, Staff lộ thông tin, history bịa.
- Actual after fix:
  1. Cấp/thu hồi quyền admin dùng `forUser(jwt)` ghi nhận `actor_id` của admin; khoá/mở khoá user ghi nhận `audit_logs` UPDATE với `actor_id` và locked status.
  2. `audit.controller.ts` cấu hình `@Roles("ADMIN")`, Manager và Customer gọi bị chặn 403 Forbidden.
  3. `vouchers.controller.ts` DELETE kiểm tra `voucher_redemptions`, trả 409 CONFLICT nếu đã có lượt áp dụng.
  4. `vouchers.controller.ts` PATCH voucher merge dữ liệu hiện có trong DB để validate ràng buộc chéo (PERCENT <= 100, validTo > validFrom), trả 400 VALIDATION_ERROR.
  5. `orders.controller.ts` cấu hình `@Roles("MANAGER")` trên `needs-manual-review` (chặn Staff 403); `getAdminTodo` ẩn `failedEmails` và `needs_manual_review` đối với Staff.
  6. `orders.service.ts` truy vấn lịch sử trạng thái đơn hàng từ `audit_logs` (`table_name = 'orders'`), sắp xếp thời gian chuẩn xác, loại bỏ hoàn toàn heuristic giả.
- Evidence:
  - `pnpm test test/admin.e2e-spec.ts test/orders-report.e2e-spec.ts`: 60/60 tests PASS.
  - `pnpm --filter @filmbooking/api test`: 412/412 tests PASS across 22 test files.
  - `pnpm --filter @filmbooking/api typecheck`: exit code 0.
  - `pnpm --filter @filmbooking/shared typecheck`: exit code 0.
  - `pnpm --filter @filmbooking/api lint`: exit code 0.
  - `pnpm --filter @filmbooking/shared lint`: exit code 0.
- Status: PASS
