# Feature cyberplex-reskin · phase-3-task-07 — Rà soát toàn cục: em-dash, hex thô, hiệu năng, a11y, chuyển động

- Classification / Risk: MODIFY (UI). Reviewer **STRICT** (gate cuối). Sau phase 2.
- Spec: NFR-19, NFR-12, NFR-11, AC-32. Thiết kế: tokens §0 T8, §8; spec §16.5, §16.7.

## Thiết kế
1. **Em-dash/en-dash** (`—`, `–`) trong **chuỗi hiển thị** (62 file `.tsx` hiện có ký tự này; bỏ qua comment/test): thay `-` hoặc dấu câu. Không đổi chuỗi bị test kiểm nguyên văn mà không cập nhật test.
2. Quét **hex thô / màu Tailwind mặc định / `rounded-pill|full` / `bg-gradient-brand` / font Inter/Rajdhani còn sót**; map về token.
3. **Playwright** (script giữ lại tại `apps/web/e2e/scrub.spec.ts` hoặc thư mục phù hợp; không thêm dependency nếu repo chưa có): cuộn tới mốc rồi đọc computed (`opacity/translate/scale`), **cuộn lên trả đúng**; hero `0 → 90svh → 0`; lưới phim hiện muộn (bắt đầu top ≤ ~560/800) và hoàn tất khi còn cách mép dưới ≥ 200px; cuộn hết trang không phần tử `data-scrub` nào còn `opacity < 1` **ở cả 4 cỡ màn 390×844, 1280×800, 1440×900, 1920×1080, cho mọi route khách** (AC-32; route nào kẹt thì `--scrub-inset: 0px`); phần tử nhận focus bằng Tab luôn hiện (`:focus-within`); `/dat-ve/*` hiện đủ ngay; reduced-motion = tất cả `1/0/1`; không scroll ngang ở 360px và 1280px; không lỗi console.
4. **Lighthouse** (trang chủ, `/phim`, `/lich-chieu`): CLS < 0.1, LCP < 2.5s; ghi số đo.
5. **A11y**: Tab bàn phím thấy vòng focus trên nút chamfer; kiểm tương phản tokens §6; screen reader đọc được phần tử đang hiện dần.
6. Reconcile tài liệu as-built (`docs/**` nhắc màu/font cũ; `docs/design/cinemo` giữ làm lịch sử). **Không** sửa intent docs.

7. **Residual từ review phase 1-2 (xử lý ở task này hoặc ghi rõ lý do không làm):**
   - Rule toàn cục `globals.css`: `[data-scrub]:focus-within` phải phủ cả phần tử animation LỒNG bên trong (`[data-scrub-media]`, `[data-scrub-beam]`, `[data-scrub-wipe]`, `[data-scrub-rule]`) (dispatcher có thể đã sửa ở bước gộp phase 2).
   - Footer `SiteFooter` gắn `scrub-inset-0` khi bật scrub cột footer; trang chủ chuyển lưới phim sang `MovieGrid` (lệch pha theo cột).
   - SeatMap/SeatLegend: hex thô `#12697A` -> `var(--color-info-line)`; ghế lẻ (R-66) và VIP còn trống không mất khung/vạch khi hover (không gắn hover shadow); mẫu "Hỏng" trong chú thích thiếu dấu gạch.
   - `text-[27px]` tổng tiền -> token cỡ chữ; chấp nhận fallback font cho ký tự "₫" (Orbitron không có glyph) và ghi chú.
   - `lib/legal.ts:5` `LEGAL_DRAFT_NOTICE` còn "—"; `auth-ui.tsx:108,148` còn "8–72" (đổi cả chuỗi và test); sweep toàn bộ `—/–` còn lại trong chuỗi hiển thị.
   - `avatar-upload.tsx:136` `chamfer-md` + `border-2` bị clip-path cắt viền: dùng shadow inset.
   - Import `HUD_LABEL` bị chèn nhóm import bên thứ ba (5 file account): chuyển xuống nhóm `@/`.
   - Audit-log: sentinel "-" dễ nhầm giá trị thật (`audit-log-view.tsx:42`) -> nhãn "(không có)".
   - Soát vé: nút `ui/button` vẫn có hiệu ứng nhấc/transition 200ms ở `/staff` trái §16.1 "tắt hết": tắt ở staff layout; icon CheckinResult vẫn tròn (§16.2 ô vuông chamfer).
   - Token `z-index` (`lib/z-index.ts`), `--dur-wipe`, `--stagger` chưa có (tokens §3.3/§4.1): thêm hoặc cập nhật tokens cho đúng thực tế.
   - Hero: kiểm ở 1024x690 và 1366x657 với tên phim dài (3 dòng), `UnverifiedEmailBanner` hiện thì hero lệch; thẻ rạp trang chủ lệch pha `index%3` vs lưới 2 cột; `aria-label` đặt trên `div` không có role (`cinema-closed-notice`, chip đóng bán).
   - Chạy ĐẦY ĐỦ ở integration: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (worktree không build được do junction; `app/auth/callback/route.ts` export `classifyOAuthError` làm type-check của `next build` báo lỗi: xác nhận có từ trước trên staging hay không).

## KHÔNG làm
Không thêm tính năng mới; không đổi nghiệp vụ; không động `apps/api`, `supabase`.

## Files to Modify
Rải rác `apps/web/src/**` (chuỗi/class), `apps/web/e2e/*` (mới), docs as-built.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`, `build`; `pnpm test` toàn repo; chạy script Playwright; số Lighthouse.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: còn dấu gạch dài, class cũ, chưa có test chuyển động.
- Expected: sạch; test cuộn PASS; CLS/LCP đạt.
- Actual after (07a, phần quét sạch, builder): HẾT dấu gạch dài trong chuỗi hiển thị (còn 3: `legal.ts`, `auth-ui.tsx` x2, đã đổi + cập nhật test); `#12697A` thô trong SeatMap/SeatLegend -> `var(--color-info-line)`; hover ghế không còn ghi đè vạch VIP / khung ghế lẻ; mẫu "Hỏng" có gạch; sentinel audit-log "(không có)"; import `HUD_LABEL` về nhóm `@/`; avatar-upload viền bằng lớp overlay inset; staff tắt transition/transform (`.staff-static`); icon CheckinResult ô vuông chamfer-md; `role="group"` cho chip đóng bán; aria-label QuickBookBar lên `<form>` + dọn rAF/setTimeout; trang chủ dùng `MovieGrid` (xoá `.home-movie-grid`), lưới rạp lệch pha theo cột thật (`.home-cinema-grid`); SiteFooter gắn `ScrubGroup.scrub-inset-0`; tokens §3.4 khớp thực tế (`--dur-wipe`, `--stagger`, z-index đã bỏ/ghi lại). Giữ có chủ ý: `text-[27px]` tổng tiền (không có token 27px), `bg-white text-neutral-900` ở `ticket-qr` (mã QR cần nền trắng), radius `rounded-*` (token radius đều 0px).
- Evidence (07a): `pnpm lint` sạch; typecheck (tsconfig.verify.json, src only) 0 lỗi; `pnpm test` 52 file / 650 test PASS. Phần B (Playwright e2e + Lighthouse + a11y thủ công) CHƯA làm, sang lượt sau.
- Status: 07a PASS (quét sạch); 07b (e2e/Lighthouse) pending
