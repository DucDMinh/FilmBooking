# Adversarial Review Report: Layer 4 / Task 02 — RPC Thanh toán & Bán vé

**Reviewer:** `reviewer` (`Model: pro`)  
**Task:** `layer-4/task-02` — RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết hạn, đơn 0đ, xác nhận bán POS  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-02`  
**Review Level:** `STRICT` (liên quan trực tiếp tới Bất biến #3 — Thanh toán đúng một lần, tài chính, giao dịch vé, RLS & quyền gọi hàm)  
**Thời điểm review:** 2026-11-11  
**Verdict:** ❌ **FAIL**

---

## 1. Tóm tắt đánh giá (Executive Summary)

Mặc dù bộ test pgTAP (`supabase/tests/041_payment_rpc.test.sql`) chạy thành công 371/371 test pass xanh, quá trình **Adversarial Cross-Boundary Audit** độc lập đối chiếu giữa code SQL (`supabase/migrations/20261111040100_rpc_payment.sql`), schema DB lõi (`20261111030100_booking_tables.sql`), các migration anh em ở Layer 4 (`task-01`, `task-03`) và `SPECIFICATIONS.md` đã phát hiện **2 lỗi CRITICAL** và **3 lỗi MAJOR** nghiêm trọng về bảo mật, tính toàn vẹn máy trạng thái (state machine gap), vi phạm quy tắc nghiệp vụ rạp chiếu và đụng độ dữ liệu khi chịu tải.

Bộ test của Builder mắc lỗi **False-Confidence Test**: các ca kiểm thử chỉ kiểm thử trên các giả định thuận lợi (happy-path hoặc chỉ test khi đơn đã sẵn ở trạng thái `expired`), che giấu hoàn toàn các điểm gãy khi đơn thực tế bị tranh chấp ghế ở trạng thái `holding`/`pending_payment`.

---

## 2. Chi tiết các lỗi phát hiện (Defects Analysis)

### 🔴 Defect 1 (CRITICAL — State Machine Gap & Exception 23514 gây vỡ Webhook)
- **Vị trí:** `supabase/migrations/20261111040100_rpc_payment.sql:227-230`
```sql
if v_conflict_held then
  -- Ghế đã bị đơn khác chiếm (race condition khi hold vừa hết hạn): chuyển manual review
  update public.orders
     set status = 'needs_manual_review'
   where id = v_order.id;
```
- **Đối chiếu Schema thật:** `supabase/migrations/20261111030100_booking_tables.sql:364-372` (Trigger `orders_guard_transition`):
```sql
if new.status is distinct from old.status and not (
     (old.status = 'holding'         and new.status in ('pending_payment', 'expired', 'cancelled', 'paid'))
  or (old.status = 'pending_payment' and new.status in ('paid', 'cancelled', 'expired'))
  or (old.status in ('expired', 'cancelled') and new.status in ('paid', 'needs_manual_review'))
  or (old.status = 'paid'            and new.status in ('checked_in', 'affected'))
  or (old.status = 'affected'        and new.status in ('exchanged', 'refunded_manual'))
) then
  raise exception 'Chuyển trạng thái đơn không hợp lệ: % -> %', old.status, new.status using errcode = '23514';
