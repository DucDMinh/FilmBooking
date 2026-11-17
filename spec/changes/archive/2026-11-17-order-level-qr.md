---
id: order-level-qr
type: feature
status: done
created: 2026-11-17
---

# Một QR cho cả đơn hàng (bỏ QR từng ghế); staff quét 1 mã là soát cả đơn

## Yêu cầu
User (2026-11-17): "gửi 8 mã qr này quá phiền phức, bây giờ không tạo mã qr từng ghế nữa, chỉ tạo qr đơn hàng thôi, mọi thông tin đơn hàng sẽ chứa trong đó, staff cũng chỉ cần quét 1 mã. Các rạp phim bây giờ cũng làm thế mà".
- Hiện trạng: mỗi ghế = 1 vé = 1 `qr_token`; email/trang vé hiện N QR; RPC `checkin_ticket` soát đúng 1 ghế mỗi lần quét (kể cả nhập tay mã đặt vé). Spec R-85 vốn đã viết "mỗi đơn có mã đặt vé và mã QR" → hiện thực lệch ý spec.
- Quyết định thiết kế (primary, theo yêu cầu): **một QR/đơn**, QR = token ngẫu nhiên của ĐƠN (không nhúng nội dung đơn vào chuỗi QR vì chuỗi nhúng ai cũng tự tạo giả được; thông tin đơn hiện khi quét: phim, suất, phòng, toàn bộ ghế). Soát vé theo đơn: một lần quét check-in tất cả ghế. Giữ bảng `tickets` từng ghế (dữ liệu/lịch sử); QR cũ theo ghế đã phát hành vẫn quét được và soát cả đơn (tương thích).

## Hợp đồng giữa các task
- DB: `orders.qr_token text not null unique` (32 hex, mặc định ngẫu nhiên, backfill đơn cũ). `checkin_ticket(p_input text, p_cinema_id uuid, p_staff_id uuid)` giữ nguyên chữ ký; tra theo `orders.qr_token` | `orders.booking_code` | (tương thích) `tickets.qr_token`; check-in TẤT CẢ ghế chưa soát của đơn trong một giao dịch, khoá hàng `orders` chống race.
- RPC jsonb thành công: `status 'OK'`, `result 'SUCCESS'`, `order_id`, `booking_code`, `movie_title`, `cinema_name`, `room_name`, `seats` (mảng nhãn ghế xếp tự nhiên), `seat_count`, `starts_at`, `checked_in_at`. Bỏ `ticket_id`/`seat_label`/`seat_type`. Các nhánh WRONG_CINEMA/CANCELLED/USED/EXPIRED/TOO_EARLY/INVALID giữ nguyên key.
- API shared: `ScanTicketResponse.ticket` → `order?: { orderId, bookingCode, movieTitle, cinemaName, roomName, seats: string[], seatCount: number, startsAt, checkedInAt }`.
- Email: đúng 1 ảnh QR (CID `ticket-qr`) mã hoá `orders.qr_token`, liệt kê toàn bộ ghế.

## Acceptance (bắt buộc)
- [x] Đơn N ghế đã thanh toán: email có **1** ảnh QR, giải mã == `orders.qr_token`; trang "Vé của tôi/chi tiết" hiện **1** QR cho cả đơn kèm danh sách ghế.
- [x] Staff quét QR đơn (hoặc nhập mã đặt vé) **một lần** → ✅ Hợp lệ, hiện toàn bộ ghế, tất cả `tickets` của đơn `checked_in_at` được set, đơn → `checked_in`; quét lại → ❌ Đã sử dụng (thời điểm + người soát lần đầu) (AC-12).
- [x] Sai rạp / suất huỷ / đơn affected / chưa tới giờ / hết giờ / chưa thanh toán / không tồn tại: giữ nguyên hành vi và thông điệp; sai rạp không lộ ghế/tên khách (AC-13, R-102); race 2 lần quét đồng thời → đúng 1 thành công.
- [x] QR cũ theo từng ghế (đã gửi trước đây) vẫn quét được và soát cả đơn.
- [x] Mọi `orders.qr_token` được backfill (đơn cũ), không trùng, đúng định dạng; `qr_token` KHÔNG lộ trong lịch sử soát vé/DTO admin (credential).
- [x] pgTAP, test API, test web, lint, typecheck PASS; verify thật trên stack local (RPC + PostgREST + email đơn nhiều ghế).

## Ghi chú
Spec đã sửa R-85, R-87, R-98, R-99, AC-12 (làm rõ theo đơn). Cần bump `spec_version` (3.3.0) qua spec-publisher. Còn gap R-86 "link bản đồ" (ngoài phạm vi).
