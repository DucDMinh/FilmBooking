# Báo cáo Review Nghiệm thu Nghiêm ngặt (STRICT Review Report — Round 2)
## Task: bug-layer5-review · phase-1-task-01 — PayOS Webhook Race & Duplicate Payment Handling

- **Agent:** reviewer (Reviewer độc lập)
- **Review level:** STRICT
- **Mục tiêu nghiệm thu:** Nghiệm thu Round 2 các tiêu chí K5-1, B/M1, B/M2, B/M3, B/M4, đặc biệt xác minh việc giải quyết triệt để defect B/M2 (link PayOS mồ côi của đơn CANCELLED) và loại bỏ false-confidence test fixture.
- **Ngày review:** 2026-11-13
- **Verdict:** **STRICT PASS**

---

## 1. Tóm tắt kết quả theo tiêu chí

| Tiêu chí | Nội dung kiểm tra | Round 1 | Round 2 | Đánh giá kỹ thuật Round 2 |
|---|---|---|---|---|
| **K5-1** | `confirm_paid` ưu tiên chọn payment theo `p_order_code`, chống va chạm unique key `23505` (`payments_order_code_key`) khi thanh toán lại | PASS | **PASS** | Migration giữ nguyên cấu trúc `order_code = p_order_code AND order_id = v_order.id FOR UPDATE;`. Đã test xác nhận retry payment cho cùng đơn không đụng 23505. Không regression. |
| **B/M1** | `webhook.controller.ts` không nuốt lỗi, trả HTTP 500 khi DB/RPC lỗi, phân biệt kết quả nghiệp vụ | PASS | **PASS** | Controller ném `InternalServerErrorException` (500) khi `paymentErr`, `eventErr`, `confirmErr`. 2 e2e test lỗi hạ tầng giả lập trả đúng HTTP 500. |
| **B/M2** | Dọn dẹp/huỷ link PayOS mồ côi của các đơn cũ bị `hold_seats` huỷ | **FAIL** | **PASS** | **Khắc phục triệt để**: Bổ sung cột `link_cancelled_at timestamptz` trên bảng `payments`. Cập nhật query quét `status in ('PENDING', 'CANCELLED')`, `payment_link_id is not null` và `link_cancelled_at is null`. Sửa test fixture đúng 100% DB thật (`status: 'CANCELLED'`). Test e2e chứng minh gọi `cancelPaymentLink` và cập nhật `link_cancelled_at` thành công, idempotent không gọi lặp lại. |
| **B/M3** | Fail-closed ở production khi thiếu `PAYOS_*` | PASS | **PASS** | `env.ts` `superRefine` bắt buộc 3 key ở production; `payos.client.ts` ném lỗi rõ ràng nếu unconfigured ở production. |
| **B/M4** | Chống race condition tạo link, `timingSafeEqual` HMAC webhook, `cancelPaymentLink` an toàn | PASS | **PASS** | `inFlightCreatePayment` chống race condition; `timingSafeEqual` an toàn trên buffers bằng nhau; `cancelPaymentLink` try/catch log WARN. |

---

## 2. Chi tiết nghiệm thu Defect B/M2 & Cross-Boundary DB Schema

### 2.1. Đối chiếu Database Schema thật (`supabase/migrations/`)
- Migration `20261113160000_confirm_paid_order_code_lookup.sql:8`:
  ```sql
  alter table public.payments add column if not exists link_cancelled_at timestamptz;
  ```
  Thao tác DDL an toàn, bổ sung cột nullable không khoá bảng, không gây downtime.
- Typescript types (`packages/shared/src/database.types.ts:462, 466, 469`):
  Đã đồng bộ đầy đủ `link_cancelled_at: string | null` trong cả 3 shape `Row`, `Insert`, `Update` của bảng `payments`.

### 2.2. Kiểm tra Logic tầng Service (`apps/api/src/modules/payment/payment.service.ts:160-197`)
- Khi khách tạo đơn mới, các đơn cũ trước đó đã bị `hold_seats` chuyển sang `cancelled` và payment bị chuyển sang `CANCELLED`.
- Query trong `payment.service.ts`:
  ```ts
  const { data: orphanedPayments } = await this.supabase
    .admin()
    .from("payments")
    .select("id, order_id, order_code, payment_link_id, link_cancelled_at")
    .in("order_id", oldOrderIds)
    .in("status", ["PENDING", "CANCELLED"])
    .not("payment_link_id", "is", null)
    .is("link_cancelled_at", null);
  ```
