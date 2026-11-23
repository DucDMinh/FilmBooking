# Feature nav-skeleton-first-row · phase-2-task-02 — Dòng dữ liệu đầu tiên hiện đủ ngay (bỏ scrub ở hàng đầu)

- Classification / Risk: MODIFY (UI, CR-016). Reviewer **STRICT** (đụng `globals.css` dùng chung cho mọi trang khách + `Scrub`; AC-32 "không phần tử kẹt ẩn" là điểm dễ hồi quy). **Song song** với task-01 (file không trùng). Sau phase 1 (spec 3.6.0).
- Spec: **NFR-19** (đã sửa), AC-35 (ý 2), AC-32, R-138/AC-31, NFR-12. Thiết kế: `.context/design-spec.md` §16.4.

## Vấn đề (root cause đã đo bằng đọc code)
`globals.css` mục "CHUYỂN ĐỘNG THEO CUỘN": `[data-scrub]` dùng `animation-timeline` view + `animation-range: entry …` + `--scrub-inset: min(36%, 300px)` nên phần tử ở hàng đầu (phim, suất chiếu, rạp, và tiêu đề `SectionHead`) bắt đầu `opacity: 0` và chỉ hiện khi cuộn thêm, người dùng thấy ô trống như web lỗi.

## Quyết định (user duyệt 2026-11-23)
Hàng đầu của mỗi mục dữ liệu **và tiêu đề ngay phía trên nó KHÔNG chạy scrub**: `opacity 1`, không trượt/phóng, ngay từ lúc vào khung nhìn. Các hàng từ hàng thứ hai trở đi giữ nguyên chuyển động theo cuộn (cuộn xuống hiện dần, cuộn lên thu về, hiện muộn).

## Thiết kế
1. Cơ chế: thêm cách đánh dấu "không scrub" cho hàng đầu, ưu tiên **CSS thuần theo breakpoint**, không JS/không đo scroll: ví dụ thuộc tính `data-scrub-first` (hoặc prop `first` của `<Scrub>` ghi thuộc tính đó) + quy tắc trong `globals.css` `[data-scrub][data-scrub-first] { animation: none; opacity: 1; translate: 0 0; scale: 1 }` (và con `[data-scrub-wipe]`, `[data-scrub-rule]`, `[data-scrub="beam"]` media/beam tương ứng, kể cả `clip-path`/`transform` ban đầu), ĐỒNG BỘ với khối `:focus-within` đang có. "Hàng đầu" phải khớp **số cột lưới thật ở từng breakpoint** (ví dụ lưới phim/rạp 1/2/3/4 cột): dùng container có thuộc tính + `:nth-child(-n+N)` theo breakpoint hoặc truyền chỉ số vào component; tránh đoán số cột sai (hàng đầu ở 1280px khác ở 390px).
2. Áp dụng cho các mục dữ liệu trang khách (đọc từng file để xác định đúng nơi):
   - Trang chủ `app/(public)/page.tsx`: tiêu đề "Phim chiếu rạp" + hàng đầu `MovieGrid`; tiêu đề "Hệ thống rạp" + hàng đầu `home-cinema-grid` (hiện đang `Scrub left/right`).
   - `app/(public)/phim/page.tsx` (+ `components/catalog/movie-card.tsx`, `MovieGrid`), `app/(public)/lich-chieu/page.tsx` (+ `components/catalog/showtime-schedule.tsx`: khối suất đầu), `app/(public)/rap/page.tsx` (thẻ rạp), `rap/[code]/page.tsx` (lịch chiếu), `phim/[slug]/page.tsx` (dải ngày/suất chiếu đầu), `components/catalog/section-heading.tsx` (tiêu đề dùng chung: cho phép đánh dấu "first").
   Hero ghim và `QuickBookBar` KHÔNG đổi (đã đúng NFR-19). Trang `/dat-ve/*`, footer, admin/staff không đổi.
3. Không phá: reduced-motion (animation chỉ bật trong `@media (prefers-reduced-motion: no-preference)`), trình duyệt không hỗ trợ `animation-timeline` (hiển thị tĩnh), `:focus-within`, các `Scrub` ở hàng sau (giữ `--i`/`--n` đúng sau khi bỏ hàng đầu: hàng 2 vẫn lệch pha hợp lý, không dồn tất cả cùng lúc).
4. `.context/design-spec.md` §16.4 đã được change-request cập nhật (mục "NGOẠI LỆ HÀNG ĐẦU": thuộc tính `data-scrub-first`, tính lại `--i`/`--n` từ hàng thứ hai): KHÔNG sửa file này; bám đúng mô tả đó, lệch thì báo trong Evidence.
5. Bảo toàn test hiện có của `Scrub`/catalog; cập nhật test chỉ ở chỗ thuộc tính mới.

## KHÔNG làm
Không tạo `loading.tsx` / `components/common/page-skeleton.tsx` (task-01). Không đổi hero, `QuickBookBar`, `components/booking`, `admin|staff`, `apps/api`, `packages/shared`, `supabase`. Không dùng JS scroll listener/IntersectionObserver.

