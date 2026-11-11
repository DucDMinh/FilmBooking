# Task 06: Web admin đơn bị ảnh hưởng: danh sách, chi tiết, ghi kết quả xử lý, gửi lại email, CSV

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-109, R-110, R-134
- AC-xx: AC-24, AC-25

## Description
Màn 24/34: lọc theo suất/trạng thái xử lý/trạng thái email, badge 'liên hệ tại quầy' cho đơn POS, gửi lại email, form xử lý (đổi suất / hoàn tiền thủ công cần số tiền + mã giao dịch ngân hàng), tải CSV.

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-5-task-08 (API huỷ suất / đóng rạp / đơn bị ảnh hưởng (+ CSV, gửi lại email))

## Acceptance Criteria
- [ ] AC-25 (UI): thiếu số tiền hoặc mã GD → không submit, báo field; đủ → trạng thái Đã hoàn thủ công.
- [ ] AC-24 (UI): cột trạng thái gửi email hiển thị Đã gửi/Lỗi + nút gửi lại.
- [ ] Staff rạp mình ghi được kết quả (#6).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/don-bi-anh-huong/page.tsx`
- `apps/web/src/app/admin/don-bi-anh-huong/[id]/page.tsx`
- `apps/web/src/components/admin/affected-resolution-form.tsx`
- `apps/web/src/components/admin/__tests__/affected-resolution-form.test.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
