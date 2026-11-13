# Review Report: Layer 5 Task 04 — API soát vé: quét QR/nhập mã theo rạp làm việc

- **Task**: `layer-5-task-04` (API soát vé: quét QR/nhập mã theo rạp làm việc)
- **Review Round**: 1
- **Review Level**: `STRICT` (liên quan Auth/RBAC, CinemaScopeGuard, PII leak protection, gọi RPC DB update vé)
- **Worktree**: `E:\FilmBooking\.worktrees\layer-5__task-04`
- **Reviewer**: Adversarial Reviewer (`Model: pro`)

---

## 1. Kết quả thẩm định (Verdict)

**STRICT PASS**

Mọi tiêu chí nghiệm thu (AC-12, AC-13, R-97..R-102, R-132) và Definition of Done (DoD) đều được đáp ứng đầy đủ và chuẩn xác. Không phát hiện bất kỳ defect hay lỗ hổng rò rỉ dữ liệu nào.

---

## 2. Chi tiết đối chiếu Cross-Boundary (Backend ↔ Database Migration)

### 2.1. RPC Database & Phân quyền (`20261111040400_rpc_checkin_reports.sql`)
- **Tên RPC**: `public.checkin_ticket(p_token_or_code text, p_cinema_id uuid, p_staff_id uuid default auth.uid())`
- **Tầng DB**:
  - `has_cinema_scope(p_cinema_id)` kiểm tra quyền caller tại rạp quét (Staff/Manager/Admin). Nếu không đủ quyền raise exception `42501` (`FORBIDDEN_CINEMA_SCOPE`).
  - Chống giả mạo `p_staff_id` (Non-Repudiation): Nếu `p_staff_id` khác `auth.uid()` khi caller không phải admin, raise exception `42501` (`FORBIDDEN_STAFF_SPOOFING`).
- **Tầng API (`CheckinService`)**:
  - Gọi RPC qua `this.supabase.forUser(user.jwt).rpc("checkin_ticket", { p_token_or_code, p_cinema_id, p_staff_id: user.id })`.
  - Bắt lỗi Postgres `42501` và ném `AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No access to this cinema")` trả HTTP 403.
  - Chuẩn bị body payload thông qua Zod schema `.strict()` chặn hoàn toàn việc client cố ý gửi field thừa (như `staffId`).

### 2.2. Kiểm tra Acceptance Criteria (AC-12, AC-13)
- **AC-12 (Vé đã sử dụng)**:
  - Khi vé đã được soát trước đó (`checked_in_at is not null`), RPC trả về `status: 'USED'`, `staff_name`.
  - Service ánh xạ thành `{ result: 'USED', color: 'yellow', message: ..., used: { checkedInAt, staffName } }`.
  - Đáp ứng chuẩn xác hiển thị màu vàng (warning) kèm thông tin nhân viên và thời gian đã soát lần đầu, không lộ PII khách hàng.
- **AC-13 (Vé sai rạp & Bảo vệ PII)**:
  - Khi rạp quét khác rạp của suất chiếu (`v_ticket.showtime_cinema_id <> p_cinema_id`), RPC trả về `status: 'WRONG_CINEMA'` cùng thông tin rạp đúng (`correct_cinema_id`, `correct_cinema_code`, `correct_cinema_name`, `correct_cinema_address`).
  - Service chuyển đổi qua hàm `toResponse()` theo danh sách trắng (whitelist mapping), chỉ trả về `{ result: 'WRONG_CINEMA', color: 'red', message: ..., correctCinema: { id, code, name, address } }`.
  - **TUYỆT ĐỐI KHÔNG** chứa bất kỳ thông tin nào về khách hàng (`customer_name`, `customer_email`, ghế `seat_label`, `booking_code`). Đã được chứng minh qua test e2e với payload cố tình chứa PII.
- **Các trạng thái khác**:
  - `OK` (xanh - `green`): trả thông tin vé, ghế, phòng, phim.
  - `CANCELLED` (đỏ - `red`): suất hoặc đơn bị huỷ / ảnh hưởng.
  - `EXPIRED` (đỏ - `red`): quá thời lượng phim kết thúc suất.
  - `TOO_EARLY` (vàng - `yellow`): quét trước giờ chiếu > 30 phút.
  - `NOT_FOUND` / `NOT_PAID` (đỏ - `red`): vé không tồn tại hoặc đơn chưa thanh toán.

### 2.3. Kiểm tra Guards & Phân quyền
- Controller gắn:
  - `@Roles("STAFF")`: RolesGuard chặn người dùng phổ thông (CUSTOMER), cho phép STAFF, MANAGER, ADMIN.
  - `@CinemaScope()`: CinemaScopeGuard lấy `cinemaId` từ request body, đối chiếu với danh sách rạp được gán của user; ném HTTP 403 `FORBIDDEN_CINEMA` nếu nhân viên quét ở rạp không thuộc quyền quản lý; Admin được cấp quyền trên toàn hệ thống.
  - Fail-closed: Request không có `cinemaId` hợp lệ bị từ chối ngay lập tức.

---

## 3. Kết quả Verification Commands trong worktree

- `pnpm -w typecheck`: **PASS** (Scope: 3 of 4 projects, không có lỗi type)
- `pnpm -w lint`: **PASS** (packages/shared, apps/api, apps/web đều sạch lint)
- `pnpm --filter @filmbooking/api test`: **PASS** (16 test files, 245 tests passed, bao gồm 15/15 tests trong `checkin.e2e-spec.ts`)

---

## 4. Code Quality & AI-Slop Audit

- **Surgical diff**: Chỉ tạo/sửa đúng 5 file được phân công trong task:
  - `apps/api/src/modules/checkin/checkin.module.ts` (12 dòng)
  - `apps/api/src/modules/checkin/checkin.controller.ts` (23 dòng)
  - `apps/api/src/modules/checkin/checkin.service.ts` (106 dòng)
  - `packages/shared/src/schemas/checkin.ts` (62 dòng)
  - `apps/api/test/checkin.e2e-spec.ts` (252 dòng)
- **Kích thước file / hàm**: Tất cả các file ≤ 300 dòng, các hàm ≤ 50 dòng.
- **AI-Slop & Anti-Slop**:
  - Không có swallowed error, không fallback ngầm.
  - Không dùng `any` type bừa bãi.
  - Tách bạch rõ ràng giữa model DB RPC payload và API response contract.
- **Oxlint / Aislop**:
  - `oxlint not configured` (chưa có oxlint config).
  - `aislop`: code tuân thủ đầy đủ tiêu chuẩn clean code.

---

## 5. Kết luận

Task `layer-5-task-04` đủ điều kiện đóng và chuyển sang bước tiếp theo.
Verdict: **STRICT PASS**.
