# BACKLOG — Yêu cầu & bug hậu-build (auto-intake)

> Khi build xong hết layer lần đầu (`mode: maintenance`), **mọi yêu cầu/bug user gửi qua chat
> được agent TỰ ĐỘNG ghi vào đây + tạo change doc** — user KHÔNG cần tạo file tay.
> User chỉ cần gõ `/change` (hoặc `/change <slug>`) → agent xử lý → cập nhật tracking.

## Bảng tracking

| ID | Tiêu đề | Loại | Trạng thái | Change file | Tạo | Xong |
|----|---------|------|-----------|-------------|-----|------|
| CR-001 | Bỏ toàn bộ POS khỏi dự án, chỉ làm web | REMOVE | done | [2026-11-12-remove-pos.md](archive/2026-11-12-remove-pos.md) | 2026-11-12 | 2026-11-12 |
| CR-002 | (backlog) FK tickets.seat_id -> seats — chỉ thêm sau khi sell_order_seats khoá seats FOR KEY SHARE (tránh deadlock confirm_paid × hold_seats, F11 task-03) | BUG | pending | [2026-11-12-tickets-seat-fk.md](2026-11-12-tickets-seat-fk.md) | 2026-11-12 | |
| CR-003 | Bỏ đổi suất khi rạp huỷ suất — khách liên hệ CSKH, chỉ hoàn tiền thủ công | MODIFY | done | [2026-11-12-remove-showtime-exchange.md](archive/2026-11-12-remove-showtime-exchange.md) | 2026-11-12 | 2026-11-12 |
| CR-004 | API chặn Admin tự khoá/tự gỡ + giữ Admin cuối cùng (GAP-010) | BUG | pending | [2026-11-14-admin-self-lock-last-admin-guard.md](2026-11-14-admin-self-lock-last-admin-guard.md) | 2026-11-14 | |
| CR-005 | Hoàn tiền thủ công thiếu phương thức + ngày hoàn bắt buộc R-110 (GAP-009) | BUG | pending | [2026-11-14-refund-method-required.md](2026-11-14-refund-method-required.md) | 2026-11-14 | |
| CR-006 | Tùy biến mail đi: giao diện CINEMO + tiếng Việt (mail Auth + mail giao dịch Nest) | MODIFY | done | [2026-11-17-custom-mail-templates.md](archive/2026-11-17-custom-mail-templates.md) | 2026-11-17 | 2026-11-17 |
| CR-007 | Bấm link xác nhận email → đăng nhập luôn (token_hash + verifyOtp), sửa R-04 | MODIFY | done | [2026-11-17-confirm-email-auto-login.md](archive/2026-11-17-confirm-email-auto-login.md) | 2026-11-17 | 2026-11-17 |
| CR-008 | Một QR cho cả đơn hàng, staff quét 1 mã soát cả đơn (bỏ QR từng ghế) | MODIFY | done | [2026-11-17-order-level-qr.md](archive/2026-11-17-order-level-qr.md) | 2026-11-17 | 2026-11-18 |
| CR-009 | Rạp đóng cửa: trang rạp báo "đã đóng cửa" thay 404; mọi đổi trạng thái rạp hiệu lực sau 7 ngày + email toàn bộ khách | MODIFY | done | [2026-11-18-cinema-status-notice.md](archive/2026-11-18-cinema-status-notice.md) | 2026-11-18 | 2026-11-18 |
| CR-010 | Re-skin UI theo CYBERPLEX (vàng/crimson, chamfer, HUD) + chuyển động đặt vé trái→phải / nội dung trên→dưới & hai bên; thêm QuickBookBar | MODIFY | done | [2026-11-19-cyberplex-reskin.md](archive/2026-11-19-cyberplex-reskin.md) | 2026-11-19 | 2026-11-19 |
| CR-011 | Mốc đóng bán online riêng của rạp (R-56) chưa có trong dữ liệu rạp công khai: lịch chiếu R-44 và thanh Đặt vé nhanh R-138 dùng mặc định 15 phút | BUG | done | [2026-11-19-public-cinema-online-cutoff.md](archive/2026-11-19-public-cinema-online-cutoff.md) | 2026-11-19 | 2026-11-20 |
| CR-012 | Ô chọn (`<select>`) và danh sách xổ xuống đang như mặc định Windows, không đồng bộ giao diện CYBERPLEX | BUG | done | [2026-11-20-select-dropdown-theme.md](archive/2026-11-20-select-dropdown-theme.md) | 2026-11-20 | 2026-11-20 |

## Quy tắc tracking

- **Trạng thái:** `pending` (chưa xử lý) · `in_progress` (đang xử lý) · `done` (xong, change file đã archive) · `blocked` (kẹt, cần user).
- **Agent intake (tự động, khi user chat yêu cầu/bug trong maintenance mode):**
  1. Tạo change doc `spec/changes/YYYY-MM-DD-<slug>.md` (copy `_TEMPLATE.md`, điền yêu cầu + acceptance từ lời user — thiếu thông tin thì hỏi ngắn 1 lần, KHÔNG bịa).
  2. Thêm 1 dòng vào bảng trên với trạng thái `pending`.
  3. Báo user: "✅ Đã ghi vào backlog: <tiêu đề> — gõ `/change` (hoặc `/change <slug>`) để xử lý." **KHÔNG code ngay.**
- **Agent xử lý change (`/change`):** khi change được xử lý xong (status `done` + chuyển `archive/`) → cập nhật hàng tương ứng: `in_progress` (khi bắt đầu) → `done` + ngày xong. `blocked` khi cần user quyết định.
- **Duy nhất 1 nguồn:** mỗi dòng = 1 change doc ở `spec/changes/`. Không xoá dòng đã `done` (giữ lịch sử), chỉ cập nhật trạng thái.
- **`/change --list`:** liệt kê các dòng chưa `done` từ bảng này (kèm slug để chạy `/change <slug>`).