- **Phân tích logic:**
  1. `.in("status", ["PENDING", "CANCELLED"])`: Bắt trúng cả payment của đơn vừa bị `hold_seats` huỷ (đang mang `CANCELLED`), giải quyết tận gốc điểm gãy ở Round 1.
  2. `.not("payment_link_id", "is", null)`: Chỉ xử lý những payment thực sự đã sinh link PayOS, tránh lãng phí request cho các payment 0đ hoặc chưa sinh link.
  3. `.is("link_cancelled_at", null)`: Đảm bảo tính **idempotent**, chỉ huỷ link một lần duy nhất.
  4. Sau khi gọi `payosClient.cancelPaymentLink(op.order_code, "Huỷ đơn cũ")`, service cập nhật `status: "CANCELLED"` và `link_cancelled_at: new Date().toISOString()`.
  5. Trong trường hợp thanh toán lại cùng 1 đơn (dòng 199–220), payment cũ cũng được cập nhật `link_cancelled_at` đồng bộ.

### 2.3. Kiểm tra Test Fixture & Mock Suite (`apps/api/test/webhook.e2e-spec.ts`)
- **Loại bỏ False-confidence:**
  Fixture payment của `ORDER_OLD_CANCELLED` đã được điều chỉnh thành:
  ```ts
  {
    id: uuid(901),
    order_id: ORDER_OLD_CANCELLED,
    cinema_id: CINEMA_HN01,
    order_code: 999901,
    amount: 150000,
    status: "CANCELLED", // Khớp 100% DB Postgres sau RPC hold_seats
    payment_link_id: "link-payos-999901",
    link_cancelled_at: null,
  }
  ```
- **Mock Query hoàn thiện:**
  Class `Query` đã bổ sung 2 toán tử lọc PostgREST `.is()` và `.not()` tương thích chuẩn Supabase JS SDK.
- **Test coverage mở rộng:**
  + Test case `"đơn có tiền: tạo payment link, đơn sang pending_payment, huỷ link PayOS của đơn cũ bị hold_seats huỷ (#10, B/M2)"`: Verify `cancelPaymentLink(999901, "Huỷ đơn cũ")` được gọi và `link_cancelled_at` có timestamp hợp lệ.
  + Test case `"B/M2: không gọi cancelPaymentLink lại cho payment đơn cũ đã có link_cancelled_at"`: Verify khi payment đã có `link_cancelled_at`, API hoàn toàn bỏ qua, không gọi lại `cancelPaymentLink`.

---

## 3. Kết quả chạy Verify Commands (Allowlist)

1. **Vitest E2E Webhook (`apps/api`):**
   - Lệnh: `pnpm test test/webhook.e2e-spec.ts`
   - Kết quả: **19/19 tests PASS** (100%).
2. **Toàn bộ Test Suite API (`apps/api`):**
   - Lệnh: `pnpm test`
   - Kết quả: **22/22 test files PASS, 381/381 tests PASS**.
3. **Typecheck Workspace:**
   - Lệnh: `pnpm typecheck`
   - Kết quả: **Done sạch sẽ 3/3 projects (`packages/shared`, `apps/web`, `apps/api`), exit code 0**.
4. **Lint Workspace:**
   - Lệnh: `pnpm lint`
   - Kết quả: **Done sạch sẽ 3/3 projects (`packages/shared`, `apps/web`, `apps/api`), 0 errors, 0 warnings, exit code 0**.

---

## 4. Kết luận

- Builder đã tiếp thu và xử lý chuẩn xác, triệt để toàn bộ nhận xét từ Round 1.
- Không còn false-confidence test fixture; mock phản ánh đúng hành vi của Database Postgres thật.
- Các cơ chế bảo mật (fail-closed, `timingSafeEqual`, quyền execute function) và tính toàn vẹn dữ liệu (idempotency, unique constraint handling) đều đạt tiêu chuẩn kỹ thuật cao nhất.
- **Verdict chính thức: STRICT PASS**.
