# Bug ticket-email-qr · phase-1-task-01 — Email vé thiếu hình QR (chỉ in chữ qr_token), staff không quét được

- Classification / Risk: BUG. Severity **cao** (R-86 MVP: email vé phải có QR; khách mở email ở quầy không có ảnh để staff quét). Scope: `apps/api/src/modules/mail/{templates,mail.service}.ts` + dependency `qrcode`. Root cause category: thiếu tính năng so với spec (template chỉ render text). Expected review level: **NORMAL** (không đổi cấp quyền; `qr_token` vốn đã nằm trong email dạng chữ, ảnh QR không thêm lộ credential; có thêm dependency + MIME attachment). Blast radius: mọi mail vé (`TICKET_ISSUED`/`TICKET`), `MailTransport` interface (mock trong test). Doc impact: `docs/DESIGN.md`/`docs/API_SPEC.md` nếu có mô tả nội dung email vé → reconcile as-built, nếu không `no doc impact`. Decision impact: ghi `.context/decisions.md` (chọn CID inline attachment, lý do).
- Yêu cầu của user (2026-11-17): "sao lại chỉ có mã đặt vé, qr đâu, staff check vé bằng qr mà".

## Root cause (code evidence)
- `apps/api/src/modules/mail/templates.ts:244-246`: `qrBlock` chỉ render `<span>` chữ `qr_token` (nhãn "MÃ QUÉT SOÁT VÉ (QR TOKEN)"), KHÔNG có ảnh. SPEC R-86: "Email gồm: mã đặt vé, **QR**, …".
- Giá trị QR đúng: trang vé web `apps/web/src/components/ticket/ticket-qr.tsx:61,85` dùng `<QRCodeSVG value={token} level="M">` với `token = qr_token`; staff `apps/web/src/components/staff/qr-scanner.tsx` (`Html5Qrcode`) → `submit("token", text)` nên QR = **nguyên chuỗi qr_token**, không thêm tiền tố/URL.

## Root cause bổ sung (reviewer round 1, primary đã xác nhận)
**Mỗi ghế = 1 vé = 1 `qr_token` riêng** (`supabase/migrations/20261111030100_booking_tables.sql:154,161`, `order_seat_id unique`; `checkin_ticket` soát theo từng vé). Payload outbox `TICKET_ISSUED` KHÔNG có token (`...confirm_paid_order_code_lookup.sql:314-323`); `jobs.controller.ts:62-74 enrichTicketPayload` chỉ lấy `.limit(1).maybeSingle()` không ORDER BY ⇒ email của đơn N ghế chỉ có QR của 1 ghế bất kỳ (DB local có đơn 4 vé). Trang web hiện mỗi ghế một QR (`ticket-card.tsx`). ⇒ Email PHẢI có **mỗi ghế một QR** (ảnh CID `ticket-qr-<n>`, nhãn ghế, chữ token dự phòng).

## Thiết kế (giữ gọn — demo)
Gmail/Outlook **chặn `data:` URI** và localhost không có URL công khai ⇒ nhúng ảnh bằng **CID inline attachment** (nodemailer `attachments: [{ filename, content: Buffer, cid, contentType: "image/png" }]`, HTML `<img src="cid:ticket-qr" …>`).
1. Dependency: `pnpm --filter @filmbooking/api add qrcode` + `pnpm --filter @filmbooking/api add -D @types/qrcode` (+ devDeps decode cho test nếu cần, vd `jsqr`, `pngjs`).
2. `mail.service.ts`: mở rộng `MailTransport.sendMail` options có `attachments?: { filename: string; content: Buffer; cid: string; contentType: string }[]`; `SendEmailOptions` thêm `attachments?`; `sendEmail` truyền xuống. Mock trong test (`mail-service.spec.ts`, `outbox-job.e2e-spec.ts`, `integration/helpers/app-harness.ts`) vẫn biên dịch.
3. `templates.ts`: export hàm thuần `extractTicketQrToken(kind, payload): string | null` (chỉ TICKET_ISSUED/TICKET, cùng logic `qr_token ?? qrToken` như `renderTicketEmail`). `renderTemplate(kind, payload, opts?: { qrImageCid?: string })` → `renderTicketEmail(payload, opts)`: khi có `qrImageCid` và token, render khối QR **ảnh** `<img src="cid:${cid}" width="220" height="220" alt="Mã QR vé" style="display:block;margin:12px auto;border:1px solid …;background:#fff;padding:8px">` kèm dòng "Đưa mã này cho nhân viên soát vé tại rạp" và GIỮ chuỗi `qr_token` dạng chữ bên dưới (dự phòng khi client chặn ảnh; vẫn có trong `text`). Không có `qrImageCid` (tạo ảnh lỗi) → render như cũ (chỉ chữ). Mọi giá trị động qua `escapeHtml`; cid là hằng nội bộ.
4. `MailService.sendOutboxEmail`: nếu `extractTicketQrToken` ra token → tạo PNG bằng `qrcode.toBuffer(token, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 440 })` (hiển thị 220px cho nét trên màn hình retina; **errorCorrectionLevel "M" khớp web**); thành công → `renderTemplate(..., { qrImageCid: "ticket-qr" })` + attachments; lỗi tạo ảnh → log warn (KHÔNG log token) và gửi bản chỉ chữ (không làm hỏng việc gửi mail). Không tạo ảnh cho kind khác.
5. KHÔNG làm: không đổi `qr_token`/DB/API/web; không đổi kind khác; không thêm link bản đồ (R-86 còn yêu cầu "link bản đồ" — ghi vào residual/gap, task riêng); không đụng `supabase/**`, `.env*`, `package.json` ngoài dependency của task (`apps/api/package.json` đang có hunk `start` của USER ⇒ chỉ thêm dependency, KHÔNG sửa dòng `start`; `pnpm-lock.yaml` cập nhật bình thường).

