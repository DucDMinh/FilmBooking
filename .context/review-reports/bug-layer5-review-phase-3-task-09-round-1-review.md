# Review Report: Bug layer5-review · phase-3-task-09 — Web Account Session, Password Change & Deletion

- **Agent:** reviewer
- **Review Level:** STRICT
- **Verdict:** STRICT PASS
- **Target Work Item:** `tasks/bug-layer5-review/phase-3-task-09.md`
- **Origin Report:** `.context/review-reports/independent-review-layer-5-G-web-account-admin.md` (G/M11-1, G/M11-2, G/M11-3, G/M11-4)
- **Files Reviewed:**
  - `apps/web/src/app/(public)/tai-khoan/page.tsx`
  - `apps/web/src/components/account/delete-account-dialog.tsx`
  - `apps/web/src/components/account/change-password-form.tsx`
  - `apps/web/src/app/auth/actions.ts`
  - `apps/web/src/components/account/__tests__/account.test.tsx`

---

## 1. Requirements Coverage & Acceptance Criteria Verification

### G/M11-1: Phát hiện tài khoản có mật khẩu & hành vi với tài khoản OAuth-only
- [x] **Loại bỏ `createBrowserSupabase().auth.getUser()`**: File `apps/web/src/app/(public)/tai-khoan/page.tsx` đã loại bỏ hoàn toàn việc gọi GoTrue client từ browser (vốn luôn trả `null` do cấu hình `persistSession: false`).
- [x] **Truy vấn `/me/identities`**: Sử dụng `apiFetch<IdentityListResponse>("/me/identities")` song song với `/me/profile` để lấy thông tin xác thực thật từ backend.
- [x] **Ẩn form Đổi mật khẩu**: Trang `/tai-khoan` kiểm tra `{hasPassword && profile.email ? <ChangePasswordForm ... /> : null}`, khi tài khoản chỉ liên kết mạng xã hội (Google/Facebook, `hasPassword = false`), form "Đổi mật khẩu" bị ẩn hoàn toàn.
- [x] **Bỏ bắt buộc mật khẩu khi xoá tài khoản**: Trong `DeleteAccountDialog`, `DeleteAccountStepTwo` kiểm tra cờ `hasPassword`. Với tài khoản OAuth-only:
  - Input nhập mật khẩu không hiển thị.
  - Nút "Xoá vĩnh viễn tài khoản" chỉ yêu cầu gõ đúng cụm từ `XOÁ TÀI KHOẢN`, không khóa vì thiếu mật khẩu.
  - Payload gửi lên API là `{ acknowledgeTicketLoss: true, password: undefined }`, hoàn toàn tương thích với backend `assertReauthenticated`.

### G/M11-2: Dọn sạch Cookie HttpOnly sau khi xoá tài khoản
- [x] **Gọi Server Action `signOutAction()`**: Sau khi API `DELETE /me` trả về kết quả thành công, `DeleteAccountDialog` gọi `await signOutAction()`.
- [x] **Dọn dẹp triệt để `sb-*`**: Server action `signOutAction()` gọi `supabase.auth.signOut()` phía server và duyệt qua `cookieStore.getAll()`, xoá sạch tất cả cookie bắt đầu bằng tiền tố `sb-` (HttpOnly cookies do Supabase SSR quản lý).
- [x] **Chuyển hướng an toàn**: Sau khi dọn sạch cookie ở server, client hiển thị thông báo thành công và chuyển hướng về `/`.

### G/M11-3: Phân biệt lỗi 403 khi xoá tài khoản
- [x] **Tài khoản có mật khẩu**: Khi API trả về 403 (mật khẩu sai hoặc thiếu), hiển thị thông báo: `"Mật khẩu hiện tại không đúng, vui lòng kiểm tra lại."`.
- [x] **Tài khoản OAuth-only**: Khi API trả về 403 (phiên đăng nhập quá 5 phút theo quy định xác thực gần đây `isRecentLogin`), hiển thị thông báo: `"Phiên đăng nhập đã quá 5 phút. Vui lòng đăng nhập lại để xác thực xoá tài khoản"`.
- [x] **Nút Đăng nhập lại**: Bổ sung nút hành động "Đăng nhập lại" đưa người dùng trực tiếp tới `/dang-nhap?next=/tai-khoan` để tái xác thực trước khi xoá.

