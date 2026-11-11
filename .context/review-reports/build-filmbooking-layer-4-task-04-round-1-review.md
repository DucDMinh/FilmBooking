# Review Report: build-filmbooking-layer-4-task-04 (Round 1)

> **Agent:** reviewer  
> **Review Level:** STRICT  
> **Verdict:** STRICT PASS  
> **Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-04`  
> **Task File:** `tasks/build-filmbooking/layer-4-task-04.md`  
> **Reviewed Artifacts:**  
> - `supabase/migrations/20261111040300_rpc_cancel.sql`  
> - `supabase/tests/043_cancel.test.sql`  
> - Cross-check: `20261111040400_rpc_checkin_reports.sql` (Task 05), `20261111040000_rpc_hold.sql` (Task 01), `20261111040100_rpc_payment.sql` (Task 02), `20261111030100_booking_tables.sql` (Layer 3), `20261111020100_security_ops.sql` (Layer 2), `20261111010000_core_identity_chain.sql` (Layer 1).

---

## 1. Executive Summary

Bản implement của Task 04 (Layer 4) xây dựng 3 RPC cốt lõi phục vụ luồng bất khả kháng huỷ suất chiếu hàng loạt và đóng cửa rạp:
1. `preview_cancel_showtimes(p_showtime_ids uuid[])`: Xem trước tác động huỷ suất (số đơn paid WEB/POS, holding, số ghế sold/held, tổng tiền hoàn trả).
2. `cancel_showtimes(p_showtime_ids uuid[], p_reason text, p_actor_id uuid)`: Huỷ suất nguyên tử, nhả ghế HELD, chuyển đơn holding/pending_payment sang `cancelled`, đơn paid (WEB + POS) sang `affected`, ghi nhận `affected_order_cases`, enqueue email vào `email_outbox` cho đơn có email (bỏ qua đơn POS không email, gắn cờ `counter_contact = true`), vô hiệu hoá vé.
3. `set_cinema_status(p_cinema_id uuid, p_status cinema_status)`: Chặn chuyển rạp sang `TEMP_CLOSED` hoặc `CLOSED` nếu còn suất chiếu tương lai đã bán vé chưa huỷ (AC-26); chỉ cho phép sau khi toàn bộ suất đã bán được huỷ qua `cancel_showtimes`.

Toàn bộ 32 test cases pgTAP chuyên sâu trong `supabase/tests/043_cancel.test.sql` và 333 test cases hồi quy từ Layer 0–3 đều **PASS 100%** trên Postgres thật.

---

## 2. Adversarial Audit & Cross-Boundary Checks

### 2.1. Đối chiếu chéo Schema thật và Tương thích tuần tự Layer 4
- **Mở rộng Schema (`showtimes`, `orders`, `affected_order_cases`)**:
  - `showtimes`: Thêm các cột `cancel_reason text`, `cancelled_at timestamptz`, `cancelled_by uuid references auth.users(id) on delete set null`. Khớp với trigger `showtimes_audit` (Layer 2).
  - `orders`: Thêm các cột `cancel_reason text`, `cancelled_at timestamptz`, `counter_contact boolean not null default false`. Khớp với trigger `orders_audit` (Layer 3).
  - `affected_order_cases`: Bảng mới lưu trữ các case đơn bị ảnh hưởng cần xử lý thủ công tại quầy hoặc hoàn tiền (R-108, R-109, R-110, AC-24). Có khoá ngoại `on delete cascade` với `orders`, `showtimes`, `cinemas`, ràng buộc `unique (order_id)`, và index chuyên dụng cho tra cứu theo rạp/suất chiếu.
- **Tương thích chéo với Task 05 (`20261111040400_rpc_checkin_reports.sql`)**:
  - View `public.v_report_cancelled_showtimes` đọc trực tiếp từ `showtimes` (`status = 'CANCELLED'`) và đếm `orders` có `status in ('affected', 'exchanged', 'refunded_manual')`. Khi áp dụng tuần tự `040300` -> `040400`, view hoạt động trơn tru, không lệch bất kỳ tên cột hay kiểu dữ liệu nào.
  - RPC `checkin_ticket` (Task 05) kiểm tra:
    ```sql
    if v_ticket.showtime_status = 'CANCELLED'
       or v_ticket.order_status in ('affected', 'cancelled', 'refunded_manual', 'exchanged') then
       ...
       return jsonb_build_object('status', 'CANCELLED', 'result', 'AFFECTED', ...);
    ```
    Khớp 100% với logic chuyển đơn sang `affected` và suất sang `CANCELLED` của `cancel_showtimes`. Vé của các đơn bị ảnh hưởng bị từ chối check-in tại quầy ngay lập tức.
- **Tương thích chéo với Task 01 (`20261111040000_rpc_hold.sql`)**:
  - RPC `hold_seats` kiểm tra `v_st.status = 'CANCELLED'` và ném `SHOWTIME_CANCELLED` (errcode `23514`). Test pgTAP trong `043_cancel.test.sql` đã kiểm chứng việc gọi `hold_seats` trên suất đã huỷ bị chặn chính xác với mã lỗi này.

### 2.2. Kiểm tra Acceptance Criteria AC-24 (Huỷ suất chiếu & Email hàng loạt)
- **Đơn WEB có email vs Đơn POS không email**:
  - Với 10 đơn WEB `paid`: Chuyển sang `status = 'affected'`, `counter_contact = false`. Đúng 10 email với template `showtime_cancelled` được enqueue vào `public.email_outbox` ở trạng thái `PENDING`.
  - Với 1 đơn POS `paid` (không có email): Chuyển sang `status = 'affected'`, `counter_contact = true`. Không sinh bản ghi rỗng trong `public.email_outbox`.
  - Cả 11 đơn được lưu vào `affected_order_cases` với lý do và cờ `counter_contact` tương ứng.
- **Giải phóng ghế và đơn dở dang**:
  - Mọi ghế `HELD` trên suất chiếu bị huỷ đều bị xoá khỏi `showtime_seat_states`.
  - Mọi đơn hàng dở dang ở trạng thái `holding` hoặc `pending_payment` đều chuyển sang `cancelled`.

### 2.3. Kiểm tra Acceptance Criteria AC-26 (`set_cinema_status`)
- **Chặn đóng rạp khi còn suất tương lai đã bán vé**:
  - Khi rạp còn 3 suất tương lai đã có ghế `SOLD` hoặc đơn `paid`/`checked_in`: Gọi `set_cinema_status(p_cinema_id, 'TEMP_CLOSED')` hoặc `'CLOSED'` bị chặn ngay lập tức với exception `CINEMA_HAS_ACTIVE_SOLD_SHOWTIMES` (errcode `23514`), trả về mảng danh sách ID của cả 3 suất chiếu trong `detail`.
- **Mở khoá sau khi huỷ suất**:
  - Sau khi gọi `cancel_showtimes` huỷ thành công cả 3 suất tương lai, gọi lại `set_cinema_status` sang `'TEMP_CLOSED'` thành công và cập nhật `cinemas.status = 'TEMP_CLOSED'`.

### 2.4. Phân quyền chặt chẽ (RBAC & Multi-Cinema Scope)
- **Kiểm tra quyền gọi RPC**:
  - Staff: Bị từ chối khi gọi `preview_cancel_showtimes`, `cancel_showtimes`, `set_cinema_status` (`FORBIDDEN_CINEMA_SCOPE` - errcode `42501`).
  - Manager rạp khác: Bị từ chối khi gọi trên suất/rạp không được phân công (`FORBIDDEN_CINEMA_SCOPE` - errcode `42501`).
  - Manager truyền mảng ID suất chiếu thuộc nhiều rạp mà chỉ quản lý 1 phần: Bị chặn ngay từ bước kiểm tra (`not public.has_cinema_role(st.cinema_id, array['MANAGER'])`).
  - Admin toàn chuỗi: Thực thi thành công toàn bộ chức năng.
- **RLS trên `affected_order_cases`**:
  - Chỉ cấp quyền `SELECT` cho authenticated (bảo vệ append-only, chống sửa đổi trực tiếp từ client).
  - Admin xem toàn bộ, Manager/Staff chỉ xem rạp mình, Khách hàng chỉ xem bản ghi của chính mình (`user_id = auth.uid()`).

### 2.5. Audit Logs
- Hệ thống audit log kích hoạt tự động qua các trigger sẵn có từ Layer 1–3:
  - Trigger `cinemas_audit` ghi nhận thao tác đổi trạng thái rạp.
  - Trigger `showtimes_audit` ghi nhận thao tác chuyển suất sang `CANCELLED`.
  - Trigger `orders_audit` ghi nhận thao tác chuyển đơn sang `cancelled` hoặc `affected`.

---

## 3. Automated Verification Results

| Verify Command | Scope | Result | Details |
|---|---|:---:|---|
| `pnpm db:test` | Postgres pgTAP | **PASS** | 9 test files, 365 tests pass (file `043_cancel.test.sql` pass 32/32 tests) |
| `pnpm lint` | Monorepo ESLint | **PASS** | 0 errors, 0 warnings (packages/shared, apps/api, apps/web) |
| `pnpm typecheck` | Monorepo TypeScript | **PASS** | `tsc` compile sạch toàn bộ packages và apps |
| `pnpm test` | Vitest Unit/Integration | **PASS** | 157 api tests + 54 web tests + 14 shared tests = 225 tests pass |
| `pnpm build` | Production Build | **PASS** | Next.js SSG + NestJS dist build thành công |

---

## 4. Residual Risks & Notes for Next Tasks

1. **Voucher Hoàn Lượt khi Huỷ Suất Hàng Loạt**:
   - Khi Layer 4 tích hợp `voucher_redemptions` (từ Task 02), các đơn `holding`/`pending_payment` bị huỷ bởi `cancel_showtimes` có thể có voucher đang ở trạng thái `HELD`. Job hết hạn định kỳ hoặc trigger sau khi merge sẽ dọn dẹp các voucher redemption này sang `RELEASED`.
2. **Khách hàng vãng lai tại POS**:
   - Các đơn POS được đánh dấu `counter_contact = true` và không có email để gửi tự động. Quy trình xử lý tại quầy (hoàn tiền thủ công `refunded_manual` hoặc đổi suất `exchanged`) đã có đầy đủ schema và view ở Task 05 để nhân viên phục vụ khách khi họ quay lại quầy.

---

## 5. Verdict

**`STRICT PASS`** — Migration `20261111040300_rpc_cancel.sql` và bộ test pgTAP `043_cancel.test.sql` đạt chất lượng rất cao, tuân thủ chặt chẽ SPECIFICATIONS.md (R-33, R-108, R-109, R-110, R-127, R-134, AC-24, AC-26), xử lý edge case hoàn hảo và tương thích tuyệt đối với các RPC/View của Layer 4. Worktree sẵn sàng cho close-out commit.
