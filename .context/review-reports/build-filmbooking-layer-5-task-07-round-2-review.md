# Báo cáo Review: Layer 5 Task 07 (Round 2)

**Agent: reviewer**  
**Task**: API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo MVP, Việc cần làm (`layer-5-task-07`)  
**Worktree**: `E:\FilmBooking\.worktrees\layer-5__task-07`  
**Review Level**: `STRICT` (RBAC Staff/Manager/Admin, bảo mật rạp NFR-05/AC-16, xử lý tài chính/hoàn tiền thủ công, báo cáo doanh thu & đối soát PayOS)  
**Verdict**: **STRICT PASS**

---

## 1. Kết quả kiểm tra xác minh tự động (Automated Verification)

| Lệnh kiểm tra | Kết quả | Chi tiết |
|---|---|---|
| `pnpm -w typecheck` | **PASS** | Tất cả các package `shared`, `api`, `web` đều biên dịch sạch, 0 lỗi TypeScript |
| `pnpm -w lint` | **PASS** | ESLint đạt 100% sạch trên toàn bộ workspace |
| `pnpm --filter @filmbooking/api test` | **PASS** | 16/16 test files pass, 257/257 tests pass (trong đó `orders-report.e2e-spec.ts` 27/27 tests pass) |

---

## 2. Thẩm định khắc phục Defect từ Round 1 (Defect Resolution Audit)

### ✅ DEFECT 1 (Ràng buộc `audit_logs.action` Check Constraint) — RESOLVED
- **Thực tế trong code**:
  Trong `apps/api/src/modules/orders/orders.service.ts`:
  - Tại dòng 536–550 (khi `CONFIRM_SALE`): Trường `action` đã được đổi thành `"UPDATE"`. Chi tiết hành động nghiệp vụ được đưa vào trường `after_data`:
    ```ts
    after_data: {
      action_detail: "CONFIRM_SALE",
      action: input.action,
      note: input.note,
      resolved_at: nowIso,
    }
    ```
  - Tại dòng 578–595 (khi `REFUND_MANUAL`): Trường `action` đã được đổi thành `"UPDATE"`. Chi tiết hoàn tiền được lưu đầy đủ trong `after_data`:
    ```ts
    after_data: {
      action_detail: "REFUND_MANUAL",
      action: input.action,
      note: input.note,
      refund_reference: input.refundReference,
      refunded_amount: input.refundedAmount,
      resolved_at: nowIso,
    }
    ```
- **Đối chiếu Schema Postgres**: Hoàn toàn tuân thủ ràng buộc cứng `check (action in ('INSERT', 'UPDATE', 'DELETE'))` của bảng `public.audit_logs`.

---

### ✅ DEFECT 2 (PostgREST Relationship Embedding Mismatch trên `showtimes`) — RESOLVED
- **Thực tế trong code**:
  Trong `apps/api/src/modules/orders/orders.service.ts`:
  - Tại dòng 660–670: Đã loại bỏ resource embedding `cinemas(name)` và `rooms(name)` không hợp lệ khỏi câu select của `showtimes`. Chỉ query các trường nội tại và quan hệ hợp lệ `movies(title_vi)`.
  - Tại dòng 711–737: Trích xuất danh sách `cinema_id` và `room_id`, sau đó truy vấn riêng bằng `Promise.all` tới bảng `cinemas` (`select("id, name")`) và `rooms` (`select("id, name")`), rồi map chính xác `cinemaName` và `roomName` cho DTO trả về.
- **Đối chiếu PostgREST**: Triệt tiêu hoàn toàn nguy cơ nổ lỗi `PGRST200` do schema thiếu Foreign Key trực tiếp giữa `showtimes` và `cinemas`.

---

### ✅ DEFECT 3 (State Machine Gap giữa `CONFIRM_SALE` và `checkin_ticket`) — RESOLVED
- **Thực tế trong code**:
  Trong `apps/api/src/modules/orders/orders.service.ts` dòng 506–516:
  Khi Manager giải quyết đơn với `action: "CONFIRM_SALE"`, service đã cập nhật đồng thời cả hai trường:
  ```ts
  await this.supabase
    .admin()
    .from("orders")
    .update({
      status: "paid",
      manual_review_resolved_at: nowIso,
    })
    .eq("id", order.id);
  ```
- **Đối chiếu Nghiệp vụ & Khớp nối**:
  Đơn hàng sau khi chốt bán sẽ mang trạng thái `paid`. Khi khách mang vé đến rạp, RPC `checkin_ticket` (kiểm tra `order_status in ('paid', 'checked_in')`) sẽ soát vé thành công, khắc phục triệt để lỗ hổng nghiệp vụ từ chối khách hàng.

---

### ✅ DEFECT 4 (Mô phỏng False-Confidence trong Mock Test) — RESOLVED
- **Thực tế trong code test**:
  Trong `apps/api/test/orders-report.e2e-spec.ts`:
  - Dòng 538–547: `FakeDb.execute` đã bổ sung chặn cứng PostgREST embedding không hợp lệ và ném mã lỗi `PGRST200`. Có test case chuyên biệt kiểm chứng tại dòng 1014–1018.
  - Dòng 574–588 và 602–616: `FakeDb.execute` đã mô phỏng trung thực Postgres Check Constraint `audit_logs_action_check` và ném mã lỗi `23514` nếu giá trị `action` nằm ngoài `('INSERT', 'UPDATE', 'DELETE')`. Có test case chuyên biệt kiểm chứng tại dòng 894–902.
  - Dòng 809–835: Bổ sung assertion kiểm tra `order.status === 'paid'` và `auditLog.action === 'UPDATE'`.

---

## 3. Thẩm định Yêu cầu Nghiệp vụ (Requirements Coverage)

1. **AC-11 (Đơn `needs_manual_review`)**:
   - Quản trị viên (Admin) thấy toàn bộ đơn cần xử lý trên toàn chuỗi.
   - Quản lý rạp (Manager HN01) chỉ thấy đơn rạp HN01, bị chặn 403 nếu cố lọc rạp HN02.
   - Nhân viên (Staff) gọi xử lý bị chặn 403 `FORBIDDEN` (chỉ xem, không được xử lý).
   - Kiểm tra ghế trùng trước khi chốt bán (`SEAT_TAKEN` -> HTTP 409).
   - Ràng buộc hoàn tiền thủ công: Bắt buộc có mã tham chiếu ngân hàng `refundReference` và số tiền hoàn `refundedAmount`.
2. **AC-16 (Phân quyền rạp / RBAC)**:
   - Các API tra cứu đơn, chi tiết đơn, và 4 báo cáo MVP đều thực thi triệt để kiểm tra ranh giới rạp.
   - RPC báo cáo gọi với context JWT của người dùng (`this.supabase.forUser(user.jwt)`), đảm bảo kiểm tra `has_cinema_manager_scope` ở tầng Postgres.
3. **D5 (`GET /admin/todo`)**:
   - Thống kê chính xác 4 nhóm việc: đơn cần xử lý thủ công, đơn bị ảnh hưởng, email lỗi outbox, và suất chiếu bắt đầu trong 30 phút. Phân quyền chuẩn xác theo rạp và toàn chuỗi.

---

## 4. Kết luận

Toàn bộ 4 Defect từ Round 1 đã được khắc phục hoàn chỉnh, chính xác với Database Schema thật và được bảo vệ bằng các test case kiểm chứng cụ thể. Mã nguồn tuân thủ nghiêm ngặt các quy tắc kỹ thuật và phân quyền bảo mật.

**Verdict: STRICT PASS**
