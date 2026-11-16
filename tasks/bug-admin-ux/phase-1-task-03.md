# Bug admin-ux · phase-1-task-03 — Nhân sự đăng nhập vẫn về trang khách; cần chuyển hướng theo vai trò

- Classification / Risk: BUG (hành vi phân quyền điều hướng, user duyệt 2026-11-16) · severity=medium · scope=apps/web auth flow + (public) layout · expected review level=STRICT (auth/RBAC/redirect, risk redirect loop/open-redirect) · blast radius: mọi trang (public), login, OAuth callback · doc impact: spec delta ghi qua spec-publisher (không sửa intent docs) · decision impact: append `.context/decisions.md`.
- Root cause: `components/auth/login-form.tsx:61` luôn đi tới `safeNext ?? "/"`; `proxy.ts` chỉ chặn người CHƯA đăng nhập ở `/admin`, `/staff`, không phân vai trò. Admin/Manager/Staff đăng nhập xong vào trang khách (không đặt vé được, vô nghĩa) và không có đường quay lại.
- Quyết định đã duyệt:
  1. ADMIN và MANAGER → `/admin`; STAFF → `/staff`; CUSTOMER giữ nguyên.
  2. Nhân sự (ADMIN/MANAGER/STAFF) vào bất kỳ trang thuộc `(public)` (`/`, `/phim`, `/rap`, `/dat-ve/...`…) → chuyển về khu vực của họ, TRỪ `/tai-khoan/*` (đổi mật khẩu/đăng xuất vẫn dùng được). Tài khoản nhiều vai: ưu tiên ADMIN > MANAGER > STAFF (dùng đúng `resolveAdminRole` ở `components/admin/nav-config.ts`).
  3. Áp dụng cả đăng nhập mật khẩu lẫn OAuth callback (`app/auth/...`). `next` hợp lệ trỏ vào `/admin*`/`/staff*` vẫn được tôn trọng; `next` trỏ trang khách của nhân sự → bỏ qua, dùng trang chủ vai trò. Giữ `sanitizeNext` chống open-redirect.
- Yêu cầu thiết kế: không gọi `/me` ở mọi request trong `proxy.ts` nếu không cần; ưu tiên làm ở server component layout `(public)` (+ sau đăng nhập). Không tạo vòng lặp redirect (`/admin` layout đang redirect `/khong-co-quyen` khi không có vai trò — customer vào `/admin` không được đẩy sang trang khách rồi lặp).
- Files to Modify (dự kiến): `apps/web/src/app/(public)/layout.tsx`, `components/auth/login-form.tsx` và/hoặc `app/(auth)/dang-nhap/page.tsx`, OAuth callback, helper mới `lib/auth/role-home.ts`, test tương ứng.
- Acceptance:
  - admin@ đăng nhập mật khẩu → `/admin`; manager.hn01@ → `/admin`; staff.hn01@ → `/staff`; customer@ → `/` (như cũ).
  - admin đã đăng nhập gõ `/`, `/phim`, `/dat-ve/<id>` → về `/admin`; gõ `/tai-khoan/bao-mat` → vẫn vào được.
  - customer vào `/admin` → `/khong-co-quyen` (không loop).
  - Test unit cho helper vai trò → đích; test layout redirect; lint/typecheck/test/build PASS.
- Status: ready (chạy SAU task-02 để khu vực admin đã có nút Đăng xuất)

## Repro Verification
- Original repro: đăng nhập admin@filmbooking.local qua `/dang-nhap`
- Expected: vào `/admin`; không vào được trang khách
- Actual before fix: về `/` (trang khách), vào được mọi trang khách
- Actual after fix:
- Evidence:
- Status: PENDING
