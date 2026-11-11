# Task 05: Web admin Việc cần làm + đơn hàng + chi tiết đơn + đơn cần xử lý thủ công

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-103, R-104, R-134
- AC-xx: AC-11

## Description
D5/B16 + 23 + B17/B18: landing nhân sự (đếm đơn cần xử lý, đơn affected chưa xử lý, email lỗi, suất sắp bắt đầu), tra cứu đơn, chi tiết + timeline trạng thái, danh sách needs_manual_review + form xử lý (Admin/Manager; Staff chỉ đọc).

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-5-task-07 (API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo M)

## Acceptance Criteria
- [ ] AC-11 (UI): đơn needs_manual_review hiện ở Việc cần làm + /admin/don-can-xu-ly của Admin và Manager rạp đó.
- [ ] Staff mở chi tiết đơn: không có nút ghi xử lý.
- [ ] Tìm theo mã đặt vé chính xác mở thẳng chi tiết.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/components/admin/todo-widgets.tsx`
- `apps/web/src/app/admin/don-hang/page.tsx`
- `apps/web/src/app/admin/don-hang/[code]/page.tsx`
- `apps/web/src/app/admin/don-can-xu-ly/page.tsx`
- `apps/web/src/components/admin/order-timeline.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
