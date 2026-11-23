# Feature concession-combo · phase-2-task-02 — API Backend: Danh mục combo, cập nhật combo đơn hàng & tích hợp thanh toán/vé

- **Classification / Risk:** MODIFY. Risk: Endpoint cập nhật combo của đơn hàng, quyền hạn người dùng (chỉ chủ đơn được sửa khi holding), tính đúng tiền, payload `BookingSummaryResponse`, email vé. Reviewer: **STRICT**.
- **Scope:** `apps/api/src/modules/booking/*`, `apps/api/src/modules/catalog/*` (hoặc `concession/*`), `apps/api/src/modules/mail/*`.

## Thiết kế chi tiết

### 1. Catalog / Combos Endpoint
- Tạo `GET /combos`:
  - Public endpoint (@Public()).
  - Trả về danh sách `ComboDto[]` đang kích hoạt (`is_active = true`), sắp xếp tăng dần theo `display_order`.

### 2. Booking Combos Endpoint
- Thêm `PUT /bookings/:id/combos`:
  - Yêu cầu xác thực (`@CurrentUser() user: AuthUser`).
  - Validate body với `ZodValidationPipe(updateOrderCombosSchema)`.
  - Service kiểm tra:
    - Đơn hàng tồn tại và thuộc về `user.id`.
    - Trạng thái đơn phải là `holding` và chưa hết hạn giữ chỗ (`hold_expires_at > now()`). Đơn đã huỷ hoặc đã thanh toán -> trả lỗi 400 `ORDER_NOT_PAYABLE` hoặc 422.
    - Gọi RPC hoặc thực hiện cập nhật `order_combos` và tính lại `subtotal_amount`, `total_amount`.
  - Trả về `BookingSummaryResponse` đầy đủ thông tin đơn hàng sau khi cập nhật.

### 3. Tích hợp BookingSummaryResponse
- Trong `BookingService.getBooking`:
  - Query kèm `order_combos` (id, combo_id, combo_name, quantity, unit_price, total_price).
  - Map vào `BookingSummaryResponse.combos`.
  - `pricing.combosTotal` = tổng tiền các combo của đơn.
  - `pricing.subtotal` = tổng tiền ghế + combosTotal.
  - `pricing.total` = subtotal - discount.

### 4. Tích hợp Email vé & DTO Soát vé
- Trong `TicketIssuedPayload` / email vé:
  - Nếu đơn hàng có combo, thêm danh sách `combos: Array<{ name: string; quantity: number }>` vào nội dung email vé để khách hàng có bằng chứng nhận combo tại quầy.
- Trong DTO tra cứu đơn / soát vé (`checkin`):
  - Trả về danh sách combo của đơn hàng để nhân viên soát vé thấy khi quét QR.

### 5. Verification
- Chạy unit test API `pnpm -C apps/api test` PASS.
- Typecheck `pnpm -w typecheck` PASS.
