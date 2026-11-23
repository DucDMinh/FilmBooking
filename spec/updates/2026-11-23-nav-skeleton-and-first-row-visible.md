# Spec Update — 2026-11-23 nav-skeleton-and-first-row-visible
**spec_version:** 3.5.2 → 3.6.0 (MINOR)
**Trigger:** feature-update · CR-016 · classify MODIFY (UI trang khách) · change doc `spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md` · workItem `feature/nav-skeleton-first-row` · risk MEDIUM

## Requirements
- **SỬA NFR-19** (Giao diện & chuyển động): thêm quy tắc **dòng dữ liệu đầu tiên của mỗi mục dữ liệu ở trang khách (phim, suất chiếu/lịch chiếu, rạp) cùng tiêu đề ngay phía trên nó luôn hiện đủ** (opacity 1, không trượt/phóng/wipe), không chờ cuộn mới thấy, kể cả khi mục còn nằm dưới khung nhìn lúc mở trang; chuyển động theo cuộn chỉ áp cho các hàng từ hàng thứ hai trở đi. Các quy tắc cũ của NFR-19 (reduced-motion, dự phòng tĩnh, không CLS ≥ 0.1, không phần tử kẹt ẩn, ngoại lệ hero ghim) giữ nguyên.
- **THÊM NFR-20** (Điều hướng & trạng thái chờ): ở trang khách, bấm điều hướng thì URL đổi và khung trang kèm skeleton hiện ngay, không giữ nguyên trang cũ chờ dữ liệu; skeleton khớp bố cục (không CLS ≥ 0.1), `role="status"`/`aria-busy="true"` + nhãn, shimmer tắt khi `prefers-reduced-motion` và không quá 3 lần/giây; áp cho mọi route khách có tải dữ liệu; lỗi tải vẫn vào trạng thái lỗi hiện có (không kẹt ở skeleton); admin và soát vé ngoài phạm vi; không đổi API/dữ liệu/nghiệp vụ.
- **THÊM AC-35** (CR-016): (a) bấm sang trang khách khác khi API chậm → URL đổi ngay + skeleton cùng bố cục, CLS < 0.1, `aria-busy`, reduced-motion không nhấp nháy, API lỗi hiện trạng thái lỗi; (b) mở trang chủ, `/phim`, `/lich-chieu`, `/rap`, chi tiết phim/rạp ở 390×844 và 1280×800 → dòng dữ liệu đầu tiên + tiêu đề phía trên đủ opacity 1, các hàng sau vẫn hiện dần theo cuộn, AC-32 vẫn đúng.
- Ma trận truy vết: thêm 1 dòng "CR nav-skeleton-and-first-row-visible (2026-11-23)" → NFR-20, NFR-19 sửa, AC-35. Tổng spec 3.6.0: **20/20** NFR, **31/31** AC còn hiệu lực (AC-01…AC-35, AC-20…AC-23 REMOVED); số requirement R-* không đổi (138 mã, 126 còn hiệu lực).
- Không THÊM/SỬA/XOÁ mã R-* nào; không đổi `docs/BRD.md`.

## Hành vi thay đổi (UI web, không đổi API/DB)
1. Hiện tại `apps/web/src/app` không có `loading.tsx`; các trang server component `await apiFetch(...)` rồi mới render nên Next giữ trang cũ tới khi dữ liệu về. Nay có ranh giới loading theo route trang khách (`loading.tsx` / `Suspense`) với skeleton dùng chung khớp bố cục từng trang.
2. `Scrub` (CSS scroll-driven, `globals.css` §"CHUYỂN ĐỘNG THEO CUỘN", `animation-range: entry …`) hiện giữ opacity 0 cho hàng đầu nằm gần mép dưới viewport; nay hàng đầu của mục dữ liệu (và tiêu đề ngay trên nó) hiện tĩnh đầy đủ, các hàng sau giữ hiện dần theo cuộn xuống / thu về khi cuộn lên (CR-010, AC-32).
3. Hành vi nghiệp vụ, API, DB, contract dữ liệu không đổi.

## Ảnh hưởng
- Module: web (`apps/web`: `app/(public)/**/loading.tsx` mới, skeleton dùng chung ở `components/common`, CSS/component Scrub, các trang trang chủ / phim / lịch chiếu / rạp), `.context/design-spec.md` (quy tắc skeleton + ngoại lệ hàng đầu). Có thể thêm/sửa test e2e cuộn (`e2e/scrub`).
- Test (bên test): điều hướng giữa mọi route khách khi API chậm (skeleton hiện ngay, đúng bố cục, CLS < 0.1, `aria-busy`, reduced-motion không shimmer, lỗi API không kẹt skeleton); dòng đầu mỗi mục hiện đủ ở màn đầu (390×844, 1280×800); hồi quy AC-32 (chuyển động theo cuộn từ hàng 2, reduced-motion, không phần tử kẹt ẩn, không thanh cuộn ngang), AC-31 (QuickBookBar), bộ cuộn Playwright (`pnpm exec playwright test -c playwright.scrub.config.ts`).
- Cần soi riêng: `/rap/<mã không tồn tại>` vẫn 404 và `/phim/[slug]`, `/rap/[code]` giữ metadata/JSON-LD khi có `loading.tsx` (streaming có thể đổi mã HTTP/thời điểm metadata).
- Không đổi DB / schema / API contract / nghiệp vụ đặt vé.
- Lưu ý: phát hành ở phase 1 (spec + plan), code chưa build; danh sách file trong scope là dự kiến.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 34, specVersion 3.6.0.
