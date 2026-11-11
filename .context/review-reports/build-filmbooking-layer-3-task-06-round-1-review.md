# Review Report: Layer 3 — Task 06 (Round 1)

- **Feature/Task**: `build-filmbooking-layer-3-task-06`
- **Worktree**: `E:\FilmBooking\.worktrees\layer-3__task-06`
- **Task file**: `tasks/build-filmbooking/layer-3-task-06.md`
- **Review Level**: `STRICT` (Phạm vi Auth / Security / Lockout / Rate limit / Turnstile / Password Policy / Token)
- **Reviewer**: AI Independent Reviewer
- **Date**: 2026-11-11
- **Verdict**: `STRICT PASS`

---

## 1. Scope & Diff Audit

Các file đã thay đổi/tạo mới trong worktree:
- `apps/api/src/modules/auth-ext/auth-ext.module.ts` (new, 25 lines)
- `apps/api/src/modules/auth-ext/auth-ext.controller.ts` (new, 76 lines)
- `apps/api/src/modules/auth-ext/auth-ext.service.ts` (new, 303 lines)
- `apps/api/src/modules/auth-ext/turnstile.service.ts` (new, 37 lines)
- `packages/shared/src/schemas/auth.ts` (new, 56 lines)
- `packages/shared/src/password-policy.ts` (new, 38 lines)
- `apps/api/test/auth-ext.e2e-spec.ts` (new, 441 lines)
- `docs/dev-setup.md` (modified, +23 lines)

**Đánh giá scope**:
- Toàn bộ 8 file đều khớp 100% với danh sách `Files to Create/Modify` trong task spec.
- Không có bất kỳ file nào ngoài scope bị tạo hoặc sửa đổi.
- Tuân thủ nguyên tắc Surgical Diff (Karpathy guidelines): từng dòng code trace trực tiếp về requirements.

---

## 2. Verification Commands Execution

| Command | Exit Code | Result | Ghi chú |
|---|---|---|---|
| `pnpm lint` | 0 | PASS | ESLint pass 3 packages (shared, api, web) |
| `pnpm typecheck` | 0 | PASS | TypeScript compile pass toàn workspace |
| `pnpm test` | 0 | PASS | 135 tests passed (api: 67, web: 54, shared: 14). Auth-ext e2e: 22/22 tests passed |
| `pnpm build` | 0 | PASS | Build api (tsc + build.mjs) & web (Next.js build) thành công |

---

## 3. Requirements & Acceptance Criteria Verification

- **AC-03 (Lockout 5 lần)**:
  - Sai 5 lần liên tiếp -> tài khoản bị khoá 15 phút (`ACCOUNT_LOCKED`, HTTP 423).
  - Tự động enqueue `ACCOUNT_LOCKED_ALERT` vào bảng `email_outbox`.
  - Lần thứ 6 dù nhập đúng mật khẩu vẫn bị từ chối 423 trong thời gian khoá.
  - Test verify đầy đủ tại `auth-ext.e2e-spec.ts`.
- **AC-02 (Resend confirmation cooldown & limits)**:
  - Gọi lại trong 60 giây bị chặn 429 `RATE_LIMITED` kèm `details.retryAfter`.
  - Giới hạn trần 5 lần/giờ theo email.
- **R-01 & R-12 (Email normalization & Neutral responses)**:
  - Email được trim và toLowerCase() nhất quán từ tầng schema.
  - Đăng ký email đã tồn tại trả về phản hồi trung tính 202 `{ status: "CHECK_EMAIL" }` mà không tạo user mới hay gửi email.
  - Quên mật khẩu cũng trả về phản hồi trung tính 202 `{ status: "CHECK_EMAIL" }`.
  - Đăng nhập sai trả thông điệp chung "Email hoặc mật khẩu không đúng", không phân biệt sai user hay sai password.
- **R-02 (Password Policy)**:
  - Kiểm tra độ dài tối thiểu 8 ký tự, có chữ hoa, chữ thường, chữ số.
  - UTF-8 byte limit: ≤ 72 bytes (giới hạn bảo mật của bcrypt) giúp chống DoS băm chuỗi khổng lồ.
  - Vi phạm trả 422 kèm danh sách lý do cụ thể.
