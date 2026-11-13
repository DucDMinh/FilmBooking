# Review Báo Cáo Nghiệm Thu: bug-layer5-review · phase-2-task-05

Agent: reviewer
Ngày: 2026-11-13
Mục tiêu review: Nghiệm thu các bản sửa lỗi thuộc nhóm C4-1 (Checkin Status Color) và C8-1, C8-2, C8-3 (Cancellation Safety & Range Validation).

---

## 1. Review Level & Verdict

- **Review Level:** `STRICT`
- **Verdict:** `STRICT PASS`

**Lý do chọn STRICT:** Task tác động trực tiếp đến an ninh dữ liệu (CSV Formula Injection), luồng tài chính hoàn tiền thủ công (chống race condition, chống hoàn vượt giá trị đơn hàng `total_amount`), luồng thông báo gửi mail (chống spam/gửi trùng khi email đang chờ hoặc đã gửi) và tính nhất quán UX/bảo mật soát vé (AC-12, R-98).

---

## 2. Blast Radius & Files Audited

- `packages/shared/src/schemas/checkin.ts`: Bảng màu kết quả soát vé `SCAN_RESULT_COLOR`.
- `packages/shared/src/schemas/cancellation.ts`: Ràng buộc `recordRefundSchema`.
- `apps/api/src/modules/cancellation/affected-csv.ts`: Hàm `escapeCsvField` khử formula injection.
- `apps/api/src/modules/cancellation/cancellation.service.ts`: Nghiệp vụ `recordRefund` và `resendEmail`.
- `apps/api/test/checkin.e2e-spec.ts`: E2E test cho soát vé.
- `apps/api/test/cancellation.e2e-spec.ts`: E2E test cho xuất CSV, hoàn tiền và gửi lại email.
- `supabase/migrations/20261111030100_booking_tables.sql`: Schema `orders`, `affected_order_actions`, trigger validation.
- `supabase/migrations/20261111020100_security_ops.sql`: Schema `email_outbox`, enum `outbox_status`.
- `supabase/migrations/20261111040300_rpc_cancel.sql`: Cột `cancel_reason` trên `orders`.

---

## 3. Verify Commands & Automated Results

| Kiểm tra | Lệnh thực thi | Kết quả |
|---|---|---|
| E2E Test Suite | `pnpm --filter api test test/checkin.e2e-spec.ts test/cancellation.e2e-spec.ts` | **PASS** (42/42 tests pass, thời gian 6.36s) |
| Linter | `pnpm eslint packages/shared/src/schemas/checkin.ts packages/shared/src/schemas/cancellation.ts apps/api/src/modules/cancellation/affected-csv.ts apps/api/src/modules/cancellation/cancellation.service.ts apps/api/test/checkin.e2e-spec.ts apps/api/test/cancellation.e2e-spec.ts` | **PASS** (0 errors, 0 warnings) |
| Shared Typecheck | `pnpm --filter shared typecheck` | **PASS** (Exit code 0) |

---

## 4. Chi tiết kiểm tra các tiêu chí khắt khe (Cross-Boundary & Adversarial Audit)

### 4.1. C4-1 — Checkin Result Color (Màu trạng thái soát vé)
- **Yêu cầu:** AC-12, R-98 và design-spec yêu cầu: chỉ `OK` hiển thị màu xanh (`"green"`), các trường hợp còn lại bao gồm vé đã sử dụng (`USED`) và chưa tới giờ chiếu (`TOO_EARLY`) phải hiển thị màu đỏ cảnh báo (`"red"`).
- **Kiểm tra code:**
  - File `packages/shared/src/schemas/checkin.ts`:
    - `SCAN_RESULT_COLOR.USED` đã chuyển thành `"red"`.
    - `SCAN_RESULT_COLOR.TOO_EARLY` đã chuyển thành `"red"`.
    - Mọi mã lỗi khác (`WRONG_CINEMA`, `CANCELLED`, `EXPIRED`, `NOT_FOUND`, `SHOWTIME_NOT_FOUND`) giữ nguyên `"red"`. Chỉ `OK` là `"green"`.
  - Service `apps/api/src/modules/checkin/checkin.service.ts:43`:
    - Gán `color: SCAN_RESULT_COLOR[result]`.
  - E2E Test `apps/api/test/checkin.e2e-spec.ts:208, 223`:
    - Test case `USED` assert `color: "red"`.
    - Test case `TOO_EARLY` assert `color: "red"`.
