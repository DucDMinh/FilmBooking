# Task 05: Playwright e2e: đặt vé → thanh toán (mock) → vé; soát vé; realtime 2 phiên web; rạp mới bán được

> **Scope change: bỏ POS (CR remove-pos, spec 2.0.0, 2026-11-12).** Bỏ AC-20/R-121 (POS giả lập ↔ web) và phụ thuộc layer-7-task-09 (REMOVED); spec `pos-realtime` thay bằng realtime 2 phiên web.

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-38, R-60
- AC-xx: AC-08, AC-19

## Description
E2E trên web + api + Supabase local (seed): khách đăng ký→xác nhận (Inbucket/Mailpit local)→chọn ghế→xác nhận (AC-08)→thanh toán (PayOS mock webhook)→vé; Staff soát vé; 2 browser context web: khách A giữ F7 → khách B thấy "Đang được giữ" ≤ 2s (R-60, NFR-03); Admin tạo rạp/phòng/sơ đồ/suất → khách đặt được (AC-19).

## Dependencies
- layer-7-task-01 (Web admin phim & rạp (danh sách + form, trạng thái rạp, cấu hình rạp))
- layer-6-task-05 (Web thanh toán + kết quả (đang xác nhận/thất bại/thành công) + Vé của )
- layer-6-task-06 (Web Staff: chọn rạp làm việc + soát vé QR/nhập mã + kết quả màu)

## Acceptance Criteria
- [ ] 4 spec PASS headless trên Chromium + mobile viewport 360px.
- [ ] R-60/NFR-03: đo thời gian cập nhật realtime giữa 2 phiên web ≤ 2s.
- [ ] Script `pnpm e2e` (root) — thêm vào CI job tuỳ chọn (manual/nightly).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `playwright.config.ts`
- `e2e/booking.spec.ts`
- `e2e/checkin.spec.ts`
- `e2e/seat-realtime.spec.ts`
- `e2e/admin-new-cinema.spec.ts`

## Notes
playwright.config.ts chỉ task này tạo. Root script `pnpm e2e` đã khai ở layer-0-task-01; không sửa package.json.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