- **R-03 (Consent tracking)**:
  - Bắt buộc `acceptTerms: true` và `termsVersion` khớp với `app_settings.terms_version`.
  - Lưu consent vào bảng `consents` cho cả `TERMS_OF_SERVICE` và `PRIVACY_POLICY`.
  - Rollback an toàn: nếu lưu consent thất bại, tự động xóa user (`deleteUser`) để không tồn tại user thiếu consent.
- **R-04, R-13 & Quyết định G5 = C (Password Reset Link Validity)**:
  - Kiểm tra `recovery_sent_at` lấy từ admin API `getUserById` ≤ 1 giờ (3600s).
  - Kiểm tra hai biên chính xác: 59 phút thành công (200), 61 phút bị từ chối 401 kèm lý do `RECOVERY_LINK_EXPIRED`.
  - Đặt lại mật khẩu thành công gọi `signOut(others)` để vô hiệu hóa mọi phiên đăng nhập khác của tài khoản.
- **R-07 (Cloudflare Turnstile)**:
  - Fail-closed khi thiếu secret hoặc lỗi kết nối.
  - Áp dụng bắt buộc cho Register và Forgot Password.
  - Tự động yêu cầu CAPTCHA đối với Login sau 3 lần đăng nhập thất bại.
- **R-08 & R-09 (Rate Limiting & Disposable Email)**:
  - Gọi RPC `hit_rate_limit` của Supabase DB cho IP và Email.
  - Gọi RPC `is_disposable_email`, chặn email dùng 1 lần với 422 `DISPOSABLE_EMAIL`.
- **R-17 (Role escalation prevention)**:
  - Schema không cho phép truyền trường `role`.
  - User tạo qua endpoint đăng ký luôn là CUSTOMER với `email_confirm: false`.
  - Tài khoản nhân sự chỉ tạo qua hàm nội bộ `createStaffAccount` với `email_confirm: true`. Không có endpoint công khai.
- **Quyết định G6 (Accepted Risk Documentation)**:
  - Đã tài liệu hóa rõ ràng trong comment đầu file `auth-ext.service.ts` và mục "Rủi ro đã chấp nhận" trong `docs/dev-setup.md`.

---

## 4. Quality & Security Gates

- **AI-slop gate**: `aislop` không có sẵn trên môi trường CLI -> bỏ qua theo quy tắc. Mã nguồn viết tay sạch sẽ, không có placeholder / dead code.
- **Anti-slop/type gate**: `oxlint` chưa được cấu hình cho repo -> `skip, oxlint not configured`. `eslint` và `tsc` đã pass 100%.
- **Open Code Review gate**: `ocr delegate preview` phát hiện 7 file code sạch sẽ. Không có phát hiện CRITICAL / MAJOR nào về XSS, SQLi, NPE, hay thread-safety.
- **AI-readable gate**:
  - Không có AI-chaos indicators: Tên hàm, biến, hằng số rõ ràng, tự giải thích (`RECOVERY_MAX_AGE_MS`, `CAPTCHA_AFTER_FAILURES`, `rejectBadCredentials`, `recordConsentOrRollback`).
  - Hàm ngắn gọn (≤50 dòng mỗi hàm).
  - Indirection thấp (controller -> service -> supabase client / turnstile service).
- **Security Check**:
  - Ngăn ngừa Timing Attack & Account Enumeration qua phản hồi trung tính.
  - Không rò rỉ JWT hay admin secrets ra ngoài.
  - Chống DoS mật khẩu bcrypt 72 bytes.
  - Fail-closed Turnstile implementation.

---

## 5. Conclusion & Verdict

Tất cả tiêu chí nghiệm thu của Task 06 đã được triển khai hoàn chỉnh, đúng quy chuẩn kiến trúc và bảo mật, với bộ test e2e chi tiết, chính xác.

**Verdict: `STRICT PASS`**
