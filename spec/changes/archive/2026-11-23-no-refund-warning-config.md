---
id: no-refund-warning-config
type: bug
status: done
created: 2026-11-23
---

# Nội dung cảnh báo không hoàn tiền do Admin cấu hình không hiển thị ở trang thanh toán

## Yêu cầu
Admin sửa "Nội dung cảnh báo không hoàn tiền" ở `/admin/cau-hinh` (khoá `app_settings.no_refund_warning`, R-106) nhưng nội dung đó không hiển thị ở đâu cả. Màn xác nhận đơn / thanh toán dùng câu cố định trong code. Cần hiển thị đúng nội dung Admin cấu hình trong khối cảnh báo ở trang thanh toán.

## Bối cảnh / tái hiện (bug)
- Màn/route/role: `/dat-ve/don/[id]/xac-nhan` (khách đã đăng nhập, đơn đang giữ chỗ); cấu hình ở `/admin/cau-hinh` (Admin).
- Bước tái hiện: Admin đổi "Nội dung cảnh báo không hoàn tiền" → lưu → khách mở màn xác nhận đơn.
- Expected (R-106, R-71, R-131): khối cảnh báo hiển thị nội dung Admin cấu hình, kèm tên rạp + giờ chiếu.
- Actual: khối `NoRefundWarning` (`apps/web/src/components/booking/no-refund-warning.tsx`) hiển thị câu cố định; API không trả `no_refund_warning` cho web nên giá trị cấu hình không bao giờ được đọc.

## Acceptance (bắt buộc)
- [ ] Khối cảnh báo ở `/dat-ve/don/[id]/xac-nhan` hiển thị nội dung `no_refund_warning` Admin đã lưu (thay câu chính sách cố định); vẫn nêu tên rạp + giờ chiếu (R-71).
- [ ] Admin đổi nội dung → khách thấy nội dung mới ở lần mở trang kế tiếp (không cần build lại).
- [ ] Không có/lỗi khi đọc cấu hình → dùng nội dung mặc định (cùng nội dung seed), không chặn thanh toán.
- [ ] Nội dung hiển thị an toàn (văn bản thuần, xuống dòng được giữ, không render HTML); giới hạn 1000 ký tự theo schema Admin.
- [ ] Hộp thoại xác nhận trước khi thanh toán và checkbox gating giữ nguyên hành vi (R-71, R-133).
- [ ] Test: API trả nội dung cấu hình, web hiển thị nội dung cấu hình và fallback mặc định.

## Ghi chú
Tham chiếu: R-71, R-106, R-131, R-133. Sửa cho khớp spec hiện hành nên không bump spec_version; cần cập nhật test-scope nếu spec-publisher yêu cầu.
