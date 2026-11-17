# Review — bug-ticket-email-qr · phase-1-task-01 · round 1

Agent: reviewer

## Review level
**NORMAL**

## Reason
Bug chỉ đụng module mail của API (template, MailService), interface `MailTransport` và thêm dependency. Không đụng auth/RBAC/schema/migration/payment. Có thêm MIME attachment và dependency runtime nên tôi soi kỹ build dist, logging token và cách dựng MIME.

## Blast radius
Mọi mail `TICKET_ISSUED`/`TICKET` do job `/jobs/send-emails` gửi (batch 20). `MailTransport.sendMail` nhận thêm trường optional `attachments` nên các mock cũ vẫn biên dịch (typecheck PASS). Có thêm dependency runtime `qrcode` và 4 devDependency.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | API **589/589 PASS** (29 file, có `mail-ticket-qr.spec.ts`, `mail-templates.spec.ts`). Web 593/594: 1 test timeout 5000ms ở `src/components/account/__tests__/account.test.tsx:179` (ChangePasswordForm). Test này nằm ngoài diff, timeout do tải khi chạy song song. Lệnh `pnpm --filter @filmbooking/web test` để chạy lại riêng bị agent-guard chặn vì không nằm trong allowlist. |
| `pnpm build` | PASS (api: `Built 105 files`; web: next build OK) |
| `pnpm --filter @filmbooking/api build` | bị agent-guard chặn (không nằm trong allowlist), tôi dùng `pnpm build` thay |
| `node -e "require('./apps/api/dist/.../mail.service.js')"` | **bị agent-guard chặn**. Tôi kiểm tra tĩnh thay (xem F4) |
| aislop / oxlint / ocr | skip (không có trong allowlist verify; oxlint/ocr chưa cấu hình) |

## Findings

### F1 — HIGH (blocking): đơn từ 2 ghế trở lên chỉ có 1 QR, nên chỉ vào được 1 người
- Mỗi ghế là một vé riêng có `qr_token` riêng: `supabase/migrations/20261111030100_booking_tables.sql:154,161`. Khi thanh toán, RPC tạo vé cho từng `order_seats`: `20261113160000_confirm_paid_order_code_lookup.sql:302-306`.
- Payload outbox `TICKET_ISSUED` không có `qr_token` (`confirm_paid_order_code_lookup.sql:314-323`). Nguồn duy nhất của token là bước enrich `apps/api/src/modules/jobs/jobs.controller.ts:66-71`: `.from("tickets").select("qr_token").eq("order_id", orderId).limit(1).maybeSingle()`. Câu này chỉ lấy **1 vé tuỳ ý** và không có `ORDER BY`, nên token của ghế nào được chọn là không xác định.
- Soát vé tính theo từng vé. `checkin_ticket` tìm theo `t.qr_token = lower(v_cleaned)` (`20261111040400_rpc_checkin_reports.sql:125`), chặn `ALREADY_USED` khi chính vé đó đã có `checked_in_at` (`:184`), và chỉ cập nhật `where id = v_ticket.ticket_id` (`:258-261`).
- Hệ quả: đơn A1+A2 nhận email có 1 ảnh QR. Staff quét thì vào được 1 ghế. Quét lần hai trả "Vé đã được sử dụng", người thứ hai không vào được bằng QR trong email. Trong khi đó khối mới `templates.ts:228-232` ghi "Đưa mã này cho nhân viên soát vé tại rạp", ngụ ý mã dùng cho cả đơn. Trang web thì render **1 QR cho mỗi vé** (`apps/web/src/components/ticket/ticket-card.tsx:96`), nên email lệch với web, trái mục kiểm tra 1 ("khớp web/scanner").
- Root cause trong task file (mục "Root cause") bỏ sót trường hợp nhiều ghế. Bug của user là "staff check vé bằng qr", fix hiện tại chỉ đúng cho đơn 1 ghế.
- Hướng sửa (chỉ là đề xuất): enrich **tất cả** vé của đơn, join `order_seats.seat_label` và sắp xếp ổn định (vd theo `seat_label` hoặc `created_at, id`). Render mỗi vé một ảnh CID (`ticket-qr-<n>`) có nhãn "Ghế X" và giữ chữ token dự phòng cho từng ghế. Phần text plain liệt kê token theo ghế. Không đổi QR sang `booking_code`, để giữ khớp web và AC-26. Phạm vi sửa sẽ cần thêm `jobs.controller.ts` (enrich) và test của nó.

