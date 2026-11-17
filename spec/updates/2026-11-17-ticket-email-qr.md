# Spec Update — 2026-11-17 ticket-email-qr
**spec_version:** 3.2.0 → 3.2.0 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · `tasks/bug-ticket-email-qr/phase-1-task-01.md` (review NORMAL PASS round 2; round 1 FAIL do email chỉ có 1 QR cho đơn nhiều ghế)

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Đây là đưa email vé về đúng requirement đã có: **R-86** ("Email gồm: mã đặt vé, **QR**, …") và **R-85** (mỗi đơn đã thanh toán có mã QR chứa token ngẫu nhiên; mỗi ghế một vé với `qr_token` riêng). Liên quan soát vé: **R-98**, **R-99**, **AC-12**, **AC-13**; nội dung lưu ý **R-133** giữ nguyên.

## Lỗi đã sửa (API, không đổi DB/web/contract)
1. Email vé chỉ in chữ `qr_token`, không có hình QR nên staff không quét được từ email. Nay mỗi ghế một ảnh QR PNG nhúng bằng CID inline attachment (`cid:ticket-qr-<n>`; Gmail/Outlook chặn `data:` URI), mã hoá nguyên `qr_token` của vé đó, errorCorrectionLevel M (khớp trang vé web); chữ token vẫn có bên dưới mỗi ảnh và trong phần `text` (dự phòng khi client chặn ảnh).
2. Job `POST /jobs/send-emails` (`enrichTicketPayload`) trước chỉ lấy 1 vé (`.limit(1).maybeSingle()`, không ORDER BY) nên đơn N ghế chỉ có token của 1 ghế bất kỳ. Nay lấy tất cả vé của đơn (`qr_token, order_seats(seat_label)`), sắp xếp tự nhiên theo nhãn ghế (A2 < A10, khớp trang vé web), ghi `payload.tickets`.
3. `MailTransport.sendMail` thêm `attachments?`; dependency mới `qrcode`. Trần 10 ảnh/mail (vé thứ 11 trở đi chỉ có chữ token); lỗi tạo ảnh không chặn gửi mail (log warn không chứa token).

## Ảnh hưởng
- Module: `api-mail` (`templates.ts`, `mail.service.ts`), `api-jobs` (`jobs.controller.ts`), `apps/api/package.json`, `pnpm-lock.yaml`; test `mail-templates.spec.ts`, `mail-ticket-qr.spec.ts` (mới), `outbox-job.e2e-spec.ts`.
- Test: email vé đơn 1 ghế và nhiều ghế (nhãn, thứ tự tự nhiên, mỗi ảnh quét ra đúng `qr_token`), staff `/staff/soat-ve` quét từng QR check-in từng ghế, fallback chữ token, đơn > 10 ghế, lỗi tạo ảnh không chặn gửi, enrich tickets trong job. Regression: các kind mail khác (không attachments), giao diện CINEMO/tiếng Việt, nội dung R-86/R-133, mail Supabase Auth không đổi.
- Không đổi DB / schema / API contract / web.
- Residual: chưa kiểm hiển thị Gmail/Outlook thật (Outlook desktop có thể hiện CID như đính kèm); R-86 còn thiếu "link bản đồ" trong email vé (gap, cần Change Request riêng); outbox cũ có sẵn `qr_token` đơn lẻ vẫn chỉ 1 QR; API đang chạy phải build lại + restart để có hiệu lực.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 24, specVersion 3.2.0, risk medium (không đổi cấp quyền/contract/DB, `qr_token` vốn đã nằm trong email dạng chữ; nhưng có dependency mới, MIME attachment, mọi mail vé và bước enrich trong job đều bị ảnh hưởng, chưa kiểm client mail thật).
