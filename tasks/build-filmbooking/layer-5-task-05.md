# Task 05: API POS `/pos/v1/*` (khoá API theo rạp, idempotent, log + rate limit) + endpoint POS giả lập cho Staff

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-120, R-121, R-122, R-123, R-124, R-125, R-126, R-127, R-128, R-129, R-130
- AC-xx: AC-21, AC-22, AC-23

## Description
Guard Bearer key → so hash pos_api_keys (chưa revoke) → cinema_id cố định. Endpoint: suất của rạp, sơ đồ + trạng thái ghế, hold / release / extend / confirm-sale, tra cứu & soát vé — cùng RPC với channel POS. Idempotent theo `requestId` (lưu kết quả, lặp → trả kết quả cũ). Log mọi call vào pos_api_logs + rate limit theo khoá. Không có chế độ offline (R-128). POS giả lập (#7): `/pos-sim/*` cho Staff đăng nhập → service lấy khoá rạp phía server gọi cùng PosService (khoá không ra client).

## Dependencies
- layer-4-task-01 (RPC giữ/nhả/gia hạn ghế nguyên tử (web + POS) + dọn hold hết hạn)
- layer-4-task-02 (RPC thanh toán & bán: confirm_paid idempotent, tiền về muộn, huỷ/hết h)
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-23: khoá HN01 giữ ghế suất HN02 → 403 `WRONG_CINEMA`.
- [ ] AC-21: web đang giữ F8 → POS hold F8 → 409 `SEAT_TAKEN`.
- [ ] AC-22: POS hold → expires_at = +5'; không gia hạn → ghế trống khi đọc lại sau hạn.
- [ ] Cùng requestId gửi 2 lần → 1 tác động, cùng response (R-126); vượt rate limit → 429; mọi call có log.
- [ ] Suất CANCELLED/đóng bán bởi Manager → POS bị từ chối (R-127); mốc đóng bán online không chặn POS.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/pos/pos.module.ts`
- `apps/api/src/modules/pos/pos-api-key.guard.ts`
- `apps/api/src/modules/pos/pos.controller.ts`
- `apps/api/src/modules/pos/pos.service.ts`
- `apps/api/src/modules/pos/pos-sim.controller.ts`
- `packages/shared/src/schemas/pos.ts`
- `apps/api/test/pos.e2e-spec.ts`

## Notes
Reviewer STRICT (khoá API, cô lập rạp).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
