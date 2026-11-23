# Spec Update — 2026-11-23 concession-combo
**spec_version:** 3.6.1 → 3.7.0 (MINOR bump — kích hoạt tính năng mới từ GĐ2 sang MVP)
**Trigger:** feature-update · CR-018 · change doc `spec/changes/2026-11-23-concession-combo.md` · workItem `feature/concession-combo`

## Requirements
- **KÍCH HOẠT SANG MVP:**
  - **R-58** (Combo bắp nước): MVP là **danh mục combo chung toàn chuỗi rạp** (một danh mục, một giá; bảng `combos` không có `cinema_id`), hiển thị và bán kèm trong luồng đặt vé trực tuyến. KHÔNG nằm trong MVP: bật/tắt + giá riêng theo rạp (BRD/roadmap GĐ2 mô tả theo rạp, chờ PO — **GAP-038**) và giao diện/endpoint Admin quản lý combo (combo qua seed migration — **GAP-039**).
  - **R-69** (Bước chọn combo): Khách hàng chọn số lượng combo bắp nước ngay tại màn hình **Xác nhận đơn hàng** (`/dat-ve/don/[id]/xac-nhan`); hiển thị ảnh, tên, mô tả, đơn giá; tự động cập nhật tổng tiền đơn hàng. MVP: combo của đơn được hiển thị khi quét QR của vé ở `/staff/soat-ve`; luồng nhận combo tại quầy đúng rạp và đánh dấu đã phát/nhận combo tách khỏi soát vé chưa có (**GAP-037**).
  - **R-100** (Hiển thị combo khi soát vé): Màn hình soát vé (`/staff/soat-ve`) và chi tiết vé hiển thị danh sách combo đã mua của đơn hàng để nhân viên rạp kiểm tra phát bắp nước. MVP chỉ hiển thị; đánh dấu đã phát/nhận combo (cờ riêng, tách khỏi soát vé) chưa có → **GAP-037**.
- **LIÊN QUAN:**
  - **R-70** (Màn tóm tắt đơn): Hiển thị chi tiết danh sách combo đã chọn và số tiền combo trong bảng giá tóm tắt.
  - **R-72** (Tính tiền minh bạch): `tổng tiền = tiền ghế + tiền combo - voucher`. Chưa quy định (**GAP-040**): voucher `applies_to` (ORDER/COMBO/SEAT) chưa được áp theo loại (hiện giảm trên toàn subtotal); hoàn/huỷ đơn có combo; mốc giá chốt combo (snapshot lúc cập nhật combo, không phải lúc giữ ghế); tồn kho combo.
  - **R-86, R-133** (Email vé & chi tiết vé): Bổ sung danh sách combo đã mua vào nội dung vé điện tử.

## Chi tiết thay đổi
1. **Database Schema:**
   - Tạo bảng `public.combos`: `id`, `name`, `description`, `price_amount`, `image_url`, `is_active`, `display_order`, `created_at`, `updated_at`.
   - Tạo bảng `public.order_combos`: `id`, `order_id` (FK `orders(id)` cascade), `combo_id` (FK `combos(id)` restrict), `quantity` (int > 0), `unit_price` (int >= 0), `total_price` (int >= 0), `created_at`.
   - Trigger / hàm tính lại tiền đơn hàng: `subtotal_amount = sum(order_seats) + sum(order_combos)`.
   - Seed dữ liệu demo: 4 combo phổ biến (Combo Solo, Combo Couple, Bắp phô mai, Nước ngọt).
2. **API Backend:**
   - `GET /combos`: Danh sách combo đang hoạt động, sắp xếp theo `display_order`.
   - `PUT /bookings/:id/combos`: Cập nhật danh sách combo cho đơn hàng đang giữ chỗ (`holding`), tính lại `subtotal_amount` và `total_amount`.
   - Cập nhật `BookingSummaryResponse` trả về trường `combos: Array<{ id, name, quantity, unitPrice, totalPrice }>`.
   - Cập nhật payload `mail.ticket` và DTO soát vé để trả về danh sách combo.
3. **Web Client:**
   - Màn hình `/dat-ve/don/[id]/xac-nhan`: Section chọn combo với hình ảnh, mô tả, đơn giá, bộ nút [- 0 +] tăng giảm số lượng.
   - Component `PriceBreakdown`: Liệt kê từng combo (`tên × số lượng` + thành tiền) khi đơn có combo; nhãn "Bắp nước & Combo" là tiêu đề section chọn combo.
   - Trang kết quả `/dat-ve/don/[id]/ket-qua` & trang xem vé `/ve/[bookingCode]`: Hiển thị danh sách combo đã mua.
   - Màn hình soát vé `/soat-ve`: Hiển thị danh sách combo để nhân viên phục vụ khách tại quầy.

## Hiệu chỉnh sau spec-validator final round 1 (cùng CR-018, chưa commit — KHÔNG bump)
Báo cáo `.context/review-reports/feature-concession-combo-phase-final-spec-validation-round-1-review.md` FAIL vì wording spec hứa quá hiện thực. Đã chỉnh trong `SPECIFICATIONS.md` (giữ `spec_version` 3.7.0): thân R-58 thu về danh mục chung toàn chuỗi (+ GAP-038, GAP-039); R-69 và R-100 ghi rõ MVP chỉ hiển thị combo khi soát vé (+ GAP-037; tiêu đề R-100 đổi thành "Hiển thị combo khi soát vé"); R-72 trỏ GAP-040; dòng 23 và mục Combo ở phần thực thể dữ liệu thống nhất "theo rạp = GĐ2". Không sửa intent docs (BRD/PRD) — lệch BRD ghi ở GAP-038.
Ghi chú tên: PriceBreakdown liệt kê từng combo `name × quantity` kèm số tiền; nhãn "Bắp nước & Combo" nằm ở tiêu đề section chọn combo (không phải dòng riêng trong PriceBreakdown).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 37, specVersion 3.7.0 (trigger feature-update). Entry combo (specRefs R-58, R-69, R-70, R-72, R-86, R-100, R-133, R-90; impact/acceptance/regression, notes `[scope v37 / feature-concession-combo, CR-018]`) đã bổ sung vào cùng scope 37 sau validator round 1 (không tăng scopeVersion vì chưa bàn giao cho bên test).
