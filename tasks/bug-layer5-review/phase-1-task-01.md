# Bug layer5-review · phase-1-task-01 — PayOS Webhook Race & Duplicate Payment Handling

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: `.context/review-reports/independent-review-layer-5-B-payment-mail.md` (K5-1, B/M1–M4)
- Root cause:
  1. **K5-1**: Khi khách thanh toán lại đơn `pending_payment`, `createPayment` chèn thêm dòng `payments` thứ 2. Trong migration `confirm_paid`, câu lệnh `SELECT ... FROM payments WHERE order_id = v_order.id FOR UPDATE` không lọc theo `p_order_code`, dẫn tới chọn dòng `CANCELLED` cũ. Sau đó update `order_code = p_order_code` gây đụng unique key `23505` (`payments_order_code_key`), khiến toàn bộ `confirm_paid` bị rollback. `webhook.controller.ts` nuốt lỗi và luôn trả `200 { success: true }`, khiến PayOS ngừng retry, khách mất tiền mà không có vé, không vào manual review.
  2. **B/M1**: `webhook.controller.ts` bỏ qua kết quả `handleWebhook`, nuốt lỗi `record_payment_event` và lỗi đọc `payments`.
  3. **B/M2**: SPEC #10 hủy link cũ khi đơn cũ `pending_payment` không có tác dụng trên DB thật do `hold_seats` đã hủy đơn cũ trước đó mà không báo PayOS; link cũ vẫn mở thanh toán.
  4. **B/M3**: `payos.client.ts` và `env.ts` fail-open: thiếu biến `PAYOS_*` ở `production` vẫn trả mock URL giả thay vì báo lỗi.
  5. **B/M4**: Có thể tạo nhiều link PayOS sống cho 1 đơn khi gọi đồng thời; bỏ qua kết quả `cancelPaymentLink`.
- Files to Create/Modify:
  - `supabase/migrations/20261113160000_confirm_paid_order_code_lookup.sql`
  - `packages/shared/src/database.types.ts`
  - `apps/api/src/modules/payment/payment.service.ts`
  - `apps/api/src/modules/payment/webhook.controller.ts`
  - `apps/api/src/modules/payment/payos.client.ts`
  - `apps/api/src/config/env.ts`
  - `apps/api/test/webhook.e2e-spec.ts`
- Status: done
- Review: STRICT PASS (Round 2, .context/review-reports/bug-layer5-review-phase-1-task-01-round-2-review.md)
- Doc impact: no doc impact (không đổi public contract; migration additive link_cancelled_at)

## Repro Verification
- Original repro:
  1. Giữ ghế và tạo payment lần 1 cho đơn -> có payment #1 với `orderCode_1`.
  2. Bấm thanh toán lại -> tạo payment #2 với `orderCode_2` (payment #1 đổi status `CANCELLED`).
  3. Bắn webhook thành công với `orderCode_2` -> `confirm_paid` bốc nhầm payment #1, cố gán `order_code = orderCode_2` -> văng lỗi `23505 (Unique violation)`.
  4. `webhook.controller.ts` bỏ qua lỗi, trả `200 { success: true }`.
  5. (Round 1 review defect B/M2): `hold_seats` huỷ đơn cũ và cập nhật `payments.status = 'CANCELLED'`. API tìm `status = 'PENDING'` nên không bao giờ tìm thấy payment cũ để gọi `cancelPaymentLink`.
