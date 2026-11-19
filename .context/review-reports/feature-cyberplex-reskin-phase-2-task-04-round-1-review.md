Agent: reviewer

# Review: feature-cyberplex-reskin, phase-2-task-04, round 1

- Task: `tasks/feature-cyberplex-reskin/phase-2-task-04.md` (CR-010: màn khách danh mục phim/rạp/lịch chiếu + scrub nhóm A/B)
- Worktree: `E:\FilmBooking\.worktrees\cyberplex-t04` (branch `wt/cyberplex-reskin__phase-2__task-04`, base 41b565b)
- **Review level: NORMAL**
- **Reason:** Đây là task UI MODIFY: không đụng API, schema, auth hay payment. Diff có thêm component dùng chung (`chips.tsx`, `section-heading.tsx`, `filter-field.ts`, `MovieGrid`) nhưng phạm vi chỉ là catalog. Mức NORMAL đúng như dispatcher yêu cầu.
- **Blast radius:**
  - Các trang `/phim`, `/phim/[slug]`, `/rap`, `/rap/[code]`, `/lich-chieu`.
  - `MovieCard`, dùng cả ở trang chủ của task-03. Props không đổi.
  - `ShowtimeSchedule`/`ScheduleDateStrip`, dùng chung cho `/phim/[slug]` và `/lich-chieu`.
  - `cinema-map` (Leaflet).

## Verify: chạy độc lập trong worktree, mỗi lệnh 1 lần

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | **apps/web PASS**, packages/shared PASS. apps/api FAIL do môi trường: worktree không có `apps/api/node_modules` (Glob `apps/api/node_modules/vitest/package.json` không có), toàn lỗi TS2307 `@nestjs/*`. Task không đụng api. |
| `pnpm lint` | PASS (exit 0) |
| `pnpm test` | packages/shared PASS 31/31. apps/api FAIL môi trường (`'vitest' is not recognized`). pnpm `-r` dừng ở lỗi đầu tiên nên **test apps/web CHƯA được kiểm độc lập**. |
| `pnpm --filter ./apps/web test` | **Blocked**: agent-guard từ chối vì không nằm trong allowlist. Không thử biến thể khác. Builder báo 50 files / 629 tests PASS, tôi chưa kiểm được. |
| `pnpm build` | Không chạy, theo brief (junction làm Turbopack lỗi; dispatcher build ở integration). |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip: không có trong allowlist verify (ocr not installed) |
| Playwright (AC-32) | Builder không chạy (cần API + DB). Chưa có bằng chứng trình duyệt. |

## Đối chiếu yêu cầu bắt buộc

1. **R-45:** phim sắp chiếu không có CTA đặt vé.
   - Thẻ grid: CTA chỉ render khi `!isComingSoon` (`movie-card.tsx` ~dòng 162-168). Chỉ hiện "Khởi chiếu dd/MM/yyyy" qua `ComingSoonDate`. Thẻ row cũng vậy.
   - `/phim/[slug]`: khối sắp chiếu giữ nguyên nội dung.
   - OK.
2. **R-42:** `AgeBadge` vẫn ở góc trên-trái poster (`absolute top-3 left-3`). OK.
3. **R-67:** `ShowtimeClosedChip` không phải link, có `title`, `aria-label`, `aria-disabled`, ghi "Mua tại quầy". Suất `CANCELLED` ở `/rap/[code]` vẫn `return null` như cũ. OK.
4. **R-137:** `cinema-closed-notice.tsx` chỉ đổi class, nội dung `copy.*` giữ nguyên. OK.
5. **SSR/SEO (R-46):** JSON-LD và metadata giữ nguyên. Riêng title `/phim` đổi `–` thành `-`. Grep toàn worktree không có test/e2e nào assert chuỗi cũ (`phim – CINEMO`, `Sắp chiếu —`, `Chi tiết phim →`). OK.
6. **Lệch pha lưới phim:**
   - Mỗi thẻ có `view()` riêng, không dùng timeline chung cho cả lưới.
   - `--i` gán theo `:nth-child(4n+k)` khi ≥1024px, `3n` ở 560-1023px, `0` ở mobile. `--n` khớp số cột thật của `.grid` trong `movie-card.module.css`.
   - Tablet 3 cột khác với "2n" trong spec, nhưng **chấp nhận được** vì pha bám đúng số cột thực tế.
