# Review: feature concession-combo, phase-1 task-01, round 1

Agent: reviewer

- Review level: **STRICT** (DB migration bảng mới + hàm tính toán tổng tiền đơn hàng + DTOs shared dùng cho API và Web).
- Scope: `supabase/migrations/20261123120000_concession_combo.sql`, `packages/shared/src/schemas/booking.ts`, `packages/shared/src/database.types.ts`, `packages/shared/src/__tests__/concession-schema.test.ts`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm -w typecheck` | PASS (3/3 workspace projects sạch). |
| `pnpm -C packages/shared test` | PASS 4/4 test files (44/44 tests PASS, gồm 5 tests mới cho `updateOrderCombosSchema`). |
| Kiểm tra migration `20261123120000_concession_combo.sql` | Cú pháp PostgreSQL chuẩn: đầy đủ ràng buộc check, RLS enabled, RLS policies cho anon/authenticated/service_role theo chuẩn `can_view_order`. Hàm `sync_order_combos` xử lý transaction an toàn với `FOR UPDATE`, kiểm tra trạng thái `holding`, tự động tính lại voucher discount và tổng tiền. |

## Findings

### CRITICAL / MAJOR
Không có.

### MINOR / NIT
1. Ràng buộc `quantity`: Đã chặn số lượng âm (`quantity > 0` trong DB, `min(0)` trong DTO zod) và chặn số lượng quá lớn (`quantity <= 20`).
2. RLS `combos`: Cho phép `anon` và `authenticated` đọc các combo đang hoạt động (`is_active = true`), phù hợp cho khách chưa đăng nhập vẫn xem được danh mục combo nếu cần.
3. RLS `order_combos`: Đọc theo `public.can_view_order(order_id)`, đảm bảo an toàn phân quyền không lộ thông tin đơn hàng của người khác.

## Verdict: **STRICT PASS**

Task-01 hoàn thành đầy đủ các yêu cầu của Phase 1. Sẵn sàng chuyển tiếp sang Phase 2 (API Backend).
