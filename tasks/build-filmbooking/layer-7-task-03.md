# Task 03: Web admin lịch chiếu: danh sách, tạo đơn lẻ/hàng loạt, chi tiết suất (đóng bán, khoá ghế), dialog huỷ suất

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-49, R-50, R-51, R-54, R-55, R-108, R-127
- AC-xx: AC-14, AC-24

## Description
Màn 21/38 + B19/B20: lịch theo rạp/phòng/ngày, tạo đơn lẻ + hàng loạt (preview xung đột), chi tiết suất (đóng/mở bán, khoá ghế trên sơ đồ, suất đã bán khoá sửa), CancelShowtimesDialog (một/nhiều/tất cả suất của rạp: preview số đơn, lý do bắt buộc, gõ xác nhận).

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-3-task-05 (API vận hành rạp: phòng, sơ đồ ghế, suất chiếu (đơn lẻ + hàng loạt), đ)
- layer-5-task-08 (API huỷ suất / đóng rạp / đơn bị ảnh hưởng (+ CSV, gửi lại email))

## Acceptance Criteria
- [ ] AC-14 (UI): tạo suất trùng giờ hiển thị suất xung đột.
- [ ] AC-24 (UI): huỷ suất → preview '10 đơn đã thanh toán sẽ chuyển Bị ảnh hưởng, 10 email', xác nhận → suất hiển thị Đã huỷ.
- [ ] Suất đã bán: form sửa giờ/phòng bị disabled kèm lý do (R-54).
- [ ] `?cancelAll=1&cinema=` mở dialog chọn sẵn mọi suất tương lai của rạp.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/lich-chieu/page.tsx`
- `apps/web/src/app/admin/lich-chieu/tao/page.tsx`
- `apps/web/src/app/admin/lich-chieu/[id]/page.tsx`
- `apps/web/src/components/admin/showtime-bulk-form.tsx`
- `apps/web/src/components/admin/seat-lock-panel.tsx`
- `apps/web/src/components/admin/cancel-showtimes-dialog.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