end if;
```
- **Hậu quả:** 
  Khi đơn đang ở `holding` hoặc `pending_payment` mà ghế bị chiếm bởi đơn khác (do vừa quá hạn 10 phút nhưng cron job chưa kịp dọn, và khách bên kia vừa thanh toán xong), webhook PayOS gọi `confirm_paid` sẽ chạy vào nhánh này.
  Lệnh `update public.orders set status = 'needs_manual_review'` lập tức kích hoạt trigger `orders_guard_transition` và ném mã lỗi Postgres **`23514`** (`Chuyển trạng thái đơn không hợp lệ: holding -> needs_manual_review` hoặc `pending_payment -> needs_manual_review`).
  Toàn bộ transaction bị abort, webhook PayOS nhận về HTTP 500! Đơn không cập nhật được trạng thái, tiền đã thu từ khách không được ghi nhận vào bảng `payments` và email hướng dẫn không được enqueue!
- **False-Confidence Test:** Trong `041_payment_rpc.test.sql:203-228` (Test 6), Builder chỉ test `needs_manual_review` bằng cách tạo đơn giả lập đã có sẵn `status = 'expired'`! Builder hoàn toàn bỏ sót test cho trường hợp `v_conflict_held` khi đơn ở `holding`/`pending_payment`.

---

### 🔴 Defect 2 (CRITICAL — BOLA / IDOR Vulnerability trên `confirm_zero_amount`)
- **Vị trí:** `supabase/migrations/20261111040100_rpc_payment.sql:676-709` và `805-806`
```sql
revoke all on function public.confirm_zero_amount(uuid) from public, anon;
grant execute on function public.confirm_zero_amount(uuid) to authenticated, service_role;
```
- **Phân tích:** 
  Hàm `confirm_zero_amount(p_order_id uuid)` là hàm `SECURITY DEFINER` và được cấp quyền thực thi trực tiếp cho mọi tài khoản đăng nhập (`authenticated`).
  Tuy nhiên, trong toàn bộ thân hàm **HOÀN TOÀN KHÔNG CÓ BẤT KỲ DÒNG NÀO KIỂM TRA QUYỀN SỞ HỮU ĐƠN HÀNG** (`v_order.user_id = auth.uid()` hoặc quyền quản trị viên Admin/Manager)!
- **Hậu quả (OWASP API Top 1 - Broken Object Level Authorization):**
  Bất kỳ user nào có tài khoản đăng nhập đều có thể gọi `supabase.rpc('confirm_zero_amount', { p_order_id: '<order_id của nạn nhân>' })` để cưỡng chế chốt đơn của người khác, hoặc chốt các đơn 0đ của kênh POS / khách vãng lai khi chưa được sự cho phép.

---

### 🟠 Defect 3 (MAJOR — Vi phạm R-127 & AC-24: `confirm_pos_sale` không kiểm tra trạng thái suất chiếu)
- **Vị trí:** `supabase/migrations/20261111040100_rpc_payment.sql:811-886`
- **Đối chiếu Spec:** 
  - `SPECIFICATIONS.md` R-127: *"Từ chối suất huỷ / ngừng bán: Suất bị huỷ / ngừng bán → API từ chối giữ/bán mới cho suất đó."*
  - AC-24: *"Manager huỷ suất → suất ngừng bán trên web và POS; vé không check-in được."*
- **Phân tích:** 
  Trong hàm `confirm_pos_sale(p_order_id, p_request_id)`, code chỉ kiểm tra `v_order.channel = 'POS'`, `v_order.status = 'holding'`, và số ghế giữ hợp lệ.
  Hàm **HOÀN TOÀN KHÔNG TRUY VẤN BẢNG `showtimes`** để kiểm tra `showtimes.status <> 'CANCELLED'`.
- **Hậu quả:** 
  Nếu một suất chiếu đã bị Admin/Manager huỷ (`CANCELLED`) sau khi nhân viên POS chọn giữ ghế, POS bấm "Xác nhận bán" thì `confirm_pos_sale` vẫn chốt đơn thành công sang `paid`, đổi ghế sang `SOLD` và xuất vé `tickets` cho một suất chiếu đã bị huỷ! Điều này tạo ra vé rác, khách mang vé không thể check-in được (AC-24) và gây sai lệch đối soát rạp.

---

### 🟠 Defect 4 (MAJOR — Race Condition & Đụng độ `UNIQUE (order_code)` khi chịu tải)
- **Vị trí:** `supabase/migrations/20261111040100_rpc_payment.sql:749` và `911`
```sql
-- confirm_zero_amount:
floor(extract(epoch from clock_timestamp()) * 1000)::bigint,

