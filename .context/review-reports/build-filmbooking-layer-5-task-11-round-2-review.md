# Review Report: build-filmbooking layer-5-task-11 (Round 2)

**Agent: reviewer**  
**Review Level:** `STRICT` (Phạm vi đụng chạm trực tiếp Auth, Mật khẩu, Xoá tài khoản / Soft-delete / PII scrub, Storage avatar)  
**Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-11`  
**Verdict:** **STRICT PASS**

---

## 1. Tóm tắt kết quả thẩm tra Round 2 (Executive Summary)

Trong đợt Review Round 2, tôi đã tiến hành thẩm tra độc lập toàn diện công tác khắc phục các khiếm khuyết được chỉ ra từ Round 1 đối với task `layer-5-task-11` (Màn 15: Tài khoản người dùng, Rạp yêu thích, Cài đặt thông báo & email, UnverifiedEmailBanner, và các luồng nhạy cảm Avatar/Đổi mật khẩu/Đổi email/Xoá tài khoản).

Tất cả 4 defect (Defect 1: CRITICAL, Defect 2: MAJOR, Defect 3: MINOR, Defect 4: MINOR) đã được Builder khắc phục triệt để, đúng đặc tả kiến trúc và quy chuẩn codebase:
1. **Defect 1 (CRITICAL - State Gap):** Đã sửa điều kiện render `ChangePasswordForm` tại `page.tsx` thành `{hasPassword && profile.email ? <ChangePasswordForm ... /> : null}`, đồng thời truyền `hasPassword` vào `ProfileForm` và `DeleteAccountDialog` để tài khoản Google OAuth-only không bị chặn bởi form mật khẩu.
2. **Defect 2 (MAJOR - DoD Testing):** Đã bổ sung bộ kiểm thử tự động toàn diện `apps/web/src/components/account/__tests__/account.test.tsx` (11 unit/component tests) phủ 4 chức năng trọng yếu (`UnverifiedEmailBanner`, `AvatarUpload`, `ChangePasswordForm`, `DeleteAccountDialog`). Tất cả test suites đều chạy thành công.
3. **Defect 3 (MINOR - Code Quality):** Đã tách thành công `ChangeEmailDialog` sang component riêng `apps/web/src/components/account/change-email-dialog.tsx` (138 dòng). File `profile-form.tsx` giảm xuống 291 dòng, tuân thủ nghiêm ngặt quy định file component ≤ 300 dòng.
4. **Defect 4 (MINOR - Memory Leak):** Đã bổ sung cơ chế thu hồi `URL.revokeObjectURL(previewUrl)` khi người dùng chọn ảnh mới, khi bấm huỷ xem trước, và `useEffect` cleanup khi component `AvatarUpload` unmount.

---

## 2. Kiểm chứng chi tiết việc khắc phục 4 Defect từ Round 1

### ✅ Defect 1: Ẩn form Đổi mật khẩu cho user OAuth-only
- **Vị trí kiểm chứng:** [apps/web/src/app/(public)/tai-khoan/page.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/app/(public)/tai-khoan/page.tsx#L84-L89)
- **Đánh giá:**
  - Tại dòng 87-89: Điều kiện `{hasPassword && profile.email ? (<ChangePasswordForm userEmail={profile.email} />) : null}` đảm bảo chỉ người dùng có phương thức đăng nhập email/mật khẩu trong `identities` mới nhìn thấy form Đổi mật khẩu.
  - Tại dòng 84: Cờ `hasPassword` tiếp tục được truyền vào `ProfileForm` -> `DeleteAccountDialog`. Khi tài khoản là OAuth-only (`hasPassword === false`), `DeleteAccountDialog` không đòi hỏi người dùng phải nhập mật khẩu để xoá tài khoản.

### ✅ Defect 2: Bổ sung bộ test tự động đạt chuẩn DoD
- **Vị trí kiểm chứng:** [apps/web/src/components/account/__tests__/account.test.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/components/account/__tests__/account.test.tsx)
- **Đánh giá:** 11 test cases đã được xây dựng và pass 100%:
  1. `UnverifiedEmailBanner`:
     - Ẩn khi `emailConfirmed === true` hoặc không có email.
     - Hiển thị thông báo khi `emailConfirmed === false`.
     - Click "Gửi lại email" gọi đúng API `POST /auth/resend-confirmation` và kích hoạt đếm ngược 60s.
  2. `AvatarUpload`:
     - Chặn các định dạng file không hợp lệ (.pdf, .txt).
     - Chặn file có kích thước > 2MB.
     - Kích hoạt preview ảnh hợp lệ và cho phép bấm huỷ để giải phóng object URL.
  3. `ChangePasswordForm`:
     - Validate input rỗng, độ dài < 8 ký tự, mật khẩu xác nhận không khớp.
     - Xử lý lỗi mật khẩu cũ không đúng từ Supabase Auth `signInWithPassword`.
  4. `DeleteAccountDialog`:
     - Bước 1: Vô hiệu hoá nút Tiếp tục nếu chưa tích checkbox cam kết mất vé.
     - Bước 1: Tích checkbox mở khoá chuyển sang Bước 2.
     - Bước 2: Nút Xoá bị vô hiệu hoá nếu không gõ chính xác cụm từ `XOÁ TÀI KHOẢN` hoặc thiếu mật khẩu (với tài khoản có mật khẩu).

### ✅ Defect 3: Độ dài file `profile-form.tsx` ≤ 300 dòng
- **Vị trí kiểm chứng:** [apps/web/src/components/account/profile-form.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/components/account/profile-form.tsx) và [apps/web/src/components/account/change-email-dialog.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/components/account/change-email-dialog.tsx)
- **Đánh giá:**
  - `profile-form.tsx`: 291 dòng (đạt chuẩn ≤ 300 dòng).
  - `change-email-dialog.tsx`: 138 dòng (đạt chuẩn ≤ 300 dòng).
  - Tách bạch rõ ràng giữa logic form cập nhật thông tin cá nhân và modal dialog đổi địa chỉ email.

### ✅ Defect 4: Thu hồi Object URL tránh rò rỉ bộ nhớ trong `AvatarUpload`
- **Vị trí kiểm chứng:** [apps/web/src/components/account/avatar-upload.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/components/account/avatar-upload.tsx#L42-L49)
- **Đánh giá:**
  - Thêm `useEffect` cleanup:
    ```tsx
    useEffect(() => {
      return () => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      };
    }, [previewUrl]);
    ```
  - Thu hồi URL cũ trước khi tạo URL mới khi chọn ảnh liên tiếp (`handleFileChange`).
  - Thu hồi URL khi bấm nút Huỷ xem trước (`handleCancelPreview`).

---

## 3. Thẩm tra Cross-Boundary & Schema Audit

| Thành phần | Endpoint Backend | Quyền hạn / RLS | Trạng thái đối chiếu |
|---|---|---|---|
| Hồ sơ người dùng | `GET /me/profile` | `auth.uid() = id` trên `profiles` | Khớp schema (`fullName`, `phone`, `gender`, `avatarUrl`) |
| Cập nhật hồ sơ | `PATCH /me/profile` | Zod schema strict, validate số điện thoại VN | Khớp schema |
| Đổi email | `POST /me/email` | GoTrue user update, yêu cầu xác nhận 2 đầu | Khớp contract |
| Tải avatar | `POST /me/avatar` | Supabase Storage bucket `avatars` | Khớp mime types và 2MB size limit |
| Cài đặt thông báo | `PUT /me/preferences` | `profiles.marketing_opt_in` | Khớp contract |
| Rạp yêu thích | `PUT /me/favorites/:id`, `DELETE /me/favorites/:id` | Bảng `favorite_cinemas` | Khớp UUID param |
| Xoá tài khoản | `DELETE /me` | Soft-delete, anonymize PII, revoke sessions | Khớp payload (`acknowledgeTicketLoss: true`, `password?`) |
| Gửi lại email xác nhận | `POST /auth/resend-confirmation` | Rate limit 60s, background mail outbox | Khớp contract |

---

## 4. Kết quả chạy Verify Commands

Thực hiện kiểm tra tự động trên worktree `E:\FilmBooking\.worktrees\layer-5__task-11`:

1. **TypeScript Typecheck:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-5__task-11"; pnpm -w typecheck
   ```
   **Kết quả:** `PASS` (0 lỗi typecheck trên toàn bộ packages/shared, apps/api, apps/web).