### F2 — MEDIUM: test tạo cảm giác an toàn giả cho đúng trường hợp F1
`apps/api/test/mail-ticket-qr.spec.ts:21-31`: fixture có `seats: ["A1","A2"]` nhưng chỉ có 1 `qr_token`. Kết quả là test khẳng định "staff quét được" cho một đơn 2 ghế mà thực tế chỉ vào được 1 ghế. Cần test nhiều vé: N vé ra N attachment, cid khác nhau, mỗi PNG giải mã ra đúng token của ghế tương ứng. Bước enrich ở `jobs.controller` cũng cần test (mock trả nhiều dòng `tickets` đúng cột `qr_token`, cùng `order_seats.seat_label`).

### F3 — LOW: lặp logic đọc token
`templates.ts:220-224` (`extractTicketQrToken`) và `templates.ts:238` (`renderTicketEmail`) cùng đọc `payload.qr_token ?? payload.qrToken`. Comment có ghi "cùng quy tắc", nhưng hai chỗ có thể lệch nhau về sau. Có thể cho `renderTicketEmail` dùng lại helper. Sửa F1 kiểu gì cũng phải đổi chỗ này.

### F4 — INFO: build dist / import style (đã kiểm tra tĩnh, OK)
- `apps/api/dist/apps/api/src/modules/mail/mail.service.js:20` là `_interop_require_default(require("qrcode"))`, dòng 140 gọi `_qrcode.default.toBuffer`. `qrcode/lib/index.js` là `module.exports = require('./server')`, không có `__esModule`, nên `.default` chính là module. Bản build SWC CommonJS chạy đúng.
- `apps/api/node_modules/qrcode/package.json` tồn tại (1.5.4, `main: ./lib/index.js`). Trong lockfile, `qrcode@1.5.4` nằm ở dependencies, `jsqr@1.4.0`, `pngjs@7.0.0`, `@types/*` ở devDependencies. `pngjs@5.0.0` là dependency bắc cầu của qrcode, hợp lý.
- Dưới vitest, `vi.spyOn(QRCode, "toBuffer")` chạy được vì test và service cùng tham chiếu một đối tượng `module.exports`.
- Phần chạy thật `node -e require(...)` bị chặn nên chưa có bằng chứng runtime, đây là residual risk nhỏ.

### F5 — INFO: bảo mật / logging (OK)
- `logger.warn` ở `mail.service.ts:144-146` chỉ log `error.message` của qrcode. Lỗi của qrcode (vd "amount of data is too big") không chứa dữ liệu đầu vào, nên token không bị log. Test `mail-ticket-qr.spec.ts:99-115` có kiểm tra điều này.
- Attachment chỉ được dựng nội bộ trong `buildTicketQrAttachment`, payload không thể ép attachment tuỳ ý, và kind khác vé không tạo ảnh (`extractTicketQrToken` có whitelist).
- cid là hằng `ticket-qr` và vẫn qua `escapeHtml`. Không dùng `data:` URI, không có XSS mới.
- Ảnh QR chỉ chứa đúng `qr_token` vốn đã in dạng chữ trong email, nên không lộ thêm credential.

### F6 — INFO: MIME, độ bền, text plain (OK)
- Test streamTransport thật (`mail-ticket-qr.spec.ts:118-138`) chứng minh có `multipart/related`, `image/png`, `Content-ID: <ticket-qr>`, `inline` và HTML tham chiếu `cid:ticket-qr`.
- Test giải mã PNG bằng jsQR+pngjs, độc lập với bộ sinh, chạy với token đúng dạng thật (32 hex, khớp CHECK `^[0-9a-f]{32}$`). Test có ý nghĩa thật, không phải tautology.
- Tạo ảnh lỗi thì vẫn gửi bản chỉ chữ, không throw, nên outbox không retry vô ích. `toBuffer` là async; ảnh 440px cho token 32 ký tự rất nhẹ, không đáng lo khi chạy batch 20.
- Phần `text` plain không đổi (`templates.ts:303` vẫn có `QR Token:`). Spec không đổi nên không bump, đúng chủ đích. `decisions.md` có ghi quyết định CID và gap "link bản đồ".
- Hunk `"start"` trong `apps/api/package.json` là thay đổi riêng của user, tôi bỏ qua đúng như brief.

## Verdict
**FAIL**. Một finding HIGH (F1) chặn PASS: email chỉ chứa QR của một vé tuỳ ý, nên đơn từ 2 ghế trở lên không soát được cả đơn bằng QR. Fix chưa giải quyết trọn bug "staff check vé bằng qr" và lệch với trang vé web (mỗi ghế một QR). F2 phải sửa kèm. Phần kỹ thuật CID/MIME/build/log đạt yêu cầu.
