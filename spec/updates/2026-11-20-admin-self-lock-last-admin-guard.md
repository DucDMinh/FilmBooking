# Spec Update — 2026-11-20 admin-self-lock-last-admin-guard
**spec_version:** 3.5.1 → 3.5.2 (PATCH — làm rõ R-105 / NFR-06, thêm AC-34)
**Trigger:** bug-fix · `spec/changes/archive/2026-11-14-admin-self-lock-last-admin-guard.md` (CR-004, GAP-010) · `tasks/bug-admin-self-lock-last-admin-guard/phase-1-task-01.md` (reviewer STRICT PASS round 6)

## Requirements
Bug: Admin có thể tự khoá tài khoản mình, tự gỡ quyền Admin của mình, hoặc khoá / gỡ quyền / xoá Admin cuối cùng (kể cả hai Admin cùng gỡ nhau đồng thời, Admin cuối gọi `DELETE /me`, Admin cuối gỡ liên kết Facebook) → chuỗi còn 0 Admin, chỉ khôi phục được bằng SQL tay.

- **SỬA (làm rõ) R-105:** thêm: hệ thống luôn giữ **ít nhất một Admin hoạt động**; Admin không tự khoá / không tự gỡ quyền Admin của chính mình; không thể khoá, gỡ quyền hoặc xoá (gồm tự xoá tài khoản, gỡ liên kết Facebook) Admin hoạt động cuối cùng — vi phạm bị từ chối **409** (`CONFLICT`, riêng gỡ Facebook là `LAST_ADMIN`) và không đổi dữ liệu; an toàn khi nhiều yêu cầu đồng thời.
- **Định nghĩa "Admin hoạt động" — quyết định do user chốt (2026-11-20, sau 3 vòng review FAIL):** có role ADMIN **và** không xoá mềm **và** không bị khoá **và** (email đã xác nhận **hoặc** có identity Facebook). Lý do: khớp ngoại lệ cron xoá tài khoản chưa xác nhận (R-10, R-19; quyết định #14/#18) — Admin chưa xác nhận email không được tính (cron sẽ xoá họ), còn Admin đăng nhập Facebook không email thì được tính (cron không xoá); nhờ đó cron `delete_unconfirmed_users` không bao giờ bị chặn bởi ràng buộc này.
- **SỬA (làm rõ) NFR-06:** ràng buộc "luôn còn ≥ 1 Admin hoạt động" được cưỡng chế ở API và tầng DB.
- **THÊM AC-34** (CR-004): tự khoá / tự gỡ → 409; Admin hoạt động cuối bị khoá / gỡ / xoá → 409; còn Admin khác thì cho phép; Admin chưa xác nhận email không được tính trừ khi có Facebook; hai Admin gỡ nhau đồng thời vẫn còn ≥ 1; cron xoá tài khoản chưa xác nhận vẫn chạy.
- **Không đổi** requirement nào khác. Cập nhật dòng tổng kết: 30/30 AC còn hiệu lực (AC-01…AC-34).

## Hiện thực (tham khảo)
Migration `supabase/migrations/20261119100000_last_active_admin_guard.sql` (hàm `is_last_active_admin` + advisory lock + trigger `FB409` trên `user_roles`, `auth.users`, `auth.identities`; không đổi/xoá dữ liệu); `users.controller.ts` (tự khoá / tự gỡ / tra sớm Admin cuối), `profile.service.ts` (`DELETE /me`), `identity.service.ts` (`DELETE /me/identities/:provider`); `docs/API_SPEC.md`, `docs/ERD.md`.

## Ảnh hưởng
Module: `apps/api` admin users, profile, identity; `supabase` (migration + pgTAP 066/068/069); `packages/shared` (`database.types.ts`).
Test: 409 ở `PATCH /admin/users/:id/lock`, `PATCH|DELETE .../admin-role|roles/admin`, `DELETE /me`, `DELETE /me/identities/:provider`; hồi quy đăng nhập/đăng ký/đổi email GoTrue (trigger trên `auth.users`), seed Admin demo, luồng gán vai trò & rạp, xoá tài khoản khách, cron `delete_unconfirmed_users`.
Lưu ý: bên test cần DB có ≥ 2 Admin hoạt động; 13 file pgTAP cũ đỏ trên DB local bẩn (seed demo) từ trước, không do thay đổi này.
