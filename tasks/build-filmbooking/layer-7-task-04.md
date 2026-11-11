# Task 04: Web admin bảng giá, ngày lễ, voucher

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-52, R-53, R-90
- AC-xx: AC-15

## Description
Màn 35 + B22 + 25: ma trận giá (loại ghế × định dạng × loại ngày × khung giờ) theo scope chuỗi/rạp (ghi đè hiển thị khác màu), ngày lễ (Admin), voucher toàn chuỗi (Admin tạo/sửa; Manager chỉ xem).

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-4-task-08 (API bảng giá & ngày lễ (quản trị) + báo giá)
- layer-5-task-06 (API quản trị: người dùng & vai trò, gán rạp, cấu hình chuỗi, khoá API )

## Acceptance Criteria
- [ ] AC-15 (UI): HN02 ghi đè VIP tối cuối tuần 100.000 hiển thị là override, HN01 kế thừa 120.000.
- [ ] Manager không sửa được giá chuỗi/ngày lễ/voucher (ẩn + API 403).
- [ ] Nhập giá không nguyên/âm → lỗi.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/gia/page.tsx`
- `apps/web/src/app/admin/ngay-le/page.tsx`
- `apps/web/src/app/admin/voucher/page.tsx`
- `apps/web/src/components/admin/price-matrix.tsx`
- `apps/web/src/components/admin/voucher-form.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
