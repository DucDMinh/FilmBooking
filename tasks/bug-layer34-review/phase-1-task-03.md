# Bug layer34-review · phase-1-task-03 — K3 oracle dò email công khai

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-api.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: bỏ @Public của /auth/oauth/callback-check và revoke grant anon của check_oauth_collision (tuân R-12).
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: done (builder PASS, chờ reviewer)
- Root cause: `POST /auth/oauth/callback-check` là `@Public` + `check_oauth_collision` grant anon, trả CONFLICT_EMAIL/CONFLICT_IDENTITY cho email/provider tuỳ ý -> oracle dò email (vi phạm R-12). Frontend (apps/web) không dùng endpoint này.
- Fix: bỏ `@Public` (controller), service nhận `AuthUser`, luôn dùng `user.id`/`user.email` từ JWT và bỏ qua `authenticatedUserId`/`email` client gửi (nhánh dò email không còn reachable qua API); migration 20261112050000 revoke anon/authenticated/public trên check_oauth_collision, chỉ service_role; hành vi hàm giữ nguyên.
- Repro Verification: e2e `apps/api/test/identity.e2e-spec.ts` mô tả callback-check: TRƯỚC fix 3 FAIL (anon nhận 409 thay vì 401; email người khác trả 409 CONFLICT_EMAIL; spoof authenticatedUserId nhận OK), SAU fix 21/21 PASS. pgTAP 046: anon không execute check_oauth_collision + gọi bị 42501. Status: PASS.
- Doc impact: docs/API_SPEC.md dòng IdentityModule (auth của callback-check = JWT).
- Residual risk: AC-04 pre-login collision check không còn ở API (không có consumer); AC-04 vẫn được chặn ở tầng DB bởi trigger guard_identity_insert. CONFLICT_IDENTITY còn cho user đăng nhập biết provider_id nào đã bị gắn (không lộ email), chấp nhận cho R-23.
