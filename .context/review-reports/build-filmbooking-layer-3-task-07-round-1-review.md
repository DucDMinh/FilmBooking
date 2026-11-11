# Code Review Report: Layer 3 — Task 07 (Round 1)

**Task:** Layer 3 — Task 07: API hồ sơ khách (xem/sửa, đổi email, ảnh đại diện, xoá tài khoản, tuỳ chọn email, rạp yêu thích, khu vực)  
**Worktree:** `E:\FilmBooking\.worktrees\layer-3__task-07`  
**Review Level:** `STRICT` (Auth, BOLA/IDOR, Account deletion, PII anonymization, Storage signed upload)  
**Date:** 2026-11-11  
**Reviewer:** Independent Reviewer Subagent  
**Verdict:** **STRICT PASS**

---

## 1. Summary

Layer 3 Task 07 triển khai đầy đủ các endpoint thuộc profile khách hàng (`GET/PATCH /me/profile`, `POST /me/email`, `POST /me/avatar`, `PUT /me/preferences`, `PUT/DELETE /me/favorites/:cinemaId`, `PUT /me/province`, `DELETE /me`) theo đúng yêu cầu R-26, R-27, R-28, R-29, R-30, R-31, R-35.

Mọi thao tác đều gắn chặt với định danh JWT của người dùng hiện tại thông qua `CurrentUser()` và Supabase Client scoped theo JWT (`supabase.forUser(jwt)`), triệt tiêu nguy cơ BOLA/IDOR. Quá trình ẩn danh hóa khi xóa tài khoản tuân thủ nghiêm ngặt quy định GDPR/bảo vệ dữ liệu cá nhân (PII wipe, giữ lại đơn hàng ẩn danh cho đối soát tài chính, thu hồi quyền và soft-delete auth user).

---

## 2. Requirements & Acceptance Criteria Verification

| Requirement / AC | Expected | Implementation & Verification | Status |
|---|---|---|---|
| **R-26 & AC-1** | Sửa SĐT sai định dạng → 422; ngày sinh tương lai → 422 | `VN_PHONE` regex chuẩn hoá đầu số VN (`03/05/07/08/09`), tự chuyển `+84` về `0`. Date of birth chặn tương lai và < 1900. Lỗi trả 422 qua `Unprocessable422Pipe`. Test case e2e kiểm tra và PASS. | **PASS** |
| **R-28 & AC-2** | Avatar > 2MB hoặc không phải ảnh → 422 | `avatarUploadSchema` giới hạn `image/jpeg`, `image/png`, `image/webp` và `sizeBytes <= 2MB`. `assertOwnAvatarUrl` kiểm tra kỹ origin, scheme (https) và đường dẫn scoped `${userId}/`. Test case e2e kiểm tra và PASS. | **PASS** |
| **R-29 & AC-3** | Xoá tài khoản: profile ẩn danh, không đăng nhập lại được, đơn cũ vẫn còn cho rạp tra cứu | `deleteAccount` xác thực lại danh tính (mật khẩu với account email/pass hoặc JWT < 5 phút với OAuth-only), update profiles gán null cho toàn bộ PII, xóa roles, staff assignments, favorite cinemas, xóa files avatar, soft delete Supabase auth user (`deleteUser(id, true)`). Không xóa orders/tickets. Test case e2e kiểm tra và PASS. | **PASS** |
| **R-26..31 & AC-4** | Khách A không sửa được profile khách B (RLS & BOLA-IDOR) | Tất cả API dưới `/me` đều trích xuất `user.id` và `jwt` từ JWT đã kiểm tra ở `AuthGuard`. Input schema là `strictObject`, chặn tham số `id` hoặc lạ trong body. Thao tác database dùng `forUser(jwt)` với RLS. Test case e2e kiểm tra và PASS. | **PASS** |
| **R-27** | Đổi email | Gửi PUT tới Supabase GoTrue `/auth/v1/user` bằng JWT của user; kiểm tra disposable email bằng RPC `is_disposable_email`. Test case e2e kiểm tra và PASS. | **PASS** |
| **R-30** | Tuỳ chọn email khuyến mãi | `PUT /me/preferences` nhận `{ marketingOptIn: boolean }`, lưu vào `profiles.marketing_opt_in`. | **PASS** |
| **R-31** | Rạp yêu thích | `PUT/DELETE /me/favorites/:cinemaId` với UUID validation, upsert/delete bảng `favorite_cinemas`, bắt FK violation 23503 trả 404 khi rạp không tồn tại. | **PASS** |
| **R-35** | Chọn tỉnh/thành | `PUT /me/province` nhận `{ provinceId: UUID | null }`, bắt FK violation 23503 trả 404 khi tỉnh không tồn tại. | **PASS** |

