# Task 04: Web xác nhận đơn: tóm tắt, voucher, cảnh báo không huỷ/không hoàn + checkbox + AlertDialog

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: R-70, R-71, R-72, R-94, R-131, R-133
- AC-xx: AC-08

## Description
Màn 08 (D3): tóm tắt phim/rạp/địa chỉ/suất/ghế/giá chốt/giảm giá/tổng + đếm ngược; ô voucher (map lỗi tiếng Việt); khối cảnh báo inline có checkbox gating nút Thanh toán + AlertDialog xác nhận cuối ghi đúng tên + địa chỉ rạp; gửi consent rồi tạo thanh toán.

## Dependencies
- layer-5-task-01 (API booking: sơ đồ ghế, giữ/nhả ghế, đơn, tóm tắt, đồng ý điều khoản, )
- layer-4-task-11 (Web chi tiết phim + lịch chiếu `/lich-chieu` + stepper đặt vé + SEO ph)

## Acceptance Criteria
- [ ] AC-08: chưa tick → nút Thanh toán disabled; AlertDialog hiển thị đúng tên + địa chỉ rạp của suất; xác nhận → gọi consent rồi payment.
- [ ] Voucher lỗi hiện thông điệp đúng mã (hết hạn, đã dùng, chưa đạt tối thiểu).
- [ ] Không có nút huỷ đơn sau thanh toán (R-131).
- [ ] Tổng tiền hiển thị VND không thập phân.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx`
- `apps/web/src/components/booking/order-summary.tsx`
- `apps/web/src/components/booking/voucher-input.tsx`
- `apps/web/src/components/booking/no-refund-warning.tsx`
- `apps/web/src/components/booking/__tests__/confirm.test.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