2. **ESLint:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-5__task-11"; pnpm -w lint
   ```
   **Kết quả:** `PASS` (0 lỗi eslint).

3. **Oxlint:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-5__task-11"; npx oxlint apps/web/src/components/account apps/web/src/components/shell/unverified-email-banner.tsx "apps/web/src/app/(public)/tai-khoan"
   ```
   **Kết quả:** `PASS` (11 files, 0 warnings, 0 errors).

4. **Unit & Component Testing:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-5__task-11"; pnpm --filter @filmbooking/web test
   ```
   **Kết quả:** `PASS` (9 test suites, 104 tests passed, bao gồm 11 tests mới trong `account.test.tsx`).

5. **Production Build:**
   ```powershell
   cd "E:\FilmBooking\.worktrees\layer-5__task-11"; pnpm --filter @filmbooking/web build
   ```
   **Kết quả:** `PASS` (Turbopack compile thành công, sinh đầy đủ các routes `/tai-khoan`, `/tai-khoan/rap-yeu-thich`, `/tai-khoan/thong-bao`).

---

## 5. Kết luận

Mọi defect từ Round 1 đã được sửa chữa chuẩn mực và triệt để. Codebase đáp ứng toàn bộ các tiêu chí:
- Yêu cầu chức năng và trải nghiệm người dùng theo `design-spec.md` Màn 15.
- Phòng vệ biên giới dữ liệu & auth (OAuth vs Email/Password, xóa tài khoản nhiều bước, PII anonymization).
- Quy chuẩn độ dài file (≤ 300 dòng) và dọn dẹp tài nguyên browser (Object URL).
- DoD kiểm thử tự động với 11 test cases chất lượng cao.
- Toàn bộ pipeline typecheck, lint, oxlint, unit test, production build xanh 100%.

**Verdict:** **STRICT PASS**
