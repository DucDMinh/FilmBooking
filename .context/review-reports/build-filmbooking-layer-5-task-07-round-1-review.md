# Báo cáo Review: Layer 5 Task 07 (Round 1)

**Agent: reviewer**
**Task**: API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo MVP, Việc cần làm (`layer-5-task-07`)
**Worktree**: `E:\FilmBooking\.worktrees\layer-5__task-07`
**Review Level**: `STRICT` (RBAC Staff/Manager/Admin, bảo mật rạp NFR-05/AC-16, xử lý tài chính/hoàn tiền thủ công, báo cáo doanh thu & đối soát PayOS)
**Verdict**: **FAIL**

---

## 1. Tóm tắt kết quả kiểm tra tự động

| Lệnh kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `pnpm -w typecheck` | **PASS** | TypeScript biên dịch sạch, không có lỗi type |
| `pnpm -w lint` | **PASS** | ESLint đạt 100%, tuân thủ quy tắc codebase |
| `pnpm --filter @filmbooking/api test` | **PASS** | 16/16 test files pass, 255/255 tests pass (25/25 tests của task 07) |

> ⚠️ **Cảnh báo Adversarial Reviewer**:
> Mặc dù toàn bộ bộ test `orders-report.e2e-spec.ts` đều xanh, quá trình đối chiếu chéo (Cross-Boundary Check) với các file migration SQL gốc trong `supabase/migrations/*.sql` đã phát hiện các **sai lệch nghiêm trọng (False-Confidence Mocking)** giữa giả định của Builder và Database Schema thật.

---

## 2. Đối chiếu chéo Database Schema & Phân tích Defect

### 🚨 DEFECT 1 (CRITICAL - Postgres Constraint Violation trên bảng `audit_logs`)
- **File**: `apps/api/src/modules/orders/orders.service.ts`
- **Dòng**: 536 và 572
- **Thực tế trong code**:
  Khi xử lý `resolveManualReview`, Builder gọi:
  ```ts
  // Dòng 534-542
  await this.supabase.admin().from("audit_logs").insert({
    action: "RESOLVE_MANUAL_REVIEW_CONFIRM_SALE", // <-- VI PHẠM CONSTRAINT
    actor_id: user.id,
    cinema_id: order.cinema_id,
    table_name: "orders",
    record_id: order.id,
    after_data: { action: input.action, note: input.note, resolved_at: nowIso },
  });

  // Dòng 570-584
  await this.supabase.admin().from("audit_logs").insert({
    action: "RESOLVE_MANUAL_REVIEW_REFUND_MANUAL", // <-- VI PHẠM CONSTRAINT
    actor_id: user.id,
    cinema_id: order.cinema_id,
    table_name: "orders",
    record_id: order.id,
    after_data: { ... },
  });
  ```
- **Đối chiếu Schema Database thật** (`supabase/migrations/20261111010000_core_identity_chain.sql` dòng 164-174):
  ```sql
  create table public.audit_logs (
    id          bigint generated always as identity primary key,
    occurred_at timestamptz not null default now(),
    actor_id    uuid,
    cinema_id   uuid,
    table_name  text not null,
    record_id   text,
    action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
    before_data jsonb,
    after_data  jsonb
  );
  ```
- **Hậu quả trên DB thật**:
  Cột `action` của bảng `audit_logs` có check constraint cứng: `check (action in ('INSERT', 'UPDATE', 'DELETE'))`.
  Khi chạy với Postgres thật, câu lệnh insert với giá trị `"RESOLVE_MANUAL_REVIEW_CONFIRM_SALE"` hoặc `"RESOLVE_MANUAL_REVIEW_REFUND_MANUAL"` sẽ bị ném lỗi `23514` (`check_violation`). Toàn bộ API `resolveManualReview` sẽ bị sập (HTTP 500) và không thể hoàn thành việc giải quyết đơn thủ công!
