# Bug layer34-review · phase-1-task-08 — Test phân quyền theo role cho mọi SECURITY DEFINER

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: test pgTAP liệt kê mọi hàm SECURITY DEFINER và kiểm has_function_privilege cho anon/authenticated theo bảng quyền mong đợi; chạy sau 02-06.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
