# Task 08: API huỷ suất / đóng rạp / đơn bị ảnh hưởng (+ CSV, gửi lại email)

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-33, R-108, R-109, R-110, R-127, R-134
- AC-xx: AC-24, AC-25, AC-26

## Description
Preview + huỷ một/nhiều/tất cả suất của rạp (lý do bắt buộc); đổi trạng thái rạp qua set_cinema_status (AC-26). Đơn bị ảnh hưởng: danh sách/chi tiết, trạng thái gửi email, gửi lại (đặt outbox về PENDING), ghi kết quả xử lý — đổi suất / hoàn tiền thủ công **bắt buộc số tiền + mã giao dịch ngân hàng** (AC-25) → refunded_manual; Staff rạp mình được ghi (#6). Xuất CSV đơn bị ảnh hưởng.

## Dependencies
- layer-4-task-04 (RPC huỷ suất hàng loạt + chặn đóng rạp còn suất đã bán)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-24 qua API: huỷ suất 10 đơn paid → 10 affected, 10 email; GET danh sách hiển thị trạng thái gửi.
- [ ] AC-25: hoàn thủ công thiếu số tiền hoặc mã GD → 422; đủ → refunded_manual và có trong báo cáo suất bị huỷ.
- [ ] AC-26: đóng rạp còn suất đã bán → 409 kèm danh sách suất cần huỷ.
- [ ] Staff HN02 ghi kết quả cho đơn HN01 → 403; Staff HN01 → OK.
- [ ] CSV UTF-8 BOM, cột tiếng Việt, chỉ dữ liệu rạp được gán.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/cancellation/cancellation.module.ts`
- `apps/api/src/modules/cancellation/cancellation.controller.ts`
- `apps/api/src/modules/cancellation/cancellation.service.ts`
- `apps/api/src/modules/cancellation/affected-csv.ts`
- `packages/shared/src/schemas/cancellation.ts`
- `apps/api/test/cancellation.e2e-spec.ts`

## Notes
Reviewer STRICT. Đăng ký app.module ở layer-6-task-01.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
