# Bug admin-self-lock-last-admin-guard · phase-1-task-01 — chặn Admin tự khoá / tự gỡ Admin và giữ Admin cuối (CR-004, GAP-010)

- Classification / Risk: BUG (bảo mật/phân quyền) · severity=high (P1) · scope=apps/api admin users, supabase migration + pgTAP, (web nếu cần hiển thị lỗi) · expected review level=STRICT (auth/RBAC, DB/migration, race) · blast radius: `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role`, mọi đường xoá/đổi `user_roles` và khoá user (kể cả `role-assign` gán vai trò khác thay Admin), RLS `user_roles_admin_delete` · migration: có (trigger/lock ở DB) → gắn HIGH_RISK_MIGRATION chỉ nếu có thao tác phá huỷ (dự kiến KHÔNG: chỉ thêm hàm + trigger, không đổi/xoá dữ liệu) · doc impact: R-105 (dispatcher/spec-publisher thêm câu, PATCH), `docs/API_SPEC.md` (mã lỗi 409/422), `docs/ERD.md` nếu thêm hàm/trigger đáng ghi.
- Root cause (từ change doc, cần builder xác minh trên code): `users.controller.ts` `lockUser` (~:120) và `applyAdminRole` (~:315) không kiểm "chính mình" hay "Admin cuối"; RLS `user_roles_admin_delete` chỉ kiểm `is_admin()`; web (layer-7 task-07) chỉ disable nút nên gọi API trực tiếp hoặc 2 Admin gỡ nhau đồng thời → chuỗi còn 0 Admin.
- Hướng sửa:
  1. API: tự khoá chính mình, tự gỡ quyền Admin của chính mình → lỗi nghiệp vụ 409 (hoặc 422) với message tiếng Việt rõ, không đổi dữ liệu. Dùng đúng kiểu exception/mã lỗi sẵn có của module (xem `AppException` và cách các lỗi khác trả).
  2. DB là hàng rào cuối: ngăn khoá/gỡ Admin cuối cùng ngay ở tầng DB, an toàn khi 2 request đồng thời (trigger BEFORE UPDATE/DELETE trên `user_roles` và nơi lưu trạng thái khoá user, hoặc hàm RPC có `pg_advisory_xact_lock`/`SELECT ... FOR UPDATE` trên tập Admin hoạt động rồi đếm). Chú ý "Admin hoạt động" = có role ADMIN và tài khoản không bị khoá. Bao phủ mọi đường: gỡ role Admin, đổi role Admin sang role khác, khoá user, xoá user_roles, xoá user (cascade) nếu có thể. Không chặn thao tác bình thường khi còn ≥ 1 Admin khác.
  3. Migration versioned mới (timestamp sau `20261118110000`), không sửa migration cũ; viết idempotent/an toàn; không đụng dữ liệu hiện có.
  4. Test: e2e API (tự khoá, tự gỡ → 409/422 không đổi dữ liệu; gỡ Admin cuối → bị chặn; còn Admin khác → cho phép) + pgTAP (`supabase/tests/0NN_*.test.sql`: chặn gỡ/khoá Admin cuối; đồng thời nếu khả thi theo mẫu `064_order_level_qr_concurrency.test.sql` dblink). Cập nhật `090_rls_matrix` nếu cần.
- Acceptance: (từ `spec/changes/2026-11-14-admin-self-lock-last-admin-guard.md`)
  - Tự khoá / tự gỡ Admin của chính mình → 409/422, không đổi dữ liệu.
  - Gỡ/khoá Admin cuối cùng bị chặn ở tầng DB, an toàn khi 2 request đồng thời.
  - Test e2e API + pgTAP cho các ca trên.
- Status: done (reviewer STRICT PASS round 6)

## Repro Verification
- Original repro: Admin duy nhất gọi `PATCH /admin/users/:id/lock` hoặc `.../admin-role` (isAdmin=false) / `DELETE /admin/users/:id/roles/admin` lên chính mình; hoặc 2 Admin gỡ/khoá nhau đồng thời; hoặc Admin cuối gọi `DELETE /me`.
- Expected: 409 `CONFLICT`, không đổi dữ liệu; luôn còn ≥ 1 Admin hoạt động.
- Actual before fix: thành công, chuỗi có thể còn 0 Admin (chỉ khôi phục bằng SQL).
- Actual after fix: API chặn tự khoá / tự gỡ chính mình (409); tra sớm `is_last_active_admin` (409); DB là hàng rào cuối: advisory lock + trigger FB409 trên `user_roles`, `auth.users`, `auth.identities`; `DELETE /me` và `DELETE /me/identities/:provider` map FB409 → 409 (không còn ẩn danh hoá rồi 500).
- Quyết định kiến trúc (user chốt 2026-11-20 sau 3 vòng FAIL): **Admin hoạt động = có role ADMIN + không xoá mềm + không bị khoá + (email_confirmed_at not null HOẶC có identity facebook)**, khớp ngoại lệ cron `delete_unconfirmed_users` (R-19, quyết định #14/#18).
- Evidence:
  - pgTAP: 068 (38 test: ca Admin chưa xác nhận không được đếm, Admin facebook không email được đếm, cron thật `delete_unconfirmed_users()` chạy được, gỡ identity facebook của Admin cuối bị chặn…), 069 (10 test đồng thời qua dblink, 3 vòng), 066 (60/60, sửa thứ tự fixture vì Admin seed trở thành Admin hoạt động duy nhất; trigger không nới).
  - e2e API: `admin.e2e-spec.ts` (tự khoá, tự gỡ PATCH/DELETE, Admin cuối, còn Admin khác, race), `profile.e2e-spec.ts` (3 ca `DELETE /me`), `identity.e2e-spec.ts` (gỡ Facebook của Admin cuối → 409 `LAST_ADMIN`).
  - lint, typecheck, test (shared 31, api 673, web 664, scripts 31), build: PASS.
  - Reports: `.context/review-reports/bug-admin-self-lock-last-admin-guard-phase-1-task-01-round-{1..6}-review.md` (round 1–5 FAIL, mỗi vòng một lỗi khác: `DELETE /me` 500, Admin chưa xác nhận email + cron kẹt, Admin Facebook không email bị chặn sai, `unlinkIdentity` 500, pgTAP 066 fixture; round 6 STRICT PASS).
- Residual: 13 file pgTAP cũ (010, 020, 030, 031, 033, 040–044, 050, 063, 090) đỏ trên DB local vì seed demo (`provinces_name_key`/`price_rules_chain_key`), có từ trước; đã rà grep: không file nào ngoài 066 chạm trigger mới, nhưng chưa xác nhận trên DB sạch (`db reset` bị cấm). Deadlock 40P01 hiếm khi nhiều dòng cùng lúc (API 500 cho bên bị huỷ). Race `email_confirmed_at = null` × xoá identity Facebook cùng một Admin chỉ xảy ra khi chạy SQL tay đồng thời (app không có đường đặt email về null). Cleanup của 069 cần DB có Admin seed. Web chưa kiểm tra hiển thị 409 (dialog xác nhận có hiển thị message theo reviewer). 2 test web flaky `account.test.tsx` có sẵn → CR-013.
- Doc impact: `docs/API_SPEC.md` (409), `docs/ERD.md` (6 hàm, 5 trigger, FB409, advisory lock), `SPECIFICATIONS.md` R-105 (spec-publisher, PATCH 3.5.2).
- Status: PASS
