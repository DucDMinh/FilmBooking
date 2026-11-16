# builder bug-admin-ux phase-1-task-02
- Thêm `components/common/sign-out-button.tsx` (signOutAction -> replace /dang-nhap + refresh, pending/disable, toast lỗi).
- Gắn vào admin-shell topbar (md+), AdminMobileNav Sheet footer, header `/staff/layout.tsx`.
- Test: `components/admin/__tests__/sign-out.test.tsx` (5 test). lint/typecheck/test apps/web PASS.
- signOutAction không đổi (đã xoá sb-* và fb-remember). Chưa commit; chờ reviewer.
- Còn dở: không có.