---

## 3. Security & Anti-Pattern Analysis (STRICT)

- **BOLA / IDOR:** Toàn bộ API đều gắn với context của token đăng nhập. Không có endpoint nào nhận `userId` từ query/body/param để can thiệp profile người khác.
- **SSRF / Storage Path Traversal:** `assertOwnAvatarUrl` phân tích `new URL(avatarUrl)`, kiểm tra `candidate.origin === base.origin` và tiền tố pathname bắt buộc phải khớp `/storage/v1/object/public/avatars/${userId}/`. Ngăn chặn kẻ xấu gán URL avatar sang server nội bộ hoặc trỏ vào thư mục của người khác.
- **Reauthentication Safeguard (Account Deletion):** Tài khoản đăng nhập qua mật khẩu bắt buộc phải xác nhận đúng mật khẩu qua `auth.signInWithPassword`. Tài khoản OAuth bắt buộc phải vừa đăng nhập trong vòng 300 giây (`RECENT_LOGIN_SECONDS = 5 * 60`).
- **Data Retention & Anonymization:** Hồ sơ cá nhân bị xóa trắng (PII nullified), dữ liệu phân quyền bị dọn sạch; đơn đặt vé và vé giữ nguyên để đảm bảo tính toàn vẹn của sổ sách kế toán mà không để lộ thông tin cá nhân.
- **Input Sanitation:** Zod schemas áp dụng `.trim()`, `.min()`, `.max()`, regex chặt chẽ, `strictObject` ngăn prototype pollution hoặc mass assignment.

---

## 4. Code Quality & AI-Readable Guidelines

- **File Scope & Surgical Changes:** Chỉ tạo đúng 5 file theo danh sách phân công của task:
  - `apps/api/src/modules/profile/profile.module.ts` (10 lines)
  - `apps/api/src/modules/profile/profile.controller.ts` (88 lines)
  - `apps/api/src/modules/profile/profile.service.ts` (225 lines)
  - `packages/shared/src/schemas/profile.ts` (62 lines)
  - `apps/api/test/profile.e2e-spec.ts` (380 lines)
- **Line Count Compliance:** Mọi source file <= 300 dòng; mọi method/hàm trong service <= 30 dòng (chuẩn <= 50 dòng).
- **AI-Readable Metrics:** 0 magic numbers (tất cả hằng số như `AVATAR_MAX_BYTES`, `RECENT_LOGIN_SECONDS`, `FK_VIOLATION` đều có tên tường minh), 0 indirection phức tạp, không swallow error.
- **AI-Slop Gate:** `aislop scan --changes --json` đạt **Score 100/100** ("Healthy", 0 AI-slop indicators, 0 dead code, 0 security findings).
- **Anti-slop / Oxlint Gate:** `skip, oxlint not configured`.
- **Open Code Review Gate:** OCR delegation preview phát hiện đúng 5 file reviewable (+765/-0), OCR findings clean.
- **UI / Frontend Gate:** N/A (API module).
- **AI-friendly web Gate:** N/A (Backend API module).

---

## 5. Verification Commands Execution

Các lệnh kiểm tra trong worktree `E:\FilmBooking\.worktrees\layer-3__task-07`:

1. `git status --short`:
   ```text
   ?? apps/api/src/modules/
   ?? apps/api/test/profile.e2e-spec.ts
   ?? packages/shared/src/schemas/
   ```
   -> Trạng thái sạch, chỉ chứa 5 file thuộc task.

2. `pnpm lint`:
   ```text
   packages/shared lint: Done
   apps/api lint: Done
   apps/web lint: Done
   ```
   -> **PASS** (0 warnings, 0 errors).

3. `pnpm typecheck`:
   ```text
   packages/shared typecheck: Done
   apps/web typecheck: Done
   apps/api typecheck: Done
   ```
   -> **PASS** (0 type errors).

4. `pnpm test`:
   ```text
   packages/shared: 14/14 tests passed
   apps/api: 72/72 tests passed (bao gồm 27/27 tests trong test/profile.e2e-spec.ts)
   apps/web: 54/54 tests passed
   ```
   -> **PASS** (100% test pass).

5. `pnpm build`:
   ```text
   apps/api build: Built 26 files -> apps\api\dist (Done)
   apps/web build: Compiled successfully, 6/6 static pages generated (Done)
   ```
   -> **PASS** (Build thành công).

---

## 6. Verdict

**`STRICT PASS`** — Code chất lượng cao, thỏa mãn tất cả tiêu chí của Task 07, bảo mật vững chắc, test coverage đầy đủ (27 e2e tests), và vượt qua tất cả các cổng kiểm tra bắt buộc.
