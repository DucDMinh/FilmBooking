# Task 01: API booking: sơ đồ ghế, giữ/nhả ghế, đơn, tóm tắt, đồng ý điều khoản, voucher trên đơn

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-05, R-59, R-61, R-64, R-65, R-66, R-67, R-68, R-70, R-71, R-94, R-95, R-131, R-133
- AC-xx: AC-01, AC-06, AC-08

## Description
`GET /showtimes/:id/seatmap` (public: lưới ghế + state + expires_at + giá theo loại), `POST /bookings/holds` (chỉ CUSTOMER đã xác nhận email — Staff/Manager/Admin 403), `DELETE /bookings/:id/hold`, `GET /bookings/:id` (tóm tắt: phim, rạp + địa chỉ, suất, ghế, giá chốt, còn bao lâu), `POST /bookings/:id/age-confirm` (R-68 phim T13+), `POST /bookings/:id/consent` (lưu bằng chứng đồng ý không huỷ/không hoàn: thời điểm + phiên bản nội dung — AC-08), `POST/DELETE /bookings/:id/voucher` (gọi RPC, map mã lỗi). Không có endpoint huỷ đơn cho khách (R-131).

## Dependencies
- layer-4-task-01 (RPC giữ/nhả/gia hạn ghế nguyên tử (web + POS) + dọn hold hết hạn)
- layer-4-task-02 (RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết h)
- layer-4-task-03 (RPC voucher lõi: áp/giữ lượt, hoàn lượt khi hết hạn/huỷ, mã lỗi)
- layer-3-task-03 (Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.typ)

## Acceptance Criteria
- [ ] AC-01: khách chưa xác nhận email gọi hold → 403 `EMAIL_NOT_CONFIRMED`.
- [ ] AC-06 (API): 2 request cùng ghế E5 song song → đúng 1 thành công, request kia 409 `SEAT_TAKEN` details.seats=['E5'].
- [ ] AC-08 (API): tạo payment khi chưa có consent → 409 `CONSENT_REQUIRED`; consent lưu consent_at + phiên bản.
- [ ] Seatmap không trả user_id/order_id; ghế HELD có expires_at < now trả về FREE.
- [ ] Nhập voucher sai > ngưỡng → 429 (R-95).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/booking/booking.module.ts`
- `apps/api/src/modules/booking/booking.controller.ts`
- `apps/api/src/modules/booking/booking.service.ts`
- `apps/api/src/modules/booking/seatmap.service.ts`
- `packages/shared/src/schemas/booking.ts`
- `apps/api/test/booking.e2e-spec.ts`

## Notes
Gọi RPC bằng `forUser(jwt)` để RLS/`auth.uid()` có hiệu lực.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
