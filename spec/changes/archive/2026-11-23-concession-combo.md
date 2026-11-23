---
id: concession-combo
type: feature
status: done
created: 2026-11-23
---

# Thêm chức năng đặt combo bắp nước vào đoạn thanh toán

## Yêu cầu
Kích hoạt tính năng chọn và mua combo bắp nước (chuyển từ phạm vi GĐ2 sang hiệu lực) trong luồng đặt vé trực tuyến:
1. Khách hàng khi đến bước Xác nhận đơn hàng & Thanh toán (`/dat-ve/don/[id]/xac-nhan`) có thể xem danh sách combo bắp nước, chọn số lượng combo muốn mua kèm.
2. Tiền combo được tính vào tổng tiền đơn hàng (`subtotal = tiền vé + tiền combo; total = subtotal - voucher`).
3. Khách thanh toán toàn bộ đơn hàng (vé + combo) qua cổng thanh toán PayOS.
4. Đơn hàng thành công hiển thị combo trong chi tiết vé, email xác nhận vé và màn hình soát vé cho nhân viên rạp kiểm tra phát bắp nước.

## Bối cảnh & Spec liên quan
- Trong `SPECIFICATIONS.md` ban đầu, combo được gắn nhãn GĐ2:
  - `R-58`: Danh mục combo và giá (toàn chuỗi / theo rạp).
  - `R-69`: Bước chọn combo bắp nước trong luồng đặt vé.
  - `R-72`: Tính toán tiền minh bạch: `tổng tiền = vé + combo - voucher`.
  - `R-100`: Đánh dấu/kiểm tra combo khi soát vé.
- Hiện trạng:
  - Bảng `orders` hiện chỉ tính tiền vé từ `order_seats`.
  - Loại voucher enum trong DB đã có sẵn giá trị `COMBO`.
  - Màn hình xác nhận `/dat-ve/don/[id]/xac-nhan` đang hiển thị thông tin phim/suất/ghế và thanh toán.

## Acceptance Criteria (bắt buộc)
- [ ] **DB Migration:**
  - Bảng `combos`: `id`, `name`, `description`, `price_amount`, `image_url`, `is_active`, `display_order`, `created_at`, `updated_at`.
  - Bảng `order_combos`: `id`, `order_id` (FK `orders(id)` on delete cascade), `combo_id` (FK `combos(id)`), `quantity` (int > 0), `unit_price` (int >= 0), `total_price` (int >= 0), `created_at`.
  - Cập nhật tính toán tiền của đơn hàng: `subtotal_amount = sum(order_seats.price_amount) + sum(order_combos.total_price)`. `total_amount = subtotal_amount - discount_amount`.
  - Seed dữ liệu demo: ít nhất 3-4 combo mẫu phổ biến (Combo Solo: 1 Bắp + 1 Nước; Combo Couple: 1 Bắp lớn + 2 Nước; Bắp rang bơ phô mai; Nước ngọt).
- [ ] **API Endpoints:**
  - `GET /combos`: Danh sách combo đang hoạt động (`is_active = true`), sắp xếp theo `display_order`.
  - `PUT /bookings/:id/combos`: Cập nhật danh sách combo cho đơn hàng đang ở trạng thái `holding` (chỉ chủ đơn được gọi, kiểm tra số lượng >= 0, tính lại subtotal và total của đơn).
  - `GET /bookings/:id`: Trả về mảng `combos` đã chọn kèm chi tiết (tên, số lượng, đơn giá, thành tiền) trong `BookingSummaryResponse`.
  - Áp dụng voucher (nếu voucher loại `ORDER` hoặc `COMBO`): tính toán giảm giá đúng quy định.
- [ ] **Giao diện Web Khách hàng (`apps/web`):**
  - Màn hình `/dat-ve/don/[id]/xac-nhan`: Bổ sung section "Bắp nước & Combo" (danh sách combo có hình ảnh, tên, mô tả, giá VND, bộ nút [- 0 +] điều chỉnh số lượng).
  - Khi tăng/giảm combo: Gọi API cập nhật combo của đơn ngay lập tức, tự động cập nhật lại PriceBreakdown (thêm dòng tiền Combo) và tổng thanh toán.
  - Màn hình kết quả `/dat-ve/don/[id]/ket-qua` & xem vé `/ve/[bookingCode]`: Liệt kê danh sách combo đã đặt kèm số lượng.
- [ ] **Email & Soát vé:**
  - Email vé (`mail.ticket`): Thêm danh sách combo bắp nước khách đã mua (nếu có) vào bảng chi tiết vé.
  - Màn hình soát vé nhân viên (`/soat-ve` / scan QR): Hiển thị thông tin combo của đơn hàng để nhân viên tại quầy kiểm tra và phát bắp nước cho khách.
- [ ] **Kiểm thử & Chất lượng:**
  - Đầy đủ unit test và API test cho luồng tính tiền và cập nhật combo.
  - Reviewer độc lập review code & spec validator kiểm tra spec delta.
