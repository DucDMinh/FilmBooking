---
id: admin-self-lock-last-admin-guard
type: bug
status: pending
created: 2026-11-14
---

# API chặn Admin tự khoá / tự gỡ quyền Admin và giữ Admin cuối cùng

## Yêu cầu
API cho phép Admin tự khoá tài khoản mình, tự gỡ quyền Admin của mình, và gỡ Admin cuối cùng của chuỗi. Web (layer-7 task-07) chỉ disable nút thao tác với chính mình; gọi API trực tiếp hoặc hai Admin gỡ nhau gần như cùng lúc → chuỗi mất hết Admin, chỉ khôi phục bằng SQL.

## Bối cảnh / tái hiện (bug)
- Màn/route/role: `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role` (`users.controller.ts` `lockUser`, `applyAdminRole`); RLS `user_roles_admin_delete` chỉ kiểm `is_admin()`.
- Bước tái hiện: Admin duy nhất gọi API gỡ quyền Admin của chính mình; hoặc 2 Admin gỡ nhau đồng thời.
- Expected: 409/422 khi tự khoá/tự gỡ; không bao giờ còn 0 Admin.
- Actual: thành công, chuỗi có thể còn 0 Admin.

## Acceptance (bắt buộc)
- [ ] Tự khoá / tự gỡ Admin của chính mình → 409/422, không đổi dữ liệu.
- [ ] Gỡ/khoá Admin cuối cùng bị chặn ở tầng DB (trigger hoặc lock trong transaction) — an toàn khi 2 request đồng thời.
- [ ] Test e2e API + pgTAP cho các ca trên.

## Ghi chú
GAP-010 (R-105, NFR-06). Nguồn: layer-7 task-07 review r1/r2 + phase review. P1.
