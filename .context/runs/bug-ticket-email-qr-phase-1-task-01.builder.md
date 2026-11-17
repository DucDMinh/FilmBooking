# Builder summary - bug-ticket-email-qr phase-1-task-01

- Done: mail vé có ảnh QR PNG inline CID `ticket-qr` (qrcode, level M, width 440, nội dung = nguyên qr_token); fallback chỉ chữ khi tạo ảnh lỗi.
- Files: apps/api/src/modules/mail/{templates,mail.service}.ts; test: mail-templates.spec.ts (+), mail-ticket-qr.spec.ts (mới); deps: qrcode, @types/qrcode, jsqr, pngjs, @types/pngjs; pnpm-lock.yaml; .context/decisions.md.
- Verify: pnpm lint OK, pnpm typecheck OK, pnpm test: api 589/589, shared 31/31, web 594/594 (lần chạy đầu 2 test web account.test.tsx timeout 5s do tải, chạy lại PASS).
- Còn dở: link bản đồ trong mail vé (R-86) - task riêng; primary điền Repro Verification.

## Round 2 (sau reviewer FAIL F1)
- Mỗi ghế một QR: jobs.controller enrich lấy tất cả vé + order_seats(seat_label), sắp xếp tự nhiên -> payload.tickets; templates.extractTicketQrs/readTicketQrs (một nơi đọc token); mail.service N PNG cid ticket-qr-<n>, trần MAX_TICKET_QR_IMAGES=10.
- Test: api 600/600, shared 31, web 594 (xanh). Mẫu 3 ghế: %TEMP%\filmbooking-ticket-email-sample-3seats.
