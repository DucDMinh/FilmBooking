# Báo cáo Adversarial Cross-Boundary Review: Layer 4 / Task 01

- **Dự án**: FilmBooking
- **Work item**: `build/build-filmbooking`
- **Layer / Task**: `layer-4 / task-01`
- **Round**: 1
- **Reviewer**: `Agent: reviewer` (`Model: pro`)
- **Review Level**: `STRICT`
- **Worktree**: `E:\FilmBooking\.worktrees\layer-4__task-01`
- **Files reviewed**:
  - `supabase/migrations/20261111040000_rpc_hold.sql`
  - `supabase/tests/040_hold.test.sql`
  - Đối chiếu: `SPECIFICATIONS.md` (R-55, R-61..R-68, R-72, R-120..R-127, AC-01, AC-02, AC-06, AC-07, AC-16, AC-21, AC-22, AC-24), `tasks/build-filmbooking/layer-4-task-01.md`, các migration Layer 1–3 và Task 02/04 Layer 4 (`20261111040100_rpc_payment.sql`, `20261111040300_rpc_cancel.sql`).

---

## 1. Kết quả tổng quan (Verdict)

**VERDICT: FAIL**

Mặc dù bộ test pgTAP (`040_hold.test.sql`) và test suite ứng dụng (`pnpm test`) chạy PASS 100%, việc kiểm tra đối chiếu chéo (Adversarial Cross-Boundary Audit) giữa logic PL/pgSQL với database schema thực và các quy tắc nghiệp vụ / bảo mật của `SPECIFICATIONS.md` đã phát hiện **2 lỗi CRITICAL về bảo mật (IDOR / BOLA / Giả mạo danh tính)**, **2 lỗi HIGH về tính toàn vẹn (Deadlock concurrency & Bỏ qua kiểm tra độ tuổi phim)**, và **2 lỗi MEDIUM về logic chống ghế lẻ và lệch chữ ký hàm giữa các migration**.

---

## 2. Chi tiết các khiếm khuyết phát hiện (Defects Log)

### Defect 1 (CRITICAL — IDOR / BOLA trong `release_seats`)
- **File:Line**: [supabase/migrations/20261111040000_rpc_hold.sql:466-509](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L466-L509)
- **Mô tả**:
  Hàm `public.release_seats(p_order_id uuid, p_actor_id uuid default auth.uid())` được `grant execute` cho `authenticated`.
  Trong thân hàm:
  ```sql
  v_actor := coalesce(p_actor_id, auth.uid());
  ...
  if not (
    (v_order.user_id is not null and v_actor is not null and v_order.user_id = v_actor)
    ...
  ```
  Hệ thống tin tưởng hoàn toàn tham số `p_actor_id` do client truyền lên. Bất kỳ khách hàng đăng nhập nào (User A) cũng có thể gọi `release_seats(order_of_user_B, user_B_uuid)`. Khi đó `v_actor` được gán bằng `user_B_uuid`, khớp với `v_order.user_id`, giúp điều kiện phân quyền vượt qua thành công. Kẻ tấn công có thể huỷ đơn đang giữ ghế của bất kỳ khách hàng nào trên hệ thống!
- **False-Confidence trong test**:
  Trong `040_hold.test.sql:481-487`, test chỉ kiểm tra trường hợp Cust2 truyền `p_actor_id` là UUID của chính Cust2 (`...0d02`). Test không kiểm tra trường hợp Cust2 truyền UUID của Cust1 (`...0d01`) để giả mạo chủ đơn.
- **Yêu cầu sửa**:
  Chỉ cho phép sử dụng `p_actor_id` khi caller là `service_role`. Đối với người dùng thông thường (`authenticated`), bắt buộc cưỡng chế `v_actor := auth.uid();` và ném lỗi `PERMISSION_DENIED` nếu `p_actor_id is not null and p_actor_id <> auth.uid()`.

---

### Defect 2 (CRITICAL — BOLA / Impersonation & Kênh POS mở toang trong `hold_seats`)
- **File:Line**: [supabase/migrations/20261111040000_rpc_hold.sql:57-118](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L57-L118), [231-247](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L231-L247), [381-404](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L381-L404)
- **Mô tả**:
  1. **Giả mạo user_id**: Hàm `hold_seats` nhận `p_user_id uuid default auth.uid()`. Khi người dùng `authenticated` gọi RPC, họ có thể truyền `p_user_id = victim_uuid`. Tại bước 3.9, hàm sẽ tự động xóa ghế giữ và huỷ đơn holding của nạn nhân trên toàn chuỗi rạp (R-64). Tại bước 3.16, đơn hàng mới được tạo đứng tên nạn nhân.
  2. **Bypass toàn bộ kiểm soát bằng kênh POS**: Hàm cho phép `p_channel = 'POS'` nhưng không kiểm tra caller có quyền POS hay không (không kiểm tra `staff_assignments` hay `service_role`). Người dùng web thông thường (`authenticated`) có thể truyền `p_channel = 'POS'` để:
     - Giữ ghế không cần đăng nhập / không cần xác nhận email (bỏ qua bước 3.2).
     - Giữ ghế sau mốc đóng bán online 15 phút, kéo dài tới khi kết thúc suất chiếu (bước 3.5).
     - Giữ không giới hạn số đơn (bỏ qua bước 3.9 giới hạn 1 đơn holding/khách).