7. **Tiêu đề section:** `SectionHeading` dùng `Scrub down` + `data-scrub-wipe` + `data-scrub-rule`, không có glitch. OK.
8. **Rạp:** `/rap` và danh sách phim ở `/rap/[code]`: thẻ lẻ `left`, chẵn `right`, mỗi thẻ timeline riêng. OK.
9. **Lịch chiếu nhóm A:** `ScrubGroup n=7` chỉ bọc dải chip ngày. Mỗi `ShowtimeGroup` là `Scrub ltr` riêng. OK. Nhưng xem MAJOR-2.
10. **Đổi ngày/bộ lọc:** node giữ key nên chỉ cập nhật theo vị trí cuộn, không scrub lại từ đầu. Node mới mount ngoài khung nhìn sẽ hiện khi cuộn tới, không kẹt vĩnh viễn trừ trường hợp cuối trang (xem Residual).
11. **Chip ≥44px:**
    - Chip ngày `min-h-[52px]`.
    - Chip giờ `min-h-11`.
    - Tab tỉnh `min-h-11`.
    - Focus trên phần tử chamfer vẽ bằng `shadow inset` qua `--focus-inset`. Biến thể `focus-visible:` được Tailwind xếp sau `hover:`, nên thắng.
    - OK.
12. **Token:**
    - Grep các file catalog và `phim|rap|lich-chieu` trong scope: không còn hex, `rounded-*` (trừ `rounded-none`) hay `text-danger`.
    - `—`/`–` chỉ còn trong comment/describe của test.
    - Popup bản đồ đã đổi hex sang `var(--color-*)`.
    - OK.
13. **`cinema-map.module.css`:**
    - Mọi selector đều có lớp local (`.map` / `.popup`) đứng trước `:global(...)`, nên hợp lệ với CSS Modules pure mode và không làm lộ style ra ngoài.
    - `bindPopup(..., { className: styles.popup })` gắn class lên `.leaflet-popup`, nên selector con khớp.
    - Leaflet vẫn được nạp bằng `await import("leaflet")` trong effect (client-only, `cinema-map.tsx:52`), không đổi.
    - OK.
14. **Test:** 2 test chỉ đổi dấu gạch trong chuỗi mong đợi. Assertion nghiệp vụ (`queryByRole link /Đặt vé/` không tồn tại) giữ nguyên. OK.
15. **Hồi quy trang chủ:** `MovieCardProps` không đổi, `MovieGrid` là export thêm. Trang chủ ở base không vỡ (xem Residual R1).

## Findings

### MAJOR-1: link đang focus trong thẻ phim bị `clip-path` che hoàn toàn (vi phạm AC-32 "phần tử nhận focus luôn hiện", NFR-19, NFR-12/WCAG 2.4.7)

**Bằng chứng:**
- Quy tắc chống kẹt `apps/web/src/app/globals.css:381` (`[data-scrub]:focus-within { animation: none; ... }`) chỉ huỷ animation trên chính phần tử `[data-scrub]`, tức `<article>`.
- `[data-scrub-media]` chạy animation riêng `beamOpen` với timeline `view()` riêng và `fill-mode: both` (`globals.css:371-374, 384`). Khi thẻ còn nằm trong vùng inset đáy 300px, keyframe `from` giữ `clip-path: inset(-40px -40px 100% -40px)`, tức che hết.
- Trong `apps/web/src/components/catalog/movie-card.tsx` (~dòng 133-168), **mọi phần tử tab tới được** của thẻ grid đều nằm trong `<div data-scrub-media>`: link tiêu đề trong `h3` và nút CTA "Đặt vé". Link poster có `tabIndex=-1`.

**Tình huống tái hiện:**
- Ở 1280×800 trên `/phim`, hàng thẻ đầu có top khoảng y≈560, nằm dưới vạch inset y=500.
- Người dùng Tab từ bộ lọc vào thẻ. Trình duyệt không cuộn vì thẻ đã nằm trong khung nhìn.
- `<article>` hiện đủ, nhưng poster, tiêu đề, CTA và vòng focus vẫn bị cắt. Focus rơi vào phần tử vô hình.
- Trang chủ (task-03) dùng `MovieCard` nên cũng dính lỗi này.

**Đề xuất:** thêm vào `movie-card.module.css` quy tắc `.card:focus-within [data-scrub-media] { animation: none; clip-path: none; }`. Specificity (0,3,0) thắng (0,2,0). Nên thêm luôn `.card:focus-within [data-scrub-beam] { animation: none; }`.

