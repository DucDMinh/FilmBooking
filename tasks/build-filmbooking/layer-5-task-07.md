# Task 07: API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo MVP, Việc cần làm

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-103, R-104, R-112, R-113, R-116, R-134
- AC-xx: AC-11, AC-16

## Description
Tra cứu đơn theo mã/email/SĐT/suất (Staff chỉ đọc rạp mình), chi tiết + lịch sử trạng thái. Danh sách needs_manual_review + ghi kết quả xử lý (chốt bán thủ công nếu ghế trống / hoàn tiền thủ công) — Admin + Manager rạp đó. Báo cáo: doanh thu theo kỳ, theo phim/suất/rạp, đối soát PayOS, suất bị huỷ (lát MVP R-119). `GET /admin/todo` (D5: đơn cần xử lý, đơn affected chưa xử lý, email lỗi, suất sắp bắt đầu).

## Dependencies
- layer-4-task-05 (RPC check-in vé + view báo cáo MVP (doanh thu, theo phim/suất/rạp, đối)
- layer-3-task-03 (Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.typ)

## Acceptance Criteria
- [ ] AC-11: đơn needs_manual_review HN01 xuất hiện cho Admin + Manager HN01, không cho Manager HN02.
- [ ] AC-16: Manager HN01 gọi báo cáo/đơn HN02 → 403 hoặc rỗng.
- [ ] Staff ghi xử lý needs_manual_review → 403 (chỉ đọc).
- [ ] Báo cáo doanh thu chỉ tính đơn paid; số liệu khớp seed test.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/orders/orders.module.ts`
- `apps/api/src/modules/orders/orders.controller.ts`
- `apps/api/src/modules/orders/orders.service.ts`
- `apps/api/src/modules/report/report.module.ts`
- `apps/api/src/modules/report/report.controller.ts`
- `packages/shared/src/schemas/orders.ts`
- `packages/shared/src/schemas/report.ts`
- `apps/api/test/orders-report.e2e-spec.ts`

## Notes
Đăng ký app.module ở layer-6-task-01.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
