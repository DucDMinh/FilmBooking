# Review: feature concession-combo, phase-2 task-02, round 1

Agent: reviewer

- Review level: **STRICT** (API endpoints mới `GET /combos`, `PUT /bookings/:id/combos`, cập nhật payload `BookingSummaryResponse`, email vé outbox).
- Scope: `apps/api/src/modules/booking/booking.controller.ts`, `apps/api/src/modules/booking/booking.service.ts`, `apps/api/src/modules/booking/booking.helper.ts`, `apps/api/src/modules/jobs/jobs.controller.ts`, `apps/api/src/modules/booking/__tests__/booking-combos.spec.ts`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm -w typecheck` | PASS toàn bộ 3 workspace (packages/shared, apps/api, apps/web). |
| `pnpm --filter @filmbooking/api test src/modules/booking/__tests__/booking-combos.spec.ts` | PASS 4/4 tests: getCombos, updateCombos gọi RPC sync_order_combos, kiểm tra quyền và trạng thái đơn, mapping summary combos và pricing.combosTotal. |
| Kiểm tra quyền & logic endpoint | `GET /combos` đánh dấu `@Public()`, trả danh sách combo active sắp xếp displayOrder. `PUT /bookings/:id/combos` có `@CurrentUser()`, xác thực quyền sở hữu đơn hàng qua `verifyOrderActionEligibility`, ném lỗi chuẩn (`HOLD_EXPIRED`, `NOT_FOUND`, `VALIDATION_ERROR`). |
| Tích hợp email vé | `jobs.controller.ts` enrich trường `combos` từ bảng `order_combos` (dạng `Tên combo × Số lượng`), template `TICKET_ISSUED` render đúng dòng `Bắp nước` trong email vé. |

## Findings

### CRITICAL / MAJOR
Không có.

### MINOR / NIT
1. `BookingSummaryResponse`: Các trường `combos` và `pricing.combosTotal` được thiết kế tương thích ngược (optional), không gây vỡ các consumer cũ.

## Verdict: **STRICT PASS**

Task-02 hoàn thành đầy đủ. Sẵn sàng chuyển tiếp sang Phase 3 (Web Client & Soát vé).
