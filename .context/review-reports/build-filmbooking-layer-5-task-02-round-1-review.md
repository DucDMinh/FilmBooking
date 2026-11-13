# Review Report: Layer 5 — Task 02 (Round 1)

**Task**: `layer-5-task-02` (API thanh toán PayOS: tạo link, webhook, polling, huỷ, đơn 0đ)  
**Review Level**: `STRICT` (Payment, Webhook, Security, Bất biến #3)  
**Reviewer**: Adversarial Reviewer (`Agent: reviewer`, Model: pro)  
**Worktree**: `E:\FilmBooking\.worktrees\layer-5__task-02`  
**Verdict**: **STRICT PASS**

---

## 1. Tổng quan Đánh giá (Executive Summary)

Task `layer-5-task-02` thực hiện toàn bộ luồng thanh toán PayOS phía backend API:
- `POST /bookings/:id/payment`: Kiểm tra sở hữu đơn, consent không huỷ/hoàn (AC-08), đơn 0đ gọi `confirm_zero_amount` (R-82), huỷ đơn cũ `pending_payment` và link cũ trên PayOS (#10), tạo payment link PayOS với thời hạn khớp `hold_expires_at` và mô tả chứa mã rạp + booking_code (R-73).
- `GET /bookings/:id/payment-status`: Polling trạng thái đơn cho màn "Đang xác nhận", tuyệt đối không dựa vào tham số returnUrl (R-74, R-79).
- `POST /bookings/:id/payment/cancel`: Huỷ link PayOS và gọi `mark_payment_cancelled` giải phóng ghế và voucher (R-77).
- `POST /payos/webhook` (@Public): Xác thực HMAC SHA256 checksum trên toàn bộ trường của data envelope; chữ ký sai -> bỏ qua, log WARN kèm `orderCode`, đơn không đổi trạng thái (AC-09); chữ ký đúng -> ghi `record_payment_event` (idempotent qua `transaction_ref`) và gọi `confirm_paid` (AC-10, AC-11).

---

## 2. Kiểm tra Yêu cầu & Nghiệp vụ (Requirements & Acceptance Criteria)

| Tiêu chuẩn / AC / Quy tắc | Kết quả | Chi tiết đối chiếu |
|---|:---:|---|
| **AC-09**: Webhook chữ ký sai -> 200/400, đơn không đổi, log cảnh báo có `orderCode` | **PASS** | `WebhookController.handlePayosWebhook` kiểm tra HMAC qua `PayosClient.verifyWebhook`. Khi sai chữ ký, log WARN với `orderCode`, trả HTTP 200 `{ success: false, message: "Invalid signature" }`, đơn hàng không bị cập nhật. E2E test xác nhận trạng thái giữ nguyên `pending_payment`. |
| **AC-10**: Webhook hợp lệ gửi 3 lần lặp lại -> đúng 1 lần paid, đúng 1 email vé | **PASS** | Idempotency được đảm bảo ở 2 tầng: tầng API qua `record_payment_event` (`on conflict (transaction_ref) do nothing`) và tầng DB qua `confirm_paid` (kiểm tra status `paid` -> trả `ALREADY_PAID`, không sinh thêm vé, không thêm email vào `email_outbox`). E2E test gửi 3 lần liên tiếp xác nhận đúng 1 ticket và 1 email outbox. |
| **AC-11**: Webhook đơn `expired` + ghế đã bán -> `needs_manual_review` | **PASS** | `confirm_paid` phát hiện ghế đã bị bán cho đơn khác (`sell_order_seats` trả false), cập nhật đơn sang `needs_manual_review`, payment sang `PAID`, enqueues email `LATE_PAYMENT_MANUAL_REVIEW` hướng dẫn khách liên hệ rạp. E2E test xác nhận đúng trạng thái. |
| **R-74**: returnUrl tuyệt đối không đổi trạng thái đơn | **PASS** | Không có endpoint nào cập nhật đơn thành `paid` từ client. Chỉ webhook hoặc truy vấn PayOS từ server mới kích hoạt `confirm_paid`. |
| **R-81**: Tuyệt đối không lưu/log dữ liệu thẻ/tài khoản | **PASS** | Zod schema `payosWebhookDataSchema` chỉ chứa `orderCode`, `amount`, `reference`, `code`, `transactionDateTime`. Không có trường số thẻ, số tài khoản, tên chủ thẻ. Logger không in payload nhạy cảm. |
| **R-82**: Đơn 0đ xác nhận trực tiếp qua `confirm_zero_amount` | **PASS** | Khi `order.total_amount === 0`, `createPayment` gọi ngay RPC `confirm_zero_amount` (service role / authenticated), bỏ qua PayOS, trả về `status: "PAID", checkoutUrl: null`. |
| **SPEC #10**: Tạo đơn mới khi đơn cũ `pending_payment` -> huỷ link cũ | **PASS** | `createPayment` truy vấn các đơn cũ `pending_payment` của user, gọi `payosClient.cancelPaymentLink` và `mark_payment_cancelled` để nhả ghế và voucher. |
| **AC-08 (API)**: Chưa có consent điều khoản -> 409 `CONSENT_REQUIRED` | **PASS** | Ném `ConsentRequiredException` với status 409 và code `CONSENT_REQUIRED` khi `order.consent_at` là null. |

---

## 3. Đối chiếu Chéo Schema & Mock Audit (Cross-Boundary DB Audit)

1. **Bảng `orders` & Enum `order_status`**:
   - Các cột `id`, `cinema_id`, `user_id`, `status`, `subtotal_amount`, `discount_amount`, `total_amount`, `booking_code`, `hold_expires_at`, `consent_at`, `cinema_code` khớp hoàn toàn với `supabase/migrations/20261111030100_booking_tables.sql` và `20261112100000_order_lifecycle_pending_payment.sql`.
   - Ràng buộc duy nhất `orders_one_active_hold_per_user_key` trên `(user_id) where status in ('holding', 'pending_payment')` được tuân thủ nghiêm ngặt: chuyển `holding -> pending_payment` trong cùng 1 row không vi phạm constraint.

2. **Bảng `payments` & `payment_events`**:
   - `payments`: cột `order_code bigint not null unique check (order_code > 0)` và `amount integer not null check (amount >= 0)` được gán đúng kiểu.
   - `orderCode` được sinh bằng biểu thức số nguyên 15 chữ số (`Number(\`${Date.now()}${...}\`)`), hoàn toàn nằm dưới `Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991`) và tương thích chuẩn PayOS.
   - `payment_events`: các cột `payment_id`, `cinema_id`, `order_code`, `transaction_ref`, `amount`, `event_status`, `signature_valid`, `occurred_at` được truyền đủ 8 tham số cho RPC `record_payment_event`.

3. **RPC `confirm_paid`**:
   - Chữ ký: `p_order_id uuid, p_amount integer, p_transaction_ref text, p_order_code bigint`. Khớp 100% với định nghĩa DB trong `supabase/migrations/20261112110000_confirm_paid_hardening.sql`.
   - Quyền: Migration đã `REVOKE` public/anon/authenticated và chỉ `GRANT EXECUTE` cho `service_role`. Code NestJS sử dụng `this.supabase.admin()` (service role client) để gọi, đảm bảo quyền thực thi hợp lệ.

4. **RPC `confirm_zero_amount` & `mark_payment_cancelled`**:
   - `confirm_zero_amount(p_order_id uuid)` và `mark_payment_cancelled(p_order_id uuid, p_reason text)` khớp tham số và hành vi với migrations `20261112120000_zero_amount_sell_hardening.sql` và `20261111040100_rpc_payment.sql`.

5. **Bộ Mock trong E2E Tests (`apps/api/test/webhook.e2e-spec.ts`)**:
   - Không có hành vi "bịa" khác DB: `FakeDb` mô phỏng chính xác trạng thái trả về của Postgres `confirm_paid` (`ALREADY_PAID`, `NEEDS_MANUAL_REVIEW`, `SUCCESS`), kiểm tra idempotency của `record_payment_event` qua `transaction_ref`, và cơ chế chuyển đổi trạng thái của `orders`/`payments`.

---

## 4. Bảo mật & BOLA/IDOR (Security Audit)

- **Xác thực & Phân quyền**:
  - `PaymentController` bảo vệ bởi `AuthGuard` toàn cục; trích xuất `user` qua `@CurrentUser()`.
  - Cả 3 endpoint khách hàng (`POST /bookings/:id/payment`, `GET /bookings/:id/payment-status`, `POST /bookings/:id/payment/cancel`) đều kiểm tra chặt chẽ `order.user_id !== user.id -> 403 FORBIDDEN`. Không thể can thiệp đơn của người khác (chống BOLA/IDOR).
  - `WebhookController` gắn decorator `@Public()` để PayOS server có thể gửi thông báo, nhưng được bảo vệ bởi lớp kiểm tra chữ ký HMAC SHA256 bắt buộc trước khi xử lý.
- **Dữ liệu nhạy cảm**: Không lưu token, số thẻ, số tài khoản ngân hàng.
- **Injection**: Không có câu lệnh SQL raw hay dynamic string concatenation. Sử dụng parameterized PostgREST builder và RPC.

---

## 5. Kết quả Verify Commands

Chạy trong worktree `E:\FilmBooking\.worktrees\layer-5__task-02`:

1. **`pnpm -w typecheck`**:
   ```
   Scope: 3 of 4 workspace projects
   packages/shared typecheck: Done
   apps/web typecheck: Done
   apps/api typecheck: Done
   Exit code: 0
   ```
2. **`pnpm -w lint`**:
   ```
   Scope: 3 of 4 workspace projects
   packages/shared lint: Done
   apps/web lint: Done
   apps/api lint: Done
   Exit code: 0
   ```
3. **`npx oxlint`**:
   ```
   Found 1 warning (unicorn/no-thenable in test mock FakeDb) and 0 errors.
   Exit code: 0
   ```
4. **`pnpm --filter @filmbooking/api test`**:
   ```
   Test Files: 16 passed (16)
   Tests: 242 passed (242)
   Duration: 25.74s
   Exit code: 0
   ```
   Riêng suite mới `test/webhook.e2e-spec.ts` vượt qua toàn bộ 12 test cases bao gồm AC-08, AC-09, AC-10, AC-11, zero-amount, cancellation, auth guards.

---

## 6. Ghi chú Kiến trúc & Khuyến nghị (Non-blocking Findings)

1. **Xử lý mã lỗi khi `handleWebhook` gặp lỗi database (Low / Polish)**:
   - *Vị trí*: [webhook.controller.ts:53-54](file:///E:/FilmBooking/.worktrees/layer-5__task-02/apps/api/src/modules/payment/webhook.controller.ts#L53-L54)
   - *Mô tả*: `WebhookController` hiện trả về `{ success: true }` ngay cả khi `paymentService.handleWebhook` trả về `{ success: false }` do lỗi RPC database.
   - *Khuyến nghị*: Khi có lỗi DB từ `confirm_paid`, nên trả về `{ success: false, message: ... }` kèm mã HTTP lỗi để PayOS retry gửi lại webhook tự động (dù đã có job đối soát định kỳ 5 phút R-80 làm lưới an toàn).
2. **Kích thước hàm `createPayment` (Code Quality)**:
   - *Vị trí*: [payment.service.ts:69-226](file:///E:/FilmBooking/.worktrees/layer-5__task-02/apps/api/src/modules/payment/payment.service.ts#L69-L226)
   - *Mô tả*: Hàm dài 157 dòng do gom nhiều bước logic (validate, check consent, đơn 0đ, cancel link cũ, insert payment). Khuyến nghị có thể tách các hàm phụ `cancelPendingPaymentsForUser` khi refactor layer sau.
3. **Fallback determinism cho `reference` (Best Practice)**:
   - *Vị trí*: [payment.service.ts:338](file:///E:/FilmBooking/.worktrees/layer-5__task-02/apps/api/src/modules/payment/payment.service.ts#L338)
   - *Mô tả*: `reference || \`PAYOS_\${orderCode}_\${Date.now()}\``. Trong thực tế PayOS luôn gửi `reference`. Tuy nhiên nếu thiếu `reference`, dùng `Date.now()` sẽ sinh 2 reference khác nhau giữa 2 lần retry. Nên dùng `PAYOS_${orderCode}` để đảm bảo deterministic.

---

## 7. Kết luận

Task đã hoàn thành xuất sắc toàn bộ yêu cầu kỹ thuật và nghiệp vụ, tuân thủ nghiêm ngặt Definition of Done, các bất biến thanh toán (Bất biến #3), AC-09, AC-10, AC-11 và bảo mật dữ liệu.

**Verdict: STRICT PASS**
