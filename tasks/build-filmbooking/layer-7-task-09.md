# Task 09: Web POS giả lập `/pos` (Staff) — giữ/nhả/gia hạn/xác nhận bán qua API POS

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-121, R-122, R-124, R-125, R-128, R-129
- AC-xx: AC-20, AC-21, AC-22

## Description
Màn 29: Staff chọn suất của rạp làm việc, sơ đồ ghế (dùng lại SeatMap) cập nhật realtime, giữ ghế (5'), gia hạn, xác nhận bán (tiền mặt giả lập), nhả; gọi `/pos-sim/*` — khoá API không bao giờ ở client; mất mạng → báo lỗi, không bán offline.

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-5-task-05 (API POS `/pos/v1/*` (khoá API theo rạp, idempotent, log + rate limit) )
- layer-6-task-03 (Web chọn ghế `/dat-ve/[showtimeId]`: SeatMap a11y + realtime + giữ ghế)

## Acceptance Criteria
- [ ] AC-20: POS giữ F7 → tab web cùng suất thấy F7 'Đang được giữ' ≤ 2s (kiểm ở e2e layer 8).
- [ ] AC-21 (UI): POS chọn ghế web đang giữ → thông báo không khả dụng.
- [ ] Không có biến chứa khoá API trong bundle client (grep build output).
- [ ] Offline → nút bán disabled + thông báo (R-128).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/pos/layout.tsx`
- `apps/web/src/app/pos/page.tsx`
- `apps/web/src/components/pos/pos-seat-board.tsx`
- `apps/web/src/components/pos/pos-cart.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
