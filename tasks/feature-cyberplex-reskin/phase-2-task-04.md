# Feature cyberplex-reskin · phase-2-task-04 — Màn khách (danh mục): phim, rạp, lịch chiếu + scrub nhóm A/B

- Classification / Risk: MODIFY (UI). Reviewer **NORMAL**. **Song song** với task-03/05/06. Sau phase 1.
- Spec: NFR-19, NFR-12, R-40..R-46, R-57, R-67, R-137. Thiết kế: `.context/design-spec.md` §16.3 (`MovieCard`, `CinemaCard`, `DateStrip`, `ShowtimeChip`), §16.4 (nhóm A lịch chiếu; nhóm B phim/rạp).

## Thiết kế
1. `components/catalog/*`: `movie-card` (chamfer-lg, viền gradient, hover poster `scale 1.045`, thanh CTA trượt lên, luôn hiện ở `hover: none`; `AgeRatingBadge` giữ góc trên-trái R-42; điểm/định dạng dưới ảnh; **phim sắp chiếu không có CTA "Đặt vé"**, chỉ "Khởi chiếu dd/MM", R-45), cinema card (§16.3), `movie-filters`, `schedule-filters`, `showtime-schedule`, `movie-showtime-schedule` (DateStrip chip chamfer-sm, ShowtimeChip chamfer-sm giờ mono, giữ disabled/tooltip R-67), `cinema-closed-notice`, `province-picker-dialog`, `favorite-button`, `cinema-map` (marker vàng, popup theo token).
2. Trang `app/(public)/phim/**`, `rap/**`, `lich-chieu/**`: tiêu đề section `Scrub kind="down"` (wipe + vạch, **không glitch**); **lưới phim: mỗi thẻ `kind="beam"` với `view()` riêng, `--i` theo CỘT** (`:nth-child(4n+k)`, 2n tablet, 0 mobile; KHÔNG timeline chung cho cả lưới); rạp/cột 2 bên: lẻ `left`, chẵn `right`; **lịch chiếu = nhóm A** (`ScrubGroup`: DateStrip từng chip, rồi từng `ShowtimeGroup`, trái → phải). Đổi tab/ngày/bộ lọc: nội dung thay tại chỗ, không scrub lại. Footer của các trang này dùng `--scrub-inset: 0px`.
3. Giữ nguyên SSR/SEO (R-46: meta, OG, schema.org), dữ liệu, URL, hành vi lọc.

## KHÔNG làm
Không đụng `app/(public)/page.tsx` (task-03), `booking|ticket|account|auth|admin|staff`, `apps/api`.

## Files to Modify
`apps/web/src/components/catalog/*` (trừ `quick-book-bar.tsx`), `apps/web/src/app/(public)/phim/**`, `rap/**`, `lich-chieu/**`, test.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`; Playwright: thẻ phim hàng 2 hoàn tất khi còn cao hơn mép dưới ≥ 200px; cuộn lên thu về; reduced-motion hiện đủ; 360px không scroll ngang.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: màn danh mục kiểu CINEMO, không chuyển động theo cuộn.
- Expected: kiểu CYBERPLEX + nhóm A/B, hiện muộn (`--scrub-inset`).
- Actual after: màn phim/rạp/lịch chiếu dùng ngôn ngữ CYBERPLEX (chamfer, viền gradient, hud, chip chamfer-sm, marker vàng). Chuyển động theo cuộn bằng CSS: tiêu đề section `Scrub kind="down"` + wipe + vạch; lưới phim `kind="beam"` view() riêng, lệch pha theo cột bằng `:nth-child` trong CSS module; rạp lẻ left / chẵn right; DateStrip là `ScrubGroup`, ShowtimeGroup `Scrub ltr` timeline riêng; đổi ngày/bộ lọc không scrub lại (phần tử mới chỉ theo vị trí cuộn).
- Evidence: `pnpm --filter ./apps/web typecheck` PASS, `lint` PASS, `test` 50 files / 629 tests PASS. Playwright KHÔNG chạy (cần API + DB Supabase, không dựng trong worktree): chưa đo bằng trình duyệt hàng 2 hoàn tất, thu về khi cuộn lên, reduced-motion, 360px không scroll ngang.
- Status: PASS (code + unit); BLOCKED phần smoke Playwright, cần kiểm ở integration

### Round 2 (sau reviewer FAIL round 1)
- MAJOR-1: `movie-card.module.css` thêm `.card:focus-within [data-scrub-media] { animation: none; clip-path: none }` và `[data-scrub-beam] { animation: none; opacity: 0 }` (không sửa globals.css). Các animation lồng khác trong scope (wipe/rule của SectionHeading) không chứa phần tử focusable nên không cần.
- MAJOR-2: `ScheduleDateStrip` nhận thêm prop `className`; `ScheduleDateNav` (/lich-chieu) truyền `scrub-inset-0`. Dải ngày dùng chung ở `/phim/[slug]` và `/rap/[code]` giữ nguyên hiện muộn vì nằm dưới màn hình lúc vào trang.
- Evidence: typecheck PASS, lint PASS, test 50 files / 629 tests PASS. Playwright vẫn chưa chạy (cần API/DB).
