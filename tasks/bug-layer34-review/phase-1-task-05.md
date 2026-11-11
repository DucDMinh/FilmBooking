# Bug layer34-review · phase-1-task-05 — K4 bán trùng ghế

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: unique index ghế×suất cho vé còn hiệu lực + confirm_paid kiểm tra ghế (040100_rpc_payment.sql:404-407,551-554,847-850) + test đồng thời 2 phiên bằng dblink.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