### MAJOR-2: `/lich-chieu` ở 390×844: dải chip ngày (điều khiển nằm trong khung nhìn khi vào trang) ở opacity 0 (vi phạm NFR-19, SPECIFICATIONS dòng 363)

**Bằng chứng:**
- NFR-19 viết: "các điều khiển trong khung nhìn lúc vào trang không bao giờ giảm opacity".
- Trên mobile, `ScheduleFilters` xếp 3 select chồng nhau (khoảng 270px). Ước tính đỉnh dải ngày ở y≈630-660: dưới h1 + mô tả, `BookingStepper`, bộ lọc và các khoảng `space-y-8`. Mức này vẫn trong khung 844px.
- Vạch inset ở y = 844 − min(36%·844, 300) = 544.
- `ScrubGroup` (`showtime-schedule.tsx` ~dòng 114) nằm hoàn toàn dưới vạch inset, nên tiến độ < 0 và cả 7 chip ở trạng thái `opacity: 0` lúc vào trang. Người dùng phải cuộn mới thấy nút chọn ngày.
- Biên lệch khoảng 100px, đủ chịu sai số ước tính.
- Case 1280×800 sát ngưỡng, không kết luận.

**Đề xuất:** truyền `scrub-inset-0` từ `ScheduleDateNav` (`schedule-filters.tsx:106-116`) xuống group, hoặc tắt scrub dải ngày riêng trên `/lich-chieu`. **Không** sửa trong `ScheduleDateStrip` dùng chung, để `/phim/[slug]` giữ hiệu ứng hiện muộn. Cách này nằm trong lối thoát design-spec §16.4 đã ghi ("Route/phần tử nào kẹt thì đặt `--scrub-inset: 0px` hoặc bỏ scrub ở đó").

### MINOR / Residual (cho task-07 / integration)

- **R1:** Trang chủ ở base dùng lưới `lg:grid-cols-5` với `MovieCard`. Thẻ giờ luôn mang pha `:nth-child(4n)`, nên với 5 cột pha bị lệch. Integration/task-03 nên dùng `MovieGrid`.
- **R2:** Quy tắc focus-within dùng chung ở `globals.css:381` (của task-01) nên phủ cả phần tử animation lồng: `[data-scrub]:focus-within :is([data-scrub-media],[data-scrub-wipe],[data-scrub-rule])`. Đây là hardening cho chủ shared.
- **R3:** `scrub-inset-0` cho `SiteFooter` thuộc shell, ngoài scope.
  - Phần tử cuối trang cần footer cao ≥ ~230px (thẻ phim cột 4) hoặc ≥ ~150px (ShowtimeGroup) mới hoàn tất.
  - Ước tính đạt với footer 4 cột, nhưng **bắt buộc kiểm bằng Playwright AC-32** (390×844, 1280×800, 1440×900, 1920×1080, cuộn tới cuối, không còn `[data-scrub]` opacity < 1, không scroll ngang).
- **R4:** Đổi ngày/bộ lọc khiến nội dung mới có thể nằm trong 300px đáy, ở opacity 0 tới khi người dùng cuộn. Không kẹt vĩnh viễn, nhưng lệch nhẹ câu "nội dung mới hiển thị đủ ngay" ở §16.4.
- **R5:** `ShowtimeClosedChip` đặt `aria-label` / `aria-disabled` trên `div` không có role. Lỗi có từ trước, có thể bị axe gắn cờ `aria-prohibited-attr`. Gợi ý thêm `role="img"` hoặc nội dung `sr-only`.
- **R6:** Test apps/web chưa được reviewer kiểm độc lập vì allowlist chỉ có `pnpm test` gộp và apps/api thiếu deps trong worktree. Dispatcher cần chạy lại ở integration.

## Verdict: **FAIL**

Có 2 MAJOR:
- **MAJOR-1:** phần tử đang focus bị che, vi phạm trực tiếp AC-32 và NFR-19, NFR-12. Lỗi xác định qua cấu trúc CSS, không phụ thuộc ước tính.
- **MAJOR-2:** điều khiển trong khung nhìn lúc vào trang bị opacity 0 ở `/lich-chieu` mobile.

Cả hai đều sửa được trong scope task (`movie-card.module.css`, `schedule-filters.tsx`/`showtime-schedule.tsx`), mỗi chỗ chỉ vài dòng. Phần còn lại (R-42/R-45/R-67/R-137/SEO, token, a11y chip, Leaflet CSS modules, test dấu gạch) đạt.
