# Báo cáo Review Nghiệm thu Nghiêm ngặt (STRICT Review Report)
## Task: bug-layer5-review · phase-1-task-01 — PayOS Webhook Race & Duplicate Payment Handling

- **Agent:** reviewer (Reviewer độc lập)
- **Review level:** STRICT
- **Mục tiêu nghiệm thu:** K5-1 (C1), B/M1, B/M2, B/M3, B/M4 từ báo cáo gốc `.context/review-reports/independent-review-layer-5-B-payment-mail.md`
- **Ngày review:** 2026-11-13
- **Verdict:** **FAIL**

---

## 1. Tóm tắt kết quả theo tiêu chí

| Tiêu chí | Nội dung kiểm tra | Kết quả | Chi tiết |
|---|---|---|---|
| **K5-1** | `confirm_paid` ưu tiên chọn payment theo `p_order_code`, chống va chạm unique key `23505` (`payments_order_code_key`) khi thanh toán lại | **PASS** | Migration `20261113160000_confirm_paid_order_code_lookup.sql` đã ưu tiên `order_code = p_order_code AND order_id = v_order.id FOR UPDATE;` trước khi fallback. |
| **B/M1** | `webhook.controller.ts` không nuốt lỗi, trả HTTP 500 khi DB/RPC lỗi, phân biệt kết quả nghiệp vụ | **PASS** | Controller kiểm tra `webhookResult.success`, ném `InternalServerErrorException` (500) khi `paymentErr`, `eventErr`, `confirmErr`. Nghiệp vụ trả 200 `{ success: true }`. |
| **B/M2** | Dọn dẹp/huỷ link PayOS mồ côi của các đơn cũ bị `hold_seats` huỷ | **FAIL** | **Lỗi logic + False-confidence test**. DB migration `hold_seats` đã đổi `payments.status` thành `CANCELLED`. Query trong API lại lọc `.eq("status", "PENDING")` nên trên DB thật kết quả luôn rỗng, không huỷ được link PayOS. Test mock dựng dữ liệu giả sai thực tế. |
| **B/M3** | Fail-closed ở production khi thiếu `PAYOS_*` | **PASS** | `env.ts` `superRefine` bắt buộc 3 key ở production; `payos.client.ts` ném lỗi rõ ràng nếu unconfigured ở production. |
| **B/M4** | Chống race condition tạo link, `timingSafeEqual` HMAC webhook, `cancelPaymentLink` an toàn | **PASS** | `inFlightCreatePayment` chống race condition; `timingSafeEqual` an toàn trên buffers bằng nhau; `cancelPaymentLink` try/catch log WARN. |

---

## 2. Chi tiết Finding gây FAIL: B/M2 & False-Confidence Test

### [CRITICAL / MAJOR DEFECT] Link PayOS mồ côi của đơn cũ bị `hold_seats` huỷ KHÔNG BAO GIỜ được huỷ trên DB thật do lệch trạng thái payment

#### 1. Đối chiếu Database Schema thật (`supabase/migrations/20261112140000_hold_seats_hardening.sql:274-275`):
Khi khách giữ ghế cho đơn mới, hàm RPC `hold_seats` (§3.13) tự động huỷ đơn cũ và cập nhật toàn bộ payment `PENDING` của đơn cũ thành `CANCELLED`:
```sql
-- 3.13 Kênh Web: huỷ đơn holding VÀ pending_payment cũ của khách trên toàn chuỗi (R-64, quyết định #9).
update public.orders o
   set status = 'cancelled'
 where o.id = any(v_old_order_ids)
   and o.status in ('holding', 'pending_payment');

-- Huỷ payment link còn mở của các đơn vừa bị huỷ
update public.payments p
   set status = 'CANCELLED'
 where p.order_id = any(v_old_order_ids)
   and p.status = 'PENDING';
```
> **Hệ quả trên DB thật:** Ngay sau khi `hold_seats` chạy xong, các bản ghi `payments` thuộc đơn cũ đã mang `status = 'CANCELLED'`. Trên DB thật KHÔNG THỂ tồn tại bản ghi `payments` nào của đơn cũ mà còn giữ `status = 'PENDING'`.

