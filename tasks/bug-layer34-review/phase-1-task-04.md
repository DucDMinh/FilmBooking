# Bug layer34-review · phase-1-task-04 — K2 liên kết MXH không có bằng chứng sở hữu (hướng a)

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-api.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: chỉ liên kết qua luồng OAuth chuẩn Supabase linkIdentity; server KHÔNG nhận providerId/identityData từ client (bỏ khỏi DTO identity.service.ts:77-97).
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