## Files to Create/Modify
- `apps/web/src/app/globals.css`
- `apps/web/src/components/motion/scrub.tsx`
- `apps/web/src/components/motion/__tests__/scrub.test.tsx`
- `apps/web/src/components/catalog/section-heading.tsx`
- `apps/web/src/components/catalog/movie-card.tsx`
- `apps/web/src/components/catalog/showtime-schedule.tsx`
- `apps/web/src/app/(public)/page.tsx`
- `apps/web/src/app/(public)/phim/page.tsx`
- `apps/web/src/app/(public)/phim/[slug]/page.tsx`
- `apps/web/src/app/(public)/lich-chieu/page.tsx`
- `apps/web/src/app/(public)/rap/page.tsx`
- `apps/web/src/app/(public)/rap/[code]/page.tsx`

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`. Trình duyệt thật (Playwright/Chrome, API giả `e2e/scrub/mock-api.mjs`): ở 390×844, 1280×800, 1440×900, 1920×1080 mở `/`, `/phim`, `/lich-chieu`, `/rap`, `/rap/<mã>`, `/phim/<slug>`: cuộn tới khi mục vừa vào khung nhìn thì phần tử hàng đầu + tiêu đề `opacity 1`, không `translate/scale`; hàng sau vẫn hiện dần và thu về khi cuộn lên; cuộn hết trang không còn phần tử `data-scrub` nào `opacity < 1` (AC-32); reduced-motion tất cả hiện đủ; bộ `pnpm exec playwright test -c playwright.scrub.config.ts` không hồi quy (nếu test cũ kiểm hiện muộn ở hàng đầu thì cập nhật cho khớp spec mới và ghi rõ; sửa `e2e/scrub/scrub.spec.ts` nếu cần, chỉ phần đó).

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: hàng phim/rạp/suất đầu và tiêu đề nằm ở màn hình đầu nhưng trống tới khi cuộn thêm.
- Expected: hàng đầu + tiêu đề hiện đủ ngay khi vào khung nhìn; hàng sau giữ chuyển động theo cuộn.
- Actual after: hàng đầu (thẻ phim, thẻ rạp, khối suất đầu, chip ngày) và tiêu đề section phía trên luôn opacity 1, không translate/scale/clip, ở mọi vị trí cuộn (kể cả vừa vào khung nhìn và khi cuộn lên lại) ở 390x844, 1280x800, 1440x900, 1920x1080; hàng 2 trở đi vẫn hiện muộn và thu về khi cuộn lên.
- Evidence:
  - Cơ chế (CSS thuần, trong `@media (prefers-reduced-motion: no-preference)` + `@supports (animation-timeline: view())` của globals.css, đặt SAU các animation-name): (1) `<Scrub first>` ghi `data-scrub-first` (SectionHeading `first`, SectionHead trang chủ, hero chi tiết phim, chip ngày, khối suất đầu `groupIndex === 0`, phim đầu ở `/rap/[code]`); (2) lưới nhiều cột ghi `data-scrub-grid="movie|cinema"` trên container và CSS dùng `> [data-scrub]:nth-child(-n + N)` theo breakpoint thật: movie 2 (<560) / 3 (>=560) / 4 (>=1024) khớp movie-card.module.css; cinema 1 (<768) / 2 (>=768) / 3 (>=1024) khớp `grid-cols-1 md:2 lg:3`. Số cột chỉ tăng theo bề rộng nên mỗi mốc chỉ thêm phần mở rộng. Quy tắc: `animation: none; opacity: 1; translate: 0 0; scale: 1` cho phần tử, `animation: none` cho wipe/rule/media/beam lồng bên trong.
  - Không động tới --i/--n: `--i` của lưới phim/rạp tính theo CỘT (không theo hàng) nên bỏ hàng đầu không làm lệch pha hàng 2; các Scrub rời không ghi --i (mặc định 0, view() riêng).
  - Vitest apps/web: 53 file, 691 test PASS (thêm 7 test trong scrub.test.tsx: prop first, thứ tự quy tắc CSS, bảng cột movie/cinema đối chiếu movie-card.module.css). typecheck: sạch. lint (eslint src): sạch.
  - Trình duyệt thật (junction node_modules vào worktree; `next build --webpack` vào .next/scrub vì Turbopack không build được trong worktree; `SCRUB_SKIP_BUILD=1 pnpm exec playwright test -c playwright.scrub.config.ts`): 25/25 PASS. Trước khi sửa e2e, 3 test cũ FAIL đúng như kỳ vọng vì giả định thẻ hàng 1 bị ẩn ((b) thu về, (c) hiện muộn hàng 1, (e) ẩn trong vùng inset); đã chuyển sang thẻ hàng 2 (helper `secondRowCardIndex`), (c) thêm kiểm hàng 1 luôn hiện đủ, hàng 2 bắt đầu cách mép dưới 285px và hoàn tất cách >= 485px. Thêm test (i) x4 cỡ màn: các route /, /phim, /rap, /rap/SGN1, /phim/phim-1, /lich-chieu, cuộn xuống rồi lên qua các vị trí quanh mỗi phần tử hàng đầu, mọi phần tử hàng đầu opacity 1, không translate/scale/clip/rule/beam. (a) AC-32 cuộn hết trang, (d) reduced-motion, (perf) CLS<0.1, (a11y) vẫn PASS.
  - Lệch so với design-spec §16.4: spec ghi đánh dấu `data-scrub-first` trên Scrub; với lưới nhiều cột hàng đầu phụ thuộc breakpoint nên dùng thêm `data-scrub-grid` ở container (cùng hiệu ứng CSS). Nên bổ sung câu này vào design-spec khi có dịp.
  - Quyết định phạm vi: tiêu đề bản đồ (`/rap`, `/rap/[code]`) KHÔNG đánh dấu first (không phải hàng dữ liệu); chip ngày luôn first (hàng ngang duy nhất ngay dưới tiêu đề); mỗi ShowtimeSchedule coi khối đầu là first (mỗi khối phim ở /lich-chieu là một mục riêng).
- Status: PASS

## Fix round 2 (reviewer STRICT FAIL round 1: M-1, M-2, m-1..m-3, spec 3.6.1)
- M-1: `ShowtimeSchedule` có prop `first` (mặc định false), khối đầu chỉ `first && groupIndex === 0`. `/phim/[slug]` truyền `first`; `/lich-chieu` chỉ truyền cho phim đầu tiên (`MovieResults` index 0, `CinemaResults` movieIndex 0). Các khối/phim sau vẫn scrub. `/rap/[code]` giữ nguyên (khối phim đầu `index === 0`).
- M-2: e2e (i) giờ chạy thêm 768x1024 (5 cỡ), kiểm clip-path của hàng đầu `!== "none"` (bắt cả trạng thái giữa chừng). Test mới (i2): mỗi route có hàng sau (`/`, `/phim`, `/rap/SGN1`, `/phim/phim-1`, `/lich-chieu`, `/lich-chieu?cinema=SGN1`) phải có phần tử scrub không phải hàng đầu (không tính footer) đang gắn `scrubPop`, phần tử sâu nhất phải opacity < 1 khi ló mép dưới; thẻ phim hàng sau ở `/phim` phải có clip-path mở dở + opacity trung gian + `beamLine` còn gắn (tia quét có timeline riêng cao 3px nên không lấy mẫu được giữa chừng). Test mới (i3) hồi quy M-1: `/lich-chieu`, `/lich-chieu?cinema=SGN1`, `/phim/phim-1` khối đầu `data-scrub-first` + `animation-name: none`, các khối sau không first + `scrubPop`.
- m-3: mốc cột lưới rạp trong globals.css đổi sang `(width >= 48rem)` / `(width >= 64rem)` (Tailwind v4 dùng rem); lưới phim giữ px ở cả hai phía nhưng đổi `movie-card.module.css` sang `(width < 1024px)` / `(width < 560px)` và globals `(width >= 560px/1024px)` để không hở ở bề rộng lẻ. Test đối chiếu cập nhật.
- Spec 3.6.1: `generateMetadata` của `rap/[code]` và `phim/[slug]` gọi `notFound()` chỉ khi API trả 404 (hàm `loadCinemaDetail`/`loadMovieData` trả `missing`), 5xx/lỗi mạng giữ metadata mặc định; không thêm request (cùng fetch `PUBLIC_CACHE`). Rạp CLOSED/TEMP_CLOSED/COMING_SOON vẫn metadata noindex, không notFound.
- Test: vitest +10 (rap generateMetadata 404/5xx/closed/số request, phim generateMetadata, ShowtimeSchedule `first`, cập nhật bảng cột). Web: 701 pass, 1 fail ngoài phạm vi (`client.test.ts` phủ mã lỗi shared) + 1 lỗi tsc ở `src/lib/api/error-messages.ts`: do `@filmbooking/shared` trong worktree là symlink tới `E:/FilmBooking/packages/shared` của repo gốc, nơi đã có commit CR-017 (thêm CONSENT_VERSION_INVALID, DOB_REQUIRED, SEAT_REQUIRED, DUPLICATE_SEATS, INVALID_SEATS); file đó không thuộc diff này. eslint sạch. Chromium scrub (build `next build --webpack`): 34/34 PASS.
- Đo request thật (next start build worktree + mock API; worktree này chưa có `loading.tsx` của task-01 nên không stream skeleton): `/rap/SAI` và `/phim/slug-sai` trả HTTP 404 + noindex cho cả UA trình duyệt thường và Googlebot; `/rap/SGN1`, `/phim/phim-1` 200 không noindex. Kịch bản "trình duyệt thường 200 + noindex khi có skeleton" chỉ đo được sau khi gộp task-01. Rạp CLOSED/TEMP_CLOSED/COMING_SOON không có trong mock nên chỉ kiểm bằng unit test.
