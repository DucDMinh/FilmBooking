# Bug layer34-review · phase-2-task-02 — confirm_paid: hết hạn → nhánh tiền về muộn, kiểm lại suất/rạp/khoá ghế, cutoff, voucher, idempotent

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M1c, M3, M4 (phần confirm_paid), M5, M9, M10a)
- Yêu cầu: Case A: nếu hold_expires_at <= now() thì đi case B; khoá showtimes FOR SHARE và kiểm ON_SALE + rạp OPEN + chưa qua cutoff (đọc app_settings bằng #>> '{}' — sửa M9 ở mọi nơi); ghế bị khoá → needs_manual_review (không raise); case B hồi sinh voucher: khoá voucher FOR UPDATE + kiểm total_uses_limit/per_user_limit, hết lượt → needs_manual_review (quyết định nghiệp vụ chờ user duyệt); nhánh lệch tiền + mọi nhánh: webhook retry khi đơn đã needs_manual_review/paid không ghi trùng audit/email. Phụ thuộc task-01.
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
- Quyết định user (2026-11-12T04:25:22Z): voucher hết lượt khi tiền về muộn → (a) needs_manual_review (không chốt vé vượt trần).
