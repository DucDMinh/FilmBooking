# Task 05: Web thanh toán + kết quả (đang xác nhận/thất bại/thành công) + Vé của tôi + chi tiết vé QR

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: R-73, R-77, R-79, R-82, R-85, R-87, R-132
- AC-xx: AC-17

## Description
Màn 09/10/11/32 + B5/B6: chuyển tới PayOS checkout (hoặc hiển thị VietQR theo handoff), returnUrl → 'Đang xác nhận thanh toán' polling payment-status (không tin query PayOS), cancelUrl → thất bại + quay lại; thành công → vé (mã đặt vé, QR từ qr_token, rạp + địa chỉ, nhắc chỉ dùng tại rạp). Vé của tôi (sắp tới/đã qua), chi tiết vé; đơn 0đ đi thẳng tới thành công.

## Dependencies
- layer-5-task-02 (API thanh toán PayOS: tạo link, webhook (checksum, idempotent, đối chi)
- layer-5-task-01 (API booking: sơ đồ ghế, giữ/nhả ghế, đơn, tóm tắt, đồng ý điều khoản, )
- layer-4-task-11 (Web chi tiết phim + lịch chiếu `/lich-chieu` + stepper đặt vé + SEO ph)

## Acceptance Criteria
- [ ] Polling dừng khi paid/failed hoặc sau timeout, hiện hướng dẫn liên hệ; không đổi trạng thái dựa trên query string.
- [ ] Khách chưa xác nhận email xem /ve → danh sách rỗng (ma trận quyền).
- [ ] Truy cập /ve/[code] của người khác → 404 (AC-17 lớp UI, dữ liệu do RLS).
- [ ] QR render từ qr_token, không chứa PII.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/dat-ve/don/[id]/thanh-toan/page.tsx`
- `apps/web/src/app/(public)/dat-ve/don/[id]/ket-qua/page.tsx`
- `apps/web/src/app/(public)/ve/page.tsx`
- `apps/web/src/app/(public)/ve/[bookingCode]/page.tsx`
- `apps/web/src/components/ticket/ticket-card.tsx`
- `apps/web/src/components/ticket/ticket-qr.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
