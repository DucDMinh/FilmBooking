# Bug layer34-review · phase-1-task-02 — K1 RPC identity cho anon

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: migration mới revoke anon trên link/unlink_user_identity, get_user_identities, mark_password_set; hàm raise khi auth.uid() null; test pgTAP set role anon bị từ chối.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: done (builder PASS, chờ reviewer)
- Root cause: 20261111040500_identity_hooks.sql (a) giữ default grant của Supabase (anon/authenticated có EXECUTE trên hàm public mới), (b) kiểm quyền `auth.uid() is not null and auth.uid() <> p_user_id` bị bỏ qua khi `auth.uid()` null -> anon gọi qua PostgREST get/link/unlink/mark_password_set cho user bất kỳ.
- Fix: migration mới `supabase/migrations/20261112050000_identity_rpc_hardening.sql`: helper `assert_identity_rpc_caller` (auth.uid() null => bắt buộc auth.role()='service_role', else raise 42501; có uid => chỉ chính mình; bỏ is_admin), 4 hàm CREATE OR REPLACE dùng helper (giữ search_path = public, auth, pg_temp), revoke all from public/anon/authenticated, grant chỉ service_role (API gọi bằng supabase.admin()). 045 thêm claims role=service_role vì hàm giờ fail-closed.
- Repro Verification: test mới `supabase/tests/046_identity_rpc_privileges.test.sql` (26 test). TRƯỚC migration: 19/26 FAIL (anon/authenticated có EXECUTE, gọi anon thành công, owner không claims không bị raise). SAU migration: 046 26/26 PASS, 045 18/18 PASS. Status: PASS.
- Doc impact: docs/ERD.md (ghi grant/hardening); docs/API_SPEC.md không đổi cho K1; packages/shared/src/database.types.ts regen (+assert_identity_rpc_caller).
- Residual risk: chạy full `supabase test db` thấy 10 file khác (010..044) lỗi duplicate `provinces_name_key` do DB local còn dữ liệu demo seed cũ; cần `supabase db reset` (bị agent-guard chặn với builder) - không liên quan thay đổi này. Nếu sau này có client dùng JWT user gọi trực tiếp các RPC này sẽ bị từ chối (chủ ý).
