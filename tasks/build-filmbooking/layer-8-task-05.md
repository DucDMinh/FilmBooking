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
- [x] 4 spec PASS headless trên Chromium + mobile viewport 360px.
- [x] R-60/NFR-03: đo thời gian cập nhật realtime giữa 2 phiên web ≤ 2s.
- [x] Script `pnpm e2e` (root) — thêm vào CI job tuỳ chọn (manual/nightly).

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

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

## Residual / Gap
- Không có e2e "đăng ký → xác nhận email (Inbucket/Mailpit)": đăng ký qua UI bị Turnstile chặn (R-07), nên mọi user e2e được tạo qua GoTrue admin với `email_confirm: true`. Gợi ý gỡ sau: truyền Turnstile test secret "luôn pass" của Cloudflare (`1x0000000000000000000000000000000AA` + site key `1x00000000000000000000AA`) qua env webServer (cần mạng; lần thử đầu API vẫn trả "Xác minh không thành công"), hoặc mock Turnstile phía API cho môi trường test. Hộp thư local: http://127.0.0.1:54324/api/v1 (API kiểu Mailpit).
- AC-19: sơ đồ ghế/suất/giá được dựng qua API (rạp + phòng qua form admin UI) và spec dừng ở bước giữ ghế / màn xác nhận, không đi tiếp tới thanh toán ở rạp mới (thanh toán đã được phủ ở booking.spec).
- Đăng nhập UI được giãn nhịp (5 lần/65 s) trong `e2e/support/ui.ts` vì API giới hạn login 10/phút/IP (R-08).
- `e2e` chưa nằm trong `pnpm typecheck` của repo; import `@supabase/supabase-js` đi qua `apps/api/node_modules` vì root không khai package (không được sửa package.json).
