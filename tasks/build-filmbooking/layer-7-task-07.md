# Task 07: Web admin người dùng & phân quyền, cấu hình chuỗi, audit log, tích hợp POS & khoá API

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-17, R-39, R-105, R-106, R-107, R-111, R-130
- AC-xx: —

## Description
Màn 26 + 28 + B23 + 39 + B24: tìm user, gán vai trò/rạp (Manager chỉ Staff rạp mình), cấu hình chuỗi (giữ ghế, nội dung cảnh báo, phiên bản điều khoản), audit log lọc theo rạp/đối tượng/người, khoá API POS (tạo → dialog hiện secret 1 lần + nút copy, thu hồi, log gọi API).

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-5-task-06 (API quản trị: người dùng & vai trò, gán rạp, cấu hình chuỗi, khoá API )

## Acceptance Criteria
- [ ] Secret POS chỉ hiển thị 1 lần; đóng dialog không xem lại được.
- [ ] Manager không thấy vai trò Manager/Admin trong dialog gán.
- [ ] Audit log hiển thị before/after dạng diff.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/nguoi-dung/page.tsx`
- `apps/web/src/app/admin/cau-hinh/page.tsx`
- `apps/web/src/app/admin/audit-log/page.tsx`
- `apps/web/src/app/admin/tich-hop-pos/page.tsx`
- `apps/web/src/components/admin/role-assign-dialog.tsx`
- `apps/web/src/components/admin/api-secret-once-dialog.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
