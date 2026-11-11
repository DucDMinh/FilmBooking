# Adversarial Review Report: Layer 4 / Task 02 — RPC Thanh toán & Bán vé (Round 2)

**Reviewer:** `reviewer` (`Model: pro`)  
**Task:** `layer-4/task-02` — RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết hạn, đơn 0đ, xác nhận bán POS  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-02`  
**Review Level:** `STRICT` (Bất biến #3 — Thanh toán đúng một lần, tài chính vé, RLS & phân quyền bảo mật)  
**Thời điểm review:** 2026-11-11  
**Verdict:** 🟢 **STRICT PASS**

---

## 1. Tóm tắt đánh giá Round 2 (Executive Summary)

Sau khi nhận kết quả `FAIL` ở Round 1 với 2 lỗi CRITICAL và 3 lỗi MAJOR, Builder đã nghiêm túc tiếp thu và tái cấu trúc triệt để code SQL (`supabase/migrations/20261111040100_rpc_payment.sql`) cũng như viết bổ sung bộ test pgTAP sâu sắc, toàn diện (`supabase/tests/041_payment_rpc.test.sql`).

Quá trình **Adversarial Cross-Boundary Audit (Round 2)** độc lập đã tiến hành rà soát từng dòng mã nguồn, đối chiếu chéo trực tiếp với database schema lõi (`20261111030100_booking_tables.sql`, `20261111020100_security_ops.sql`, `20261111010000_core_identity_chain.sql`) và `SPECIFICATIONS.md`. Kết quả xác nhận **100% các defect đã được khắc phục hoàn chỉnh, chuẩn xác và có bộ test pgTAP phủ kín các ca kiểm thử biên âm bản (negative boundary)**.

---

## 2. Kết quả kiểm chứng chi tiết 5 Defect từ Round 1

### ✅ Defect 1 (CRITICAL — State Machine Gap & Exception 23514): ĐÃ SỬA TRIỆT ĐỂ
- **Hiện trạng kiểm tra:** 
  - Trong `supabase/migrations/20261111040100_rpc_payment.sql:19-44`, hàm trigger `orders_guard_transition` đã được cập nhật chính thức bằng `create or replace function`, bổ sung nhánh chuyển trạng thái:
    - `holding -> ('pending_payment', 'expired', 'cancelled', 'paid', 'needs_manual_review')`
    - `pending_payment -> ('paid', 'cancelled', 'expired', 'needs_manual_review')`
  - Đồng thời, trong thân hàm `confirm_paid` (dòng 209-213 và 327-335), hệ thống thực hiện chuyển đổi an toàn qua bước trung gian `expired` trước khi sang `needs_manual_review`, bảo đảm tính nhất quán tuyệt đối của máy trạng thái.
- **Xác minh pgTAP Test:**
  - `supabase/tests/041_payment_rpc.test.sql:479-540` (Section 11) kiểm thử trực tiếp 2 ca:
    1. Đơn 11 ở trạng thái `pending_payment` bị tranh chấp ghế: `confirm_paid` chuyển mượt mà sang `needs_manual_review`, không bị ném lỗi `23514`, không sinh vé rác, enqueue email hướng dẫn khách.
    2. Đơn 14 ở trạng thái `holding` bị tranh chấp ghế: `confirm_paid` chuyển an toàn sang `needs_manual_review`.

---

### ✅ Defect 2 (CRITICAL — BOLA / IDOR trên `confirm_zero_amount`): ĐÃ SỬA TRIỆT ĐỂ
- **Hiện trạng kiểm tra:** 
  - Trong `supabase/migrations/20261111040100_rpc_payment.sql:800-812`, hàm `confirm_zero_amount` đã tích hợp rào chắn kiểm soát quyền truy cập chặt chẽ:
    ```sql
    if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
      if auth.uid() is null or v_order.user_id is null or v_order.user_id <> auth.uid() then
        raise exception 'FORBIDDEN: Không có quyền xác nhận đơn hàng của người khác' using errcode = '42501';
      end if;
    elsif coalesce(auth.role(), '') <> 'service_role'
          and current_setting('role', true) not in ('postgres', 'supabase_admin')
          and current_user not in ('postgres', 'supabase_admin')
          and not public.is_admin() then
      if auth.uid() is null or v_order.user_id is null or v_order.user_id <> auth.uid() then
        raise exception 'FORBIDDEN: Không có quyền xác nhận đơn hàng của người khác' using errcode = '42501';
      end if;
    end if;
    ```
- **Xác minh pgTAP Test:**
  - `supabase/tests/041_payment_rpc.test.sql:542-583` (Section 12) mô phỏng người dùng B (`cust2`) gọi `confirm_zero_amount` trên đơn của người dùng A (`cust1`) -> pgTAP khẳng định ném đúng mã lỗi **`42501`** (`FORBIDDEN`). Khi chính chủ người dùng A gọi -> thành công chuyển trạng thái `paid`.

---

### ✅ Defect 3 (MAJOR — `confirm_pos_sale` không kiểm tra `showtimes.status`): ĐÃ SỬA TRIỆT ĐỂ
- **Hiện trạng kiểm tra:** 
  - Trong `supabase/migrations/20261111040100_rpc_payment.sql:972-984`, hàm `confirm_pos_sale` đã bổ sung truy vấn kiểm tra suất chiếu với khóa chia sẻ `for share`:
    ```sql
    select * into v_showtime from public.showtimes where id = v_order.showtime_id for share;
    if not found then
      raise exception 'SHOWTIME_NOT_FOUND: Suất chiếu không tồn tại' using errcode = '23514';
    end if;
    if v_showtime.status = 'CANCELLED' then
      raise exception 'SHOWTIME_CANCELLED: Suất chiếu đã bị huỷ, không thể bán vé' using errcode = '23514';
    end if;
    if v_showtime.status <> 'ON_SALE' then
      raise exception 'SHOWTIME_NOT_OPEN: Suất chiếu không ở trạng thái mở bán' using errcode = '23514';
    end if;
    ```
  - Tuân thủ nghiêm ngặt R-127 và AC-24: chặn hoàn toàn việc xuất vé POS trên các suất chiếu bị hủy hoặc ngừng bán.
- **Xác minh pgTAP Test:**
  - `supabase/tests/041_payment_rpc.test.sql:585-614` (Section 13) kiểm tra bán POS trên suất chiếu có `status = 'CANCELLED'` và suất có `status = 'CLOSED'` -> cả 2 đều bị chặn và ném ngoại lệ như mong đợi.

---

### ✅ Defect 4 (MAJOR — Đụng độ `UNIQUE (order_code)` khi chịu tải cao): ĐÃ SỬA TRIỆT ĐỂ
- **Hiện trạng kiểm tra:** 
  - Builder đã tạo sequence chuyên dụng trong `supabase/migrations/20261111040100_rpc_payment.sql:9-14`:
    ```sql
    create sequence if not exists public.internal_payment_order_code_seq
      start with 900000000000000
      increment by 1;
    revoke all on sequence public.internal_payment_order_code_seq from public, anon;
    grant usage, select on sequence public.internal_payment_order_code_seq to authenticated, service_role;
    ```
  - Loại bỏ hoàn toàn biểu thức `extract(epoch from clock_timestamp()) * 1000`. Toàn bộ các vị trí sinh `order_code` cho kênh POS, đơn 0đ và các nhánh fallback đều chuyển sang dùng `nextval('public.internal_payment_order_code_seq')` (dòng 228, 352, 437, 581, 652, 869, 1046).
- **Xác minh pgTAP Test:**
  - Các bài kiểm thử tại dòng 381-386 (đơn 0đ) và 428-433 (POS) kiểm tra giá trị `order_code` sinh ra từ sequence `>= 900000000000000`, bảo đảm tính đơn điệu, nguyên tử và không bao giờ va chạm constraint.

---

### ✅ Defect 5 (MAJOR — Xử lý `AMOUNT_MISMATCH` làm mất dấu đơn hàng): ĐÃ SỬA TRIỆT ĐỂ
- **Hiện trạng kiểm tra:** 
  - Trong `supabase/migrations/20261111040100_rpc_payment.sql:203-306`, nhánh lệch tiền đã được tái thiết kế toàn diện theo đúng R-104 & R-134:
    1. Nhả ngay lập tức ghế `HELD` của đơn để rạp có thể bán cho khách khác.
    2. Chuyển trạng thái đơn sang `needs_manual_review` (hiện rõ trên màn hình xử lý của Quản lý rạp).
    3. Lưu bản ghi thanh toán ở trạng thái `PENDING` kèm số tiền thực nhận.
    4. Ghi nhận sự kiện `payment_events` với cờ `AMOUNT_MISMATCH` phục vụ đối soát PayOS.
    5. Ghi vết `audit_logs` đầy đủ thông tin trước/sau.
    6. Enqueue email thông báo `AMOUNT_MISMATCH_MANUAL_REVIEW` vào `email_outbox` hướng dẫn khách hàng.
- **Xác minh pgTAP Test:**
  - `supabase/tests/041_payment_rpc.test.sql:166-221` (Section 5) kiểm tra toàn bộ 7 tiêu chí: mã trả về `AMOUNT_MISMATCH`, đơn sang `needs_manual_review`, không sinh vé, ghế HELD bị xoá, email được enqueue và payment ở trạng thái `PENDING`.

---

## 3. Đánh giá các Cổng chất lượng (Quality Gates)

| Quality Gate | Trạng thái | Chi tiết ghi nhận |
|---|---|---|
| **Requirements Coverage** | 🟢 **PASS** | Phủ đầy đủ R-75, R-76, R-77, R-78, R-82, R-85, R-86, R-104, R-116, R-125, R-127, R-128, R-134; AC-10, AC-11, AC-24. |
| **Cross-Boundary & Mock Audit** | 🟢 **PASS** | Schema khớp 100% với migrations lõi (`booking_tables.sql`, `security_ops.sql`, `core_identity_chain.sql`); sequence chống va chạm `UNIQUE (order_code)`. |
| **Security & Permissions (OWASP)** | 🟢 **PASS** | Khắc phục triệt để BOLA/IDOR trên `confirm_zero_amount`; các hàm nhạy cảm revoke public/anon và chỉ grant `service_role`. |
| **Race Conditions & Concurrency** | 🟢 **PASS** | `FOR UPDATE` trên `orders`, `FOR SHARE` trên `showtimes`, atomic `ON CONFLICT` trên `showtime_seat_states`, sequence nguyên tử. |
| **AI-slop Gate** | 🟢 **PASS** | Không có narrative comment rườm rà, không nuốt lỗi, logic SQL chặt chẽ, test assertions sắc gọn (54/54 tests). |
| **Anti-slop / Type Gate** | ⏩ **SKIP** | Task thuần SQL migration và test pgTAP, không thay đổi file TS/JS. |

---

## 4. Kết luận

Toàn bộ các lỗ hổng bảo mật, lỗi state machine và đụng độ dữ liệu được chỉ ra ở Round 1 đã được sửa chữa tận gốc. Bộ test pgTAP đã được nâng cấp từ 37 lên 54 ca kiểm thử chi tiết, phản ánh chính xác hành vi cơ sở dữ liệu thực tế.

**Verdict chính thức:** 🟢 **STRICT PASS**  
Cho phép đóng task `layer-4/task-02` và tiến hành các bước tiếp theo trong workflow.
