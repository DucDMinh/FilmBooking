# Task 09: Wiring API #3: đăng ký identity + pricing, sinh lại types

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Import IdentityModule, PricingModule; `pnpm db:types` sau migration layer 4 (RPC signatures).

## Dependencies
- layer-4-task-01 (RPC giữ/nhả/gia hạn ghế nguyên tử (web + POS) + dọn hold hết hạn)
- layer-4-task-02 (RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết h)
- layer-4-task-03 (RPC voucher lõi: áp/giữ lượt, hoàn lượt khi hết hạn/huỷ, mã lỗi)
- layer-4-task-04 (RPC huỷ suất hàng loạt + chặn đóng rạp còn suất đã bán)
- layer-4-task-05 (RPC check-in vé + view báo cáo MVP (doanh thu, theo phim/suất/rạp, đối)
- layer-4-task-06 (Identity/social: trigger email liên kết + API liên kết/huỷ liên kết, F)
- layer-4-task-07 (Wiring API #2: đăng ký catalog, cinema-ops, auth-ext, profile + sinh l)
- layer-4-task-08 (API bảng giá & ngày lễ (quản trị) + báo giá)

## Acceptance Criteria
- [ ] App khởi động; `GET /me/identities` 401 khi không token; `GET /showtimes/:id/prices` 200.
- [ ] `pnpm -w typecheck` PASS với types mới.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/app.module.ts`
- `packages/shared/src/database.types.ts`

## Notes
Task wiring.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
