---
id: refund-method-required
type: bug
status: done
created: 2026-11-14
---

# Ghi hoàn tiền thủ công thiếu "phương thức hoàn tiền" bắt buộc (R-110)

## Yêu cầu
`recordRefundSchema` (`packages/shared/src/schemas/cancellation.ts`) chỉ có `refundedAmount`, `refundReference`, `note`. Spec R-110 và design màn 24 yêu cầu thêm phương thức hoàn tiền (bắt buộc) và ngày hoàn.

## Bối cảnh / tái hiện (bug)
- Màn/route/role: `/admin/don-bi-anh-huong/[id]` (Staff/Manager/Admin) → `POST /admin/affected-orders/:id/refund`.
- Expected: form bắt buộc chọn phương thức (+ ngày hoàn), lưu vào `affected_order_actions`, hiển thị trong chi tiết + CSV.
- Actual: không có trường phương thức/ngày.

## Acceptance (bắt buộc)
- [x] Schema shared + API + DB (migration versioned nếu cần cột mới) có `refundMethod` bắt buộc và ngày hoàn.
- [x] Form web bắt buộc chọn phương thức; chi tiết đơn + CSV hiển thị.
- [x] Test API + web.

## Ghi chú
GAP-009 (R-110). Nguồn: layer-7 phase review. P1. Kiểm R-110 trong `SPECIFICATIONS.md` trước khi làm.
