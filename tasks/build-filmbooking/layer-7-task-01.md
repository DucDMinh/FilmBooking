# Task 01: Web admin phim & rạp (danh sách + form, trạng thái rạp, cấu hình rạp)

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-32, R-33, R-38, R-41, R-42, R-56
- AC-xx: AC-19, AC-26

## Description
Màn 20/37 + 19/36: CRUD phim (poster upload, nhãn tuổi, ngày khởi chiếu) chỉ Admin; CRUD rạp (Admin), Manager sửa thông tin rạp mình; cấu hình rạp (dọn phòng, mốc đóng bán online); đổi trạng thái rạp — bị chặn (AC-26) thì hiện danh sách suất + link sang huỷ hàng loạt `/admin/lich-chieu?cinema=..&cancelAll=1`.

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-3-task-04 (API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ,)
- layer-3-task-05 (API vận hành rạp: phòng, sơ đồ ghế, suất chiếu (đơn lẻ + hàng loạt), đ)

## Acceptance Criteria
- [ ] AC-19 (UI): Admin tạo rạp mới → xuất hiện ở /rap không cần deploy.
- [ ] AC-26 (UI): đóng rạp còn suất đã bán → hiện cảnh báo + danh sách suất, không đổi trạng thái.
- [ ] Manager không thấy nút tạo rạp/phim.
- [ ] Form validate bằng zod schema shared; lỗi server hiển thị đúng field.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/phim/page.tsx`
- `apps/web/src/app/admin/phim/[id]/page.tsx`
- `apps/web/src/app/admin/rap/page.tsx`
- `apps/web/src/app/admin/rap/[id]/page.tsx`
- `apps/web/src/components/admin/movie-form.tsx`
- `apps/web/src/components/admin/cinema-form.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
