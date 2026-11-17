# Spec Update — 2026-11-18 order-level-qr
**spec_version:** 3.2.0 → 3.3.0 (MINOR — đổi ngữ nghĩa requirement: một QR cho cả đơn thay cho QR từng ghế; check-in theo đơn)
**Trigger:** feature-update (MODIFY) · `spec/changes/2026-11-17-order-level-qr.md` (CR-008) · `tasks/feature-order-level-qr/phase-1-task-01.md` (review STRICT PASS round 2), `phase-2-task-02.md` (STRICT PASS round 2), `phase-3-task-03.md` (NORMAL PASS round 1)

## Requirements
Yêu cầu của user (2026-11-17): "gửi 8 mã qr này quá phiền phức, bây giờ không tạo mã qr từng ghế nữa, chỉ tạo qr đơn hàng thôi, mọi thông tin đơn hàng sẽ chứa trong đó, staff cũng chỉ cần quét 1 mã". Không THÊM / XOÁ mã requirement; SỬA 4 requirement và 1 acceptance (cũ → mới):

- **SỬA R-85 (Mã đặt vé & QR)**
  - Cũ: mỗi đơn đã thanh toán có mã đặt vé và "mã QR chứa token ngẫu nhiên" (hiện thực cũ lệch ý: mỗi ghế = 1 vé = 1 QR).
  - Mới: mỗi đơn có mã đặt vé và **một mã QR duy nhất cho cả đơn** (mọi ghế dùng chung; không có QR từng ghế). QR chỉ chứa **token ngẫu nhiên của đơn**, không chứa thông tin cá nhân, không nhúng nội dung đơn; phim, suất, phòng, toàn bộ ghế, combo hiện khi quét.
- **SỬA R-87 (Trang "Vé của tôi")**
  - Cũ: "xem lại QR".
  - Mới: "xem lại **QR của đơn**" (tăng độ sáng màn hình khi mở QR giữ nguyên).
- **SỬA R-98 (Kết quả soát vé)**
  - Cũ: ✅ Hợp lệ hiện phim, suất, phòng, ghế, combo, nhãn tuổi.
  - Mới: ✅ Hợp lệ hiện phim, suất, phòng, **toàn bộ ghế của đơn**, combo, nhãn tuổi. Các nhánh ❌ giữ nguyên.
- **SỬA R-99 (Quy tắc check-in)**
  - Cũ: mỗi **vé** check-in một lần.
  - Mới: mỗi **đơn** check-in một lần; một lần quét QR hoặc nhập mã đặt vé soát **tất cả ghế** của đơn; vẫn chỉ tại rạp của suất, cửa sổ 30 phút trước giờ chiếu đến hết giờ phim; đơn `affected` không check-in được.
- **SỬA AC-12**
  - Cũ: "vé đã check-in, quét lại → báo đỏ Đã sử dụng".
  - Mới: "**đơn** đã check-in, quét lại QR → báo đỏ Đã sử dụng kèm thời điểm + người soát lần đầu".
- Giữ nguyên: R-86 (nội dung email vé), R-97, R-100, R-101, R-102, R-133, AC-13. Gap còn lại: R-86 "link bản đồ" trong email vé chưa có (ngoài phạm vi, cần Change Request riêng).
- `SPECIFICATIONS.md` chỉ đổi frontmatter (`spec_version` 3.3.0, `updated_at`, `source`) và nhãn "Tổng (spec 3.3.0)"; nội dung R-85/R-87/R-98/R-99/AC-12 đã sửa trong bước spec delta của Change Request.

## Lý do
Một đơn N ghế phát N QR (email 8 ảnh, trang vé 8 QR, staff quét 8 lần) quá phiền cho khách và nhân viên; các rạp phim thực tế dùng một mã cho cả đơn. Spec R-85 vốn đã viết "mỗi đơn có mã QR" nên hiện thực cũ (QR từng ghế) lệch ý; nay chốt ngữ nghĩa theo đơn và đổi hiện thực.

## Thay đổi hiện thực (as-built)
- **DB** (`supabase/migrations/20261117120000_order_level_qr.sql`, `20261117130000_order_level_qr_fixes.sql`):
  - Cột `orders.qr_token text not null unique` (32 hex, mặc định ngẫu nhiên 128-bit, có CHECK định dạng), backfill mọi đơn cũ, **bất biến** sau khi tạo (guard `orders_guard_transition`).
  - `checkin_ticket(p_input, p_cinema_id, p_staff_id)` giữ chữ ký: tra theo `orders.qr_token` | `orders.booking_code` | (tương thích) `tickets.qr_token` cũ, soát **tất cả ghế chưa soát của đơn trong một giao dịch**, không ghi đè `checked_in_at` cũ; thứ tự khoá showtimes → orders → tickets (không deadlock với `cancel_showtimes`/`confirm_paid_order`).
  - `audit_row_change` bỏ `qr_token` khỏi bản chép audit (credential không vào `audit_logs`). Bảng `tickets` (từng ghế) giữ nguyên làm dữ liệu/lịch sử.
  - Kết quả RPC thành công: `order_id, booking_code, movie_title, cinema_name, room_name, seats[], seat_count, starts_at, checked_in_at`; bỏ `ticket_id/seat_label/seat_type`; các nhánh WRONG_CINEMA/CANCELLED/USED/EXPIRED/TOO_EARLY/INVALID giữ key.
  - Migration rewrite bảng `orders` (ADD COLUMN default volatile + UNIQUE/CHECK trên dữ liệu cũ) → gắn **HIGH_RISK_MIGRATION**; có rollback ghi trong migration.
