# Feature cyberplex-reskin · phase-2-task-03 — Trang chủ: hero ghim + `QuickBookBar` (R-138)

- Classification / Risk: ADDITIVE (R-138) + MODIFY. Reviewer **NORMAL** (có truy vấn dữ liệu lịch chiếu mới ở client/server; không đổi API/DB). **Song song** với task-04/05/06 (file rời nhau). Sau phase 1.
- Hợp đồng: `spec/changes/2026-11-19-cyberplex-reskin.md`. Spec: R-138, R-35, R-43, R-44, R-59, R-67, R-137, AC-31, NFR-19. Thiết kế: `.context/design-spec.md` §16.3 (`QuickBookBar`), §16.4 ("Hero ghim"), §16.5; `docs/design/cyberplex/preview.html` (khối `.scene > .pin`, `@keyframes lit/splitL/splitR/qRise/leadOut/armed`).

## Thiết kế
1. `app/(public)/page.tsx` + component hero: cấu trúc `.scene > .pin` (ghim 90svh chỉ khi `min-width:768px` và `min-height:620px`, trong `@supports (animation-timeline: scroll())` + no-preference). Ảnh nền phim nổi bật (`priority`, LCP), kicker, tên phim 2 dòng (dòng 2 outline), meta, CTA. Animation `scroll(root block)` theo bảng "Hero ghim" §16.4 (range tính bằng `svh`). **Mobile/màn thấp: không ghim, `QuickBookBar` sáng sẵn.**
2. `components/catalog/quick-book-bar.tsx` (mới): `<form>` 4 `<select>` gốc có `<label>` (Rạp, Phim, Ngày, Giờ chiếu) + nút "Đặt vé", đặt ở đáy khối banner. Quy tắc đúng như R-138 (spec 3.5.0): **dùng đúng truy vấn/điều kiện lọc của lịch chiếu R-44** (đang bán online, chưa quá mốc đóng bán, rạp đang hoạt động, tỉnh đang chọn, 7 ngày tới); đổi ô trước thì đặt lại các ô sau; ô rỗng hiện "Chưa có suất"; chưa chọn tỉnh thì mở `ProvincePickerDialog`; Guest vẫn điều hướng (R-16 xử lý ở màn chọn ghế); server vẫn quyết định cuối. Chọn lần lượt, ô sau phụ thuộc ô trước; **chỉ liệt kê lựa chọn có suất thật** theo tỉnh đang chọn (R-35), loại suất "Ngừng bán online" (R-67), rạp không hoạt động (R-137), suất đã qua giờ. Dùng **API/hàm lấy dữ liệu lịch chiếu đã có** (tìm bằng `graphify query "lịch chiếu theo tỉnh"`), không thêm endpoint/migration; nếu bắt buộc phải thêm thì ghi `Blocked` và hỏi. Submit đủ 4 ô → điều hướng `/dat-ve/[showtimeId]`; thiếu → lỗi `hud` đỏ dưới thanh, `aria-live`, không điều hướng. Ô chưa sáng vẫn bấm được và **opacity luôn 1** (chỉ lệch vị trí/cỡ, chưa có vạch dưới).
3. Phần dưới hero của trang chủ: section phim (tab Đang chiếu/Sắp chiếu, R-40) và "Rạp yêu thích / Rạp tại {tỉnh}": **chỉ khung bố cục + tiêu đề scrub nhóm B**; thẻ phim/rạp do task-04.
4. Test: logic lọc lựa chọn của `QuickBookBar` (đúng danh sách, phụ thuộc theo ô, lỗi thiếu ô, điều hướng đúng `showtimeId`).

## KHÔNG làm
Không đụng `components/catalog/movie-card|cinema*` (task-04), `booking|ticket|account|auth|admin|staff`, `apps/api`, `supabase`. Không scroll listener.

## Files to Modify
`apps/web/src/app/(public)/page.tsx`, `apps/web/src/components/catalog/quick-book-bar.tsx` (mới) + hero component mới, test.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`; Playwright (script ở scratchpad, kết quả ghi vào Evidence): cuộn `0 → 90svh → 0` đọc computed của `.qfield` (`opacity/translate/scale`) đảo ngược đúng; reduced-motion → mọi thứ hiện đủ.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: trang chủ hero tĩnh, chưa có đặt vé nhanh.
- Expected: AC-31, thanh đặt vé hiện lần lượt trái → phải theo cuộn, đảo ngược khi cuộn lên.
- Actual after: _(builder điền)_
- Evidence: _(builder điền)_
- Status: pending