- **Lý do bộ test của Builder bỏ lọt (False-confidence test)**:
  Trong `apps/api/test/orders-report.e2e-spec.ts`, class `FakeDb` chỉ lưu dữ liệu vào `store.push(...)` mà không hề mô phỏng check constraint `action in ('INSERT', 'UPDATE', 'DELETE')`.
- **Cách khắc phục**:
  Đổi giá trị trường `action` thành `"UPDATE"` (vì đây là hành động cập nhật đơn hàng). Các thông tin định danh nghiệp vụ như `action: input.action`, `note`, `refundReference` đã được lưu đầy đủ trong `after_data`.

---

### 🚨 DEFECT 2 (CRITICAL - PostgREST Relationship Embedding Mismatch trong `GET /admin/todo`)
- **File**: `apps/api/src/modules/orders/orders.service.ts`
- **Dòng**: 651-655
- **Thực tế trong code**:
  ```ts
  let stQuery = this.supabase
    .admin()
    .from("showtimes")
    .select("id, cinema_id, room_id, movie_id, format, starts_at, ends_at, status, cinemas(name), movies(title_vi), rooms(name)", { count: "exact" })
    .gte("starts_at", now.toISOString())
    .lte("starts_at", in30m.toISOString())
    .neq("status", "CANCELLED");
  ```
- **Đối chiếu Schema Database thật** (`supabase/migrations/20261111020000_catalog.sql` dòng 110-129):
  ```sql
  create table public.showtimes (
    id            uuid primary key default gen_random_uuid(),
    cinema_id     uuid not null,
    room_id       uuid not null,
    movie_id      uuid not null references public.movies (id),
    starts_at     timestamptz not null,
    ends_at       timestamptz not null,
    format        public.screen_format not null,
    ...
    foreign key (room_id, cinema_id) references public.rooms (id, cinema_id),
    unique (id, room_id),
    ...
  );
  ```
- **Hậu quả trên DB thật**:
  Bảng `showtimes` **không có Foreign Key trực tiếp** từ `cinema_id` tới `public.cinemas(id)`. Khóa ngoại liên kết phòng là composite foreign key `(room_id, cinema_id) -> rooms(id, cinema_id)`.
  Khi Supabase PostgREST biên dịch truy vấn `cinemas(name)` trên bảng `showtimes`, nó sẽ trả về lỗi:
  `PGRST200: Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache` (HTTP 400). Endpoint `GET /admin/todo` sẽ bị lỗi hoàn toàn trên môi trường Supabase thật.
- **Lý do bộ test của Builder bỏ lọt (False-confidence test)**:
  Trong `apps/api/test/orders-report.e2e-spec.ts` dòng 88-112, Builder tự tay nhồi sẵn `cinemas: { name: "..." }`, `rooms: { name: "..." }` vào mảng test fixture `fakeDb.tables.showtimes`. `Query.select` của mock chỉ copy object đó ra mà không thực hiện quan hệ schema thật.
- **Cách khắc phục**:
  Query `showtimes` chỉ nên select các trường nội bộ của bảng `showtimes` (`id, cinema_id, room_id, movie_id, format, starts_at, ends_at, status, movies(title_vi)`). Sau đó gom danh sách `cinema_id` và `room_id` để query bảng `cinemas` và `rooms` bằng truy vấn riêng (như mô hình `Promise.all` mà Builder đã áp dụng rất tốt ở `getOrderDetail`).

---

