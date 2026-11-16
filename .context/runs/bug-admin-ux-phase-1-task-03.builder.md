# Builder summary — bug-admin-ux phase-1-task-03

Đã làm: điều hướng theo vai trò sau đăng nhập + chuyển nhân sự khỏi nhóm `(public)`.

- `lib/auth/role-home.ts` (thuần): `roleHome`, `isStaffAllowedPath` (/admin, /staff, /tai-khoan; chuẩn hoá qua URL chống `..`), `resolvePostLoginTarget`.
- `lib/auth/load-me.ts`: `fetchMeOrNull` (mọi lỗi → null = fail-open).
- `proxy.ts`: gắn request header `x-pathname` (ghi đè; KHÔNG gọi /me).
- `app/(public)/layout.tsx`: người đã đăng nhập → 1 lệnh /me; nhân sự + pathname ngoài vùng cho phép → `redirect` (ngoài try/catch). Khách không tốn /me.
- `components/auth/staff-area-guard.tsx`: guard client cho điều hướng mềm (layout không re-render).
- `app/(auth)/dang-nhap/page.tsx`: action trả `redirectTo`; nhân sự đã đăng nhập mở /dang-nhap → redirect.
- `components/auth/login-form.tsx`: dùng `redirectTo` (vẫn sanitizeNext).
- `app/auth/callback/route.ts`: sau exchangeCodeForSession → `resolvePostLoginTarget`.

Quyết định lệch brief: STAFF → `/staff/chon-rap` (không phải `/staff`, vì /staff không có page).
Chưa chạy: `pnpm build` (tránh đụng `.next` của dev server), e2e.
