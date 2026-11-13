# Review Report: bug-layer5-review · phase-4-task-11 — Test Suite Hardening & False Confidence Elimination

- **Agent:** reviewer
- **Task:** `tasks/bug-layer5-review/phase-4-task-11.md`
- **Round:** 1
- **Review Level:** STRICT (Cổng kiểm tra Test Quality / Anti-False-Confidence)
- **Verdict:** STRICT PASS

---

## 1. Bối cảnh & Mục tiêu Thẩm định

Task 11 tập trung xử lý các rủi ro "xanh giả" (false-confidence) trong 3 bộ kiểm thử e2e trọng yếu của hệ thống API:
1. `apps/api/test/webhook.e2e-spec.ts`:
   - FakeDb `confirm_paid` mô phỏng chính xác hành vi của RPC PostgreSQL khi gặp `AMOUNT_MISMATCH` (`p_amount !== order.total_amount`).
   - Thêm test case webhook nhận số tiền không khớp -> chuyển `order.status = "needs_manual_review"`, cập nhật payment thực tế, tạo outbox email cho CSKH, trả HTTP 200 cho PayOS.
   - Thêm test case `verifyWebhook` trả về `null` an toàn khi thiếu biến môi trường `PAYOS_CHECKSUM_KEY`.
2. `apps/api/test/admin.e2e-spec.ts`:
   - Khắc phục test case audit log `seat_hold_minutes_web` bị xanh giả do pre-seeded row trong `fakeDb.reset()`.
   - Seed row chuyển sang `default_cleaning_minutes`, test case kiểm tra động việc tạo mới audit log với `action: "UPDATE"`, `record_id: "seat_hold_minutes_web"`, `actor_id: ADMIN`, và `after_data.value: 15`.
3. `apps/api/test/orders-report.e2e-spec.ts`:
   - FakeDb `rpc()` không còn mock kiểm tra token dạng substring sơ sài; thực hiện giải mã JWT payload trích xuất `sub` làm `callerId`.
   - Kiểm tra RBAC thực chất và trả mã lỗi PostgreSQL `42501` khi Staff hoặc Manager khác rạp cố truy cập RPC báo cáo hoặc RPC `resolve_manual_review`.

---

## 2. Chi tiết Kết quả Thẩm định Đối chiếu Chéo (Adversarial Cross-Boundary Audit)

### 2.1 Webhook & RPC `confirm_paid` (`apps/api/test/webhook.e2e-spec.ts`)
- **Đối chiếu Schema PostgreSQL (`supabase/migrations/20261113160000_confirm_paid_order_code_lookup.sql`):**
  + Trong hàm `public.confirm_paid`, tại dòng 139-155: khi `p_amount is distinct from v_order.total_amount`, trigger và logic chuyển trạng thái đơn hàng sang `needs_manual_review`, ghi nhận sự kiện `AMOUNT_MISMATCH` vào `payment_events`, ghi `audit_logs`, chèn `email_outbox` với payload mismatch, và trả về:
    ```json
    {
      "success": false,
      "status": "AMOUNT_MISMATCH",
      "order_status": "needs_manual_review",
      "order_id": "...",
      "expected_amount": 150000,
      "received_amount": 100000
    }
    ```
  + **Đánh giá FakeDb trong test:**
    + FakeDb tại dòng 265-288 mô phỏng đúng: khi `p_amount !== order.total_amount`, cập nhật `order.status = "needs_manual_review"`, gán `pay.amount = pAmount`, `pay.status = "PAID"`, push outbox email `LATE_PAYMENT_MANUAL_REVIEW`, và trả về `status: "AMOUNT_MISMATCH"`.
  + **Đánh giá Service & Controller (`PaymentService` & `WebhookController`):**
    + `PaymentService.handleWebhook` nhận `status: "AMOUNT_MISMATCH"` từ RPC, nhận diện đây là kết quả kinh doanh (business outcome) hợp lệ được ghi nhận thành công trong DB, trả về `{ success: true, status: "AMOUNT_MISMATCH", result: confirmResult }`.
    + `WebhookController` xác nhận kết quả thành công và phản hồi HTTP 200 `{ success: true }` cho PayOS để PayOS không retry lặp vô hạn.
  + **Đánh giá Test Case Mismatch:**
    + Test case `webhook nhận số tiền không khớp (AMOUNT_MISMATCH) -> chuyển needs_manual_review và trả HTTP 200 cho PayOS` gửi orderCode 999903 với amount 100,000 (so với total 150,000) kèm HMAC signature hợp lệ.
    + Assertions kiểm tra đầy đủ: HTTP 200, `order.status === "needs_manual_review"`, `payment.amount === 100000`, `payment.status === "PAID"`, và `emailOutbox` chứa email CSKH.
  + **Đánh giá Test Case Missing Checksum Key:**
    + Test case `verifyWebhook: trả về null an toàn khi thiếu PAYOS_CHECKSUM_KEY` khởi tạo `PayosClient` với config thiếu key, kiểm tra kết quả trả về `null` thay vì văng unhandled exception.

