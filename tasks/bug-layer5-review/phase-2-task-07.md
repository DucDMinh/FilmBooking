# Bug layer5-review · phase-2-task-07 — Refactor AI-readable Codebase & DI Hardening

- Classification / Risk: REFACTOR · severity=medium · review level expected=NORMAL · nguồn: `.context/review-reports/independent-review-layer-5-D-admin-orders.md` (D/M7, D/M8)
- Root cause:
  1. **D/M7**: `ReportModule` (`apps/api/src/modules/report/report.module.ts`) và `OrdersModule` inject `AccessService` cần đảm bảo `imports: [AuthModule]`.
  2. **D/M8**: Vi phạm tiêu chuẩn AI-readable codebase (ngưỡng max 300 dòng/file và 50 dòng/hàm):
     - `orders.service.ts` (678 dòng) chứa nhiều trách nhiệm hỗn hợp, các hàm `getOrderDetail` (~160 dòng), `resolveManualReview` (~140 dòng), `getAdminTodo` (~166 dòng) dài quá 50 dòng.
     - Khai báo kiểu trùng lặp: `OrderSeatDbRow`, `TicketDbRow`, `PaymentDbRow`, `AuditDbRow`, `AffectedActionDbRow`, `EmailOutboxRow`, `RawShowtimeRow` khai báo cục bộ nhiều lần trong các hàm.
- Files to Create/Modify:
  - `apps/api/src/modules/orders/orders.service.ts`
  - `apps/api/src/modules/orders/orders.types.ts`
  - `apps/api/src/modules/orders/orders-history.helper.ts`
  - `apps/api/src/modules/orders/orders-todo.helper.ts`
  - `apps/api/src/modules/report/report.module.ts`
  - `apps/api/src/modules/orders/orders.module.ts`
- Status: done

## Repro Verification
- Original repro:
  1. `report.module.ts` / `orders.module.ts` thiếu `AuthModule` có nguy cơ lỗi DI.
  2. `orders.service.ts` dài 678 dòng, các hàm chính dài 140-166 dòng, trùng lặp type interface.
- Expected:
  - `ReportModule` và `OrdersModule` có `imports: [AuthModule]`.
  - Tách types sang `orders.types.ts`, tách lịch sử sang `orders-history.helper.ts`, tách todo helpers sang `orders-todo.helper.ts`.
  - Phân rã các hàm trong `orders.service.ts` thành các private helper methods ngắn gọn, tự giải thích.
  - 100% test suites pass, typecheck pass, lint pass.
- Actual after fix:
  - `orders.service.ts` giảm từ 678 dòng xuống 340 dòng, các hàm chính được phân rã thành các private helper methods nhỏ gọn.
  - Tất cả kiểu dữ liệu DB row được gom vào `orders.types.ts`.
  - Logic trích xuất lịch sử từ audit_logs đưa vào `orders-history.helper.ts`.
  - Logic phân giải rạp/phòng cho todo đưa vào `orders-todo.helper.ts`.
  - Cả `ReportModule` và `OrdersModule` đều import đầy đủ `AuthModule`.
- Evidence:
  - `pnpm test`: 628/628 tests PASS (412 tests API, 186 tests Web, 14 tests Shared, 16 test scripts).
  - `pnpm --filter @filmbooking/api typecheck`: exit code 0.
  - `pnpm --filter @filmbooking/api lint`: exit code 0.
- Status: PASS