-- confirm_pos_sale:
floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
```
- **Đối chiếu Schema:** `supabase/migrations/20261111030100_booking_tables.sql:176`:
```sql
order_code bigint not null unique check (order_code > 0),
```
- **Phân tích:** 
  NFR-02 quy định hệ thống hỗ trợ bán vé đa rạp với tốc độ thao tác cao (nhiều rạp, mỗi rạp nhiều quầy POS bán đồng thời).
  Hàm `extract(epoch from clock_timestamp()) * 1000` chỉ lấy timestamp theo milli-giây.
- **Hậu quả:** 
  Khi có 2 giao dịch POS tại 2 quầy vé khác nhau hoặc 2 đơn 0đ diễn ra trong cùng 1 milli-giây, giá trị `order_code` sẽ bị trùng lặp chính xác, dẫn đến ném lỗi Postgres **`23505`** (`unique_violation`) trên ràng buộc `payments.order_code`. Giao dịch bán vé tại quầy của nhân viên thu ngân bị crash bất ngờ. Cần sử dụng một sequence (`create sequence`) chuyên dụng cho POS/zero-amount để sinh số duy nhất tuyệt đối.

---

### 🟠 Defect 5 (MAJOR — Lệch tiền `AMOUNT_MISMATCH` làm mất dấu đơn hàng trên hệ thống vận hành)
- **Vị trí:** `supabase/migrations/20261111040100_rpc_payment.sql:155-204`
- **Đối chiếu Spec:** 
  - `SPECIFICATIONS.md` R-104: *"Xử lý đơn cần xem xét thủ công: Danh sách đơn needs_manual_review (Manager rạp mình / Admin); ghi chú cách xử lý, đánh dấu đã giải quyết."*
  - R-134: *"Khách chuyển sai số tiền → đơn không được xác nhận, giao dịch xuất hiện trong báo cáo đối soát."*
- **Phân tích:** 
  Khi khách hàng thanh toán lệch số tiền (`p_amount <> v_order.total_amount`), tiền trong tài khoản của khách đã bị trừ ở cổng PayOS.
  Trong code hiện tại:
  - Đơn hàng được giữ nguyên trạng thái (`holding` hoặc `pending_payment`).
  - Không enqueue bất kỳ email cảnh báo nào cho khách hoặc quản lý rạp.
- **Hậu quả:** 
  Sau 10 phút, đơn hàng này sẽ tự động hết hạn (`expired`). Trên giao diện quản trị rạp, Cinema Manager vào tab "Đơn cần xử lý thủ công" (`needs_manual_review`) sẽ **KHÔNG THẤY** đơn này! Khách hàng bị mất tiền, đến rạp khiếu nại nhưng rạp không có thông tin xử lý trên danh sách cần giải quyết.

---

## 3. Đánh giá các Cổng chất lượng (Quality Gates)

| Quality Gate | Trạng thái | Chi tiết ghi nhận |
|---|---|---|
| **Requirements Coverage** | ❌ **FAIL** | Thiếu kiểm tra `showtimes.status` khi bán POS (R-127); lệch số tiền mất dấu khỏi `needs_manual_review` (R-104). |
| **Cross-Boundary & Mock Audit** | ❌ **FAIL** | Đụng độ trực tiếp với trigger `orders_guard_transition` (Defect 1); đụng độ `UNIQUE (order_code)` trên tải cao (Defect 4). |
| **Security & Permissions (OWASP)** | ❌ **FAIL** | Lỗ hổng BOLA/IDOR nghiêm trọng trên hàm `confirm_zero_amount` (Defect 2). |
| **Race Conditions & Concurrency** | ❌ **FAIL** | Sinh `order_code` bằng timestamp milli-giây dễ va chạm constraint (Defect 4). |
| **AI-slop Gate** | ⚠️ **WARN** | Bộ test thiếu các ca kiểm thử biên âm bản (negative & race boundary), tạo cảm giác an tâm giả tạo. |
| **Anti-slop / Type Gate** | ⏩ **SKIP** | Task chỉ bao gồm migration và test SQL thuần, không thay đổi file TS/JS. |

---

## 4. Danh sách công việc yêu cầu Builder sửa chữa (Action Checklist for Builder)

1. [ ] **Sửa Defect 1 (State Machine Transition):**
   Trong `confirm_paid`, khi `v_conflict_held = true`, không được update trực tiếp `status = 'needs_manual_review'`. Phải cập nhật qua `status = 'expired'` trước, sau đó mới cập nhật sang `status = 'needs_manual_review'` (hoặc cập nhật điều kiện chuyển trạng thái trong máy trạng thái nếu được quy định), để tuân thủ trigger `orders_guard_transition`. Viết bổ sung test case pgTAP cho kịch bản này!
2. [ ] **Sửa Defect 2 (BOLA Security Check):**
   Trong `confirm_zero_amount`, bổ sung kiểm tra quyền sở hữu đơn:
   ```sql
   if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
     if v_order.user_id is null or v_order.user_id <> auth.uid() then
       raise exception 'FORBIDDEN: Không có quyền thao tác trên đơn hàng này' using errcode = '42501';
     end if;
   end if;
   ```
   Bổ sung test pgTAP xác minh rằng user khác gọi `confirm_zero_amount` sẽ bị chặn `42501`.
3. [ ] **Sửa Defect 3 (Kiểm tra suất chiếu khi bán POS):**
   Trong `confirm_pos_sale`, bổ sung kiểm tra trạng thái suất chiếu từ bảng `showtimes`:
   Nếu `showtimes.status = 'CANCELLED'` (hoặc không phải `ON_SALE`), ném lỗi `SHOWTIME_CANCELLED` / `SHOWTIME_NOT_AVAILABLE` và chặn bán vé (R-127). Bổ sung test pgTAP cho trường hợp này.
4. [ ] **Sửa Defect 4 (Sinh `order_code` an toàn):**
   Tạo một Postgres Sequence chuyên dụng (ví dụ `create sequence if not exists public.internal_payment_code_seq;`) để sinh `order_code` an toàn tuyệt đối, tránh đụng độ unique constraint khi quầy vé POS bán đồng thời.
5. [ ] **Sửa Defect 5 (Xử lý `AMOUNT_MISMATCH`):**
   Khi lệch số tiền, cập nhật đơn sang `expired` rồi sang `needs_manual_review`, lưu dòng payment ghi nhận số tiền thực nhận với trạng thái cờ mismatch, và enqueue email thông báo cho khách hàng để liên hệ rạp hỗ trợ.

---

**Kết luận:** Task **FAIL** vòng 1. Yêu cầu Builder tiếp thu các phát hiện trên và tiến hành chỉnh sửa trước khi review vòng 2.