### 2.2 Admin Audit Log Dynamic Verification (`apps/api/test/admin.e2e-spec.ts`)
- **Điểm mù cũ (False Confidence):**
  + Trước đây, `fakeDb.reset()` khởi tạo sẵn một bản ghi audit log với `record_id: "seat_hold_minutes_web"` và `value: 10`. Do đó test case chỉ cần `find` theo `record_id` là pass dù controller/trigger có ghi audit log mới hay không.
- **Khắc phục trong Task 11:**
  + Dòng 82: `record_id` của bản ghi seed được đổi thành `"default_cleaning_minutes"`.
  + Tại dòng 735-742: Sau khi gửi request PUT cập nhật `seat_hold_minutes_web` thành 15, test kiểm tra tìm audit log với `table_name: "app_settings"`, `record_id: "seat_hold_minutes_web"`.
  + Assertions xác nhận:
    + `audit` tồn tại (do mô phỏng trigger update tại dòng 385-398 sinh ra).
    + `audit.action === "UPDATE"`.
    + `audit.actor_id === ADMIN` (khớp với JWT admin caller).
    + `audit.after_data.value === 15` (chứng minh dữ liệu được cập nhật động, không phải dữ liệu cũ).

### 2.3 Orders & Report RBAC Hardening (`apps/api/test/orders-report.e2e-spec.ts`)
- **Cơ chế xác thực caller:**
  + FakeDb triển khai trích xuất JWT qua `this.currentJwt`:
    ```typescript
    const part = this.currentJwt.split(".")[1];
    const payload = JSON.parse(Buffer.from(part, "base64").toString());
    callerId = payload.sub ?? null;
    ```
  + Không còn so sánh chuỗi substring dễ sai lệch, đảm bảo callerId phản ánh đúng danh tính người gọi từ token ký hợp lệ.
- **Mô phỏng RBAC thực tế của Postgres RLS/RPC:**
  + Khi `isCallerStaff` (từ bảng `staff_assignments`), RPC lập tức trả về lỗi Postgres: `{ code: "42501", message: "FORBIDDEN_CINEMA_SCOPE" }`.
  + Khi `isCallerManagerHn01` nhưng truyền `pCinemaId === HN02`, RPC trả về lỗi Postgres: `{ code: "42501", message: "FORBIDDEN_CINEMA_SCOPE" }`.
  + Trong RPC `resolve_manual_review`: kiểm tra caller có quyền `ADMIN` trong `user_roles` hoặc `MANAGER` của đúng rạp sở hữu đơn hàng trong `staff_assignments`. Nếu không, trả về `{ code: "42501", message: "FORBIDDEN_SCOPE" }`.
- **Độ bao phủ của Test Suite:**
  + Test Staff gọi `/reports/revenue` -> 403 `FORBIDDEN`.
  + Test Staff gọi `/orders/needs-manual-review` -> 403 `FORBIDDEN`.
  + Test Staff gọi `/orders/:id/resolve-manual-review` -> 403 `FORBIDDEN`.
  + Test Manager HN02 gọi `/orders/:id/resolve-manual-review` với đơn của HN01 -> 403 `FORBIDDEN_CINEMA`.
  + Test Manager HN01 gọi xử lý đơn HN01 -> thành công (201/200), đơn giữ nguyên trạng thái `needs_manual_review` và cập nhật `manual_review_resolved_at`.

---

## 3. Verification Commands & Thực thi Thực tế

| Lệnh kiểm tra | Kết quả | Chi tiết |
|---|---|---|
| `pnpm --filter @filmbooking/api test test/webhook.e2e-spec.ts test/admin.e2e-spec.ts test/orders-report.e2e-spec.ts` | **PASS (exit code 0)** | 3/3 test files passed, 81/81 test cases passed. |
| `pnpm --filter @filmbooking/api typecheck` | **PASS (exit code 0)** | `tsc -p tsconfig.json` hoàn tất không có lỗi typecheck nào. |
| `pnpm --filter @filmbooking/api lint` | **PASS (exit code 0)** | `eslint src test` sạch 100%, không vi phạm cú pháp hay rule nào. |
| `pnpm --filter @filmbooking/api test` (Toàn bộ API test suite) | **PASS (exit code 0)** | 22/22 test files passed, 414/414 test cases passed. Không có regression. |

---

## 4. Kết luận

Toàn bộ các yêu cầu của Task 11 (Phase 4) về việc loại bỏ các điểm "xanh giả", siết chặt tính chân thực của bộ mock FakeDb đối chiếu chéo với schema PostgreSQL thực tế và kiểm thử biên cho Webhook, Admin Audit, Orders RBAC đã được hoàn thiện chặt chẽ, chính xác và đạt tiêu chuẩn cao nhất.

**Verdict: STRICT PASS**
