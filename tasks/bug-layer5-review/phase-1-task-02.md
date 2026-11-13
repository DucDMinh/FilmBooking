# Bug layer5-review · phase-1-task-02 — Orders resolveManualReview & Module DI Hardening

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-D-admin-orders.md` (K5-2, D/M7)
- Root cause:
  1. **K5-2**: `resolveManualReview` cập nhật `status: 'paid'` cho đơn `needs_manual_review`, vi phạm máy trạng thái DB (`orders_guard_transition` chặn mã lỗi `23514`) và trái `SPECIFICATIONS.md:311` (`needs_manual_review` là trạng thái kết thúc). Trước khi lỗi, service tự ý upsert `showtime_seat_states` thành `SOLD` riêng lẻ từng ghế không lock, không transaction, nuốt lỗi tạo "ghế ma". Nhánh `REFUND_MANUAL` insert vào `affected_order_actions` bị trigger chặn vì yêu cầu đơn `affected`, code bỏ qua `error` nuốt lỗi.
  2. **D/M7**: `OrdersModule` và `ReportModule` inject `AccessService` nhưng không import `AuthModule` (vốn không `@Global`), dẫn tới lỗi Nest DI khi wire vào `AppModule`.
- Files to Create/Modify:
  - `supabase/migrations/20261113170000_resolve_manual_review_rpc.sql`
  - `apps/api/src/modules/orders/orders.module.ts`
  - `apps/api/src/modules/orders/orders.service.ts`
  - `apps/api/src/modules/orders/orders.controller.ts`
  - `apps/api/src/modules/report/report.module.ts`
  - `apps/api/test/orders-report.e2e-spec.ts`
- Status: done
- Review: STRICT PASS (Round 1, .context/review-reports/bug-layer5-review-phase-1-task-02-round-1-review.md)
- Doc impact: no doc impact (RPC nội bộ bảo toàn máy trạng thái và intent docs SPEC:311; không đổi public contract)

## Repro Verification
- Original repro:
  1. Đơn hàng ở trạng thái `needs_manual_review`.
  2. Manager rạp gọi `POST /orders/:id/resolve-manual-review` với action `CONFIRM_SALE`.
  3. Lỗi 500 do trigger `orders_guard_transition` chặn `23514`; `showtime_seat_states` bị gán dòng SOLD ma cho đơn.
  4. Hoặc gọi với `REFUND_MANUAL`, insert `affected_order_actions` bị trigger chặn, lỗi bị nuốt và trả 200 thành công giả.
  5. Đăng ký `OrdersModule` vào `AppModule` gây crash khởi động do thiếu dependency `AccessService`.
- Expected:
  - RPC nguyên tử `resolve_manual_review` đánh dấu `manual_review_resolved_at = clock_timestamp()` và ghi `audit_logs` đầy đủ thông tin xử lý (`action`, `note`, `refund_reference`, `refunded_amount`).
  - Trạng thái đơn giữ nguyên `needs_manual_review` theo đúng `SPECIFICATIONS.md:311` và R-104; không biến đổi trạng thái bất hợp pháp và không tạo ghế ma `SOLD`.
  - Chỉ Manager của rạp hoặc Admin mới có quyền giải quyết; Staff bị từ chối 403.
  - `OrdersModule` và `ReportModule` import `AuthModule`, giải quyết triệt để lỗi DI.
- Actual before fix: Lỗi 23514, tạo ghế ma, nuốt lỗi hoàn tiền, thiếu import AuthModule gây crash DI.
- Actual after fix:
  - RPC `resolve_manual_review` cập nhật `manual_review_resolved_at = clock_timestamp()` nguyên tử và ghi `audit_logs` với action 'UPDATE', action_detail 'RESOLVE_MANUAL_REVIEW'.
  - Status đơn hàng giữ nguyên `needs_manual_review` (tuân thủ SPECIFICATIONS.md:311 và R-104), không đổi sang `paid`, không tạo ghế ma `SOLD`, không insert vào `affected_order_actions`.
  - Endpoint đổi sang `@Roles("MANAGER")` và kiểm tra quyền rạp/Admin ở cả 2 lớp API + RPC DB; Staff gọi nhận 403 FORBIDDEN. Đơn đã resolved gọi lại nhận 409 CONFLICT.
  - `OrdersModule` và `ReportModule` import `AuthModule`, khởi tạo DI trơn tru.
- Evidence:
  - `pnpm --filter @filmbooking/api test test/orders-report.e2e-spec.ts`: 28/28 tests PASS.
  - `pnpm test`: 568 tests PASS toàn repo (API: 382, Web: 156, Shared: 14, Scripts: 16).
  - `pnpm typecheck`: PASS 100%.
  - `pnpm lint`: PASS 100%.
- Status: PASS
