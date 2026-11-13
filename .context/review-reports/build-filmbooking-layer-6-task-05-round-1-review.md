# Review — build-filmbooking layer-6 task-05 — round 1

Agent: reviewer
Worktree: E:/FilmBooking/.worktrees/layer-6__task-05 (wt/layer-6__task-05, chưa commit)

## Review level
STRICT

## Reason
Màn vé/QR (token check-in), đọc dữ liệu đơn qua RLS (AC-17 / NFR-05), sửa `proxy.ts` (route guard dùng chung), luồng thanh toán (polling payment-status).

## Blast radius
- Mới: `app/(public)/dat-ve/don/[id]/ket-qua/page.tsx`, `app/(public)/ve/page.tsx`, `app/(public)/ve/[bookingCode]/page.tsx`, `components/ticket/{ticket-card,ticket-qr,ticket-data,payment-result}.tsx|ts`, `components/ticket/__tests__/ticket.test.tsx`.
- Sửa: `apps/web/src/proxy.ts` (thêm `/dat-ve/don` vào các prefix cần bảo vệ, áp cho cả `xac-nhan` của task-04).
- Ngoài danh sách Files của task: `ticket-data.ts`, `payment-result.tsx`, `proxy.ts` (builder đã báo). `thanh-toan/page.tsx` không làm (dispatcher đã quyết định, không tính là lỗi).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS 18 file / 258 test ngay lần 1 (không có timeout, nên 7 timeout builder gặp ở account/staff-pages là do máy đang tải) |
| `cd apps/web && pnpm build` | PASS (`/dat-ve/don/[id]/ket-qua`, `/ve`, `/ve/[bookingCode]` đều dynamic) |
| aislop / oxlint / ocr | skip: không có trong allowlist verify của project-config |

## Đối chiếu chéo với schema (supabase/migrations)
- `orders` có đủ các cột `id, booking_code, movie_title, cinema_name, room_name, showtime_starts_at, showtime_ends_at, status, cinema_id, user_id` (20261111030100_booking_tables.sql:65-94). Các embed `cinemas(address)` (FK orders.cinema_id), `order_seats(id, seat_label)` (FK order_seats.order_id), `tickets(order_seat_id, qr_token, checked_in_at)` (FK tickets.order_id) mỗi cái chỉ có một đường FK, nên PostgREST không bị nhập nhằng. Query chạy được.
- GRANT: `select` trên orders/order_seats/tickets cấp cho authenticated (:602). `cinemas` có `grant select` cho anon/authenticated + `cinemas_select using (true)` (core_identity_chain.sql:407-409). Không có GRANT theo cột nào gây lỗi 42501.
- Enum: chỉ hiện các đơn `paid` / `checked_in`. Khớp cách API map sang `PAID` (payment.service.ts:298-301). Ở polling, `EXPIRED`/`CANCELLED`/`NEEDS_MANUAL_REVIEW` khớp `BOOKING_PAYMENT_STATUSES` trong shared.
- QR chỉ mã hoá `qr_token` (hex 32 ký tự, không PII, :161). Đạt.

## Findings

### CRITICAL
Không có.

### MAJOR

**M1. Truy vấn "Vé của tôi" / chi tiết vé dựa vào RLS nhưng RLS KHÔNG giới hạn ở chủ đơn. Staff/Manager/Admin sẽ thấy vé và QR của khách khác (vi phạm AC-17 ở lớp UI).**
- `apps/web/src/components/ticket/ticket-data.ts:75-83` (`fetchMyPaidOrders`) và `:87-97` (`fetchPaidOrder`) không lọc `user_id`. Comment ở :74, `ve/[bookingCode]/page.tsx:17` và trong page ket-qua ghi "RLS chỉ trả đơn của chính khách", điều này sai.
- Policy thật `orders_select` (20261111030100_booking_tables.sql:603-608) là `user_id = auth.uid() OR is_admin() OR has_cinema_role(cinema_id, STAFF|MANAGER)`. `can_view_order` (:549-565) cũng vậy, áp cho tickets/order_seats.
- Hệ quả:
  - Admin vào `/ve` thì thấy mọi đơn paid của cả chuỗi (query không có giới hạn số dòng). Staff/Manager thấy mọi đơn paid của rạp mình.
  - `/ve/<mã của khách B>` render đủ QR token của B, trong khi task AC và design màn 32 yêu cầu "không phải vé của mình → 404".
  - `/dat-ve/don/<id của B>/ket-qua` cũng render vé của B.
  - Proxy chỉ kiểm tra đã đăng nhập, không kiểm role, nên những role này vào được các trang trên.
- Sửa: lấy `user.id` từ `auth.getUser()` và thêm `.eq("user_id", user.id)` vào cả hai hàm (ket-qua cũng cần user id). Thêm test khẳng định query có filter `user_id`.

