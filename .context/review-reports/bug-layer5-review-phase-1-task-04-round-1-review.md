# Báo Cáo Review Nghiệm Thu (Round 1) — phase-1-task-04

**Mã task:** `tasks/bug-layer5-review/phase-1-task-04.md`  
**Tiêu đề:** Transactional Mail Templates & Payload Completion (B/M5, B/M6)  
**Người thực hiện (Builder):** builder  
**Người đánh giá (Reviewer):** reviewer độc lập (Adversarial Review)  
**Review Level:** `STRICT`  
**Verdict:** **`FAIL`**

---

## 1. Tổng quan kiểm tra

Bản vá của task `phase-1-task-04` xử lý 2 lỗi tồn đọng từ đợt rà soát Layer 5 (`independent-review-layer-5-B-payment-mail.md`):
- **B/M5:** Email vé thật (`TICKET_ISSUED`) thiếu `qr_token`, `cinema_address`, và `seats` do payload enqueue từ DB không chứa các trường này.
- **B/M6:** 3 loại email của `IdentityModule` (`password_set`, `oauth_missing_email_collision`, `oauth_missing_email_verify`) thiếu template HTML riêng, fallback dump `JSON.stringify(payload)` làm lộ `user_id` và token, đồng thời không từ chối an toàn kind lạ.

Sau khi đối chiếu chéo (Cross-Boundary Check) giữa implementation trong code TypeScript với database schema thật trong các migration Supabase (`supabase/migrations/*.sql`) và mã nguồn thư viện Supabase client (`@supabase/postgrest-js`), Reviewer phát hiện **1 khiếm khuyết nghiêm trọng (Critical Defect) vi phạm nguyên tắc Adversarial Review số 1 và số 2**: Code sử dụng sai phương thức PostgREST khiến **toàn bộ đơn hàng có từ 2 ghế trở lên bị mất mã QR trong email**, và bộ test e2e sử dụng mock sai lệch che giấu hoàn toàn lỗi này.

---

## 2. Chi tiết các phát hiện (Findings)

### Finding 1: [MAJOR / FALSE-CONFIDENCE TEST] `JobsService.enrichTicketPayload` nổ lỗi PostgREST `PGRST116` và làm mất sạch QR token đối với mọi đơn hàng có từ 2 ghế trở lên

