# Task 03: Web chọn ghế `/dat-ve/[showtimeId]`: SeatMap a11y + realtime + giữ ghế + đếm ngược

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: R-16, R-59, R-60, R-61, R-63, R-64, R-65, R-66, R-68, R-121, R-122
- AC-xx: AC-01, AC-06, AC-07, AC-20

## Description
Màn 06/31 + B12/B13 (design-spec §5.3): lưới ghế có nhãn cho screen reader, điều hướng phím mũi tên, trạng thái Trống/Đang chọn/Đang giữ/Đã bán/Khoá/Hỏng, sweetbox 2 ô; subscribe Realtime kênh theo suất; **tự tính 'trống' khi expires_at < now ở client** (timer) để AC-07/AC-22 ≤ 2s không cần cron; giới hạn 8, cảnh báo ghế lẻ, xác nhận độ tuổi phim T13+; chưa đăng nhập → LoginRequiredDialog (giữ `next`); chưa xác nhận email → banner + chặn; đếm ngược + HoldExpiredDialog.

## Dependencies
- layer-5-task-01 (API booking: sơ đồ ghế, giữ/nhả ghế, đơn, tóm tắt, đồng ý điều khoản, )
- layer-4-task-11 (Web chi tiết phim + lịch chiếu `/lich-chieu` + stepper đặt vé + SEO ph)

## Acceptance Criteria
- [ ] AC-06 (UI): API trả SEAT_TAKEN → toast 'E5 vừa có người chọn', ghế chuyển Đang giữ, bỏ khỏi lựa chọn.
- [ ] AC-07/AC-20: sự kiện realtime hoặc hết expires_at → cập nhật ô ghế ≤ 2s (test bằng fake timers + mock channel).
- [ ] Mỗi ghế có aria-label 'Hàng E ghế 5, VIP, 120.000 đồng, trống' (NFR-12); dùng được hoàn toàn bằng bàn phím.
- [ ] Chọn ghế thứ 9 bị chặn với thông báo; chọn tạo ghế lẻ → báo trước khi gọi API.
- [ ] Hết giờ giữ → HoldExpiredDialog, quay lại sơ đồ.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/dat-ve/[showtimeId]/page.tsx`
- `apps/web/src/components/booking/seat-map.tsx`
- `apps/web/src/components/booking/seat-legend.tsx`
- `apps/web/src/components/booking/hold-countdown.tsx`
- `apps/web/src/components/booking/hold-expired-dialog.tsx`
- `apps/web/src/components/booking/login-required-dialog.tsx`
- `apps/web/src/lib/realtime/use-showtime-seats.ts`
- `apps/web/src/components/booking/__tests__/seat-map.test.tsx`

## Notes
Màn rủi ro cao nhất phía UI — ưu tiên test.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
