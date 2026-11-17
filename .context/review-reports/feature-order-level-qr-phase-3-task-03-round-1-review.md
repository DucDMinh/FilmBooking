# Review — feature/order-level-qr · phase-3-task-03 (web) · round 1

Agent: reviewer

- **Review level:** NORMAL. Đã cân nhắc nâng STRICT vì task hiển thị credential QR, nhưng không nâng: web chỉ đọc `orders.qr_token` của chính chủ (có `eq("user_id")` + RLS), không thêm route, API client hay cache key mới. Các component sửa là local của màn vé và màn soát vé.
- **Reason:** MODIFY UI, gồm trang vé khách (1 QR/đơn) và màn soát vé (hiện cả đơn), theo hợp đồng `ScanTicketResponse.order` của task-02.
- **Blast radius:** `components/ticket/{ticket-data.ts, ticket-card.tsx}`, `components/staff/checkin-result.tsx`, `app/staff/soat-ve/page.tsx`, cùng 3 file test. `ticket-qr.tsx` không đổi.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS (web không còn lỗi type do đổi shared) |
| `pnpm test` | PASS: web **47 file / 595/595**; shared 31, api 600, scripts 31 |
| `pnpm test:int` | 92/92 PASS (api) |
| Xem trên trình duyệt thật | **Chưa làm.** Cần đăng nhập khách + staff kèm một đơn đã thanh toán; tạo hay sửa dữ liệu demo nằm ngoài quyền reviewer. Đây là residual risk: primary cần xem tay ở 375/768/1280 |
| aislop / ocr | skip, chưa cài |

## Đối chiếu chéo

- **Quyền đọc cột:** `ticket-data.ts:48-49` select thêm `qr_token` trên `orders` bằng client của người dùng. DB cấp `grant select on public.orders ... to authenticated` ở mức bảng (`20261111030100_booking_tables.sql:602`), không có GRANT theo cột, và RLS `orders_select` cho chủ đơn đọc. Vì vậy không có rủi ro 42501 khiến `fetchMyOrders` âm thầm trả `[]`. Integration test phase-1 và task-02 đã đọc được cột này.
- **AC-17:** `fetchMyOrders`, `fetchMyOrder`, `fetchMyOrderShowtimeId` vẫn `.eq("user_id", userId)` (`ticket-data.ts:97, :111, :128`).
- **Không còn token từng vé:** select `tickets(order_seat_id, checked_in_at)`; `TicketView` đã bỏ `qrToken`, test kiểm `!("qrToken" in t)`. Grep `apps/web/src` không còn `ticket.qrToken`, `response.ticket` hay `ticketId`. `components/admin/order-detail.tsx:215` chỉ đọc `seatLabel` của DTO admin.

## Kiểm theo trọng tâm

1. **Trang vé khách** (`ticket-card.tsx:69-102`):
   - Chỉ có MỘT `TicketQr token={order.qrToken} label="Mã QR đơn hàng"`, kèm câu "Một mã QR cho cả đơn — …".
   - Danh sách ghế hiện kèm "(N ghế)" và xếp tự nhiên (`ticket-data.ts:63`).
   - Đơn `affected` không hiện QR, chỉ hiện `AffectedNotice`. Đơn `checked_in` hiện "Đã soát vé".
   - Dòng "Vé không hỗ trợ huỷ / đổi / hoàn tiền." giữ nguyên. Wake Lock, toàn màn hình nền trắng, QR 304px, Escape đóng: giữ nguyên trong `ticket-qr.tsx`.
   - a11y: QR có `role="img"` + `aria-label`; dialog có `aria-modal` + `aria-label`; focus trả về nút mở.
2. **Màn soát vé** (`checkin-result.tsx:55-100`):
   - OK hiện "Đã soát N ghế của đơn", phim, rạp/phòng, suất, **mã đặt vé**, toàn bộ ghế, "N ghế", giờ check-in.
   - USED chỉ hiện thời điểm và người soát lần đầu.
   - WRONG_CINEMA chỉ đọc `correctCinema`, không chạm vào `order`. Test cố ý bơm `order` dư mà vẫn không lộ `C7`, `C8`, `2 ghế`, `HN01-SECRET` hay `Phòng 03`.
   - Lịch sử (`soat-ve/page.tsx:24-27`) hiện mã đặt vé, hoặc "Mã QR"; không bao giờ hiện token. Test `staff-pages.test.tsx:136-137` giữ nguyên.
3. **Hợp đồng shared:** khớp `ScanTicketResponse.order` (seats/seatCount/orderId); typecheck xanh.
4. **Test đỏ trước/xanh sau** (đánh giá bằng đọc code): `TicketDetail` mong đúng 1 QR `"o"x32` (code cũ render N QR từ token vé → đỏ); `checkin-result` mong `"C7, C8, C10"`/`"3 ghế"` (code cũ đọc `ticket.seatLabel` → đỏ); `toPaidOrderView` mong `qrToken` cấp đơn. Không có test tautology. Nội dung tiếng Việt đúng.

## Findings

1. **LOW — `TicketView.checkedIn` không còn được dùng ở UI.** `ticket-data.ts:6, :61` vẫn tính `checkedIn`, nhưng không component nào đọc nữa. Trạng thái "Đã soát vé" giờ chỉ dựa vào `order.status === "checked_in"` (`ticket-card.tsx:95`). Hệ quả: đơn cũ đã soát dở từng ghế bằng QR theo ghế (trước CR) mà status vẫn `paid` sẽ không có dấu hiệu nào trên trang vé. Hiếm gặp và chấp nhận được. Nên bỏ trường thừa, hoặc dùng nó (ví dụ "đã soát k/N ghế").
2. **INFO — Badge trạng thái lặp ý.** Đơn `checked_in` vừa có badge "Đã check-in" (`ticket-card.tsx:9`) vừa có dòng "Đã soát vé" (`:96`), hai cụm từ khác nhau cho cùng một trạng thái. Đây là vấn đề copy, không ảnh hưởng chức năng.
3. **INFO — Token nằm trong `data-qr-value` của DOM (có từ trước).** `ticket-qr.tsx:84` render nguyên token vào thuộc tính `data-qr-value` ở markup production, chỉ để test dùng. Token vốn đã có trong QR trên trang của chính chủ, nên không phải lỗ hổng mới. Không thuộc diff này.
4. **INFO — Màn soát hiện nguyên chuỗi vừa quét khi kết quả NOT_FOUND/NOT_PAID (có từ trước).** `checkin-result.tsx:137` + `soat-ve/page.tsx:148` hiện "Mã: <chuỗi quét>". Nếu quét QR hợp lệ của một đơn chưa thanh toán, token đơn sẽ hiện trên màn staff, nhưng staff vốn đang cầm QR đó. Không thuộc diff này.

Không có finding CRITICAL, HIGH hay MEDIUM.

## Verdict: **NORMAL PASS**

Residual risk: chưa xem trên trình duyệt thật (responsive 375/768/1280, máy quét đọc được QR trên màn hình). Primary cần verify tay với đơn seed nhiều ghế, theo mục Repro Verification của task.
