# Task 02: Web admin phòng chiếu + trình chỉnh sơ đồ ghế + sao chép sơ đồ

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-47, R-48
- AC-xx: —

## Description
Màn 22 + B21: danh sách phòng, editor lưới hàng × cột (đặt loại ô Thường/VIP/Sweetbox 2 ô/lối đi/hỏng), đặt nhãn hàng/ghế tự động, sao chép sơ đồ từ phòng khác.

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-3-task-05 (API vận hành rạp: phòng, sơ đồ ghế, suất chiếu (đơn lẻ + hàng loạt), đ)

## Acceptance Criteria
- [ ] Sweetbox phải chiếm 2 ô liền kề cùng hàng; lỗi hiện tại chỗ.
- [ ] Lưu → reload hiển thị đúng; sao chép tạo bản độc lập.
- [ ] Editor thao tác được bằng bàn phím (chọn ô + phím đổi loại).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/rap/[id]/phong/page.tsx`
- `apps/web/src/app/admin/rap/[id]/phong/[roomId]/page.tsx`
- `apps/web/src/components/admin/seat-layout-editor.tsx`
- `apps/web/src/components/admin/copy-layout-dialog.tsx`
- `apps/web/src/components/admin/__tests__/seat-layout-editor.test.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
