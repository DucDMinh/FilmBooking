# Bug admin-ux · phase-1-task-02 — Khu vực admin/staff không có nút Đăng xuất

- Classification / Risk: BUG · severity=high · scope=apps/web admin + staff shell · root cause category=thiếu UI · expected review level=NORMAL · blast radius: AdminShell/StaffShell · doc impact: no doc impact · decision impact: none.
- Root cause: `signOutAction` (`apps/web/src/app/auth/actions.ts:19`) chỉ được dùng ở `components/account/delete-account-dialog.tsx:246`. `components/admin/admin-shell.tsx` (topbar: logo CINEMO + CinemaSelector) không có menu người dùng/đăng xuất; kiểm xem `app/staff` có shell tương tự cũng thiếu thì sửa luôn.
- Files to Modify:
  - `apps/web/src/components/admin/admin-shell.tsx` (+ component mới nhỏ vd `sign-out-button.tsx` dùng chung)
  - shell của `/staff` nếu thiếu
  - test: `components/admin/__tests__/shell.test.tsx` (nút có mặt; bấm gọi signOutAction rồi chuyển `/dang-nhap`)
- Acceptance:
  - Topbar admin (desktop + mobile nav) có nút "Đăng xuất"; bấm → hết phiên (cookie auth bị xoá) → về `/dang-nhap`; vào lại `/admin` bị đẩy về đăng nhập.
  - Hành vi tương tự ở `/staff`.
- Status: ready

## Repro Verification
- Original repro: đăng nhập admin@filmbooking.local → vào `/admin` → tìm cách đăng xuất
- Expected: có nút Đăng xuất
- Actual before fix: không có; kẹt trong phiên admin
- Actual after fix:
- Evidence:
- Status: PENDING
