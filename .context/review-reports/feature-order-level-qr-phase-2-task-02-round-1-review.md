# Review — feature/order-level-qr · phase-2-task-02 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** Task đổi hợp đồng API soát vé (`ScanTicketResponse`, nhiều client dùng), đổi DTO admin chi tiết đơn, và đổi cách dùng credential (`orders.qr_token`) trong email. Đây là các rủi ro đỏ: security/token, API contract, shared schema.
- **Blast radius:** `packages/shared/src/schemas/{checkin,orders}.ts` (web staff/admin dùng chung); `POST /checkin/scan`; `GET /orders/:id`; worker `/jobs/send-emails` (mọi mail TICKET_ISSUED); `MailService`/`templates.ts`. Web (task-03) đang sửa song song trong working tree (7 file `apps/web/**` dirty), nằm ngoài phạm vi review này.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS cả 3 package. Brief nói web đỏ 5 chỗ, nhưng không còn đúng: task-03 đã sửa web trong working tree |
| `pnpm test` lần 1 | shared 31/31 PASS; api: phần tổng kết bị cắt khỏi output; web 4 fail / 591 (timeout: `pricing-voucher.test.tsx`, `auth-forms.test.tsx`, …) |
| `pnpm test` lần 2 (chạy lại 1 lần) | shared 31/31 PASS; **api 29 file / 598/598 PASS**; web 2 fail / 593 (`account.test.tsx`: timeout 5000ms, rồi chữ gõ của test trước tràn sang test sau, `"oWrrdo1n2g3Old123"`). Hai lần chạy fail ở các file web khác nhau, đều không liên quan task này → flake do tải. Chuỗi lệnh dừng ở web nên `node --test scripts/*.test.mjs` chưa chạy |
| `pnpm test:int` | **9 file / 91/91 PASS** trên DB local (`rls-scope.int-spec.ts` có `afterAll → cleanupScope`, không làm bẩn dữ liệu demo) |
| `aislop scan --changes --json` | skip, aislop chưa cài (`command not found`) |
| `npx oxlint apps/api/src packages/shared/src` | 0 error. Repo không có cấu hình oxlint, chạy với mặc định |
| `ocr` | skip, ocr chưa cài |
| AI-friendly web gate | N/A (backend) |

## Đối chiếu chéo với DB thật

- `checkin_ticket` hiện hành (`supabase/migrations/20261117130000_order_level_qr_fixes.sql:376-389`) trả đúng các khoá `order_id, booking_code, movie_title, cinema_name, room_name, seats, seat_count, starts_at, checked_in_at`. `checkin.service.ts:49-64` đọc đúng các khoá đó. Tên tham số `p_token_or_code` khớp chữ ký RPC.
- WRONG_CINEMA (`:220-228`) chỉ trả `correct_cinema_*`. Service chỉ đọc khoá từ danh sách trắng (`checkin.service.ts:71-80`); nhánh `default` chỉ trả `base`. Không có đường nào chuyển tiếp nguyên object RPC. Nhánh USED chỉ trả `checkedInAt` và `staffName`.
- INVALID có `order_status` thì là NOT_PAID, không có thì là NOT_FOUND. Nhánh "đơn paid không có vé" (`:337-342`) không có `order_status` → NOT_FOUND. Hợp lý.
- Payload outbox TICKET_ISSUED do DB sinh (`20261113160000_confirm_paid_order_code_lookup.sql:314-323`, `20261112120000_zero_amount_sell_hardening.sql:162-171`) không có `qr_token`. Vì vậy `enrichTicketPayload` luôn lấy `orders.qr_token` qua `admin()`. Đúng AC "giải mã == orders.qr_token".
- Credential: `orders.service.ts` `select("*")` (`:76, :133, :224, :363, :369`) đều đi qua `mapSummaryDto` hoặc `buildOrderDetailDto`, ánh xạ từng trường tường minh. `cancellation.service.ts:231, :276` đi qua `enrichAffectedOrders` (`:745-772`), cũng tường minh. Hiện không có endpoint nào trả nguyên hàng `orders` hay `tickets`. `OrderTicketDto` đã bỏ `qrToken` (`packages/shared/src/schemas/orders.ts:67-68`). Log của jobs chỉ có order id + code (`jobs.controller.ts:70, :76`). Log của mail không có token (`mail.service.ts:140`).
- Grep `qrImageCids|extractTicketQrs|MAX_TICKET_QR_IMAGES|orderTicketsForEmail|ticket-qr-` trong `apps/` không còn kết quả. Grep `ticketId|seatLabel|seatType` trong `packages/shared/src` chỉ còn ở các DTO khác (orders/cancellation/pricing), không dính tới hợp đồng soát vé.

## Findings

1. **MEDIUM — Test không lộ credential trong DTO admin cho tự tin giả (FAIL).** File `apps/api/test/orders-report.e2e-spec.ts:1053-1066`, fixture ở `:220-244` và `:265-277`.
   - Test mới khẳng định "GET /orders/:id KHÔNG lộ qr_token". Nhưng trong fixture, `qr_token` (`"a".repeat(32)`) chỉ có ở hàng **tickets** (`:272`). Hàng `orders` (`ORDER_PAID_HN01`) không có `qr_token`, trong khi DB thật có `orders.qr_token text not null unique`.
   - Vì vậy test chỉ chứng minh token cũ `tickets.qr_token` không lộ. Nó không chứng minh credential mới `orders.qr_token` không lộ: nếu sau này `buildOrderDetailDto` hoặc `mapSummaryDto` thêm `...row` hay `qrToken: row.qr_token`, test vẫn xanh. Đây đúng loại "mock có cấu trúc khác bảng thật" mà luật adversarial yêu cầu đánh FAIL.
   - Code hiện tại đúng. Cách sửa: thêm `qr_token: "b".repeat(32)` vào các hàng `orders` của fixture (ít nhất `ORDER_PAID_HN01`). Assert `b{32}` không xuất hiện trong `GET /orders/:id`, đồng thời trong `GET /orders` (tìm kiếm) và `GET /admin/todo`, vì các route này cũng `select("*")` trên orders.

