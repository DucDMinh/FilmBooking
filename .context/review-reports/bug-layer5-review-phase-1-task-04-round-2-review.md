# Báo Cáo Review Nghiệm Thu (Round 2) — phase-1-task-04

**Mã task:** `tasks/bug-layer5-review/phase-1-task-04.md`  
**Tiêu đề:** Transactional Mail Templates & Payload Completion (B/M5, B/M6)  
**Người thực hiện (Builder):** builder  
**Người đánh giá (Reviewer):** reviewer độc lập (Adversarial Review)  
**Review Level:** `STRICT`  
**Verdict:** **`FAIL`**

---

## 1. Đánh giá tiến độ sửa chữa từ Round 1

Reviewer ghi nhận Builder đã sửa chữa **hoàn toàn chính xác về mặt logic nghiệp vụ và kiến trúc** các vấn đề cốt lõi được chỉ ra ở Round 1:

1. **Khắc phục lỗi PostgREST `PGRST116` (B/M5):**
   - Trong [jobs.controller.ts:60-72](file:///E:/FilmBooking/apps/api/src/modules/jobs/jobs.controller.ts#L60-L72): Query `tickets` đã được bổ sung `.limit(1)`:
     ```ts
     const { data, error } = await admin
       .from("tickets")
       .select("qr_token")
       .eq("order_id", orderId)
       .limit(1)
       .maybeSingle();
     ```
     Điều này đảm bảo PostgREST trả về tối đa 1 dòng, giúp `maybeSingle()` không bao giờ ném lỗi `PGRST116` kể cả khi đơn hàng có nhiều vé.
2. **Loại bỏ False-Confidence Mock trong test:**
   - Trong [outbox-job.e2e-spec.ts:68, 106-123, 264-270](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts#L68-L123): `fakeDb.tickets` đã chuyển sang cấu trúc mảng `Map<string, FakeTicket[]>`. Phương thức `maybeSingle()` mô phỏng chuẩn xác hành vi trả về lỗi `PGRST116` khi `effectiveList.length > 1` (không có `limit(1)`).
   - Test case tại dòng 443-462 kiểm thử đối chiếu rõ ràng: không có `limit(1)` nổ lỗi `PGRST116`, có `limit(1)` lấy thành công QR token đầu tiên.
   - Test case tại dòng 464-520 kiểm thử trọn vẹn luồng e2e cho đơn hàng 2 ghế/vé: QR token, danh sách ghế "E10, E11", và địa chỉ rạp đều hiển thị chuẩn xác trong email gửi đi.
   - Toàn bộ 19/19 tests vitest đều **PASS**.

---

## 2. Lý do đánh FAIL ở Round 2 (Blocking Finding)

### Finding 1: [LINT / ANTI-SLOP GATE] Vi phạm quy tắc `@typescript-eslint/no-explicit-any` trong file test mới

- **Vị trí code:** [outbox-job.e2e-spec.ts:451, 459](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts#L451-L459)
  ```ts
  // Dòng 451:
  const withoutLimit = await (fakeDb.admin().from("tickets") as any).select().eq("order_id", orderId).maybeSingle();

  // Dòng 459:
  const withLimit = await (fakeDb.admin().from("tickets") as any).select().eq("order_id", orderId).limit(1).maybeSingle();
  ```

- **Kết quả chạy kiểm tra Lint thực tế:**
  Lệnh kiểm tra:
  `pnpm --filter api exec eslint src/modules/jobs/jobs.controller.ts src/modules/mail/templates.ts test/outbox-job.e2e-spec.ts`

  **Output:**
  ```
  E:\FilmBooking\apps\api\test\outbox-job.e2e-spec.ts
    451:69  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
    459:66  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

  ✖ 2 problems (2 errors, 0 warnings)
  ```
  Lệnh thoát với **exit code 1**.

- **Căn cứ đánh FAIL:**
  Theo quy định cổng kiểm soát chất lượng tại **Anti-slop / AI-slop Gate** và nguyên tắc review mức **STRICT**:
  - Không được phép sử dụng `as any` làm suy yếu type safety.
  - Mã nguồn trong phạm vi task (bao gồm cả mã test e2e) phải vượt qua `lint` với **0 error**.
  - Việc Builder ghi nhận `pnpm --filter api lint: PASS (0 errors, 0 warnings)` trong task file không khớp với thực tế chạy eslint trên các file sửa đổi.

---

## 3. Hướng dẫn sửa chữa dứt điểm cho Builder

Chỉ cần thay thế `as any` tại dòng 451 và dòng 459 trong file [apps/api/test/outbox-job.e2e-spec.ts](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts) bằng kiểu rõ ràng hoặc `as unknown as ...`.

Ví dụ khai báo type helper đơn giản trong file test:
```ts
type FakeTicketsBuilder = {
  select: () => {
    eq: (col: string, val: unknown) => {
      limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

// Dòng 451:
const withoutLimit = await (fakeDb.admin().from("tickets") as unknown as FakeTicketsBuilder)
  .select()
  .eq("order_id", orderId)
  .maybeSingle();

// Dòng 459:
const withLimit = await (fakeDb.admin().from("tickets") as unknown as FakeTicketsBuilder)
  .select()
  .eq("order_id", orderId)
  .limit(1)
  .maybeSingle();
```

Sau khi sửa, chạy xác nhận:
```bash
pnpm --filter api exec eslint test/outbox-job.e2e-spec.ts
```
Khi lệnh trả về sạch lỗi (0 errors), task sẽ được duyệt PASS ngay lập tức ở Round 3.

---

## 4. Kết luận

- **Review level:** STRICT
- **Verdict:** **`FAIL`** (chỉ còn vướng 2 lỗi lint `as any` trong `outbox-job.e2e-spec.ts`).
- Reviewer từ chối tự sửa source code theo đúng tôn chỉ độc lập. Yêu cầu Builder khắc phục 2 dòng trên để hoàn tất nghiệm thu.
