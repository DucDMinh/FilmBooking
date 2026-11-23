# Spec Update — 2026-11-23 nav-skeleton-and-first-row-visible
**spec_version:** 3.5.2 → 3.6.1 (MINOR 3.6.0, rồi PATCH 3.6.1 làm rõ hệ quả HTTP status của skeleton; gộp trong cùng một delta vì cùng CR)
**Trigger:** feature-update · CR-016 · classify MODIFY (UI trang khách) · change doc `spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md` · workItem `feature/nav-skeleton-first-row` · risk MEDIUM
**Lịch sử phát hành:** 3.6.0 (scope v34, phase 1, spec + plan, code chưa build) → 3.6.1 (scope v35, đã hiện thực + merge + kiểm chứng Playwright)

## Requirements
### 3.6.0 (MINOR, đã phát hành scope v34)
- **SỬA NFR-19** (Giao diện & chuyển động): thêm quy tắc **dòng dữ liệu đầu tiên của mỗi mục dữ liệu ở trang khách (phim, suất chiếu/lịch chiếu, rạp) cùng tiêu đề ngay phía trên nó luôn hiện đủ** (opacity 1, không trượt/phóng/wipe), không chờ cuộn mới thấy, kể cả khi mục còn nằm dưới khung nhìn lúc mở trang; chuyển động theo cuộn chỉ áp cho các hàng từ hàng thứ hai trở đi. Các quy tắc cũ của NFR-19 (reduced-motion, dự phòng tĩnh, không CLS ≥ 0.1, không phần tử kẹt ẩn, ngoại lệ hero ghim) giữ nguyên.
- **THÊM NFR-20** (Điều hướng & trạng thái chờ): ở trang khách, bấm điều hướng thì URL đổi và khung trang kèm skeleton hiện ngay, không giữ nguyên trang cũ chờ dữ liệu; skeleton khớp bố cục (không CLS ≥ 0.1), `role="status"`/`aria-busy="true"` + nhãn, shimmer tắt khi `prefers-reduced-motion` và không quá 3 lần/giây; áp cho mọi route khách có tải dữ liệu; lỗi tải vẫn vào trạng thái lỗi hiện có (không kẹt ở skeleton); admin và soát vé ngoài phạm vi; không đổi API/dữ liệu/nghiệp vụ.
- **THÊM AC-35** (CR-016): (a) bấm sang trang khách khác khi API chậm → URL đổi ngay + skeleton cùng bố cục, CLS < 0.1, `aria-busy`, reduced-motion không nhấp nháy, API lỗi hiện trạng thái lỗi; (b) mở trang chủ, `/phim`, `/lich-chieu`, `/rap`, chi tiết phim/rạp ở 390×844 và 1280×800 → dòng dữ liệu đầu tiên + tiêu đề phía trên đủ opacity 1, các hàng sau vẫn hiện dần theo cuộn, AC-32 vẫn đúng.
- Ma trận truy vết: thêm 1 dòng "CR nav-skeleton-and-first-row-visible (2026-11-23)" → NFR-20, NFR-19 sửa, AC-35. Tổng spec 3.6.0: **20/20** NFR, **31/31** AC còn hiệu lực (AC-01…AC-35, AC-20…AC-23 REMOVED); số requirement R-* không đổi (138 mã, 126 còn hiệu lực).

