# Spec Update — 2026-11-20 refund-method-required
**spec_version:** 3.5.2 → 3.5.2 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · CR-005 · `tasks/bug-refund-method-required/phase-1-task-01.md` (review PASS round 2) · workItem `bug/refund-method-required`

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Không đổi requirement; đưa code về đúng **R-110** / **BR-ADM-14** (ghi nhận "Đã hoàn tiền thủ công" bắt buộc số tiền, ngày, phương thức, mã giao dịch ngân hàng, người thực hiện), đóng **GAP-009** (`docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`). Liên quan **AC-25** (thiếu trường bắt buộc → chặn lưu).

## Lỗi đã sửa
1. `POST /admin/affected-orders/:orderId/refund` trước đây không đòi phương thức hoàn tiền và ngày hoàn. Nay body bắt buộc `refundMethod` (`BANK_TRANSFER` / `E_WALLET` / `CASH` / `OTHER`) và `refundedAt` (ngày `YYYY-MM-DD`, không ở tương lai theo giờ Việt Nam). Thiếu hoặc sai → 422 `VALIDATION_ERROR`.
2. DB: migration `supabase/migrations/20261120100000_refund_method_required.sql` thêm cột `refund_method`, `refunded_at` và CHECK `NOT VALID` cho trạng thái `REFUNDED_MANUAL` (không backfill dòng cũ; không phải HIGH_RISK_MIGRATION, không phá huỷ dữ liệu).
3. DTO `AffectedOrderDto` thêm `refundMethod`, `refundedAt` (nay là NGÀY NGƯỜI NHẬP; trước đây là `created_at`) và `processedAt` (= `created_at`, thời điểm hệ thống ghi nhận).
4. CSV đơn bị ảnh hưởng thêm 2 cột "Phương thức hoàn", "Ngày hoàn"; cột "Thời gian xử lý" nay lấy `processedAt`.
5. Web: form ghi hoàn tiền thêm 2 trường; chi tiết đơn bị ảnh hưởng, danh sách và chi tiết đơn (`order-detail`) hiển thị phương thức + ngày hoàn. Dòng cũ chưa có dữ liệu hiển thị "Chưa ghi".

## Ảnh hưởng
- Module: api-cancellation, api-orders, shared-schemas, supabase (cột `orders`/bảng hoàn tiền), web admin (đơn bị ảnh hưởng, chi tiết đơn). Docs as-built: `docs/API_SPEC.md`, `docs/ERD.md`, `packages/shared/src/database.types.ts`.
- Test: ghi hoàn tiền thiếu phương thức / ngày / ngày tương lai → 422; hợp lệ → lưu và hiển thị ở chi tiết đơn + danh sách; CSV có 2 cột mới; phân quyền Staff / Manager rạp mình / Admin giữ nguyên; pgTAP 070 (mới), 031, 044 cập nhật theo cột mới.
- Hồi quy: huỷ suất → đơn `affected` → email; danh sách + lọc + CSV; xử lý manual review.
- Residual: pgTAP 031/044 chưa xác nhận trên DB sạch (DB local bẩn vì seed demo, có từ trước); dòng `REFUNDED_MANUAL` cũ không có phương thức/ngày (CHECK `NOT VALID`, không backfill).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 31, specVersion 3.5.2.
