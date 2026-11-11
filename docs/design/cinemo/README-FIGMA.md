# CINEMO — Figma-ready UI kit

Bộ giao diện được dựng từ BRD hệ thống đặt vé chuỗi rạp CINEMO. Đây là bộ **SVG vector có thể import vào Figma**, không phải file `.fig` native. Mỗi SVG là một màn hình/artboard độc lập; text, shape và thành phần cơ bản có thể chỉnh sửa sau khi import.

## Import vào Figma
1. Giải nén ZIP.
2. Mở Figma Design và tạo file mới.
3. Kéo thả các file trong `screens/` vào canvas (hoặc dùng File → Place image).
4. Mỗi SVG được nhập thành một nhóm vector; dùng Ungroup để chỉnh từng lớp.
5. Dùng `tokens/design-tokens.json` làm nguồn màu, typography, spacing và trạng thái component.

## Danh sách màn hình
### Khách hàng
- 01 Trang chủ; 02 Chi tiết phim; 03 Danh sách rạp; 04 Chi tiết rạp; 05 Chọn suất; 06 Chọn ghế; 07 Combo; 08 Xác nhận đơn; 09 Thanh toán VietQR; 10 Vé thành công; 11 Vé của tôi; 12 Đăng nhập; 13 Đăng ký; 14 Xác nhận email; 15 Hồ sơ; 16 Bảo mật & liên kết; 33 Quên mật khẩu.
### Nhân viên & vận hành
- 17 Soát vé QR; 18 Dashboard Admin; 19 Quản lý rạp; 20 Quản lý phim; 21 Lịch chiếu; 22 Phòng & sơ đồ ghế; 23 Đơn hàng; 24 Đơn bị ảnh hưởng; 25 Giá / voucher; 26 Người dùng & phân quyền; 27 Báo cáo; 28 Cấu hình & audit log; 29 POS giả lập.
- 34 Chi tiết đơn bị ảnh hưởng; 35 Bảng giá; 36 Form rạp; 37 Form phim; 38 Form suất chiếu; 39 API keys POS; 40 Dashboard Cinema Manager.
### Mobile
- 30 Trang chủ; 31 Chọn ghế; 32 Vé điện tử.

## Quyết định thiết kế bám BRD
- Tông dark-cinema, màu nhấn coral; desktop 1440px, mobile 390px.
- Rạp và địa chỉ được làm nổi bật ở bước xác nhận, thanh toán và trên vé.
- Sơ đồ ghế có trạng thái: trống, đang chọn, đang giữ, đã bán, VIP; cấu trúc sẵn cho ghế khóa và Sweetbox.
- Timer giữ ghế 10 phút; cảnh báo không huỷ/không hoàn; VietQR; QR ticket.
- Admin có chọn phạm vi rạp; Staff/Manager có màn hình nghiệp vụ theo rạp; màn check-in và POS riêng.
- Nội dung minh hoạ, phim, email và doanh thu đều là dữ liệu demo.

## Ghi chú
- SVG nhập vào Figma là vector group; bộ này chưa được publish thành file `.fig` hoặc Figma project trên cloud.
- Đây là UI handoff mức high-fidelity cho các màn hình trọng yếu; một số trạng thái phụ như lỗi API, loading, empty state, modal xác nhận hủy suất và responsive tablet cần được hoàn thiện trong vòng review tiếp theo.