- Expected:
  - `confirm_paid` tìm chính xác payment theo `order_code = p_order_code` trước, cập nhật đúng dòng payment #2 thành `PAID`, chốt đơn `paid` và sinh vé thành công.
  - Webhook controller kiểm tra kết quả `handleWebhook`; nếu gặp lỗi RPC/hạ tầng, trả mã lỗi HTTP 500 để PayOS retry.
  - `NODE_ENV=production` bắt buộc khai báo `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, ném ngoại lệ cấu hình nếu thiếu.
  - Khi tạo thanh toán mới, link cũ phải được hủy hợp lệ hoặc tái sử dụng an toàn, không tạo race condition link mồ côi. Đơn cũ dù đã bị `hold_seats` chuyển `CANCELLED` vẫn được truy vết qua `payment_link_id` và `link_cancelled_at is null` để huỷ link PayOS.
- Actual before fix: Lỗi 23505 rollback `confirm_paid`, webhook trả `200 { success: true }`, đơn kẹt `pending_payment`. Link PayOS của các đơn cũ bị `hold_seats` huỷ không bao giờ bị huỷ trên cổng PayOS do query lệch `status = 'PENDING'`.
- Actual after fix:
  1. Migration `20261113160000_confirm_paid_order_code_lookup.sql`: `confirm_paid` ưu tiên chọn chính xác dòng payment theo `order_code = p_order_code AND order_id = v_order.id FOR UPDATE;`, fallback theo `order_id` mới nhất (`ORDER BY created_at DESC LIMIT 1 FOR UPDATE;`). Khi thanh toán lại, webhook cho `orderCode_2` cập nhật chính xác dòng payment #2 thành `PAID`, không văng lỗi 23505, chốt đơn `paid`, sinh vé và enqueue email thành công. Bổ sung `alter table public.payments add column if not exists link_cancelled_at timestamptz;`.
  2. `webhook.controller.ts`: Phân biệt lỗi kỹ thuật và kết quả nghiệp vụ; ném `InternalServerErrorException` (HTTP 500) khi `paymentErr`, `eventErr`, hoặc `confirmErr` xảy ra để PayOS retry; trả `200 { success: true }` cho các kết quả nghiệp vụ hợp lệ (`SUCCESS`, `ALREADY_PAID`, `NEEDS_MANUAL_REVIEW`, `AMOUNT_MISMATCH`).
  3. `env.ts`: Trong `superRefine`, khi `NODE_ENV === "production"`, bắt buộc `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` phải có giá trị.
  4. `payos.client.ts`: Ném lỗi rõ ràng nếu `!this.payOS` và `NODE_ENV === "production"`; dùng `timingSafeEqual` an toàn trên buffers cho chữ ký; `cancelPaymentLink` xử lý lỗi đúng kèm log WARN.
  5. `payment.service.ts`: Tuần tự hoá `createPayment` bằng `inFlightCreatePayment` chống race condition tạo nhiều link PayOS; truy vấn payment mồ côi của các đơn cũ theo `status in ('PENDING', 'CANCELLED')`, `payment_link_id is not null` và `link_cancelled_at is null`; huỷ link PayOS (`cancelPaymentLink(op.order_code, "Huỷ đơn cũ")`) và cập nhật `status: 'CANCELLED'`, `link_cancelled_at: new Date().toISOString()`; thanh toán lại cùng đơn cũng cập nhật `link_cancelled_at` cho payment PENDING cũ.
  6. `database.types.ts`: Bổ sung `link_cancelled_at: string | null` vào Row, Insert, Update của bảng `payments`.
  7. `webhook.e2e-spec.ts`: Sửa fixture DB đúng thực tế DB sau `hold_seats` (`status: "CANCELLED"`, `payment_link_id: "link-payos-999901"`, `link_cancelled_at: null`), bổ sung `.is()` và `.not()` cho `Query`, viết test kiểm chứng huỷ link PayOS mồ côi và ghi nhận `link_cancelled_at`, đồng thời kiểm chứng idempotent không huỷ lại payment đã có `link_cancelled_at`.
- Evidence:
  - Vitest: `cd apps/api && pnpm test test/webhook.e2e-spec.ts` -> 19/19 tests PASS (bao gồm K5-1 retry payment không lỗi 23505, B/M1 webhook trả 500 khi RPC/DB lỗi, B/M2 huỷ link PayOS đơn cũ CANCELLED & idempotent không gọi lại khi đã có link_cancelled_at, B/M3 validate production env & client, B/M4 timingSafeEqual và cancelPaymentLink).
  - Toàn bộ suite `apps/api`: 22 test files (381 tests) PASS.
  - `pnpm typecheck` (packages/shared + apps/web + apps/api): PASS (exit code 0).
  - `pnpm lint` (packages/shared + apps/web + apps/api): PASS (exit code 0).
- Status: PASS (ready for review round 2)
