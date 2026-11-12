# Bug layer34-review · phase-2-task-05 — RBAC theo §5.3: đóng/mở rạp chỉ Admin, báo cáo chỉ Manager/Admin

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M7)
- Yêu cầu: set_cinema_status chỉ Admin (R-32, AC-26); tách helper scope: check-in (STAFF+MANAGER) vs báo cáo (MANAGER); 4 report_* + view v_report_* không cho STAFF (sửa grant/RLS view); sửa test 043/044 đang hợp thức hoá hành vi sai; cập nhật allowlist 048 nếu đổi hàm.
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending
