# builder 2b — feature/order-level-qr phase-2-task-02 mục 4 (email 1 QR/đơn)

Đã làm: jobs.controller enrich `orders.qr_token`; templates `extractTicketQrToken` + `qrImageCid`; mail.service 1 PNG cid `ticket-qr` / `ve-qr.png`;
test mail-templates, mail-ticket-qr, outbox-job viết lại theo 1 QR/đơn; decisions.md thêm mục "Mail vé 1 QR/đơn" + ghi chú SUPERSEDED 2 mục cũ.
Verify: lint xanh, api typecheck xanh, `pnpm test` xanh (shared 31, api 598, web 594). Web typecheck đỏ do 2a đổi ScanTicketResponse (task-03).
Mẫu email: C:\Users\Duc Dao\AppData\Local\Temp\order-qr-sample\{mail-8-ghe.html,ve-qr.png}.
Còn dở: không. Lưu ý: thư mục rỗng thừa E:\tmp-order-qr-sample (tạo nhầm) cần xoá tay.
