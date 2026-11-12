# Bug layer34-review · phase-2-task-04 — hold_seats: FOR SHARE suất, kiểm rạp OPEN/phim PUBLISHED, idempotency POS sau kiểm quyền

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M4 (phần hold), M6, M8a)
- Yêu cầu: hold_seats khoá showtimes FOR SHARE; kiểm cinemas.status='OPEN' và movies.status='PUBLISHED' (R-33); tra pos_requests theo request_id CHỈ sau khi đã kiểm quyền POS và theo cặp (cinema_id, request_id), không trả booking_code đơn khác; extend_pos_hold FOR UPDATE (giới hạn số lần gia hạn nếu spec có — đọc spec, không tự đặt).
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
- Bổ sung (user ok 2026-11-12T04:25:22Z): test đồng thời 2 phiên thật (dblink, theo mẫu 047) cho hold_seats cùng ghế cùng suất — đúng 1 thành công, 1 SEAT_TAKEN; ghi nhận khoá đang nằm trên seats (vật lý) thay vì (suất, ghế) — đo ở layer-8-task-01, chỉ đổi nếu cần.