**M2. Chi tiết vé thiếu nhắc chính sách không huỷ/không đổi/không hoàn (R-87 yêu cầu rõ, R-133(5), design 10/32).**
- `apps/web/src/components/ticket/ticket-card.tsx:47-49` chỉ có "Vé chỉ có giá trị khi quét tại rạp. Vui lòng không chia sẻ mã QR…".
- R-87: "trang chi tiết vé nhắc lại chính sách không huỷ/không hoàn (§7.2)". Design 32: "Vé không thể huỷ, đổi hoặc hoàn tiền… Chỉ sử dụng tại rạp ghi trên vé." + địa chỉ + hotline. Design 10 (`QrTicket`): "Vé không huỷ/không hoàn".

**M3. Không có chế độ mở QR toàn màn hình / tăng độ sáng (R-87 yêu cầu rõ; design 32 và mặc định "Điểm cần user quyết" #6).**
- Không có nút "Mở vé toàn màn hình", overlay nền trắng với QR ≥ 280px, hay Screen Wake Lock (`ve/[bookingCode]/page.tsx`, `ticket-card.tsx`).
- QR đang là 176px (`ticket-qr.tsx:6`), trong khi design 10 yêu cầu QR ≥ 240px trên mobile.

**M4. Đơn `affected` (suất bị rạp huỷ) biến mất khỏi "Vé của tôi".**
- `ticket-data.ts:39`: `PAID_STATUSES = ["paid","checked_in"]`.
- Design màn 11 yêu cầu hiện đơn `affected` với badge danger "Bị ảnh hưởng" + dòng "Suất đã bị huỷ — vui lòng liên hệ CSKH để được hoàn tiền" + hotline. Thiếu `OrderStatusBadge` (Đã thanh toán / Đã check-in / Bị ảnh hưởng).
- Hiện tại khách có suất bị huỷ mất hẳn dấu vết đơn đã trả tiền.
- (Đơn `exchanged`/`refunded_manual`: tuỳ builder quyết định có hiện ở "Đã xem" không, nhưng `affected` thì bắt buộc.)

### MINOR
- m1. `payment-result.tsx:53-55`: gặp PAID thì `router.refresh()` rồi `return`, không lên lịch poll nữa. Nếu lần đọc lại ở server trả null (lỗi tạm thời ở lần đọc), `PaymentResult` vẫn mounted với phase `waiting`. Spinner quay mãi, không poll, không timeout. Nên giữ lại timer timeout hoặc hiện fallback.
- m2. Ket-qua với id không phải UUID hoặc đơn của người khác: API trả 400/403, nhưng `catch` coi là "waiting" (`payment-result.tsx:49-51`), nên phải chờ đủ 90s mới hiện màn timeout. Nên dừng ngay khi gặp 4xx, hoặc trả 404 ở server khi id không hợp lệ.
- m3. Màn thất bại dẫn về `/lich-chieu`, design 10 là "Chọn lại ghế" về 06 cùng suất. Timeout là 90s, design ghi "quá 2'". Màn thành công thiếu "Về trang chủ" và dòng email.
- m4. `/ve` dùng 2 section thay vì Tabs "Sắp tới / Đã xem". Không có trạng thái rỗng riêng cho tab "Chưa có vé đã xem". Card thiếu poster và QR mini.
- m5. Test chỉ phủ hàm thuần và polling. Không có test cho các page server (404 khi khác chủ, chưa xác nhận email ra danh sách rỗng, filter của query). Hai AC (404 và email chưa xác nhận) chưa có kiểm chứng tự động.
- m6. Scope: `proxy.ts`, `ticket-data.ts`, `payment-result.tsx` nằm ngoài danh sách Files. Thay đổi hợp lý: proxy không chặn `/dat-ve/[showtimeId]`, đã có test ở `ticket.test.tsx:147-153`. Dispatcher cần ghi nhận để merge, vì `/dat-ve/don/*/xac-nhan` của task-04 giờ cũng yêu cầu đăng nhập.

## Các mục đạt
- Polling dừng khi PAID / thất bại / review / timeout. Cleanup khi unmount có `stopped` + `clearTimeout`. Không đọc query string của PayOS.
- Proxy: `/dat-ve/<showtimeId>` vẫn mở cho guest. Chỉ `/dat-ve/don/...` bị chặn.
- Khách chưa xác nhận email: `/ve` ra danh sách rỗng kèm thông báo, `/ve/[code]` trả 404.
- Không lộ `contact_email`/`contact_phone`: select liệt kê cột rõ ràng.

## Verdict
**FAIL**: 4 MAJOR (M1 lỗ hổng cách ly dữ liệu theo role / AC-17, M2–M4 thiếu yêu cầu R-87 và design màn 10/11/32).
