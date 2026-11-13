# Independent Adversarial Review Report

- **Task:** `build-filmbooking/layer-5-task-03`
- **Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-03`
- **Scope:** Mail (Resend) + worker `email_outbox` (retry) + job endpoint gửi email (`POST /jobs/send-emails`)
- **Reviewer:** Adversarial Reviewer (`reviewer`, Model: `pro`)
- **Review Level:** `STRICT`
- **Round:** 1
- **Verdict:** `STRICT PASS`

---

## 1. Executive Summary

Builder đã hoàn thành việc triển khai Mail Worker và Job endpoint phục vụ gửi email giao dịch từ bảng `email_outbox` theo đúng spec và các Acceptance Criteria (AC). 
Việc đối chiếu chéo (Cross-Boundary Check) với migration `supabase/migrations/20261111020100_security_ops.sql` xác nhận tên bảng, tên cột (`kind`, `to_email`, `payload`, `status`, `attempts`, `next_attempt_at`, `last_error`, `sent_at`) và enum `outbox_status` (`PENDING`, `SENT`, `FAILED`) hoàn toàn khớp 100%.

Cơ chế khoá chống xử lý trùng (concurrency lock) được triển khai qua cả RPC và fallback atomic conditional update (`update next_attempt_at where id = ... and status = 'PENDING' and next_attempt_at <= now`) kết hợp in-memory `inFlightIds` Set, đảm bảo khi gọi song song 2 job không gửi trùng email.
Scope change theo CR `remove-showtime-exchange` (spec 3.0.0): template email huỷ suất chỉ hướng dẫn liên hệ CSKH rạp (hotline mặc định `1900 0000`) để hoàn tiền thủ công, không có bất kỳ hướng dẫn đổi suất nào.
Các template email đều escape HTML an toàn, vé sử dụng `qr_token`, tuân thủ R-86, R-133, không rò rỉ dữ liệu nhạy cảm.

---

## 2. Requirements & Acceptance Criteria Verification

| Yêu cầu / AC | Mô tả & Tiêu chuẩn | Kết quả | Ghi chú & Dẫn chứng |
|---|---|---|---|
| **AC-23 (Security)** | Job không có `x-job-secret` đúng -> 401 UNAUTHENTICATED | **PASS** | `JobsController` được bảo vệ bởi `@UseGuards(JobSecretGuard)`. Guard băm SHA-256 và dùng `timingSafeEqual` chống timing attack. Test e2e xác minh 401 khi thiếu hoặc sai secret. |
| **AC (Outbox Batch)** | Outbox 3 email PENDING -> gọi job -> 3 SENT (Resend mock) | **PASS** | Batch được xử lý, trạng thái cập nhật `SENT`, `attempts` tăng 1, `sent_at` ghi nhận thời gian gửi, `last_error` được xoá null. |
| **AC (Retry & Backoff)** | Lỗi gửi -> retry backoff -> FAILED sau max attempts (3 lần) kèm `last_error` | **PASS** | `MAX_EMAIL_ATTEMPTS = 3`. Thất bại chuyển `attempts + 1`, tính exponential backoff `2^attempts` phút cho `next_attempt_at`. Lần 3 thất bại chuyển hẳn sang `FAILED` và ghi nhận chi tiết `last_error`. |
| **AC (Concurrency)** | Gọi job 2 lần song song đồng thời KHÔNG gửi trùng email | **PASS** | Test e2e mô phỏng 2 request `POST /jobs/send-emails` gọi song song với `Promise.all` và delay network. Tổng số email gửi đi chính xác là 3, không có duplicate call. Luồng atomic conditional update lọc đúng bản ghi chưa bị claim. |
| **AC-26 / R-86 / R-133** | Template vé không chứa dữ liệu nhạy cảm ngoài cần thiết; QR là `qr_token` | **PASS** | Template vé `renderTicketEmail` hiển thị `booking_code`, `qr_token`, rạp, suất chiếu, ghế, cảnh báo R-133 ('chỉ dùng tại rạp ghi trên vé', 'không huỷ/không hoàn', 'đến trước 15 phút'). Không lộ password/token bí mật. |
| **R-109 / CR Scope Change** | Email huỷ suất chỉ hướng dẫn liên hệ CSKH hoàn tiền thủ công, KHÔNG có đổi suất | **PASS** | Template `renderShowtimeCancelledEmail` hiển thị hotline mặc định `1900 0000`, hướng dẫn hoàn tiền thủ công, ghi chú rõ hệ thống không hỗ trợ đổi suất chiếu. |
| **R-11, R-24, R-78** | Template cảnh báo khoá tài khoản, liên kết MXH, tiền về muộn/chênh lệch | **PASS** | Đầy đủ 6 nhóm template trong `templates.ts`, map linh hoạt qua hàm `renderTemplate` chuẩn hoá `kind.toUpperCase()`. |

---

## 3. Cross-Boundary Schema & Mock Audit

1. **Database Schema Khớp 100%:**
   - Đối chiếu với file `supabase/migrations/20261111020100_security_ops.sql` dòng 144-160:
     - Bảng: `public.email_outbox`
     - Cột: `id`, `kind`, `to_email`, `payload`, `cinema_id`, `status`, `attempts`, `next_attempt_at`, `last_error`, `created_at`, `sent_at`.
     - Enum status: `'PENDING'`, `'SENT'`, `'FAILED'`.
   - Các câu lệnh Supabase JS client trong `JobsService` sử dụng chính xác các tên cột và kiểu enum trên. Không xảy ra tình trạng bịa cột như `recipient_email` hay `template_name`.

2. **Tính Trung Thực của Bộ Mock Test (`test/outbox-job.e2e-spec.ts`):**
   - Mock DB `fakeDb` lưu trữ đúng cấu trúc `OutboxRow` mô phỏng bảng thật.
   - Thao tác `select` hỗ trợ đầy đủ `eq`, `lte` trên `next_attempt_at`, `order`, `limit`.
   - Thao tác `update` hỗ trợ filter điều kiện kết hợp `.select()` trả về danh sách row đã claim thành công, mô phỏng chuẩn xác cơ chế atomic update của PostgreSQL qua PostgREST.

---

## 4. Code Quality & Security Audit

- **Input Validation & Sanitization:**
  - `templates.ts`: Toàn bộ các giá trị nội suy vào HTML template đều được escape qua hàm `escapeHtml()`, ngăn chặn triệt để HTML injection / XSS.
  - `jobs.controller.ts`: Query param `batchSize` được ép kiểu qua `Number.parseInt` và fallback về giá trị mặc định (20) khi không hợp lệ hoặc `NaN`.
- **AI-Slop & Complexity Check:**
  - Không có narrative comments vô nghĩa, không có dead code hay TODO stubs.
  - Phân tách rõ ràng giữa Service gửi email (`MailService`), module jobs xử lý worker (`JobsService`), Controller (`JobsController`) và bộ render (`templates.ts`).
  - Hàm `processEmailOutbox` kiểm soát ngoại lệ chặt chẽ, dọn dẹp `inFlightIds.delete(item.id)` trong khối `finally`.

---

## 5. Verification Commands Results

Chạy trực tiếp trong worktree `E:\FilmBooking\.worktrees\layer-5__task-03`:

1. **TypeScript Typecheck:**
   ```bash
   pnpm -w typecheck
   # apps/api typecheck: Done
   # apps/web typecheck: Done
   # packages/shared typecheck: Done
   # Exit code: 0
   ```
2. **ESLint:**
   ```bash
   pnpm -w lint
   # apps/api lint: Done
   # apps/web lint: Done
   # packages/shared lint: Done
   # Exit code: 0
   ```
3. **Oxlint:**
   ```bash
   npx oxlint apps/api/src/modules/mail apps/api/src/modules/jobs
   # Found 0 warnings and 0 errors. Finished in 88ms.
   # Exit code: 0
   ```
4. **Automated Unit & E2E Tests:**
   ```bash
   pnpm --filter @filmbooking/api test
   # Test Files: 16 passed (16)
   # Tests: 241 passed (241)
   # Trong đó test/outbox-job.e2e-spec.ts: 11 passed (11)
   # Exit code: 0
   ```
5. **Next.js & NestJS Build:**
   ```bash
   pnpm -w build
   # apps/api build: Built 62 files -> apps\api\dist
   # apps/web build: Compiled successfully in 21.7s
   # Exit code: 0
   ```

---

## 6. Conclusion

Task `layer-5-task-03` đạt chất lượng cao, tuân thủ nghiêm ngặt mọi tiêu chí kỹ thuật, bảo mật, và schema thực tế. Đủ điều kiện để merge.

**Final Verdict:** `STRICT PASS`
