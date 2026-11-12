# Bug layer34-review · phase-2-task-03 — confirm_zero_amount + confirm_pos_sale dùng sell_order_seats, kiểm lại suất/rạp, FK tickets.seat_id

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M4 (phần confirm_zero_amount), residual P0-05) + scan Defect #2
- Yêu cầu: cả hai hàm chuyển sang public.sell_order_seats (không còn upsert seat_state không điều kiện); confirm_zero_amount khoá showtimes FOR SHARE + kiểm ON_SALE/rạp OPEN; tranh chấp ghế → needs_manual_review thay vì lỗi thô; thêm FK tickets.seat_id → seats(id) on delete restrict (kiểm dữ liệu trước); dọn nhánh elsif dead code confirm_zero_amount 040100:805-811. Test tranh chấp ghế cho cả hai hàm.
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
