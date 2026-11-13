# Review — build-filmbooking layer-6 task-05 — round 2

Agent: reviewer
Worktree: E:/FilmBooking/.worktrees/layer-6__task-05 (wt/layer-6__task-05, chưa commit)

## Review level
STRICT

## Reason
Vé/QR, cách ly dữ liệu đơn theo chủ (AC-17), route guard `proxy.ts`, luồng polling thanh toán.

## Blast radius
Giống round 1: 3 page mới, `components/ticket/*`, `proxy.ts` (thêm `/dat-ve/don`). Không đụng API hay migration.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS 18 file / 270 test, lần đầu đã pass, không có timeout |
| `cd apps/web && pnpm build` | PASS |
| aislop / oxlint / ocr | skip, không có trong allowlist verify |

## Đóng các finding của round 1
- **M1 (AC-17): đóng.**
  - `ticket-data.ts` lọc `.eq("user_id", userId)` ở `fetchMyOrders` (:95), `fetchMyOrder` (:109) và `fetchMyOrderShowtimeId` (:126).
  - `userId` lấy từ `getSessionUser()` → `supabase.auth.getUser()` phía server (:133-139). Hàm này xác thực JWT với Supabase, không nhận tham số nào từ client.
  - Page `ket-qua`: không có user, hoặc đơn không thuộc user, thì trả 404 (`ket-qua/page.tsx:23-25`). Id không phải UUID → PostgREST lỗi → data null → 404.
  - Test dùng Supabase giả nhiều chủ đơn, trong đó Admin thấy mọi dòng (đúng như RLS thật). Test khẳng định chỉ filter `user_id` mới cách ly được, và Admin vào `/ve/[code]` / `ket-qua` của người khác thì nhận 404. Mock này mô phỏng đúng policy `orders_select` thật.
- **M2: đóng.** Có "Vé chỉ có giá trị khi quét tại rạp ghi trên vé…", "Vé không hỗ trợ huỷ / đổi / hoàn tiền." và hotline rạp (`ticket-card.tsx:76-86`). Cột `cinemas.hotline` có trong schema, role authenticated được select.
- **M3: đóng.** QR thường 240px, overlay `role=dialog` nền trắng với QR 304px, focus vào nút Đóng, Escape để đóng, trả focus về nút mở, Wake Lock xin và nhả đúng lúc (`ticket-qr.tsx`).
- **M4: đóng.** `VISIBLE_STATUSES` có thêm `affected`, có badge Đã thanh toán / Đã check-in / Bị ảnh hưởng, kèm hướng dẫn CSKH + hotline.
  - Kiểm tra lộ `qr_token` của đơn affected: `TicketCard`/`TicketDetail` là server component (không có `"use client"`, không client component nào import). Với đơn affected, `TicketQr` (client) không được render. Vì vậy token không bị serialize vào RSC payload hay HTML.
- **m1: đóng.** Khi PAID, component `refresh()` rồi tiếp tục poll tới khi hết thời gian chờ, nên không còn kẹt spinner.
- **m2: đóng.** Lỗi 400/403/404 được báo ngay.
- **m3: đóng.** Timeout 120s, có "Chọn lại ghế" → `/dat-ve/{showtimeId}`, có "Về trang chủ".
- **m5: đóng.** Đã có test cho các page: chưa xác nhận email ra danh sách rỗng hoặc 404; đơn người khác ra 404.

## Findings

### CRITICAL
Không có.

### MAJOR
Không có.

### MINOR (không chặn)
- n1. `ket-qua/page.tsx:30-39`: nếu đơn đã chuyển `affected` (rạp huỷ suất sau khi khách trả tiền), trang vẫn có tiêu đề "Đặt vé thành công". Vé không hiện QR và có cảnh báo, nhưng tiêu đề gây nhầm.
- n2. `/ve` vẫn dùng 2 section "Sắp tới / Đã qua" thay vì Tabs "SẮP TỚI / ĐÃ XEM", và thiếu trạng thái rỗng riêng cho tab "Đã xem" (design màn 11). Còn từ round 1.
- n3. `ticket-qr.tsx:36-67`:
  - Dialog toàn màn hình không trap focus, Tab có thể ra phần nền.
  - Wake Lock không xin lại khi `visibilitychange`, trình duyệt tự nhả lock khi khách đổi tab.
- n4. `AffectedNotice` dùng `role="alert"` trong danh sách. Khi có nhiều đơn affected, trình đọc màn hình sẽ đọc dồn lúc tải trang. `role="note"` hoặc chỉ dùng text thì phù hợp hơn.
- n5. `fetchMyOrders` không giới hạn số dòng. Với 1 khách thì chấp nhận được cho demo.
- n6. Scope: `proxy.ts`, `ticket-data.ts`, `payment-result.tsx` nằm ngoài danh sách Files (đã ghi ở round 1). Dispatcher cần biết `/dat-ve/don/*/xac-nhan` của task-04 giờ cũng bắt đăng nhập.

## Verdict
**STRICT PASS**: M1–M4 và các minor m1/m2/m3/m5 của round 1 đã đóng, không có regression. Còn 6 MINOR không chặn.
