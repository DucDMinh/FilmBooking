# Báo cáo Review Độc lập: bug/layer34-review · phase-2-task-06 (Round 1)

**Agent: reviewer**  
**Review Level:** STRICT  
**Work Item:** `bug/layer34-review`  
**Task ID:** `phase-2-task-06`  
**Ngày review:** 2026-11-12  
**Verdict:** **STRICT PASS**

---

## 1. Tổng quan phạm vi review

Tôi đã thực hiện Adversarial Review ở cấp độ **STRICT** cho task `phase-2-task-06` (M10c, MINOR #8 trong báo cáo đánh giá Layer 3-4 DB):
- **Task file:** `tasks/bug-layer34-review/phase-2-task-06.md`
- **Diff triển khai:**
  - `supabase/migrations/20261112150000_cancel_showtimes_hardening.sql` (migration additive mới)
  - `supabase/tests/057_cancel_showtimes_idempotent.test.sql` (test pgTAP mới, 15 assertions)
  - `tasks/bug-layer34-review/phase-2-task-06.md` (cập nhật kết quả & evidence)
- **Files đối chiếu chéo:**
  - `supabase/migrations/20261111030100_booking_tables.sql` (schema `orders`, `tickets`, `affected_order_cases`, trigger ban đầu)
  - `supabase/migrations/20261111040300_rpc_cancel.sql` (phiên bản `cancel_showtimes`, `preview_cancel_showtimes` trước đó)
  - `supabase/migrations/20261111040400_rpc_checkin_reports.sql` (hàm `checkin_ticket` xử lý vé đơn affected)
  - `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql` (thứ tự khoá toàn cục)
  - `supabase/tests/048_function_privileges.test.sql` (bảng allowlist quyền EXECUTE schema public)

---

## 2. Kết quả kiểm tra đối chiếu chuyên sâu (Adversarial Audit)

### 2.1. Email Idempotency khi gọi lại `cancel_showtimes`
- **Cơ chế chống gửi trùng lặp 2 lớp:**
  1. **Lớp 1 (Trạng thái nghiệp vụ):** Kiểm tra `aoc.email_sent = false` khi join `orders` với `affected_order_cases`.
  2. **Lớp 2 (Trạng thái hạ tầng outbox):** Kiểm tra `not exists (select 1 from public.email_outbox eo where eo.kind = 'showtime_cancelled' and eo.payload->>'order_id' = o.id::text)`.
- **Cơ chế cập nhật nguyên tử:**
  - Mệnh đề CTE kép:
    ```sql
    with inserted_emails as (
      insert into public.email_outbox (...)
      ...
      returning id, (payload->>'order_id')::uuid as order_id
    ),
    mark_sent as (
      update public.affected_order_cases aoc
      set email_sent = true
      from inserted_emails ie
      where aoc.order_id = ie.order_id
      returning aoc.id
    )
    select count(*) into v_emails_enqueued from inserted_emails;
    ```
    Toàn bộ thao tác chèn outbox và cập nhật `email_sent = true` diễn ra trong cùng một statement, không có khoảng trễ (window of vulnerability).
- **Idempotency khi gọi lại:**
  - Lệnh `insert into public.affected_order_cases ... on conflict (order_id) do update set reason = excluded.reason, counter_contact = excluded.counter_contact;` **không** ghi đè cột `email_sent`, giữ nguyên giá trị `true` của các đơn đã gửi.
  - Bước 5.6 tự động đồng bộ `email_sent = true` nếu outbox đã có sẵn email cho đơn (chống out-of-sync nếu trước đó có gián đoạn).
  - Khi gọi lại lần 2, `inserted_emails` trả về 0 dòng, `emails_enqueued_count = 0`, số lượng email trong outbox giữ nguyên không đổi (xác nhận qua pgTAP test 057, assert 12-15).

### 2.2. Xử lý đơn `checked_in`
- **Máy trạng thái đơn (`orders_guard_transition`):**
  - Đã bổ sung nhánh chuyển đổi hợp lệ: `(old.status = 'checked_in' and new.status in ('affected'))`.
  - Khắc phục triệt để lỗi nổ ngoại lệ `23514` khi huỷ suất có đơn khách đã quét vé check-in.
- **Hàm xem trước (`preview_cancel_showtimes`):**
  - Các chỉ số `paid_orders_count`, `web_paid_orders_count`, `pos_paid_orders_count`, và `total_refund_amount` đã được cập nhật tính cho `o.status in ('paid', 'checked_in')`.
- **Hàm huỷ suất (`cancel_showtimes`):**
  - Chuyển toàn bộ các đơn `paid` và `checked_in` sang `affected`, ghi nhận đầy đủ vào `affected_order_cases`, và enqueue email thông báo cho khách.
- **Tương tác với `checkin_ticket`:**
  - Đối chiếu với `20261111040400_rpc_checkin_reports.sql`: Bước 2 của `checkin_ticket` kiểm tra `v_ticket.showtime_status = 'CANCELLED' or v_ticket.order_status in ('affected', 'cancelled', 'refunded_manual', 'exchanged')` -> lập tức ghi log và trả về `status: 'CANCELLED', result: 'AFFECTED'`. Đơn đã chuyển `affected` sẽ không thể quét vé check-in tiếp, tuân thủ đúng R-101.

### 2.3. Cơ chế khoá & Concurrency (Global Locking Order)
- Thứ tự khoá toàn cục được thực thi nghiêm ngặt:
  1. `public.showtimes` (`FOR UPDATE` theo `p_showtime_ids`).
  2. `public.orders` (`ORDER BY id FOR UPDATE` gồm các đơn `holding`, `pending_payment`, `paid`, `checked_in`).
  3. `public.showtime_seat_states` (xóa ghế `HELD` có `ORDER BY showtime_id, seat_id FOR UPDATE`).
- Giữ nguyên ghế `SOLD` trên `showtime_seat_states` để lưu vết lịch sử vị trí ghế đã bán, phục vụ bồi thường / đổi vé.
- Tránh hoàn toàn nguy cơ deadlock (40P01) khi nhiều giao dịch huỷ suất hoặc thanh toán diễn ra đồng thời.

### 2.4. Bảo mật & Phân quyền (Security & ACL)
- `orders_guard_transition()`: `REVOKE ALL FROM public, anon, authenticated` (chỉ trigger/system thực thi).
- `preview_cancel_showtimes` & `cancel_showtimes`:
  - `SECURITY DEFINER`, `SET search_path = ''`.
  - Kiểm tra `p_actor_id <> auth.uid()` ném `42501 FORBIDDEN_ACTOR_SPOOFING` (chống mạo danh audit log theo P0-08).
  - Kiểm tra thẩm quyền rạp qua `public.has_cinema_role(st.cinema_id, array['MANAGER'])` đối với authenticated staff.
  - `REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated, service_role`.
  - Khớp 100% với allowlist bảo mật trong `supabase/tests/048_function_privileges.test.sql`.

### 2.5. Kiểm tra Surgical Diff (Karpathy Guidelines)
- Không có drive-by refactor, không sửa đổi các file migration đã áp dụng trước đó.
- Code SQL ngắn gọn, tường minh, có chú thích rõ ràng theo từng bước nghiệp vụ.
- Bộ test pgTAP `057_cancel_showtimes_idempotent.test.sql` bao phủ đủ 15 tình huống từ preview, cancel lần 1, kiểm tra outbox, đến cancel lần 2 (idempotent).

---

## 3. Kết quả chạy Verify Commands

Tất cả lệnh kiểm tra đều thực thi và PASS:
1. **`pnpm db:test`**:
   - Chạy toàn bộ **26 test files**, **762 tests**, thời gian 15s.
   - Kết quả: **PASS 100%** (bao gồm `048_function_privileges.test.sql`, `043_cancel.test.sql`, `057_cancel_showtimes_idempotent.test.sql`).
2. **`pnpm typecheck`**:
   - `packages/shared`, `apps/api`, `apps/web`: **PASS 100%**, không có lỗi kiểu TypeScript.
3. **`pnpm test`**:
   - `packages/shared` (14 tests): PASS.
   - `apps/api` (210 tests): PASS.
   - `apps/web` (93 tests): PASS.
   - `scripts` (16 tests): PASS.

---

## 4. Đánh giá chất lượng mã nguồn & Gates

- **AI-slop gate / Anti-slop gate:** Không đụng mã nguồn TS/JS (chỉ có SQL migration + pgTAP SQL test). Oxlint/Aislop: N/A.
- **AI-readable code:** Đặt tên biến, CTE và câu truy vấn rõ ràng (`inserted_emails`, `mark_sent`), chia bước mạch lạc (`5.1` đến `5.7`).
- **Doc Impact:** Không làm thay đổi interface public API hoặc model entity ngoài; tuân thủ đúng các đặc tả R-108, R-109, R-110.

---

## 5. Kết luận

Bản sửa lỗi đã giải quyết triệt để và an toàn toàn bộ các vấn đề được nêu trong yêu cầu task:
1. Email idempotency được bảo đảm bằng cả cờ nghiệp vụ lẫn kiểm tra outbox trong CTE nguyên tử.
2. Đơn `checked_in` được hỗ trợ chuyển sang `affected` thông qua trigger guard, tính toán đúng trong preview và xử lý huỷ trọn vẹn trong `cancel_showtimes`.
3. Tuân thủ Global Locking Order, phòng chống deadlock và đảm bảo an toàn phân quyền RPC.

**Verdict: STRICT PASS**
