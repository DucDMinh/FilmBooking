# Review Report: build-filmbooking layer-5-task-11 (Round 1)

**Agent: reviewer**  
**Review Level:** `STRICT` (Phạm vi đụng chạm trực tiếp Auth, Mật khẩu, Xoá tài khoản / Soft-delete / PII scrub, Storage avatar)  
**Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-11`  
**Verdict:** **FAIL**

---

## 1. Tóm tắt kết quả thẩm tra (Executive Summary)

Task `layer-5-task-11` triển khai Màn 15 (Tài khoản người dùng), các màn con (Rạp yêu thích, Cài đặt thông báo & email), các dialog thao tác nhạy cảm (Đổi mật khẩu, Đổi email, Xoá tài khoản nhiều bước, Upload avatar) và `UnverifiedEmailBanner` trong layout công khai.

Hầu hết các luồng giao diện chính, accessibility, responsive, design tokens và việc mapping endpoint backend REST API (`/me/profile`, `/me/email`, `/me/avatar`, `/me/favorites/:cinemaId`, `/me/preferences`, `/me`, `/auth/resend-confirmation`) được tích hợp chính xác.

Tuy nhiên, theo các nguyên tắc kiểm tra nghiêm ngặt (Adversarial Review) và DoD của task:
1. **Lỗi logic hiển thị form đổi mật khẩu cho tài khoản OAuth (`apps/web/src/app/(public)/tai-khoan/page.tsx:87`)**: State `hasPassword` đã được tính toán từ danh sách identities của Supabase nhưng không được đưa vào điều kiện render, khiến người dùng đăng nhập bằng Google OAuth vẫn thấy form "Đổi mật khẩu" và không thể thực hiện do không có mật khẩu cũ.
2. **Vi phạm DoD - Thiếu bộ test tự động (`Tests added + pass`)**: Chưa có file test nào được bổ sung để kiểm chứng các tính năng then chốt (`UnverifiedEmailBanner`, `AvatarUpload`, `ChangePasswordForm`, `DeleteAccountDialog`).
3. **Quy chuẩn Code Quality - Độ dài file vượt trần (`apps/web/src/components/account/profile-form.tsx`)**: File dài 409 dòng (vượt ngưỡng ≤ 300 dòng theo quy định hệ thống).
4. **Nguy cơ rò rỉ bộ nhớ (Memory Leak) trong `AvatarUpload` (`apps/web/src/components/account/avatar-upload.tsx`)**: Chưa thu hồi `URL.revokeObjectURL` khi người dùng chọn đổi ảnh liên tiếp hoặc khi component unmount.

---

## 2. Danh sách khiếm khuyết chi tiết (Defect Details)

### 🔴 Defect 1 (CRITICAL - Functional & State Gap): Hiển thị form Đổi mật khẩu cho tài khoản chỉ đăng nhập bằng Google OAuth
- **Vị trí:** [page.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/app/(public)/tai-khoan/page.tsx#L86-L90) (dòng 86-90)
- **Mô tả:**
  Tại dòng 28-34, component đã lấy thông tin người dùng từ Supabase và xác định chính xác cờ `hasPassword`:
  ```tsx
  const hasEmailProvider = userData.user.identities.some((id) => id.provider === "email");
  setHasPassword(hasEmailProvider);
  ```
  Tuy nhiên tại dòng 86-90, việc render `ChangePasswordForm` chỉ kiểm tra `profile.email`:
  ```tsx
  {/* Đổi mật khẩu (nếu tài khoản có liên kết email/mật khẩu) */}
  {profile.email ? (
    <ChangePasswordForm userEmail={profile.email} />
  ) : null}
  ```
- **Hậu quả:**
  Người dùng đăng nhập bằng Google OAuth (OAuth-only) vẫn có `profile.email` (ví dụ `user@gmail.com`). Họ nhìn thấy form "Đổi mật khẩu", nhập "Mật khẩu hiện tại", nhưng vì tài khoản OAuth không có mật khẩu trong Supabase auth, hàm `supabase.auth.signInWithPassword` luôn thất bại với lỗi `"Mật khẩu hiện tại không chính xác"`. Người dùng bị rơi vào ngõ cụt và không thể thao tác.
- **Yêu cầu khắc phục:**
  Sửa điều kiện render tại dòng 87 thành:
  ```tsx
  {hasPassword && profile.email ? (
    <ChangePasswordForm userEmail={profile.email} />
  ) : null}
  ```

---

### 🔴 Defect 2 (MAJOR - DoD Violation): Chưa bổ sung bộ test tự động (Missing Tests)
- **Vị trí:** DoD trong file `tasks/build-filmbooking/layer-5-task-11.md`:
  ```markdown
  - [ ] Tests added + pass
  ```
- **Mô tả:**
  Không có bất kỳ test unit hoặc component test nào được thêm vào cho các chức năng được tạo mới. Builder chỉ chạy bộ test có sẵn từ các layer trước (8 file test cũ).
- **Yêu cầu khắc phục:**
  Bổ sung file test (ví dụ `apps/web/src/components/account/__tests__/account.test.tsx` hoặc tương đương) kiểm thử tối thiểu các hành vi cốt lõi:
  1. `UnverifiedEmailBanner`: Hiện khi `emailConfirmed === false`, ẩn khi `emailConfirmed === true` hoặc `!email`. Nút gửi lại có countdown 60s và gọi đúng endpoint.
  2. `AvatarUpload`: Từ chối file sai định dạng (ví dụ `.pdf`, `.txt`) hoặc dung lượng > 2MB với thông báo lỗi rõ ràng; kích hoạt preview khi chọn ảnh hợp lệ.
  3. `ChangePasswordForm`: Báo lỗi khi mật khẩu xác nhận không khớp, mật khẩu mới < 8 ký tự, hoặc mật khẩu cũ sai.
  4. `DeleteAccountDialog`: Bước 1 yêu cầu tích checkbox cảnh báo mất vé mới cho tiếp tục; bước 2 bắt buộc gõ đúng `XOÁ TÀI KHOẢN` và mật khẩu.

---

### 🟡 Defect 3 (MINOR - Code Quality Gate): File vượt trần 300 dòng
- **Vị trí:** [profile-form.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/components/account/profile-form.tsx) (409 dòng)
- **Mô tả:**
  Theo quy định kiến trúc codebase (`skills/karpathy-guidelines/SKILL.md` và `.agent/FEATURE_WORKFLOW.md`), mỗi file component cần ≤ 300 dòng. File `profile-form.tsx` hiện dài 409 dòng do chứa toàn bộ Dialog đổi email (`emailDialogOpen`, `newEmail`, `handleChangeEmail`, JSX dialog từ dòng 343-399).
- **Yêu cầu khắc phục:**
  Tách Dialog đổi email thành component riêng (ví dụ `change-email-dialog.tsx` trong `apps/web/src/components/account/`) và import vào `profile-form.tsx`.

---

### 🟡 Defect 4 (MINOR - Resource Cleanup): Thiếu dọn dẹp Object URL trong `AvatarUpload`
- **Vị trí:** [avatar-upload.tsx](file:///E:/FilmBooking/.worktrees/layer-5__task-11/apps/web/src/components/account/avatar-upload.tsx#L51-L65)
- **Mô tả:**
  Khi người dùng liên tục chọn các ảnh khác nhau qua nút chọn file, mỗi lần `handleFileChange` được kích hoạt đều tạo `URL.createObjectURL(file)` mới mà không gọi `URL.revokeObjectURL(previewUrl)` để giải phóng URL cũ. Ngoài ra không có `useEffect` dọn dẹp khi unmount.
- **Yêu cầu khắc phục:**
  Gọi `if (previewUrl) URL.revokeObjectURL(previewUrl);` trước khi set `objectUrl` mới trong `handleFileChange`, và thêm `useEffect` cleanup thu hồi `previewUrl` khi component unmount.

---

## 3. Đánh giá đối chiếu chéo (Cross-Boundary & Schema Audit)

| Endpoint / RPC | Bảng DB liên quan | Schema / Controller Backend | Web Client đối chiếu | Đánh giá |
|---|---|---|---|---|
| `GET /me/profile` | `profiles`, `favorite_cinemas` | `ProfileController.get` | `tai-khoan/layout.tsx`, `tai-khoan/page.tsx` | Khớp schema |
| `PATCH /me/profile` | `profiles` | `updateProfileSchema` (Zod strict) | `profile-form.tsx`, `avatar-upload.tsx` | Khớp schema (`fullName`, `phone`, `dateOfBirth`, `gender`, `avatarUrl`) |
| `POST /me/email` | GoTrue `PUT /auth/v1/user` | `changeEmailSchema` | `profile-form.tsx` (Dialog Đổi Email) | Khớp contract |
| `POST /me/avatar` | Supabase Storage `avatars` | `avatarUploadSchema` | `avatar-upload.tsx` | Khớp MIME/size |
| `PUT /me/preferences` | `profiles.marketing_opt_in` | `updatePreferencesSchema` | `tai-khoan/thong-bao/page.tsx` | Khớp contract |
| `PUT /me/favorites/:cinemaId` | `favorite_cinemas` | `cinemaIdParamSchema` (UUID) | `tai-khoan/rap-yeu-thich/page.tsx` | Khớp UUID |
| `DELETE /me/favorites/:cinemaId` | `favorite_cinemas` | `cinemaIdParamSchema` (UUID) | `tai-khoan/rap-yeu-thich/page.tsx` | Khớp UUID |
| `DELETE /me` | `profiles`, `orders`, Auth | `deleteAccountSchema` (`acknowledgeTicketLoss: true`, `password`) | `delete-account-dialog.tsx` | Khớp contract (bảo toàn PII scrub, xử lý signOut + redirect) |
| `POST /auth/resend-confirmation` | GoTrue / Mail worker | `resendConfirmationSchema` (`email`) | `unverified-email-banner.tsx` | Khớp contract (Status 202) |

---

## 4. Kết quả chạy Verify Commands

Thực hiện trong worktree `E:\FilmBooking\.worktrees\layer-5__task-11`:

1. **Typecheck:**
   `pnpm -w typecheck` -> **PASS** (0 lỗi TypeScript trên toàn bộ packages/shared, apps/api, apps/web).
2. **Lint:**
   `pnpm -w lint` -> **PASS** (0 lỗi ESLint).
3. **Oxlint:**
   `npx oxlint apps/web/src/components/account apps/web/src/components/shell/unverified-email-banner.tsx 'apps/web/src/app/(public)/tai-khoan' 'apps/web/src/app/(public)/layout.tsx'` -> **PASS** (10 files, 0 warnings, 0 errors).
4. **Test:**
   `pnpm --filter @filmbooking/web test` -> **PASS** (8 test suites, 93 tests pass - tuy nhiên không có test mới cho task-11).

---

## 5. Kết luận & Hướng dẫn cho Builder

Bản triển khai có chất lượng giao diện và mức độ bám sát spec tốt, tuân thủ design tokens và UX đã định dạng trong design-spec. Tuy nhiên, do tồn tại lỗi logic đối với tài khoản OAuth (Defect 1) và vi phạm cổng kiểm thử tự động của DoD (Defect 2), task được đánh giá:

**Verdict:** **FAIL**

**Các bước khắc phục cần thiết:**
1. Sửa điều kiện render `ChangePasswordForm` tại `apps/web/src/app/(public)/tai-khoan/page.tsx` dòng 87 để tôn trọng cờ `hasPassword`.
2. Tạo file test cho các component mới của tài khoản (`UnverifiedEmailBanner`, `AvatarUpload`, `ChangePasswordForm`, `DeleteAccountDialog`).
3. Tách `change-email-dialog.tsx` ra khỏi `profile-form.tsx` để giảm số dòng của `profile-form.tsx` xuống ≤ 300 dòng.
4. Bổ sung thu hồi `URL.revokeObjectURL` trong `avatar-upload.tsx`.