#### 2. Lỗi logic trong `apps/api/src/modules/payment/payment.service.ts:164-178`:
```ts
// SPEC #10 & B/M2: tạo đơn mới khi đơn cũ pending/cancelled/expired còn link -> cancel link cũ
const { data: oldUserOrders } = await this.supabase
  .admin()
  .from("orders")
  .select("id, status")
  .eq("user_id", user.id)
  .neq("id", order.id)
  .in("status", ["pending_payment", "cancelled", "expired"]);

const oldOrderIds = (oldUserOrders ?? []).map((o) => o.id);
if (oldOrderIds.length > 0) {
  const { data: orphanedPayments } = await this.supabase
    .admin()
    .from("payments")
    .select("id, order_id, order_code")
    .in("order_id", oldOrderIds)
    .eq("status", "PENDING"); // <--- [ĐIỂM GÃY LOGIC]: Trên DB thật, status đã là 'CANCELLED'!

  for (const op of (orphanedPayments as PaymentDbRow[]) ?? []) {
    await this.payosClient.cancelPaymentLink(op.order_code, "Tạo đơn mới");
    await this.supabase
      .admin()
      .from("payments")
      .update({ status: "CANCELLED" })
      .eq("id", op.id);
  }
  ...
}
```
Bởi vì câu query lọc `.eq("status", "PENDING")`, trên DB thật `orphanedPayments` luôn luôn trả về mảng rỗng `[]`.
Vòng lặp `for (const op of orphanedPayments)` không bao giờ được thực thi, và `payosClient.cancelPaymentLink` **không bao giờ được gọi** để huỷ link cũ trên cổng PayOS! Khách vẫn có thể mở link cũ của đơn đã huỷ để quét thanh toán.

#### 3. Bằng chứng False-Confidence Test (`apps/api/test/webhook.e2e-spec.ts`):
Tại sao bộ test của Builder vẫn pass 18/18?
Kiểm tra fixture trong `apps/api/test/webhook.e2e-spec.ts:79-91, 164-171`:
```ts
// Fixture đơn cũ:
{
  id: ORDER_OLD_CANCELLED,
  user_id: USER_CUSTOMER,
  status: "cancelled", // Đơn đã cancelled
  ...
}

// Nhưng fixture payment lại gán:
{
  id: uuid(901),
  order_id: ORDER_OLD_CANCELLED,
  order_code: 999901,
  amount: 150000,
  status: "PENDING", // <--- GIẢ MẠO TRẠNG THÁI: Trái ngược hoàn toàn với migration hold_seats_hardening.sql!
}
```
Builder đã cố tình gán `status: "PENDING"` cho payment của đơn đã `cancelled`, tạo ra trạng thái giả định không có thật trong Postgres, giúp test pass màu xanh nhưng code thực tế trên staging/production thì vô tác dụng.

---

## 3. Các điểm đạt tốt của Builder trong lần sửa này

1. **Migration K5-1 (`20261113160000_confirm_paid_order_code_lookup.sql`)**:
   - `confirm_paid` khoá dòng payment theo `order_code = p_order_code` trực tiếp, giúp việc thanh toán lại cùng đơn bằng link mới không bao giờ chạm vào payment `CANCELLED` cũ, dập tắt hoàn toàn lỗi xung đột `23505`.
   - Quyền execute cấp chuẩn cho `service_role`, revoke khỏi `public, anon, authenticated`.
2. **Xử lý Webhook (B/M1)**:
   - Phân biệt tách bạch giữa lỗi hạ tầng (500) và kết quả nghiệp vụ (200), không nuốt lỗi `confirmErr`, `eventErr`, `paymentErr`.
3. **Cấu hình & Security (B/M3, B/M4)**:
   - Fail-closed chuẩn xác khi thiếu `PAYOS_*` ở môi trường production.
   - Dùng `timingSafeEqual` an toàn trên buffers có kiểm tra độ dài.
   - Single-flight promise pattern trong `createPayment` dập tắt race condition tạo nhiều link đồng thời.

---

## 4. Hướng dẫn sửa chữa cho Builder

1. **Sửa logic nhận diện payment mồ côi trong `payment.service.ts`**:
   - Nhận diện các payment cần huỷ link PayOS: Các đơn cũ thuộc `oldOrderIds` có payment vừa bị `hold_seats` huỷ (mang `status = 'CANCELLED'`) hoặc `pending_payment` (`status = 'PENDING'`).
   - Để tránh việc gọi lặp lại `cancelPaymentLink` cho các đơn đã huỷ từ lâu trong quá khứ:
     - *Phương án khuyến nghị (Clean & Minimal):* Thêm cột `link_cancelled_at timestamptz` hoặc cờ `link_cancelled boolean not null default false` vào bảng `payments` (qua 1 migration mới), HOẶC lọc các payment của `oldOrderIds` có `status IN ('PENDING', 'CANCELLED')` và được tạo gần đây (`created_at >= now() - interval '15 minutes'`). Khi huỷ link thành công trên PayOS thì đánh dấu lại bản ghi để không gọi lại.
2. **Sửa lại Test Fixture trong `apps/api/test/webhook.e2e-spec.ts`**:
   - Sửa payment của `ORDER_OLD_CANCELLED` trong `fakeDb.tables.payments` thành `status: "CANCELLED"` đúng như DB thật sau khi `hold_seats` chạy.
   - Viết test chứng minh `cancelPaymentLink` vẫn được gọi thành công và huỷ đúng link PayOS của payment `CANCELLED` mồ côi đó.

---

## 5. Kết luận
- **Verdict: FAIL** (Do vi phạm Rule 1 & Rule 2: False-confidence test và lỗi logic cross-boundary DB schema ở B/M2).
- Chuyển giao lại cho Builder chỉnh sửa trước khi tiến hành Round 2.
