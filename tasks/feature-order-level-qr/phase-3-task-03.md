# Feature order-level-qr · phase-3-task-03 — Web: 1 QR cho đơn (Vé của tôi) + màn soát vé hiển thị cả đơn

- Classification / Risk: MODIFY (UI). Reviewer **NORMAL**. Phụ thuộc task-01 (cột `orders.qr_token`) và task-02 (type `ScanTicketResponse.order` trong `@filmbooking/shared`).
- Hợp đồng: `spec/changes/2026-11-17-order-level-qr.md`.

## Thiết kế
1. `apps/web/src/components/ticket/ticket-data.ts`: `ORDER_COLUMNS` thêm `qr_token` của đơn; `OrderRow.qr_token`; `PaidOrderView.qrToken` (QR của đơn) — `tickets: TicketView[]` giữ `seatLabel` + `checkedIn` nhưng BỎ `qrToken` từng vé khỏi view; vẫn lọc theo `user_id` (AC-17) như cũ; danh sách ghế xếp tự nhiên.
2. `apps/web/src/components/ticket/ticket-card.tsx` (+ `ticket-qr.tsx`): chi tiết đơn hiện **MỘT** QR (`TicketQr token={order.qrToken} label="Mã QR đơn hàng"`) kèm danh sách toàn bộ ghế và mã đặt vé; dòng hướng dẫn "Một mã QR cho cả đơn — đưa cho nhân viên soát vé, không cần mã từng ghế"; đơn `affected` vẫn không hiện QR dùng được; đơn `checked_in` hiện trạng thái "Đã soát vé" (giữ cách hiện có xử lý vé đã dùng, nay ở mức đơn); giữ tăng độ sáng màn hình khi mở QR (R-87), chính sách không huỷ/không hoàn.
3. Màn soát vé `apps/web/src/app/staff/soat-ve/page.tsx` (+ component kết quả): dùng `response.order` thay `response.ticket`: kết quả ✅ hiện phim, suất, phòng, **toàn bộ ghế của đơn** (`seats` + "N ghế") và mã đặt vé; `USED` giữ thời điểm + người soát lần đầu; WRONG_CINEMA chỉ tên + địa chỉ rạp (không ghế/tên khách); lịch sử soát KHÔNG hiện token (`soat-ve/page.tsx:23`). Grep mọi nơi web đọc `ticket.seatLabel`, `ticket.qrToken`, `response.ticket`, DTO admin `tickets[].qrToken` (task-02 có thể đã bỏ) và cập nhật.
4. Test: `components/ticket/__tests__/ticket.test.tsx` (1 QR/đơn dù N ghế, danh sách ghế, affected không QR), test soát vé (OK hiện N ghế, USED, WRONG_CINEMA không lộ ghế), `ticket-data` (`toPaidOrderView` có `qrToken` đơn, không còn token vé). Đỏ trước khi sửa.

## KHÔNG làm
Không đụng `supabase/**`, `apps/api/**`, `packages/shared/**` (nếu thiếu type → báo lại, không tự sửa), `.env*`. Không `git add/commit/checkout/reset/stash/clean`.

## Files to Modify
`apps/web/src/components/ticket/*`, `apps/web/src/app/staff/soat-ve/*`, test liên quan.

## Repro Verification
- Original: trang vé hiện N QR; màn soát chỉ 1 ghế.
- Expected: 1 QR/đơn; màn soát hiện cả đơn.
- Actual after: trang vé hiện 1 QR/đơn kèm danh sách ghế; màn soát hiện toàn bộ ghế của đơn.
- Evidence (2026-11-18): test component/page (đỏ trước, xanh sau; web 595), typecheck web xanh, reviewer NORMAL PASS round 1. CHƯA xem trên trình duyệt thật (cần đăng nhập khách + staff với đơn seed nhiều ghế) — user tự kiểm ở 375/768/1280 và thử quét QR.
- Status: PASS (kèm residual: chưa kiểm giao diện thật)
