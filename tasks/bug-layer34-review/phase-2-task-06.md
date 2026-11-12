# Bug layer34-review · phase-2-task-06 — cancel_showtimes: email idempotent, không email đơn POS, xử lý đơn checked_in

- Classification / Risk: BUG · severity=medium · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M10c, MINOR #8)
- Yêu cầu: gọi lại cancel_showtimes không enqueue lại email cho đơn đã affected trước đó (lọc theo lần gọi/email_sent); đơn POS không gửi email (quyết định #8); đơn checked_in một phần xử lý theo spec (đọc spec, ghi rõ).
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