### 3.6.1 (PATCH, scope v35 — làm rõ, không THÊM/SỬA/XOÁ mã R-* nào)
- **LÀM RÕ R-137**, **AC-28**, **NFR-20** về hệ quả của skeleton: với mã rạp (`/rap/<mã>`) hoặc slug phim (`/phim/<slug>`) **không tồn tại**, **mọi client** (trình duyệt thường, Googlebot, Bingbot) nhận **HTTP 200 + `noindex` + giao diện "không tìm thấy"**, không phải 404. Lý do: khung trang và skeleton (NFR-20) được stream trước khi biết mã sai, nên `notFound()` trong `generateMetadata` không đổi được mã HTTP. Đã đo bằng Playwright (Chrome, Googlebot, Bingbot); `noindex` ngăn công cụ tìm kiếm lập chỉ mục. User chấp nhận 2026-11-23. Rạp `CLOSED`/`TEMP_CLOSED`/`COMING_SOON` vẫn 200 + thông báo (R-137, không đổi).
- Spec 3.6.0 giả định ban đầu (bot nhận 404) bị thay thế bởi 3.6.1; kết quả đo thực tế là lý do của bản PATCH.
- R-137 (trang rạp không hoạt động) được làm rõ thêm: trang gắn `noindex` (không lập chỉ mục). Đây là hành vi đã chạy từ CR-009 (cinema-status-notice) và được đo ở test (5c); bổ sung chỉ để spec khớp as-built, không phải requirement mới.
- Không đổi `docs/BRD.md`; số đếm tổng spec giữ như 3.6.0 (20/20 NFR, 31/31 AC, 138 mã R-*, 126 còn hiệu lực).

## Hành vi thay đổi (UI web, không đổi API/DB)
1. Trước: `apps/web/src/app` không có `loading.tsx`; trang server component `await apiFetch(...)` rồi mới render nên Next giữ trang cũ tới khi dữ liệu về. Nay: 11 ranh giới `loading.tsx` theo route trang khách + skeleton dùng chung `PageSkeleton` khớp bố cục từng trang.
2. `Scrub` (CSS scroll-driven, `globals.css` §"CHUYỂN ĐỘNG THEO CUỘN") trước đây giữ opacity 0 cho hàng đầu nằm gần mép dưới viewport. Nay hàng dữ liệu đầu + tiêu đề phía trên hiện tĩnh đầy đủ (đánh dấu `data-scrub-first`, `data-scrub-grid` theo số cột thật từng breakpoint; `ShowtimeSchedule` nhận prop `first`, chỉ khối suất đầu ở trang đầu); các hàng sau giữ hiện dần theo cuộn xuống / thu về khi cuộn lên (CR-010, AC-32). Mốc cột lưới rạp quy đổi theo `rem`.
3. `/phim/[slug]` và `/rap/[code]`: `generateMetadata` gọi `notFound()` khi API trả 404 (metadata `noindex`); vì khung đã stream nên mã HTTP vẫn 200 (xem 3.6.1).
4. Hành vi nghiệp vụ, API, DB, contract dữ liệu không đổi.

## File thật đã đổi (từ `git log a698ad6..HEAD`, chỉ phần CR-016; không gồm CR-017 và script seed tooling)
- Skeleton điều hướng (task-01, `b7ec119`, `49c67c5`): `apps/web/src/app/(public)/loading.tsx`; `(public)/phim/loading.tsx`, `phim/[slug]/loading.tsx`, `lich-chieu/loading.tsx`, `rap/loading.tsx`, `rap/[code]/loading.tsx`, `dat-ve/loading.tsx`, `dat-ve/don/loading.tsx`, `ve/loading.tsx`, `ve/[bookingCode]/loading.tsx`, `tai-khoan/loading.tsx`; `apps/web/src/components/common/page-skeleton.tsx` + `__tests__/page-skeleton.test.tsx`.
- Hàng đầu hiện tĩnh + notFound (task-02, `9ff8886`, `10ab08e`): `apps/web/src/app/globals.css`; `apps/web/src/components/motion/scrub.tsx` + `__tests__/scrub.test.tsx`; `apps/web/src/components/catalog/movie-card.tsx`, `movie-card.module.css`, `section-heading.tsx`, `showtime-schedule.tsx`, `__tests__/schedule.test.tsx`; trang `apps/web/src/app/(public)/page.tsx`, `phim/page.tsx`, `phim/[slug]/page.tsx` + `__tests__/page.test.tsx`, `lich-chieu/page.tsx`, `rap/page.tsx`, `rap/[code]/page.tsx` + `__tests__/page.test.tsx`; `e2e/scrub/scrub.spec.ts`.
- Kiểm chứng end-to-end (task-03, `edb2f18`, `618b84a`): `e2e/scrub/nav-skeleton.spec.ts` (mới), `e2e/scrub/mock-api.mjs` (làm chậm API qua env), `e2e/scrub/README.md`, `playwright.scrub.config.ts`.
- Tài liệu/spec: `SPECIFICATIONS.md` (3.6.0 rồi 3.6.1), `.context/design-spec.md` (§16.4 ngoại lệ hàng đầu + quy tắc skeleton), `spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md`, task files `tasks/feature-nav-skeleton-first-row/phase-2-task-01.md`, `phase-2-task-02.md`, `phase-3-task-03.md`.
- Ghi chú: `scripts/seed-showtimes-week.mjs` + `supabase/seed/README.md` (commit `06b6de2`) là tooling seed suất chiếu để chạy thử, không thuộc scope test và không đổi spec.