- **Đánh giá:** **ĐẠT**. Khớp chính xác AC-12, loại bỏ hoàn toàn false-confidence từ test cũ.

---

### 4.2. C8-1 — CSV Formula Injection Mitigation
- **Yêu cầu:** Vô hiệu hóa nguy cơ chèn formula injection cho bảng tính (Excel/Calc) khi mở tệp CSV xuất đơn hàng bị ảnh hưởng. Bắt buộc kiểm tra và prepend ký tự `'` trước tất cả các ký tự khởi đầu nguy hiểm: `=`, `+`, `-`, `@`, `\t` (tab), `\r` (carriage return).
- **Kiểm tra code:**
  - File `apps/api/src/modules/cancellation/affected-csv.ts:29-35`:
    ```ts
    let str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
    ```
    - Regex `/^[=+\-@\t\r]/` bao phủ toàn bộ 6 ký tự nguy hiểm.
    - Quá trình prepend `'` diễn ra trước khi kiểm tra escape dấu quote `""`, đảm bảo chuỗi có chứa dấu phẩy hay xuống dòng vẫn được bọc trong nháy kép và giữ nguyên tiền tố `'`.
    - Mọi trường dữ liệu trong hàng (tên rạp, phim, phòng, ghi chú, mã GD, số điện thoại, email...) đều được duyệt qua `escapeCsvField`.
  - E2E Test `apps/api/test/cancellation.e2e-spec.ts:1044-1075`:
    - Test đã nạp payload độc hại gồm cả 6 ký tự: `=cmd|'/c calc'!A0`, `+Phòng 1`, `@CustomerEvil`, `-\t0912345678`, `\rtest@example.com`.
    - Assertion xác nhận chuỗi xuất hiện trong CSV đều có tiền tố `'` (`'=cmd...`, `'+Phòng...`, `'@Customer...`, `'-\t...`, `'\rtest...`).
- **Đánh giá:** **ĐẠT**. Chống tấn công Formula Injection chuẩn xác, không làm hỏng định dạng CSV UTF-8 BOM.

---

### 4.3. C8-2 — Resend Email Safe (An toàn gửi lại email)
- **Yêu cầu:**
  1. Chỉ cho phép gửi lại khi trạng thái email là `FAILED` hoặc chưa có bản ghi outbox.
  2. Chặn `409 CONFLICT` nếu email đang ở trạng thái `PENDING` (tránh worker đang claim hoặc sắp gửi) hoặc `SENT` (tránh spam gửi trùng cho khách).
  3. Truy vấn trực tiếp DB theo `payload->>order_id` thay vì tải toàn bộ bảng `email_outbox` về bộ nhớ lọc bằng JS.
  4. Bổ sung đầy đủ thông tin rạp/phim/phòng/suất chiếu vào payload outbox để template không bị rơi vào giá trị mặc định.
  5. Bắt và xử lý lỗi update/insert từ database, không nuốt lỗi.
- **Kiểm tra code & Cross-Boundary DB Schema:**
  - Database schema (`supabase/migrations/20261111020100_security_ops.sql:144-157`):
    - Bảng `email_outbox` có enum `outbox_status`: `'PENDING', 'SENT', 'FAILED'`.
    - Cột `payload` kiểu `jsonb`, `to_email` kiểu `text`.
  - Database schema (`supabase/migrations/20261111030100_booking_tables.sql:84-88` & `20261111040300_rpc_cancel.sql:12`):
    - Bảng `orders` có đầy đủ các cột snapshot: `movie_title`, `cinema_name`, `room_name`, `showtime_starts_at`, `cancel_reason`.
  - Service `apps/api/src/modules/cancellation/cancellation.service.ts:501-594`:
    - Query `orders` lấy đủ: `id, cinema_id, cinema_name, movie_title, room_name, showtime_starts_at, status, contact_email, booking_code, cancel_reason`.
    - Query `email_outbox` trực tiếp qua `.filter("payload->>order_id", "eq", orderId).order("created_at", { ascending: false })`.
    - Kiểm tra `outboxError` -> ném `AppException(ERROR_CODES.INTERNAL_ERROR)`.
    - Kiểm tra `existing.status === "PENDING" || existing.status === "SENT"` -> ném `AppException(ERROR_CODES.CONFLICT)` (tương ứng HTTP status 409).
    - Khi `existing.status === "FAILED"`: update `status = 'PENDING'`, `next_attempt_at = now()`, `last_error = null`. Kiểm tra `updateError`.
    - Khi chưa có bản ghi: insert bản ghi mới với `payload` gồm đầy đủ `cinema_name`, `movie_title`, `room_name`, `showtime_starts_at`, `reason`. Kiểm tra `insertError`.
  - E2E Test `apps/api/test/cancellation.e2e-spec.ts:897-960`:
    - Kiểm tra trạng thái `PENDING` -> trả về 409 CONFLICT.
    - Kiểm tra trạng thái `SENT` -> trả về 409 CONFLICT.
    - Kiểm tra trường hợp đơn chưa có email -> tạo mới với payload đầy đủ các trường snapshot rạp/phim.