- **Yêu cầu sửa**:
  1. Với kênh `WEB`: nếu caller không phải `service_role`, cưỡng chế `v_user_id := auth.uid();` (từ chối hoặc ghi đè `p_user_id`).
  2. Với kênh `POS`: bắt buộc caller phải là `service_role` HOẶC nhân viên/quản lý rạp có trong `public.staff_assignments` của rạp thuộc suất chiếu đó (`public.has_cinema_role(v_st.cinema_id, array['STAFF', 'MANAGER']::public.staff_role[])`).

---

### Defect 3 (HIGH — Nguy cơ Deadlock khi giữ nhiều ghế đồng thời)
- **File:Line**: [supabase/migrations/20261111040000_rpc_hold.sql:424-440](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L424-L440)
- **Mô tả**:
  Khi hai giao dịch đồng thời cùng cố giữ nhiều ghế có phần giao nhau (ví dụ User 1 giữ `[Seat_A, Seat_B]`, User 2 giữ `[Seat_B, Seat_A]`):
  Câu lệnh chèn trạng thái giữ ghế:
  ```sql
  insert into public.showtime_seat_states (...)
  select ... from public.price_quote(p_showtime_id, p_seat_ids) pq;
  ```
  Hàm `price_quote` duyệt `order by q.ord` theo thứ tự mảng `p_seat_ids` client gửi lên. Vì câu lệnh chèn không có `ORDER BY pq.seat_id`, Postgres sẽ chèn theo thứ tự mảng. User 1 giữ khóa trên `Seat_A` chờ `Seat_B`, User 2 giữ khóa trên `Seat_B` chờ `Seat_A` -> **Postgres báo lỗi 40P01 (deadlock detected)** thay vì trả về lỗi tranh chấp ghế `SEAT_TAKEN` / `unique_violation (23505)`.
- **Yêu cầu sửa**:
  Sắp xếp cố định thứ tự chèn hoặc khóa tài nguyên theo thứ tự tăng dần của `seat_id`:
  1. Bổ sung `ORDER BY pq.seat_id` vào câu lệnh `insert into public.showtime_seat_states ... select ... from public.price_quote(...) pq order by pq.seat_id`.
  2. Đồng thời trước khi thao tác, nên thực hiện khóa deterministic:
     `perform 1 from public.seats s where s.id = any(p_seat_ids) order by s.id for update;`

---

### Defect 4 (HIGH — Bỏ qua kiểm tra độ tuổi phim T13/T16/T18)
- **File:Line**: [supabase/migrations/20261111040000_rpc_hold.sql:142-170](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L142-L170)
- **Mô tả**:
  Theo yêu cầu R-68 và AC-16 trong `SPECIFICATIONS.md`:
  *"Phim T13/T16/T18... Ngày sinh trong hồ sơ cho thấy khách chưa đủ tuổi → chặn đặt vé."*
  Trong `20261111040000_rpc_hold.sql`, hàm `hold_seats` hoàn toàn không select cột `age_rating` từ bảng `movies`, không kiểm tra trường `date_of_birth` từ bảng `public.profiles` của khách hàng. Khách hàng vị thành niên (hoặc tài khoản chưa điền ngày sinh) vẫn có thể giữ ghế xem phim `T18` mà không gặp bất kỳ rào cản nào.
- **Yêu cầu sửa**:
  1. Lấy `m.age_rating` từ `public.movies`.
  2. Với kênh `WEB` và phim có `age_rating in ('T13', 'T16', 'T18')`:
     - Đọc `date_of_birth` từ `public.profiles` theo `v_user_id`.
     - Nếu `date_of_birth is null` -> `raise exception 'DOB_REQUIRED: Vui lòng cập nhật ngày sinh trong thông tin tài khoản trước khi đặt vé cho phim %' using errcode = '22023'`.
     - Tính số tuổi tại ngày chiếu: `v_age := extract(year from age((v_st.starts_at at time zone 'Asia/Ho_Chi_Minh')::date, v_dob))`. Nếu không đủ tuổi -> `raise exception 'UNDERAGE_FOR_RATING: Bạn chưa đủ % tuổi để đặt vé phim này' using errcode = '23514'`.