## Ảnh hưởng
- Module: web (`apps/web`: `app/(public)/**/loading.tsx`, `components/common/page-skeleton`, `components/motion/scrub`, `components/catalog/*`, các trang trang chủ / phim / chi tiết phim / lịch chiếu / rạp / chi tiết rạp, `globals.css`), `.context/design-spec.md`, bộ cuộn Playwright `e2e/scrub`.
- Test (bên test): điều hướng giữa mọi route khách khi API chậm (skeleton hiện ngay, đúng bố cục, CLS < 0.1, `aria-busy`, reduced-motion không shimmer, lỗi API không kẹt skeleton); dòng đầu mỗi mục hiện đủ ở màn đầu (390×844, 768×1024, 1280×800, 1440×900, 1920×1080); **mã rạp/slug phim sai: HTTP 200 + `noindex` + giao diện không tìm thấy cho mọi client (kể cả Googlebot, Bingbot)**; rạp đóng cửa 200 + thông báo; hồi quy AC-32, AC-31, AC-28. Chạy: `pnpm exec playwright test -c playwright.scrub.config.ts` (task-03 ghi 55 passed gồm `nav-skeleton.spec.ts` 20 test + `scrub.spec.ts` 35 test; test (5b) đã sửa theo 3.6.1, không còn `test.fail`).
- Số đo (Chromium 1280×800, API chậm 1500ms, task-03): URL đổi + skeleton hiện 25–50ms sau click ở /phim, /lich-chieu, /rap, /rap/SGN1, /phim/phim-1; CLS lúc thay skeleton bằng nội dung 0.0000; lỗi API 500 thì skeleton biến mất sau ~1,5s, không kẹt; reduced-motion 0 animation đang chạy trên skeleton.
- Không đổi DB / schema / API contract / nghiệp vụ đặt vé.

## Residual
- **Bot không nhận 404** cho mã rạp/slug phim sai vì khung trang được stream trước khi biết mã sai (skeleton `loading.tsx`). Cách duy nhất để có 404 thật là **bỏ skeleton ở `/rap/[code]` và `/phim/[slug]`** (đánh đổi NFR-20 ở hai route này). User đã chấp nhận 200 + `noindex` (2026-11-23).
- Một lần đo `/phim/phim-1` có CLS 0.3675 tính cả shift sát lúc nhấn (`hadRecentInput`, không vào CLS chuẩn), do trang chủ đã cuộn xuống rồi skeleton ngắn hơn (chân trang dịch); không lặp lại ở lần chạy cuối.
- `/rap` và trang chủ cache chi tiết mọi rạp 60s nên `/rap/<mã>` chỉ "lạnh" khi đi từ trang không gọi API rạp; `/lich-chieu` lỗi 500 chỉ kiểm tiêu đề, không kiểm chữ lỗi riêng.
- Chưa kiểm bằng Lighthouse/axe chính thức; Firefox/Safari không có scroll-driven animations (dự phòng tĩnh, chấp nhận theo CR-010).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 35, specVersion 3.6.1 (thay scopeVersion 34 / 3.6.0).
