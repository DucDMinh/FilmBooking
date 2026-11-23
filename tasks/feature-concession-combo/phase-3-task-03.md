# Feature concession-combo · phase-3-task-03 — Web Client: Component chọn combo tại trang xác nhận, PriceBreakdown, chi tiết vé & màn Soát vé

- **Classification / Risk:** MODIFY. Risk: Giao diện đặt vé (`apps/web`), đồng bộ state tổng tiền, responsive, hiển thị vé và soát vé. Reviewer: **NORMAL** (hoặc STRICT cho luồng thanh toán).
- **Scope:** `apps/web/src/app/(public)/dat-ve/don/[id]/xac-nhan/*`, `apps/web/src/components/booking/*`, `apps/web/src/app/(public)/dat-ve/don/[id]/ket-qua/*`, `apps/web/src/app/(public)/ve/*`, `apps/web/src/app/(staff)/soat-ve/*`.

## Thiết kế chi tiết

### 1. Component `ConcessionSelector` (`apps/web/src/components/booking/concession-selector.tsx`)
- Tải danh sách combo khả dụng qua `apiFetch<ComboDto[]>("/combos")`.
- Hiển thị card cho từng combo:
  - Tên combo, mô tả, ảnh thumbnail (hoặc icon nếu chưa có ảnh).
  - Đơn giá định dạng VND (`formatVnd`).
  - Nút điều khiển số lượng: `[-]` `[số lượng]` `[+]` (tối đa 20/combo).
- Khi người dùng bấm tăng/giảm:
  - Gọi `PUT /bookings/:id/combos` với danh sách items mới.
  - Sau khi API trả về, callback `onChanged(newSummary)` cập nhật state `summary` của trang xác nhận ngay lập tức mà không cần reload trang.

### 2. Trang Xác nhận Đơn hàng (`/dat-ve/don/[id]/xac-nhan/page.tsx`)
- Nhúng `ConcessionSelector` vào cột bên trái (ngay dưới `ShowtimeInfo` hoặc phía trên `VoucherInput`).
- Cập nhật `PriceBreakdown`:
  - Thêm dòng hiển thị tổng tiền combo: `Bắp nước & Combo: ...đ` (nếu đơn có chọn combo).
  - Tổng thanh toán phản ánh đúng `summary.pricing.total`.

### 3. Trang Kết quả `/dat-ve/don/[id]/ket-qua/page.tsx` & Xem vé `/ve/[bookingCode]/page.tsx`
- Hiển thị danh sách combo đã mua (tên combo × số lượng).
- Ghi chú: "Nhận bắp nước tại quầy bắp nước của rạp bằng mã QR hoặc mã vé này".

### 4. Màn hình Soát vé `/soat-ve`
- Khi quét QR thành công: ngoài danh sách ghế, phòng, suất chiếu, hiển thị thêm danh sách combo của đơn hàng (nếu có) để nhân viên rạp phát bắp nước cho khách hàng.

### 5. Verification
- `pnpm -C apps/web test` PASS.
- `pnpm -w typecheck` PASS.
- Kiểm tra trực quan layout responsive trên desktop và mobile.

## Residual (reviewer round 2 — STRICT PASS)

- **GAP-037 / R-100 (m6, m-F):** không có luồng nhận combo tách khỏi soát vé, không có cờ đã phát; quầy quét ở /staff/soat-ve soát luôn vé của đơn. Đã ghi `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`; xử lý bằng change-request riêng.
- m3: race giữa `VoucherInput.onChanged` (GET) và PUT combo — chỉ lệch hiển thị, tiền theo DB.
- m4: voucher bị gỡ âm thầm khi subtotal < min_order_amount.
- Ảnh seed `/images/combos/*.webp` không có asset (chưa có `apps/web/public`); UI dùng icon fallback. Cần asset thật hoặc đổi seed.
- m-A: danh sách /combos chỉ tải một lần (combo bị tắt sau khi mở trang → 404 tới khi tải lại). m-B: combo ngừng bán bị bỏ khỏi đơn không báo. m-C: nút Thanh toán không khoá khi PUT combo đang chạy (chỉ lệch hiển thị). m-D: chưa có pgTAP cho RLS `order_combos_select`. m-E: PriceBreakdown hiện từng dòng combo thay vì một dòng tổng (task file mô tả một dòng). m-G: `booking.service.ts:373` còn hardcode "tối đa 20".
- Chưa kiểm tra trực quan 375/768/1280, chưa có e2e Playwright.
