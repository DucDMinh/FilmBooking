# Báo Cáo Review Độc Lập: Layer 5 — Task 12 (Round 1)

- **Work item:** `build/build-filmbooking`
- **Task:** `layer-5-task-12` (Web bảo mật & liên kết tài khoản + bước bổ sung email Facebook)
- **Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-12`
- **Reviewer:** Adversarial Reviewer (vai trò reviewer, Model: `pro`)
- **Review Level:** `STRICT` (Phạm vi nhạy cảm: Xác thực/OAuth, liên kết danh tính, phân tán phiên, chống dò email R-12, máy trạng thái AC-04/AC-05)
- **Verdict:** `STRICT PASS`

---

## 1. Tổng Quan & Đánh Giá Độc Lập

Task 12 hoàn thiện giao diện Quản lý Bảo mật & Phương thức đăng nhập (`/tai-khoan/bao-mat`), Đặt mật khẩu lần đầu cho tài khoản mạng xã hội (`AddPasswordForm`), Đăng xuất các phiên khác (`SessionsCard`), và Màn hình bổ sung email cho luồng Facebook không cung cấp email (`/bo-sung-email`).

Qua kiểm tra chéo (Cross-Boundary Audit) giữa giao diện web, backend API (`apps/api`) và schema database (`supabase/migrations/*.sql`), mã nguồn tuân thủ chặt chẽ các quy định nghiệp vụ cốt lõi:
1. **Tuân thủ F-2/M-05 & Bug Remediation P1-07/08:** Luồng liên kết mạng xã hội thủ công bắt buộc gọi `POST /me/identities/link-intent` trước khi kích hoạt `supabase.auth.linkIdentity`. Nếu phiên chưa re-auth gần đây (mã `REAUTH_REQUIRED`), thao tác lập tức bị chặn và hướng dẫn người dùng đăng nhập lại, bảo đảm trigger database `guard_identity_insert` không bị vi phạm.
2. **AC-05 (UI & State Machine):** Khi tài khoản chỉ còn một phương thức đăng nhập duy nhất (`canUnlink === false`), nút huỷ liên kết mở hộp thoại giải thích chi tiết, chặn mọi yêu cầu gọi `DELETE /me/identities/:provider`.
3. **AC-04 (UI & Anti-Auto-Merge):** Khi xảy ra va chạm email hoặc lỗi callback từ GoTrue, hệ thống không tự ý gộp tài khoản mà hiển thị màn hình điều hướng người dùng đăng nhập bằng mật khẩu trước khi liên kết.
4. **R-15 (Phiên đăng nhập):** Server Action thực hiện `signOut({ scope: "others" })` qua `@supabase/ssr`, bảo vệ phiên làm việc hiện tại trên cookie HttpOnly và kết thúc mọi phiên khác.
5. **R-12 (Chống Enumeration Oracle):** Màn hình `/bo-sung-email` hiển thị thông báo trung tính giống nhau cho cả trường hợp email mới và email đã tồn tại, ngăn chặn kẻ tấn công dò tìm tài khoản.

---

## 2. Đối Chiếu Chéo Ranh Giới (Cross-Boundary Schema & API Audit)

| Thành phần Web | Ranh giới API / DB | Kết quả đối chiếu |
|---|---|---|
| `LinkedAccounts.startLink` | `POST /me/identities/link-intent` (`MeController`) ↔ Bảng `identity_link_intents` + trigger `guard_identity_insert` | Khớp 100%. Payload `{ provider }` tuân theo `createLinkIntentInputSchema`. API kiểm tra `isRecentLogin(amr)`. Chỉ khi 204 thành công mới tiến hành `linkIdentity`. |
| `LinkedAccounts.load` | `GET /me/identities` (`IdentityController`) ↔ RPC `get_user_identities` | Khớp 100% schema `IdentityListResponse` (`identities`, `hasPassword`, `canUnlink`, `totalMethods`). |
| `LinkedAccounts.confirmUnlink` | `DELETE /me/identities/:provider` (`IdentityController`) ↔ RPC `unlink_user_identity` | Khớp 100%. Cung cấp 2 lớp bảo vệ: UI chặn qua `canUnlink`, backend/DB ném mã `LAST_LOGIN_METHOD` (23514 / 409 Conflict) nếu gọi trực tiếp. |
| `AddPasswordForm.handleSubmit` | `POST /me/password` (`IdentityController`) ↔ `updateUserById` + RPC `mark_password_set` | Khớp 100%. Xác thực `addPasswordInputSchema` theo chính sách mật khẩu chung, kiểm tra trùng khớp xác nhận mật khẩu, ngăn chặn ghi đè nếu tài khoản đã có mật khẩu (`PASSWORD_ALREADY_SET`). |
| `SessionsCard.confirm` | Server Action `signOutOthers` ↔ GoTrue Client `@supabase/ssr` | Khớp 100%. Gọi `supabase.auth.signOut({ scope: "others" })` từ môi trường server có cookie HttpOnly hợp lệ. |
| `MissingEmailForm.handleSubmit` | `POST /auth/oauth/missing-email` (`IdentityController`) ↔ `profiles` + `email_outbox` | Khớp 100%. Đạt chuẩn R-12: trả về cùng thông báo trung tính cho cả user mới và va chạm email cũ, xử lý rate limit (HTTP 429). |

---

## 3. Kiểm Tra Tiêu Chí Chấp Nhận & Edge Cases

- **AC-04:**
  - Callback lỗi trùng email (`status=email_exists`) trên `/bo-sung-email`: hiển thị card cảnh báo và nút chuyển tiếp sang `/dang-nhap?next=%2Ftai-khoan%2Fbao-mat`.
  - Callback lỗi `identity_already_exists` hoặc mã va chạm trên `/tai-khoan/bao-mat`: hiển thị thông báo hướng dẫn đăng nhập mật khẩu rồi liên kết, không làm rò rỉ dữ liệu tài khoản khác.
- **AC-05:**
  - Chỉ còn Facebook: khi bấm Huỷ liên kết, mở `AlertDialog` hướng dẫn thêm mật khẩu hoặc liên kết tài khoản khác; không có nút submit gọi `DELETE`.
  - Có cả Email + Google: bấm Huỷ liên kết Google mở modal xác nhận, xác nhận xong mới gọi `DELETE /me/identities/google` và tự động re-fetch danh sách.
- **R-15:**
  - Đăng xuất phiên khác có modal xác nhận rõ ràng, toast phản hồi trạng thái hoàn tất/thất bại.
- **R-12:**
  - `/bo-sung-email` dùng `NEUTRAL_MESSAGE`: "Nếu email hợp lệ, chúng tôi đã gửi hướng dẫn tới hộp thư của bạn. Vui lòng kiểm tra email để hoàn tất đăng nhập." Không có bất kỳ tín hiệu nào giúp phân biệt email có tồn tại hay không.

---

## 4. Chất Lượng Mã Nguồn & Tiêu Chuẩn Giao Diện (UI Craft-Floor)

1. **Tuân thủ giới hạn kích thước:**
   - `apps/web/src/app/(public)/tai-khoan/bao-mat/page.tsx`: 47 dòng (≤ 300 dòng).
   - `apps/web/src/components/account/linked-accounts.tsx`: 291 dòng (≤ 300 dòng).
   - `apps/web/src/components/account/add-password-form.tsx`: 79 dòng (≤ 300 dòng).
   - `apps/web/src/components/account/sessions-card.tsx`: 73 dòng (≤ 300 dòng).
   - `apps/web/src/app/(auth)/bo-sung-email/page.tsx`: 113 dòng (≤ 300 dòng).
   - `apps/web/src/components/account/__tests__/linked-accounts.test.tsx`: 267 dòng (≤ 300 dòng).
2. **Khả năng tiếp cận (Accessibility - A11y):**
   - Đầy đủ `Label htmlFor`, `aria-invalid`, `role="alert"`, `role="status"`.
   - Các nút icon đều có `aria-label` tương ứng (`Huỷ liên kết Google`, `Liên kết Facebook`).
   - Modal/Dialog dùng Radix UI (`AlertDialog`, `Dialog`) hỗ trợ quản lý focus và phím Escape.
   - Thẻ form có thuộc tính `noValidate` và xử lý validation nhất quán.
3. **Khả năng đáp ứng (Responsive - 375 / 768 / 1280):**
   - Sử dụng Flexbox linh hoạt (`flex-wrap`, `min-h-16`, `min-w-0`, `truncate`) đảm bảo trên màn hình hẹp 375px không bị tràn ngang layout.
4. **Bảo vệ SEO & Quyền riêng tư:**
   - Trang `/tai-khoan/bao-mat` có `metadata.robots = { index: false }`, bảo vệ thông tin tài khoản người dùng khỏi các bot tìm kiếm.
   - Trang `/bo-sung-email` bọc component trong `<Suspense>` để đáp ứng tiêu chuẩn của Next.js App Router khi sử dụng `useSearchParams()`.

---

## 5. Báo Cáo Các Cổng Kiểm Tra (Gates Summary)

- **AI-Slop Gate:** `skip, aislop not installed`. Không phát hiện anti-pattern trong code review trực quan (không có comment trần thuật thừa thãi, không có dead code, không dùng `any`, xử lý lỗi đầy đủ).
- **Anti-slop / Oxlint Gate:** `skip, oxlint not configured`.
- **Open Code Review Gate (`ocr`):** Đã chạy `ocr delegate preview` trên worktree với 5 file mã nguồn mới (+870 dòng). Không có phát hiện CRITICAL hoặc MAJOR.
- **AI-Readable Codebase Gate:** Tên biến/hàm tường minh (`startLink`, `confirmUnlink`, `signOutOthers`, `NEUTRAL_MESSAGE`), tuân thủ chuẩn cấu trúc dự án.
- **Check Commands (trong worktree `wt/layer-5__task-12`):**
  - `pnpm -w typecheck`: **PASS** (0 lỗi trên toàn bộ workspace).
  - `pnpm -w lint`: **PASS** (0 lỗi ESLint).
  - `pnpm --filter @filmbooking/web test`: **PASS** (9/9 test files, 109/109 tests passed; 16/16 tests của task 12 đạt 100%).
  - `pnpm --filter @filmbooking/web build`: **PASS** (Next.js 16.4.6 Turbopack build thành công 14/14 routes, bao gồm `/bo-sung-email` và `/tai-khoan/bao-mat`).

---

## 6. Kết Luận

Mã nguồn của `layer-5-task-12` hoàn toàn đáp ứng các tiêu chí kỹ thuật, bảo mật và trải nghiệm người dùng theo tài liệu đặc tả và các quy tắc kiến trúc.

**Kết luận: `STRICT PASS`**