## Test (đỏ trước)
- `mail-templates.spec.ts`: có `qrImageCid` → html chứa `<img src="cid:ticket-qr"` + alt; vẫn chứa qr_token dạng chữ; không `qrImageCid` → như cũ (không `<img src="cid:`); `extractTicketQrToken` đúng cho TICKET_ISSUED/TICKET, `null` cho kind khác/thiếu token.
- `mail-service.spec.ts`: `sendOutboxEmail("a@b.c","TICKET_ISSUED",{…qr_token})` → transport nhận `attachments` 1 phần tử `cid:"ticket-qr"`, `contentType:"image/png"`, buffer bắt đầu bằng chữ ký PNG `89 50 4E 47`, và html chứa `cid:ticket-qr`; kind khác → KHÔNG attachments; tạo ảnh lỗi (mock `qrcode` ném lỗi) → vẫn gửi, html không có `<img src="cid:`, không throw.
- **Bằng chứng QR đúng nội dung (quan trọng):** test giải mã PNG sinh ra (jsqr + pngjs hoặc tương đương) và `expect(decoded).toBe(qr_token)` cho token mẫu thực tế (~ độ dài `qr_token` thật — xem `tickets.qr_token` sinh thế nào ở migration/RPC).
- MIME thật: dùng `nodemailer` `jsonTransport`/`streamTransport` (không mạng) dựng message từ đúng options `MailService` truyền và kiểm tra có part `image/png` với `Content-ID` `<ticket-qr>` + html tham chiếu `cid:ticket-qr`.

## Files to Modify
`apps/api/src/modules/mail/{templates.ts,mail.service.ts}`, `apps/api/package.json` (dependency), `pnpm-lock.yaml`, các test mail/harness liên quan, `.context/decisions.md`, docs as-built nếu có.

## Repro Verification
- Original repro: khách thanh toán xong → mở email vé (kind `TICKET_ISSUED`).
- Expected (R-86): email có hình QR để staff quét tại rạp.
- Actual before fix: email chỉ có chữ `qr_token` trong khung chữ (templates.ts:244-246), không có ảnh.
- Actual after fix: email vé có **mỗi ghế một ảnh QR** (CID inline `ticket-qr-<n>`, nhãn ghế, chữ token dự phòng), QR mã hóa nguyên `qr_token` của đúng vé đó.
- Evidence (2026-11-17):
  - Đầu-cuối với dữ liệu thật: build API (`pnpm --filter @filmbooking/api build`), lấy 8 vé thật của đơn seed qua PostgREST (`select=qr_token,order_seats(seat_label)`), chạy `MailService` đã build + transport giả → 8 attachments `image/png`, 8 cid duy nhất, mỗi PNG giải mã (jsqr) == `qr_token` DB, html tham chiếu đủ 8 `cid:`, thứ tự D4,D9,D10,E4,E9,E10,F7,F8 (sắp xếp tự nhiên, khớp web).
  - Test tự động: api 599, web 594, shared 31, scripts 31 PASS; lint + typecheck sạch. Test đỏ trước khi sửa (builder), test giải mã PNG == token, MIME streamTransport (multipart/related, Content-ID), enrich nhiều vé (không còn `limit(1)`).
  - Reviewer NORMAL: round 1 FAIL (HIGH: mỗi ghế một vé, email chỉ có 1 QR) → sửa → round 2 PASS.
  - Chưa gửi SMTP/Gmail thật tới hộp thư; Outlook desktop có thể hiển thị ảnh CID như đính kèm (chữ token luôn có).
- Status: PASS
