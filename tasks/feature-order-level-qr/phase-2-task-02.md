# Feature order-level-qr · phase-2-task-02 — Backend: API soát vé theo đơn, DTO/shared, email 1 QR đơn

- Classification / Risk: MODIFY. Risk: đổi hợp đồng API soát vé + payload email (credential QR) → reviewer **STRICT**. Phụ thuộc task-01 đã áp vào DB local (RPC trả `order_id, seats[], seat_count`, cột `orders.qr_token`).
- Hợp đồng: `spec/changes/2026-11-17-order-level-qr.md`.

## Thiết kế
1. **Shared** `packages/shared/src/schemas/checkin.ts`: `ScanTicketResponse.ticket` → `order?: { orderId, bookingCode, movieTitle, cinemaName, roomName, seats: string[], seatCount: number, startsAt, checkedInAt }` (cập nhật comment). `scanTicketSchema` giữ (token | bookingCode). Mọi chỗ dùng schema/type này trong `packages/shared` + `apps/api` cập nhật.
2. **API soát vé** `apps/api/src/modules/checkin/checkin.service.ts`: ánh xạ payload RPC mới (đọc `seats` mảng + `seat_count`, `order_id`), vẫn chỉ đọc các khoá đã biết (không chuyển tiếp nguyên object), WRONG_CINEMA không có ghế/tên khách. Test `apps/api/test/checkin.e2e-spec.ts` + `integration/rls-scope.int-spec.ts` cập nhật; test mới: OK trả `order.seats` đủ N ghế; USED/WRONG_CINEMA như cũ.
3. **DTO đơn** `apps/api/src/modules/orders/*` + `packages/shared/src/schemas/orders.ts`: `OrderTicketDto.qrToken` (credential) BỎ khỏi DTO admin (thay bằng `checkedIn: boolean` nếu cần); không thêm token vào DTO admin. Grep mọi nơi dùng `qrToken`/`qr_token` trong `apps/api` (trừ mail) và cập nhật test (`orders-report.e2e-spec.ts`, `webhook.e2e-spec.ts`, `integration/*`). KHÔNG làm vỡ web admin — nếu `apps/web` đang đọc `ticket.qrToken` của DTO admin thì báo lại để task-03 xử lý (liệt kê file).
4. **Email 1 QR đơn** (đơn giản hoá kết quả bug-ticket-email-qr round 2 về MỘT ảnh):
   - `jobs.controller.ts` `enrichTicketPayload`: thay truy vấn tickets bằng `from("orders").select("qr_token").eq("id", orderId).maybeSingle()` → `enriched.qr_token`; bỏ `orderTicketsForEmail`, sắp xếp, `payload.tickets`. Lỗi PostgREST vẫn `logger.warn` (order id + code, không token). Seats vẫn lấy từ `order_seats` như cũ.
   - `templates.ts`: bỏ danh sách vé/`qrImageCids`; trở lại 1 QR: `extractTicketQrToken` (một chỗ đọc `qr_token ?? qrToken`), `renderTemplate(kind, payload, { qrImageCid?: string })`; khối QR: ảnh `<img src="cid:ticket-qr">` + dòng "Một mã QR cho cả đơn — đưa mã này cho nhân viên soát vé, không cần mã từng ghế" + chữ token dự phòng; liệt kê toàn bộ ghế (đã có). `text`: `QR Token: <token>`.
   - `mail.service.ts`: 1 PNG, cid `ticket-qr`, filename `ve-qr.png`; bỏ `MAX_TICKET_QR_IMAGES`; lỗi tạo ảnh vẫn gửi bản chỉ chữ, không log token.
   - Test: `mail-templates.spec.ts`, `mail-ticket-qr.spec.ts` (đơn nhiều ghế vẫn đúng 1 attachment, giải mã == token đơn, MIME 1 Content-ID, lỗi tạo ảnh vẫn gửi), `outbox-job.e2e-spec.ts` (fake `orders` select `qr_token`; không còn `tickets`/sort). Các test per-ticket cũ được thay/bỏ vì hành vi đó bị loại bỏ có chủ đích.
5. **Docs as-built**: `docs/API_SPEC.md` (response `POST /checkin/scan` dùng `order{…seats[]}`), `docs/ERD.md` (`orders.qr_token`, `tickets.qr_token` chỉ để tương thích). `.context/decisions.md`: mục CID inline cập nhật thành 1 QR/đơn + quyết định QR = token đơn (không nhúng nội dung), tương thích QR cũ.

## KHÔNG làm
Không đụng `supabase/**`, `apps/web/**` (task-03), `.env*`, dòng `"start"` trong `apps/api/package.json`; không đổi dependency (`qrcode` vẫn dùng). Không `git add/commit/checkout/reset/stash/clean`.

## Files to Modify
`packages/shared/src/schemas/{checkin,orders}.ts`, `apps/api/src/modules/{checkin,orders,jobs,mail}/**`, test liên quan, `docs/API_SPEC.md`, `docs/ERD.md`, `.context/decisions.md`.

## Repro Verification
- Original: email đơn 8 ghế có 8 QR; API soát trả 1 ghế/lần.
- Expected: email 1 QR, API soát trả cả đơn.
- Actual after: email đơn nhiều ghế có đúng 1 ảnh QR của đơn; API soát vé trả `order{seats[]}`.
- Evidence (2026-11-18): build API thật + đơn seed 8 ghế (PostgREST) → 1 attachment `image/png` cid `ticket-qr`, PNG giải mã (jsqr) == `orders.qr_token`, html có đúng 1 `<img cid:ticket-qr>`, câu "Một mã QR cho cả đơn", đủ 8 ghế xếp tự nhiên. Test: api 600, `test:int` 92/92 (có ca quét `orders.qr_token` soát cả 3 ghế rồi USED), test chống lộ token (primary tự kiểm: cố ý làm DTO lộ token ⇒ test đỏ, đã gỡ). Reviewer STRICT: round 1 FAIL (test tự tin giả) → sửa → round 2 PASS.
- Status: PASS
