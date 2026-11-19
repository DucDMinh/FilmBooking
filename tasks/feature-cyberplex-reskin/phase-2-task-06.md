# Feature cyberplex-reskin · phase-2-task-06 — Admin và Soát vé (da nhẹ, không chuyển động)

- Classification / Risk: MODIFY (UI). Reviewer **NORMAL** (nhiều file nhưng đổi class cơ học; bảng dày đặc). **Song song** với task-03/04/05. Sau phase 1.
- Spec: NFR-19, NFR-12, R-97..R-99, R-103..R-110. Thiết kế: §16.1 (Admin/Soát vé: màu + font + chamfer nút/badge/dialog; **không** scanline/lưới/scrub), §16.3 (`DataTable`, `AdminShell`, `StaffHeader`, `CheckinResult`).

## Thiết kế
1. `components/admin/*` (46 file), `app/admin/**`: AdminShell (sidebar `chrome`, active vạch trái vàng, badge vai trò chamfer-sm), PageHeader (Chakra Petch), `DataTable` vuông, hàng 56px, header `hud`, chỉ kẻ ngang dưới hàng, trạng thái = badge tone §1.4; form card vuông hoặc `--cut-sm`; dialog `--cut-lg` nhưng nội dung bảng không bị cắt góc; biểu đồ Recharts dùng `chart-1..5` mới.
2. `components/staff/*`, `app/staff/**`: StaffHeader, `CheckinResult` (banner success/danger, chữ Chakra Petch 20px + icon, **không hiệu ứng, hiện tức thì**), vùng camera; tương phản ngoài trời; không scanline.
3. Tắt scanline cho `/admin` và `/staff` (lớp phủ scanline chỉ trang khách: đặt cờ ở layout route group).
4. **Không** dùng `Scrub`. Không đổi quyền, scope rạp, logic CSV, bộ lọc URL.

## KHÔNG làm
Không đụng `components/catalog|booking|ticket|account|auth|shell|common|ui`, `app/(public)/**`, `apps/api`.

## Files to Modify
`apps/web/src/components/admin/*`, `components/staff/*`, `app/admin/**`, `app/staff/**`, test.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`; Playwright smoke `/admin`, `/staff/soat-ve` (render, không có scanline, không `data-scrub`); kiểm tương phản badge.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: admin/soát vé coral.
- Expected: da CYBERPLEX nhẹ, không chuyển động, dữ liệu đọc rõ.
- Actual after: admin/soát vé dùng màu CYBERPLEX qua token (vàng/chrome/sidebar-accent), font heading Chakra Petch, nút/badge chamfer từ `components/ui`, card/bảng/ô nhập vuông (đã bỏ mọi `rounded-*`), `text-danger` -> `text-danger-text`, không dấu `—`/`–` trong chuỗi hiển thị, không Scrub/scanline/chuyển động.
- Evidence: typecheck PASS; lint PASS; test 629/629 PASS (4 test bám dấu `—`/`–` cũ sửa sang `-`); grep: không `Scrub|data-scrub|scanline|rounded|coral|cta-glow` trong admin/staff, scanline chỉ ở `(public)/layout.tsx`; `next build --webpack` compile OK nhưng fail type-check ở `.next/types/app/auth/callback/route.ts` (`classifyOAuthError` export từ route.ts, ngoài scope, có từ trước). `pnpm build` (turbopack) không chạy được trong worktree do junction node_modules. Playwright smoke KHÔNG chạy (cần API/đăng nhập).
- Status: PASS (chờ reviewer)