---

### Defect 5 (MEDIUM — Khiếm khuyết trong quy tắc chống ghế lẻ `ORPHAN_SEAT`)
- **File:Line**: [supabase/migrations/20261111040000_rpc_hold.sql:282-350](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L282-L350)
- **Mô tả**:
  1. **Áp đặt lên POS**: Kênh POS là nhân viên bán vé trực tiếp cho khách tại quầy, không được áp quy tắc chống ghế lẻ như web (R-66 / AC-02).
  2. **Chặn khách mua vé khi hàng chỉ còn 2 ghế trống**: Logic kiểm tra hiện tại chỉ xét `seg_total_capacity >= 2`. Nếu cả hàng/phân đoạn 10 ghế chỉ còn lại đúng 2 ghế trống (ví dụ A9, A10) do các ghế khác đã bán hết, khách đi 1 mình muốn mua ghế A9 sẽ bị chặn vì để lại A10 (và ngược lại). Kết quả là cả 2 ghế này không thể bán được cho khách đi lẻ! R-66 có quy định rõ: *"trừ khi sơ đồ không còn cách chọn khác"*.
  3. **Xử lý ghế bị khoá (`showtime_seat_locks`)**: Ghế bị Manager khoá đang được đối xử như ghế đã có người ngồi (`is_occupied = true`) thay vì ranh giới phân tách segment. Nếu A1 bị khoá, A2 trống, A3 đã bán -> A2 bị coi là orphan seat kẹp giữa và không bao giờ bán được.
- **Yêu cầu sửa**:
  - Đặt điều kiện `if v_channel = 'WEB' then` cho toàn bộ khối 3.12.
  - Bổ sung kiểm tra số ghế trống còn lại của hàng/phân đoạn (`available_count`): nếu `available_count <= 2` thì miễn trừ kiểm tra ghế lẻ.
  - Phân tách segment nếu gặp ghế `showtime_seat_locks`.

---

### Defect 6 (MEDIUM — Xung đột chữ ký và hành vi hàm `generate_booking_code`)
- **File:Line**: `20261111040000_rpc_hold.sql:34-53` so với `20261111040100_rpc_payment.sql:9-40`
- **Mô tả**:
  Hai migration của Task 01 và Task 02 cùng tạo hàm `public.generate_booking_code(p_cinema_code text)` nhưng định nghĩa khác nhau:
  - Task 01: bộ ký tự `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, chỉ grant cho `service_role`.
  - Task 02: bộ ký tự `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ`, có vòng lặp kiểm tra trùng trong bảng `orders`, grant cho cả `authenticated, service_role`.
  Khi Task 02 áp dụng sau Task 01, nó sẽ đè lên hàm của Task 01.
- **Yêu cầu sửa**: Thống nhất implementation chuẩn cho hàm `generate_booking_code` giữa 2 task.

---

## 3. Khuyến nghị cho Builder (Action Items)

1. Sửa hàm `release_seats`:
   - Bắt buộc kiểm tra: nếu caller không phải `service_role`, không được dùng `p_actor_id` khác `auth.uid()`.
2. Sửa hàm `hold_seats`:
   - Kiểm tra định danh: kênh `WEB` cưỡng chế `user_id = auth.uid()`; kênh `POS` kiểm tra quyền nhân sự rạp hoặc `service_role`.
   - Sắp xếp thứ tự insert `showtime_seat_states` theo `ORDER BY pq.seat_id` để chống deadlock.
   - Bổ sung logic kiểm tra nhãn tuổi `m.age_rating` vs `profiles.date_of_birth` cho kênh `WEB`.
   - Bọc kiểm tra ghế lẻ `ORPHAN_SEAT` chỉ cho kênh `WEB`, thêm điều kiện miễn trừ khi số ghế trống `<= 2`.
3. Bổ sung test cases trong `040_hold.test.sql`:
   - Test kẻ tấn công cố tình truyền `p_actor_id` của nạn nhân vào `release_seats` -> phải bị từ chối `PERMISSION_DENIED`.
   - Test khách thường gọi `hold_seats` với `p_channel = 'POS'` -> phải bị từ chối `PERMISSION_DENIED`.
   - Test khách chưa cập nhật ngày sinh hoặc chưa đủ tuổi đặt phim `T18` -> lỗi `DOB_REQUIRED` / `UNDERAGE_FOR_RATING`.
   - Test mua 1 vé khi hàng chỉ còn 2 ghế trống -> không bị lỗi `ORPHAN_SEAT`.

---
**Verdict Final: FAIL**
Báo cáo được tạo bởi Adversarial Reviewer độc lập. Builder cần khắc phục đầy đủ các defect trên trước khi yêu cầu review vòng 2.
