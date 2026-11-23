# Review: feature-nav-skeleton-first-row / phase-2 / task-01 (round 2)

Agent: reviewer
Worktree: `E:\FilmBooking\.worktrees\feature-nav-skeleton-first-row__phase-2__task-01` (fix commit `49c67c5`, sau `b7ec119`, base `a698ad6`)

## Review level
NORMAL, xác nhận hẹp các finding của round 1.

## Reason
Phần sửa của round 2 chỉ chạm 4 file `loading.tsx`, `page-skeleton.tsx` (thêm prop `gapClassName`), test và task file. Không đụng API, schema, auth hay `page.tsx`. M1 đã được user chấp nhận theo spec 3.6.1 nên không còn là rủi ro cần soi kiểu STRICT.

## Blast radius
- `CinemaGridSkeleton` có prop mới `gapClassName`, mặc định vẫn là `gap-4 md:gap-6`, nên trang chủ giữ nguyên. Chỉ `/rap` truyền `gap-6`.
- Skeleton của `/dat-ve`, `/lich-chieu` và `/rap/[code]`. Không ảnh hưởng gì ngoài `(public)`.

## Scope check
`git diff --stat a698ad6..HEAD` vẫn gồm đúng 14 file như round 1, không thêm file nào ngoài scope. `git diff b7ec119..HEAD` chỉ sửa `dat-ve/loading.tsx`, `lich-chieu/loading.tsx`, `rap/[code]/loading.tsx`, `rap/loading.tsx`, `page-skeleton.tsx`, `page-skeleton.test.tsx` và task file. Đạt.

## Verify commands + result
Tất cả chạy trong `apps/web` của worktree.

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (`tsc --noEmit` sạch) |
| `pnpm lint` | PASS (`eslint src` sạch) |
| `pnpm test` | PASS: 54 file, 710 test (round 1 có 708 test, round này thêm 2 ca stepper aria-hidden). Lần này reviewer đã tự xác nhận được bộ test web. |
| aislop / oxlint / ocr | skip, không nằm trong allowlist verify của reviewer |

## Xác nhận từng finding round 1

- **M1 (soft 404 do `loading.tsx`)**: user đã chấp nhận (2026-11-23, spec 3.6.1). Không tính là lỗi. Task file có dòng "Residual M1 (ĐÃ CHẤP NHẬN...)". Dòng này nêu rõ 200 + noindex với trình duyệt thường, không gỡ `loading.tsx`, việc `notFound()` trong `generateMetadata` thuộc task-02, và kèm hệ quả nhẹ hơn ở `dat-ve/[showtimeId]`, `dat-ve/don/[id]/ket-qua`, `ve/[bookingCode]`. Đạt.
- **m1**: `dat-ve/loading.tsx` đã bỏ `Skeleton h-5 w-48`. Comment ghi lý do (`CinemaTag` thật trả null). Import `Skeleton` vẫn được dùng ở các khối dưới, lint sạch. Đạt.
- **m2**: Evidence có số đo bằng trình duyệt thật (API trễ 3s, MutationObserver ghi chuỗi nhãn skeleton) cho 6 cặp điều hướng khác nhóm route: `/phim`→`/rap/DAD1`, `/rap`→`/phim/phim-3`, `/lich-chieu`→`/rap/HAN1`, `/rap/SGN1`→`/phim?q=`, `/phim/phim-1`→`/rap?province=DN`, `/`→`/lich-chieu?movie=`. Ở mỗi cặp chỉ thấy nhãn của đúng route đích, không thấy "skeleton trang chủ" chớp lên. Phương pháp này trả lời trực tiếp câu hỏi của round 1 (skeleton **nào** hiện) và phủ cả hai chiều chi tiết ↔ danh sách, nên tôi chấp nhận kết luận "không cần chỉnh thêm". Hạn chế: đo trên `next dev --webpack`, chưa đo trên bản build production. Reviewer không tự chạy lại được vì ngoài quyền verify. Ghi ở Residual, không chặn.
- **m3**: `CinemaGridSkeleton` nhận `gapClassName` qua `cn(...)`, mặc định giữ nguyên. `rap/loading.tsx` truyền `gap-6`, khớp `rap/page.tsx`. `rap/[code]/loading.tsx` bọc bản đồ trong `section.space-y-3` gồm `SectionHeadSkeleton` và khối `h-56`, khớp cấu trúc thật ở `rap/[code]/page.tsx:309-317` (`section.space-y-3` gồm `SectionHeading` và `CinemaMap`). Đạt.
- **m4**: stepper ở `dat-ve/loading.tsx` và `lich-chieu/loading.tsx` đã bọc `<div aria-hidden="true">`. Tôi kiểm `booking-stepper.tsx`: không có link, button hay tabIndex, nên `aria-hidden` không che phần tử focus được (không vi phạm quy tắc aria-hidden-focus). Test mới kiểm `nav.closest("[aria-hidden='true']")`. Đạt.

## Hồi quy
- Mỗi `loading.tsx` vẫn chỉ có đúng 1 `role=status`: bộ test `describe.each(ROUTE_LOADINGS)` vẫn PASS, và phần sửa không thêm vùng status nào.
- Diff không thêm `data-scrub`, `"use client"`, hex thô hay em-dash trong chuỗi hiển thị.
- Không đụng file ngoài scope.

## Findings
- CRITICAL: không có.
- MAJOR: không có. M1 đã được user chấp nhận và có ghi Residual.
- MINOR: không có finding mới.

## Residual
- Số đo m2 lấy từ `next dev --webpack`. Dispatcher nên chạy `pnpm build` ở repo gốc sau merge, như đã ghi ở round 1.
- `notFound()` trong `generateMetadata` (để bot nhận 404) là việc của task-02.

## Verdict
**NORMAL PASS**