### G/M11-4: Đổi mật khẩu an toàn & tuân thủ chính sách
- [x] **Loại bỏ gọi GoTrue client trực tiếp**: Loại bỏ `supabase.auth.updateUser` và `signInWithPassword` ở client.
- [x] **Server Action `changePasswordAction`**: Chuyển luồng sang server action. Xác thực mật khẩu cũ bằng cách gọi API NestJS `POST /auth/login`, kế thừa toàn bộ cơ chế bảo vệ:
  - Giới hạn tần suất IP (`rateLimit`).
  - Kiểm tra tài khoản bị khóa (`is_login_locked`).
  - Ghi nhận số lần đăng nhập thất bại và tự động khóa 15 phút khi nhập sai nhiều lần (`ACCOUNT_LOCKED`).
- [x] **Tuân thủ `checkPasswordPolicy`**: Cả ở client validation và server action đều kiểm tra qua hàm dùng chung `checkPasswordPolicy`, áp dụng `PASSWORD_ISSUE_MESSAGES` kiểm tra đủ các điều kiện (tối thiểu 8 ký tự, tối đa 72 bytes, chữ hoa, chữ thường, chữ số).
- [x] **Bỏ thông báo sai sự thật**: Đã xoá bỏ toast "Chúng tôi đã gửi email thông báo" (vốn vi phạm R-14 vì hệ thống chưa cấu hình luồng email này).

---

## 2. Cross-Boundary & DB Schema Audit

1. **API Contract Đối chiếu**:
   - `GET /me/identities`: Khớp với `IdentityListResponse` (`packages/shared/src/schemas/identity.ts`) và `IdentityController.getIdentities`.
   - `DELETE /me`: Khớp với `DeleteAccountInput` và `ProfileService.assertReauthenticated` (`apps/api/src/modules/profile/profile.service.ts:204-221`), xử lý đúng cả 2 nhánh (nhập `password` đối với tài khoản email, hoặc kiểm tra `isRecentLogin` với tài khoản OAuth).
   - `POST /auth/login`: Khớp với `AuthExtService.login` (`apps/api/src/modules/auth-ext/auth-ext.service.ts:105-136`), kích hoạt lockout 15 phút khi sai liên tiếp.
2. **Khắc phục Minor Defect m11-6**:
   - `isPhraseMatch` trong `delete-account-dialog.tsx` đã bổ sung `.normalize("NFC").toUpperCase().replace("XÓA", "XOÁ")`, xử lý triệt để vấn đề gõ tiếng Việt tổ hợp NFD và sự khác biệt giữa kiểu đặt dấu mới/cũ ("XÓA" vs "XOÁ").

---

## 3. Verify Commands & Automated Test Results

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `pnpm --filter @filmbooking/web test src/components/account/__tests__/account.test.tsx` | **PASS** | 21/21 tests pass (bao gồm kiểm tra OAuth-only ẩn đổi mật khẩu, phân biệt 403 xóa tài khoản, lockout đổi mật khẩu, gọi signOutAction). |
| `pnpm lint` (`eslint src`) | **PASS** | Không có bất kỳ lỗi lint nào trong `apps/web`. |
| `npx tsc --noEmit` (scope task-09) | **PASS** | 5 file của task-09 hoàn toàn sạch lỗi type. |

> [!NOTE]
> Có 1 lỗi typecheck trong file `apps/web/src/app/api/proxy/[...path]/route.ts(62,66)` (`Property 'ip' does not exist on type 'NextRequest'`). Lỗi này phát sinh từ việc sửa đổi của task khác (`phase-3-task-08`) và không thuộc phạm vi các file của `phase-3-task-09`. Đề nghị Builder/Dispatcher của task-08 lưu ý sửa `(request as unknown as { ip?: string }).ip ?? request.headers.get("x-real-ip")`.

---

## 4. Code Quality & Surgical Diff
- Các component được phân tách rõ ràng (`DeleteAccountStepOne`, `DeleteAccountStepTwo`, `PasswordInputField`), tuân thủ quy tắc giới hạn dòng hàm và file.
- Không có drive-by refactor; mọi thay đổi đều bám sát 4 phát hiện M11-1..M11-4 của đợt review độc lập.
- Xử lý accessibility chuẩn: có `role="alert"`, `aria-label`, `aria-invalid`, và focus management theo Radix UI.

---

## 5. Kết luận
Task `phase-3-task-09` đã khắc phục triệt để và an toàn 4 lỗ hổng bảo mật và khiếm khuyết nghiệp vụ (G/M11-1, G/M11-2, G/M11-3, G/M11-4).
**Đánh giá: STRICT PASS**.