2. **LOW — Thứ tự ghế trong email không xếp tự nhiên.** File `apps/api/src/modules/jobs/jobs.controller.ts:105-110`: `order_seats.select("seat_label")` không có `order`, nên mail liệt kê ghế theo thứ tự PostgREST trả về. Test `outbox-job.e2e-spec.ts` còn chốt luôn chuỗi `"A10, A2, B1"`. Trong khi đó RPC (`...fixes.sql:366-370`) và trang vé web (`ticket-data.ts:63`) đều xếp tự nhiên. Spec chỉ yêu cầu "liệt kê toàn bộ ghế" nên không chặn, nhưng mail lệch với hai nơi còn lại. Bản per-ticket trước đây có xếp (`orderTicketsForEmail`).

3. **LOW — `seatCount` có thể lệch với `seats.length`.** File `checkin.service.ts:60`: dùng `seat_count` của RPC (`jsonb_array_length`, có đếm cả nhãn null) trong khi `seats` đã được lọc bỏ phần tử không phải chuỗi. Test `checkin.e2e-spec.ts` ("seats không phải mảng") chốt luôn trường hợp `seats: []` với `seatCount: 1`. Thực tế gần như không xảy ra vì nhãn ghế lấy từ `order_seats`. Có thể cân nhắc dùng luôn `seats.length` để đảm bảo nhất quán.

4. **INFO — Integration test chưa quét bằng token mới.** `apps/api/test/integration/rls-scope.int-spec.ts:479-493` chỉ quét bằng `a.qrToken`, tức token **vé** cũ (đường tương thích), và danh sách bí mật cấm lộ chưa có `orders.qr_token`. Cả đường quét chính bằng `orders.qr_token` lẫn nhánh OK đều chưa có test integration ở tầng API; pgTAP 063 đã cover ở tầng DB. Nên bổ sung khi tiện.

5. **INFO — Token vé cũ trong `audit_logs` giờ mở được cả đơn.** Các dòng audit lịch sử vẫn còn `tickets.qr_token` (decisions.md đã ghi nhận). `apps/api/src/modules/admin/audit.controller.ts:27, :110-111` trả nguyên `before_data`/`after_data` cho Manager/Admin. Qua đường tương thích, một token vé cũ giờ check-in được **cả đơn** thay vì một ghế. Đây là vấn đề có từ trước, người đọc audit vốn đã có quyền RLS đọc cột này, và nằm ngoài phạm vi task.

6. **INFO — Mail gửi thiếu QR không retry.** Nếu enrich lỗi tạm thời (PostgREST error), mail vẫn được gửi không có QR và chuyển `SENT`, không retry. Hành vi này giữ nguyên như trước và đã ghi ở decisions.md (Consequences).

## Các mục đã kiểm và đạt

- Hợp đồng `ScanTicketResponse.order` (`packages/shared/src/schemas/checkin.ts:48-60`) khớp đúng 9 trường của spec delta.
- Email 1 QR đơn đạt các điểm sau:
  - Ảnh `cid:ticket-qr` (cid đã escape) và chữ token dự phòng qua `tokenChip` (đã escape).
  - Có câu "Một mã QR cho cả đơn — …".
  - Liệt kê toàn bộ ghế qua `infoTable`, có escape.
  - Giữ nguyên các câu R-86/R-133/AC-26 (`templates.ts:300-335`).
  - `mail.service.ts` tạo 1 PNG với level M, margin 1, width 440, mã hoá nguyên token. Lỗi tạo ảnh thì vẫn gửi bản chỉ có chữ. Kind không phải vé thì không có attachment.
  - Test giải mã PNG bằng jsqr khớp token 32 hex thật. MIME thật có đúng 1 Content-ID.
  - Outbox cũ có `payload.tickets` bị bỏ qua đúng (test ở cả template và worker).
- Đỏ trước/xanh sau (đánh giá bằng cách đọc code): các test checkin OK (`toEqual` trên `order`), orders-report (`qrToken` có trong bản cũ), mail (cid `ticket-qr-1` cũ) và outbox (fake không còn bảng `tickets`) đều sẽ FAIL với code cũ. Không có test tautology.
- Docs as-built: `docs/API_SPEC.md:164, :172` và `docs/ERD.md:46, :50` khớp code. Không sửa intent docs. `.context/decisions.md` có ghi SUPERSEDED rõ ràng.
- Surgical diff: mọi dòng đổi đều trace về task. File và hàm nằm trong giới hạn. Không vượt ngưỡng AI-chaos indicator.

## Verdict: **FAIL**

Lý do duy nhất chặn PASS là F1: test cho tự tin giả về việc không lộ credential mới. Đây là AC "qr_token KHÔNG lộ trong DTO admin", và fixture `orders` thiếu cột NOT NULL `qr_token`. Code sản phẩm hiện đúng, nên chỉ cần sửa fixture/test. F2 và F3 nên sửa cùng lượt (nhỏ, không bắt buộc). Round 2 kiểm lại F1.
