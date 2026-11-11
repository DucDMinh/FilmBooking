# Task 03: RPC voucher lõi: áp/giữ lượt, hoàn lượt khi hết hạn/huỷ, mã lỗi

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-90, R-92, R-93, R-94, R-95
- AC-xx: —

## Description
`apply_voucher(order_id, code)`: tối đa 1 voucher/đơn, kiểm hạn/min đơn/tổng lượt/lượt mỗi khách, giữ lượt bằng voucher_redemptions (khoá hàng chống race), tính lại tổng. `remove_voucher`. Trigger trên orders: đổi sang expired/cancelled → hoàn lượt; paid → lượt thành 'used'. Rate limit nhập mã qua hit_rate_limit (5 lần/10' mỗi user). Voucher toàn chuỗi (phạm vi rạp là GĐ2).

## Dependencies
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)

## Acceptance Criteria
- [ ] Hai đơn đồng thời dùng voucher còn 1 lượt → chỉ 1 thành công (pgTAP với khoá).
- [ ] Đơn expired → lượt được hoàn (count giảm).
- [ ] Áp voucher thứ 2 cho cùng đơn → VOUCHER_ALREADY_APPLIED; hết hạn → VOUCHER_EXPIRED; chưa đạt tối thiểu → VOUCHER_MIN_NOT_MET.
- [ ] Nhập sai > ngưỡng → RATE_LIMITED.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111040200_rpc_voucher.sql`
- `supabase/tests/042_voucher.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