- **Đánh giá:** **ĐẠT**. Khắc phục triệt để lỗ hổng spam và gửi trùng email, tối ưu hoá DB query.

---

### 4.4. C8-3 — Refund Safety & Range Validation (An toàn hoàn tiền & chặn hoàn trùng)
- **Yêu cầu:**
  1. Chỉ cho phép hoàn tiền đối với đơn hàng đang ở trạng thái `affected`. Nếu đơn không ở trạng thái `affected` (ví dụ: `paid`, `refunded_manual`) -> trả về `409 CONFLICT`.
  2. Chặn hoàn tiền trùng lặp (race condition / double-refund) thông qua kiểm tra bảng `affected_order_actions` (`action = 'REFUNDED_MANUAL'`) -> trả về `409 CONFLICT`.
  3. Kiểm tra số tiền hoàn: bắt buộc `0 < refundedAmount <= orders.total_amount`. Nếu `<= 0` hoặc `> total_amount` -> trả về `422 UNPROCESSABLE_ENTITY`.
  4. Bắt lỗi và xử lý ngoại lệ database khi insert `affected_order_actions` và update `orders`.
- **Kiểm tra code & Cross-Boundary DB Schema:**
  - Schema `packages/shared/src/schemas/cancellation.ts:61-65`:
    - `refundedAmount: z.number().int().min(1).max(MAX_AMOUNT_VND)`.
  - Service `apps/api/src/modules/cancellation/cancellation.service.ts:352-482`:
    - Kiểm tra `input.refundedAmount <= 0` -> ném 422 `VALIDATION_ERROR`.
    - Query `orders` lấy thêm cột `total_amount`.
    - Kiểm tra `order.status !== "affected"` -> ném 409 `CONFLICT`.
    - Query kiểm tra `existingAction` trong `affected_order_actions` với `action = 'REFUNDED_MANUAL'` -> ném 409 `CONFLICT`.
    - Kiểm tra `input.refundedAmount > totalAmount` -> ném 422 `VALIDATION_ERROR`.
    - Insert vào `affected_order_actions` có kiểm tra `insertError`.
    - Update `orders.status = 'refunded_manual'` có kiểm tra `updateError`.
  - E2E Test `apps/api/test/cancellation.e2e-spec.ts:689-794`:
    - Test `refundedAmount = 0` -> trả về 422 `VALIDATION_ERROR`.
    - Test `refundedAmount = 200000` (vượt `total_amount = 150000`) -> trả về 422 `VALIDATION_ERROR`.
    - Test đơn có trạng thái `paid` -> trả về 409 `CONFLICT`.
    - Test thao tác hoàn tiền lần 2 trên đơn đã hoàn -> trả về 409 `CONFLICT`.
- **Đánh giá:** **ĐẠT**. Bảo vệ toàn vẹn dữ liệu tài chính và báo cáo đối soát doanh thu.

---

## 5. Surgical Changes & Code Quality Audit

- Toàn bộ thay đổi tập trung chính xác vào 6 file thuộc phạm vi task, không phát sinh drive-by refactor hay thay đổi ngoài ý muốn.
- Không có dead code, không có commented code thừa, không có `as any`.
- Tuân thủ quy định linter và conventions của dự án.

---

## 6. Kết Luận

Tất cả 4 mục defect (C4-1, C8-1, C8-2, C8-3) đã được sửa chữa triệt để, đối chiếu chéo chính xác với Postgres migrations và được bảo vệ bằng các bài kiểm thử E2E nghiêm ngặt.

**Kết quả nghiệm thu: STRICT PASS.**