- **Vị trí code:** [jobs.controller.ts:60-76](file:///E:/FilmBooking/apps/api/src/modules/jobs/jobs.controller.ts#L60-L76)
  ```ts
  if (!hasQr && orderId) {
    tasks.push(
      (async () => {
        try {
          const { data, error } = await admin
            .from("tickets")
            .select("qr_token")
            .eq("order_id", orderId)
            .maybeSingle();
          if (!error && data?.qr_token) {
            enriched.qr_token = data.qr_token;
          }
        } catch (err) {
          this.logger.warn(`Failed to enrich qr_token for order ${orderId}: ${err}`);
        }
      })(),
    );
  }
  ```

- **Đối chiếu Database Schema thật:**
  Trong [20261111030100_booking_tables.sql:154-166](file:///E:/FilmBooking/supabase/migrations/20261111030100_booking_tables.sql#L154-L166):
  ```sql
  create table public.tickets (
    id              uuid primary key default gen_random_uuid(),
    order_id        uuid not null references public.orders (id) on delete cascade,
    order_seat_id   uuid not null unique references public.order_seats (id) on delete cascade,
    ...
    qr_token        text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
  );
  ```
  Và trong RPC chốt vé [20261113160000_confirm_paid_order_code_lookup.sql:302-306](file:///E:/FilmBooking/supabase/migrations/20261113160000_confirm_paid_order_code_lookup.sql#L302-L306):
  ```sql
  insert into public.tickets (order_id, order_seat_id, showtime_id, cinema_id, qr_token)
  select v_order.id, os.id, v_order.showtime_id, v_order.cinema_id, encode(extensions.gen_random_bytes(16), 'hex')
    from public.order_seats os
   where os.order_id = v_order.id
     and not exists (select 1 from public.tickets t where t.order_seat_id = os.id);
  ```
  Bảng `tickets` có quan hệ **1-N** với `orders` (mỗi ghế `order_seats` sinh 1 vé `tickets` có `qr_token` riêng biệt).

- **Cơ chế lỗi runtime trên PostgREST / Supabase:**
  Khi một đơn hàng có từ 2 ghế trở lên (kịch bản thông dụng nhất trong rạp chiếu phim — mua vé đôi, đi theo nhóm, gia đình):
  Query `.from("tickets").select("qr_token").eq("order_id", orderId).maybeSingle()` gửi header `Accept: application/vnd.pgrst.object+json`.
  Khi PostgREST tìm thấy 2 dòng trở lên, PostgREST trả về HTTP 406 Not Acceptable kèm mã lỗi:
  ```json
  {
    "code": "PGRST116",
    "details": "Results contain 2 rows, application/vnd.pgrst.object+json requires 1 row",
    "message": "JSON object requested, multiple (or no) rows returned"
  }
  ```
  Trong Supabase JS Client (`@supabase/postgrest-js`), kết quả trả về là `{ data: null, error: { code: 'PGRST116', ... } }`.
  Vì `error` mang giá trị (truthy) và `data` là `null`, biểu thức kiểm tra `if (!error && data?.qr_token)` bị **`FALSE`**!
  Khối `try/catch` không bắt được lỗi vì PostgREST không throw exception mà trả qua biến `error`.
  Biến `enriched.qr_token` hoàn toàn không được gán và giữ nguyên giá trị `undefined`.

- **Hậu quả người dùng:**
  Trong [templates.ts:140-145](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L140-L145):
  ```ts
  ${qrToken ? `
  <div style="text-align:center; margin-bottom:16px;">
    <span class="label">MÃ QUÉT SOÁT VÉ (QR TOKEN)</span><br>
    <span class="qr-text">${escapeHtml(qrToken)}</span>
  </div>` : ""}
  ```
  Khi `enriched.qr_token` không có, biến `qrToken` là chuỗi rỗng `""`. Email vé gửi cho khách hàng bị **MẤT HOÀN TOÀN KHỐI MÃ QUÉT QR** đối với tất cả đơn hàng mua từ 2 vé trở lên!

- **Phân tích False-Confidence Test Mock:**
  Tại sao 18/18 test trong `outbox-job.e2e-spec.ts` lại PASS xanh?
  Xem [outbox-job.e2e-spec.ts:68, 91-100, 238-240](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts#L68-L100):
  ```ts
  const tickets = new Map<string, FakeTicket>();
  ...
  setTickets: (items: FakeTicket[]) => {
    for (const t of items) tickets.set(t.order_id, t);
  }
  ...
  if (table === "tickets") {
    return {
      select: () => ({
        eq: (_col: string, val: unknown) => {
          const ticket = tickets.get(String(val));
          return {
            maybeSingle: async () => ({
              data: ticket ? { qr_token: ticket.qr_token } : null,
              error: null,
            }),
  ```
  1. Mock chỉ lưu trữ cấu trúc Map `order_id -> FakeTicket` (giả định sai lầm 1 đơn chỉ có 1 vé).
  2. Mock `maybeSingle()` luôn trả về `error: null`, không hề mô phỏng hành vi trả lỗi `PGRST116` của PostgREST khi có nhiều hơn 1 dòng.
  3. Trong chính test case `B/M5` ([outbox-job.e2e-spec.ts:420-456](file:///E:/FilmBooking/apps/api/test/outbox-job.e2e-spec.ts#L420-L456)), Builder tạo 2 ghế (`E10`, `E11`) trong `order_seats`, nhưng lại chỉ truyền 1 vé trong `fakeDb.setTickets(...)`!
  Đây chính là điểm mù nghiêm trọng vi phạm **Nguyên tắc Adversarial Review số 1**.

---

### Finding 2: [ACCEPTABLE / PASS] Tiêu chí B/M6 đã được hiện thực tốt

- **3 Template HTML mới:**
  - `renderPasswordSetEmail` ([templates.ts:352-405](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L352-L405)): Render HTML chuẩn, nút thiết lập mật khẩu kèm URL/token, không rò rỉ `user_id`.
  - `renderOAuthMissingEmailCollisionEmail` ([templates.ts:408-457](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L408-L457)): Hướng dẫn đăng nhập phương thức cũ và link dẫn về `/me/profile`, không dump payload.
  - `renderOAuthMissingEmailVerifyEmail` ([templates.ts:460-511](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L460-L511)): Nút bấm và link sao chép xác thực email kèm `token`, cảnh báo hết hạn 15 phút.
- **Loại bỏ dump raw JSON:**
  - `renderTemplate` ([templates.ts:550](file:///E:/FilmBooking/apps/api/src/modules/mail/templates.ts#L550)): Nhánh default ném `Error("UNKNOWN_KIND: ...")`.
  - Worker ([jobs.controller.ts:227-243](file:///E:/FilmBooking/apps/api/src/modules/jobs/jobs.controller.ts#L227-L243)): Phát hiện `UNKNOWN_KIND`, đánh dấu ngay `FAILED` với `attempts = MAX_EMAIL_ATTEMPTS`, không gửi email rác và không retry lặp vô tận.
- **Test verification:** Các test case kiểm thử không chứa `{"`, `<pre>`, hay `user_id` đều đạt.

---

### Finding 3: [MINOR] Cải thiện truy vấn dữ liệu rạp và danh sách ghế

1. **Hotline rạp:** `enrichTicketPayload` mới chỉ truy vấn `address` từ `cinemas`. Mặc dù `templates.ts` có fallback `DEFAULT_HOTLINE = "1900 0000"`, việc select thêm `hotline` từ `cinemas` (`select("address, hotline")`) sẽ đảm bảo hiển thị đúng số điện thoại của từng cụm rạp địa phương theo R-86.
2. **Thứ tự ghế:** Query `order_seats` trong `enrichTicketPayload` chưa có `.order("seat_label")`, có thể khiến danh sách ghế hiển thị xáo trộn (ví dụ "B2, B1") thay vì theo thứ tự chữ cái tự nhiên.

---

## 3. Yêu cầu sửa đổi đối với Builder (Action Items)

1. **Sửa `JobsService.enrichTicketPayload`:**
   - Thay vì dùng `.maybeSingle()` trên bảng `tickets` với điều kiện `eq("order_id", orderId)`, hãy truy vấn mảng danh sách vé hoặc sử dụng `.limit(1)`:
     ```ts
     const { data, error } = await admin
       .from("tickets")
       .select("qr_token")
       .eq("order_id", orderId)
       .limit(1)
       .maybeSingle();
     ```
     Hoặc tốt hơn, truy vấn danh sách `tickets`:
     ```ts
     const { data, error } = await admin
       .from("tickets")
       .select("qr_token")
       .eq("order_id", orderId);
     if (!error && Array.isArray(data) && data.length > 0) {
       enriched.qr_token = data[0].qr_token;
     }
     ```
   - (Tùy chọn) Bổ sung `hotline` vào query `cinemas`:
     ```ts
     const { data, error } = await admin
       .from("cinemas")
       .select("address, hotline")
       .eq("id", cinemaId)
       .maybeSingle();
     if (!error && data) {
       if (data.address) enriched.cinema_address = data.address;
       if (data.hotline) enriched.hotline = data.hotline;
     }
     ```

2. **Cập nhật bộ test `apps/api/test/outbox-job.e2e-spec.ts`:**
   - Sửa `fakeDb.tickets` từ `Map<string, FakeTicket>` thành hỗ trợ danh sách vé theo `order_id` (1 order có thể có nhiều vé).
   - Mô phỏng chính xác hành vi của PostgREST: nếu gọi `.maybeSingle()` trên kết quả trả về `length > 1` (và không có `limit(1)`), mock phải trả về lỗi `{ code: "PGRST116" }` thay vì `error: null`.
   - Bổ sung test case kiểm thử việc gửi email cho đơn hàng có **2 vé thật** (`fakeDb.setTickets([... 2 vé ...])`) để đảm bảo email gửi đi chứa đầy đủ mã QR token, chứng minh triệt tiêu lỗi `PGRST116`.

---

## 4. Kết luận

- **Review level:** STRICT
- **Verdict:** **`FAIL`**
- Do khiếm khuyết Finding 1 trực tiếp dẫn đến việc mất mã QR trên môi trường thật với các đơn hàng mua nhiều vé, task **không được phép PASS**. Builder cần chỉnh sửa code và hoàn thiện bộ mock test theo các mục trên trước khi gửi lại review Round 2.
