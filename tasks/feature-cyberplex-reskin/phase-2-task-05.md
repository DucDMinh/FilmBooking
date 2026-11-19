# Feature cyberplex-reskin · phase-2-task-05 — Luồng đặt vé, vé, tài khoản, đăng nhập

- Classification / Risk: MODIFY (UI). Reviewer **STRICT** (SeatMap, đồng hồ giữ ghế, cảnh báo không huỷ/hoàn R-133: lỗi UI ở đây gây mất tiền/khiếu nại). **Song song** với task-03/04/06. Sau phase 1.
- Spec: R-59..R-68, R-70, R-71, R-73, R-76, R-79, R-85, R-133, NFR-12, NFR-19. Thiết kế: §16.3 (`SeatMap`, `BookingStepper`, `BookingSummary`, `CountdownTimer`, `NoRefundNotice`, `QrTicket`, form/auth), §16.4 (nhóm A chọn ghế; "Trang luồng đặt vé").

## Thiết kế
1. `components/booking/*` (gồm `hold-countdown.tsx` = CountdownTimer: chip chamfer-sm, số mono, success > 2', warning ≤ 2', danger-text ≤ 30s, giữ role=timer/aria-live/logic ngưỡng; việc chuyển từ task-02): SeatMap (ô chamfer `--cut-seat`, màu theo tokens §1.5, **giữ ký hiệu ✓/đồng hồ/×/vạch VIP/ô đôi + `aria-label` + roving tabindex + `aria-live`**), SeatLegend, BookingStepper (4 đoạn), BookingSummary (tổng tiền Orbitron vàng), VoucherField, PolicyConfirmDialog, AgeWarning, NoRefundNotice, HoldExpiredDialog, các panel xác nhận/thanh toán/kết quả. Feedback chọn ghế (scale 1→1.15→1, 160ms) và đổi tổng tiền: time-based, không scrub.
2. `app/(public)/dat-ve/**`: **`--scrub-inset: 0px`** cho cả route (phần trong khung nhìn hiện đủ ngay); nhóm A (`ScrubGroup`) chỉ cho phần ở dưới màn hình (mobile: chú thích, tóm tắt); ghế đang chọn không bao giờ bị thu về. Tia quét thanh màn hình theo tiến độ nhóm.
3. Trang `app/(public)/ve/**`, `tai-khoan/**`, `(auth)/**`, `components/account/*`, `components/auth/*`: form input vuông, nhãn `hud`, nút primary, Turnstile `theme="dark"`, lỗi `danger-text`. Trang ngắn: `scrub-inset-0` hoặc không scrub. (`components/ticket` đã làm ở task-02.)
4. **Bất biến nghiệp vụ**: không đổi logic giữ ghế, đếm giờ, gating checkbox, AlertDialog xác nhận, nội dung tên rạp + địa chỉ + cảnh báo R-133 ở 06/08/10/32; test hiện có của booking/ticket/account/auth phải PASS không sửa assertion nghiệp vụ.

## KHÔNG làm
Không đụng `components/catalog|shell|common|ui` (đã làm), `admin|staff`, `app/(public)/page.tsx`, `apps/api`, `packages/shared`, `supabase`.

## Files to Modify
`apps/web/src/components/booking/*`, `components/account/*`, `components/auth/*`, `app/(public)/dat-ve/**`, `ve/**`, `tai-khoan/**`, `app/(auth)/**`, test.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`; Playwright: trang chọn ghế vừa vào có mọi phần tử `opacity 1` ngay; chọn ghế cập nhật tóm tắt; cuộn lên xuống không làm mất ghế đang chọn; reduced-motion; 360px; Tab bàn phím thấy focus inset trên nút chamfer.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: luồng đặt vé kiểu CINEMO.
- Expected: kiểu CYBERPLEX, hành vi và a11y nguyên vẹn, trang đặt vé dùng được ngay khi vào.
- Actual after: SeatMap/SeatLegend/BookingStepper/HoldCountdown/NoRefund/order-summary/seat-picker aside, form auth + tài khoản đã sang CYBERPLEX; logic, aria-label, roving tabindex, role=timer, gating R-71, nội dung R-133 giữ nguyên. /dat-ve có layout `scrub-inset-0`.
- Evidence: typecheck PASS, lint PASS, test 50 files/629 PASS. Playwright/smoke chưa chạy (app cần Supabase env + API). Build không chạy trong worktree (symlink node_modules); webpack compile OK, lỗi type .next/types ở app/auth/callback/route.ts là có sẵn, không thuộc scope.
- Status: PASS (code + unit: typecheck/lint/test 629 PASS); smoke Playwright chưa chạy