- **API**:
  - `POST /checkin/scan` trả `order{orderId, bookingCode, movieTitle, cinemaName, roomName, seats[], seatCount, startsAt, checkedInAt}` (thay `ticket`); WRONG_CINEMA không có ghế/tên khách.
  - DTO đơn của admin bỏ `qrToken`, thêm `checkedIn`; `qr_token` không lộ qua DTO admin/audit.
  - Schema shared `ScanTicketResponse`, `OrderTicketDto`.
- **Email vé** (`templates.ts`, `mail.service.ts`, `jobs.controller.ts`):
  - Đúng **1 ảnh QR** (CID inline `ticket-qr`, `ve-qr.png`) mã hoá `orders.qr_token`; liệt kê đủ ghế (xếp tự nhiên A2 < A10); chữ token dự phòng.
  - Câu hướng dẫn "Một mã QR cho cả đơn — không cần mã từng ghế"; lỗi tạo ảnh không chặn gửi.
  - Job `/jobs/send-emails` enrich từ `orders.qr_token` (bỏ `payload.tickets`, bỏ trần 10 ảnh); outbox cũ có `payload.tickets` bị bỏ qua đúng.
  - Thay thế hiện thực "mỗi ghế một ảnh QR" của bug-fix `ticket-email-qr` (scope v24).
- **Web**:
  - Trang "Vé của tôi/chi tiết" hiện **1 QR cho cả đơn** kèm danh sách ghế và mã đặt vé (đơn `affected` không QR; đơn `checked_in` hiện "Đã soát vé").
  - Màn `/staff/soat-ve` dùng `response.order`: hiện toàn bộ ghế + "Đã soát N ghế"; lịch sử soát không hiện token.
- **Docs as-built**: `docs/API_SPEC.md` (response `POST /checkin/scan`), `docs/ERD.md` (`orders.qr_token`, `tickets.qr_token` chỉ để tương thích); quyết định ghi ở `.context/decisions.md`.

## Ảnh hưởng
- Module: `supabase-checkin` (migration, RPC), `api-checkin`, `api-orders`, `api-mail`, `api-jobs`, `shared-schemas`, `web-ticket`, `web-staff-soat-ve`. Test: pgTAP 044 (cập nhật), 063/064/065 (mới), `checkin.e2e-spec`, `rls-scope.int-spec`, `orders-report.e2e-spec`, `mail-templates.spec`, `mail-ticket-qr.spec`, `outbox-job.e2e-spec`, web `ticket.test`, `checkin-result.test`, `staff-pages.test`.
- Test luồng: email đơn 1 ghế và nhiều ghế (1 QR, giải mã == `orders.qr_token`), trang vé 1 QR/đơn, staff quét 1 lần soát cả đơn (QR đơn, nhập mã đặt vé, QR cũ theo ghế), quét lại USED, sai rạp không lộ ghế (AC-13), race 2 lần quét đồng thời, checkin ‖ cancel_showtimes không deadlock, DTO admin/audit không lộ `qr_token`.
- Regression: R-132/R-133, "Vé của tôi" (AC-17 lọc theo chủ đơn), job `/jobs/send-emails`, `confirm_paid_order`/`cancel_showtimes` (thứ tự khoá), `audit_logs`, các kind mail khác và mail Auth (không đổi).
- Doc impact: có (`docs/API_SPEC.md`, `docs/ERD.md` đã reconcile). Intent doc `docs/BRD.md`: không đổi (BR-TKT-01, BR-CHK-03 không mâu thuẫn).

## Residual
- Chưa kiểm giao diện web thật (375/768/1280) và quét QR thật bằng camera/điện thoại; reviewer task-03 cũng chưa xem trình duyệt thật (user tự kiểm).
- QR đóng gói chỉ là token của đơn, không nhúng nội dung đơn (chủ ý, tránh giả mạo chuỗi); thông tin đơn hiện khi quét.
- Audit cũ của `tickets` (trước migration `...130000`) còn chứa token vé cũ; token này vẫn quét được (QR cũ theo ghế soát cả đơn). Audit là append-only, chỉ admin/manager đọc được.
- **HIGH_RISK_MIGRATION**: không promote production khi chưa verify staging (migration rewrite bảng `orders`, UNIQUE/CHECK trên dữ liệu cũ); có rollback trong migration.
- Đơn cũ đã soát dở từng ghế (dữ liệu trước CR) mà status còn `paid`: trang vé không có dấu hiệu "đã soát một phần" (`TicketView.checkedIn` không còn dùng ở UI); soát nốt phần còn lại không ghi đè `checked_in_at` cũ (đã có test).
- Gap R-86: "link bản đồ" chưa có trong email vé (ngoài phạm vi).
- API đang chạy phải `pnpm --filter @filmbooking/api build` + restart mới có hiệu lực.
- `pnpm db:test` nguyên bản trên DB local có data demo FAIL từ trước (fixture đụng dữ liệu demo: `provinces_name_key`, `price_rules_chain_key`, 032#18); cần DB sạch. 044/063 builder chạy độc lập trong transaction + rollback (45/45, 64/64); 064/065 reviewer chạy lại PASS.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 25, specVersion 3.3.0, trigger `feature-update`, risk **high** (đổi RPC check-in là credential/quyền, migration backfill + UNIQUE trên bảng `orders`, đổi hợp đồng API soát vé và payload email; chưa kiểm client thật). Các mục scope v24 về "mỗi ghế một QR" được đánh dấu bị thay thế bởi v25.