### ⚠️ DEFECT 3 (MAJOR - State Machine Gap giữa `CONFIRM_SALE` và `checkin_ticket`)
- **File**: `apps/api/src/modules/orders/orders.service.ts` dòng 506-530
- **Đối chiếu**: `supabase/migrations/20261111040400_rpc_checkin_reports.sql` dòng 243-250 (`checkin_ticket` Bước 5).
- **Mô tả**:
  Khi Manager chọn `action: "CONFIRM_SALE"` cho đơn `needs_manual_review`:
  - `orders.manual_review_resolved_at` được gán timestamp.
  - Ghế được chốt `SOLD` trong `showtime_seat_states`.
  - Vé được sinh trong `tickets`.
  - Nhưng `orders.status` vẫn là `'needs_manual_review'`.
  Tại RPC `checkin_ticket`:
  ```sql
  -- BƯỚC 5: Kiểm trạng thái đơn hàng (phải là paid hoặc checked_in)
  if v_ticket.order_status not in ('paid', 'checked_in') then
    return jsonb_build_object('status', 'INVALID', 'message', 'Đơn hàng chưa thanh toán hợp lệ');
  end if;
  ```
  Hệ quả: Khách hàng cầm vé của đơn `CONFIRM_SALE` đến rạp sẽ bị từ chối soát vé (`INVALID`) vì `order_status` không phải là `paid` hay `checked_in`.
- **Ghi chú**:
  Trigger `orders_guard_transition` trong migration hiện tại không cho phép chuyển trực tiếp từ `needs_manual_review` sang `paid`. Builder đã xử lý đúng việc không cố update `status` để tránh vi phạm trigger, tuy nhiên sự xung đột logic này cần được đồng bộ rõ ràng hoặc lưu ý cho Phase soát vé/bảo trì schema.

---

## 3. Đánh giá các tiêu chí theo yêu cầu Task

- **AC-11 (Danh sách needs_manual_review)**: **ĐẠT VỀ LOGIC**
  - Admin thấy toàn chuỗi, Manager HN01 chỉ thấy đơn của HN01, không thấy HN02.
  - Staff gọi API xử lý `resolveManualReview` bị chặn 403 `FORBIDDEN` (chỉ đọc).
- **AC-16 (Phân quyền rạp / RBAC)**: **ĐẠT VỀ LOGIC**
  - Manager HN01 gọi đơn / báo cáo của HN02 bị chặn 403 `FORBIDDEN_CINEMA`.
  - 4 RPC báo cáo (`report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes`) được gọi với JWT người dùng (`this.supabase.forUser(user.jwt)`), kích hoạt đầy đủ kiểm tra `has_cinema_manager_scope` ở mức DB.
- **GET /admin/todo (D5)**: **CẦN SỬA**
  - Đầy đủ 4 hạng mục: đơn `needs_manual_review` chưa xử lý, đơn `affected` chưa xử lý, `email_outbox` lỗi (FAILED), suất chiếu sắp bắt đầu trong 30 phút.
  - Cần sửa lỗi quan hệ PostgREST `showtimes` (Defect 2).
- **Zod Schema & DTOs**: **ĐẠT**
  - Phân tách rõ ràng query, input, và output DTOs.
  - `resolveManualReviewSchema` validate chặt chẽ `refundReference` và `refundedAmount` khi `action === "REFUND_MANUAL"`.
- **Chất lượng code & AI-Slop**: **ĐẠT**
  - Không có dead code, không lạm dụng `any`, xử lý kiểu dữ liệu TypeScript tường minh.

---

## 4. Kết luận & Hướng xử lý

- **Verdict**: **FAIL**
- **Yêu cầu Builder khắc phục trước khi Review Round 2**:
  1. **Sửa Defect 1**: Trong `apps/api/src/modules/orders/orders.service.ts` (dòng 536 và 572), đổi `action: "RESOLVE_MANUAL_REVIEW_CONFIRM_SALE"` và `action: "RESOLVE_MANUAL_REVIEW_REFUND_MANUAL"` thành `action: "UPDATE"` để tuân thủ check constraint của bảng `audit_logs`.
  2. **Sửa Defect 2**: Trong `apps/api/src/modules/orders/orders.service.ts` (dòng 651-655), sửa truy vấn `showtimes` trong `getAdminTodo` để không dùng resource embedding `cinemas(name)` không tồn tại trên foreign key schema thật.
  3. **Cập nhật Test**: Bổ sung kiểm tra constraint của `audit_logs` trong `FakeDb` của `apps/api/test/orders-report.e2e-spec.ts` để ngăn chặn regression.
