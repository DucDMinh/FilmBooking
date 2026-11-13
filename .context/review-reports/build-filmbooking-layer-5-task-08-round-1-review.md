# Báo cáo Review Độc lập: layer-5-task-08 (Round 1)

> **Agent: reviewer**
> **Task:** `tasks/build-filmbooking/layer-5-task-08.md` — API huỷ suất / đóng rạp / đơn bị ảnh hưởng (+ CSV, gửi lại email)
> **Worktree:** `E:\FilmBooking\.worktrees\layer-5__task-08`
> **Review Level:** `STRICT` (Bất biến #3 — RPCs huỷ suất hàng loạt, bảo mật rạp, chuyển trạng thái đơn hàng và tài chính hoàn tiền)
> **Verdict:** `STRICT PASS`

---

## 1. Tổng quan kiểm tra (Review Scope)

Các file được kiểm tra trong worktree `E:\FilmBooking\.worktrees\layer-5__task-08`:
1. `apps/api/src/modules/cancellation/cancellation.module.ts`
2. `apps/api/src/modules/cancellation/cancellation.controller.ts`
3. `apps/api/src/modules/cancellation/cancellation.service.ts`
4. `apps/api/src/modules/cancellation/affected-csv.ts`
5. `packages/shared/src/schemas/cancellation.ts`
6. `apps/api/test/cancellation.e2e-spec.ts`

Đối chiếu chéo (Cross-Boundary Check) với các file database migration:
- `supabase/migrations/20261111030100_booking_tables.sql` (bảng `affected_order_actions`, triggers `affected_order_actions_validate`, `affected_order_actions_apply`, `fill_cinema_from_order`, RLS)
- `supabase/migrations/20261111040300_rpc_cancel.sql` (bảng `affected_order_cases`, RPCs `preview_cancel_showtimes`, `cancel_showtimes`, `set_cinema_status`)
- `supabase/migrations/20261112150000_cancel_showtimes_hardening.sql` (hardening `cancel_showtimes`, kiểm tra actor spoofing, idempotency email, thứ tự khoá toàn cục, trigger `orders_guard_transition`)
- `supabase/migrations/20261111020100_security_ops.sql` (bảng `email_outbox`, quyền RLS)
- `supabase/migrations/20261111040400_rpc_checkin_reports.sql` & `20261112160000_rbac_cinema_reports_hardening.sql` (view và RPC báo cáo suất bị huỷ `report_cancelled_showtimes`)

---

## 2. Kết quả kiểm tra tiêu chí nghiệm thu (Acceptance Criteria Coverage)

| Tiêu chí | Yêu cầu | Đánh giá | Trạng thái |
|---|---|---|:---:|
| **AC-24** | Huỷ suất 10 đơn `paid` -> 10 `affected`, 10 email; GET danh sách hiển thị đúng trạng thái. | - Gọi RPC `cancel_showtimes` chuyển các đơn `paid` và `checked_in` sang `affected`, ghi nhận `affected_order_cases` và enqueue vào `email_outbox`.<br>- API `GET /admin/affected-orders` và `GET /cinemas/:cinemaId/affected-orders` hiển thị danh sách đơn kèm trạng thái `status: affected` và `emailStatus: PENDING/SENT/FAILED`.<br>- Kiểm tra lý do huỷ bắt buộc (`reason.trim().min(1)`), thiếu -> 400 `VALIDATION_ERROR`. | **PASS** |
| **AC-25** | Hoàn tiền thủ công thiếu số tiền hoặc mã GD -> 422; đủ -> `refunded_manual` và xuất hiện trong báo cáo suất bị huỷ. Staff rạp mình được ghi (#6), Staff rạp khác -> 403. | - `Unprocessable422Pipe` kết hợp với validation trong `CancellationService.recordRefund` bắt buộc `refundedAmount >= 0` và `refundReference.trim().min(1)`, thiếu -> HTTP 422 `UNPROCESSABLE_ENTITY`.<br>- Kiểm tra phân quyền rạp nghiêm ngặt: Staff HN02 ghi nhận cho HN01 -> 403 `FORBIDDEN_CINEMA`; Staff HN01 ghi nhận -> 201 OK.<br>- Đơn chuyển sang `refunded_manual` và ghi bản ghi vào `affected_order_actions` (khớp trigger `affected_order_actions_apply` và các filter trong view báo cáo `report_cancelled_showtimes`).<br>- Chặn hoàn tiền 2 lần trên cùng một đơn (trả về 409 `CONFLICT`). | **PASS** |
| **AC-26** | Đóng rạp còn suất đã bán -> 409 kèm danh sách suất cần huỷ. | - Endpoint `PATCH/POST /admin/cinemas/:cinemaId/status` gọi RPC `set_cinema_status`.<br>- Khi chuyển sang `TEMP_CLOSED` hoặc `CLOSED`, nếu rạp còn suất tương lai đã bán vé (`starts_at > now()`, `status <> 'CANCELLED'`), RPC ném lỗi 23514 `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES`. Service trích xuất `showtimeIds` từ details/message và trả HTTP 409 `CONFLICT` kèm `{ showtimeIds: [...] }`.<br>- Chỉ `ADMIN` được thực hiện đổi trạng thái rạp (`@Roles("ADMIN")`), Manager/Staff bị chặn 403 `FORBIDDEN`. | **PASS** |
| **CSV Export** | UTF-8 BOM, cột tiếng Việt, chỉ dữ liệu rạp được gán. | - File CSV bắt đầu bằng UTF-8 BOM `\uFEFF` (hỗ trợ Excel mở không lỗi font).<br>- Tiêu đề 18 cột tiếng Việt chuẩn (`Mã đặt vé`, `Tên rạp`, `Tên phim`, `Suất chiếu`, `Tổng tiền (VNĐ)`, `Số tiền hoàn (VNĐ)`, `Mã GD ngân hàng`...).<br>- Lọc rạp chặt chẽ qua `resolvePermittedCinemas`: Staff chỉ xuất được dữ liệu của rạp mình phụ trách; Admin có thể xuất toàn hệ thống hoặc theo rạp cụ thể. | **PASS** |
| **Scope Changes** | Tuân thủ CR remove-pos (spec 2.0.0) và CR remove-showtime-exchange (spec 3.0.0). | - Bỏ hoàn toàn logic POS riêng.<br>- Bỏ hoàn toàn đổi suất: `AFFECTED_ORDER_STATUSES = ["affected", "refunded_manual"]`, không có route hay DTO nhận `exchanged`. | **PASS** |

---

## 3. Đối chiếu chéo Database Schema & Audit bộ Mock Test (Cross-Boundary Check)

1. **Khớp nối bảng và trigger:**
   - Bảng `affected_order_actions`: Cột `order_id`, `cinema_id`, `action`, `refund_reference`, `refunded_amount`, `note`, `performed_by` khớp 100% với migration `20261111030100_booking_tables.sql`.
   - Trigger `affected_order_actions_apply` chuyển trạng thái đơn sang `refunded_manual`. Việc service cập nhật `orders.status = 'refunded_manual'` diễn ra an toàn, không vi phạm trigger `orders_guard_transition` vì `old.status` đã hoặc đang chuyển thành `refunded_manual`.
   - Bảng `email_outbox`: Khớp các trường `kind`, `to_email`, `payload`, `cinema_id`, `status: 'PENDING'`.

2. **Audit bộ Mock Test (`FakeDb` trong `cancellation.e2e-spec.ts`):**
   - Mock RPC `preview_cancel_showtimes`: Tính toán `showtimes_count`, `paid_orders_count`, `total_refund_amount` khớp với migration `20261112150000_cancel_showtimes_hardening.sql`.
   - Mock RPC `cancel_showtimes`: Cập nhật `showtimes.status = 'CANCELLED'`, `orders.status = 'affected'`, thêm vào `affected_order_cases` và enqueue `email_outbox`. Trả về payload jsonb khớp hoàn toàn cấu trúc DB thật.
   - Mock RPC `set_cinema_status`: Bắt đúng mã lỗi `23514` và chi tiết `details: JSON.stringify(soldShowtimes)` như Postgres trigger thật.
   - Bộ test gồm 19 tests phủ kín AC-24, AC-25, AC-26, resend email, export CSV, phân quyền rạp, và các edge cases (mã GD rỗng, số tiền âm, hoàn tiền 2 lần).

---

## 4. Bảo mật, Hiệu năng & Chất lượng mã nguồn

- **Bảo mật (Security):**
  - Đảm bảo triệt để BOLA/IDOR: Mọi thao tác theo `orderId` (`recordRefund`, `getAffectedOrderDetail`, `resendEmail`) đều đọc `orders.cinema_id` từ cơ sở dữ liệu và xác thực đối chiếu với quyền rạp của user (`access.cinemaRoles`).
  - Phân quyền theo vai trò: `previewCancel` và `cancelShowtimes` yêu cầu `@Roles("MANAGER")` và `@CinemaScope()`; `setCinemaStatus` yêu cầu `@Roles("ADMIN")`; `recordRefund`, `resendEmail`, `listAffectedOrders`, `exportCsv` yêu cầu `@Roles("STAFF")` kèm kiểm tra rạp phụ trách.
  - Fail-closed: `CinemaScopeGuard` và `resolvePermittedCinemas` từ chối ngay khi không xác định được quyền rạp hợp lệ.
- **Surgical Diff:**
  - Đúng 6 file trong danh sách `Files to Create/Modify` của task. Không có file dư thừa, không can thiệp ngoài phạm vi.
- **Lưu ý tối ưu hoá (Non-blocking Architectural Note):**
  - Trong `enrichAffectedOrders` và `getAffectedOrderDetail`, việc tra cứu `email_outbox` qua `.eq("kind", "showtime_cancelled")` sau đó tìm `payload.order_id` trong bộ nhớ hoạt động tốt ở quy mô hiện tại. Khi dữ liệu sản xuất lớn, nên bổ sung filter theo `cinema_id` hoặc sử dụng toán tử JSONB PostgREST `.contains("payload", { order_id })` để tối ưu tải DB.

---

## 5. Kết quả chạy Verify Commands

Đã thực thi trực tiếp trong worktree `E:\FilmBooking\.worktrees\layer-5__task-08`:
1. `pnpm -w typecheck` -> **PASS** (apps/web, apps/api, packages/shared sạch lỗi TypeScript).
2. `pnpm -w lint` -> **PASS** (apps/web, apps/api, packages/shared sạch lỗi ESLint).
3. `pnpm --filter @filmbooking/api test` -> **PASS** (16 test files passed, 249 tests passed; trong đó 19/19 tests của `cancellation.e2e-spec.ts` pass).
4. `pnpm -w build` -> **PASS** (Build api dist và Next.js production build thành công).

---

## 6. Kết luận

Task **layer-5-task-08** đáp ứng đầy đủ và nghiêm ngặt mọi tiêu chí của AC-24, AC-25, AC-26, quy cách CSV UTF-8 BOM tiếng Việt, phân quyền rạp (#6), tuân thủ scope change (bỏ POS, bỏ đổi suất).

**Verdict:** `STRICT PASS`
