# Review: feature-nav-skeleton-first-row / phase-2 / task-01 (round 1)

Agent: reviewer
Worktree: `E:\FilmBooking\.worktrees\feature-nav-skeleton-first-row__phase-2__task-01` (branch `wt/feature-nav-skeleton-first-row__phase-2__task-01`, commit `b7ec119`, base `a698ad6`)

## Review level
NORMAL, có soi thêm theo kiểu STRICT ở một điểm: hành vi HTTP/SEO của route động.

## Reason
Diff chỉ thêm file UI mới (1 component dùng chung, 11 `loading.tsx`, 1 test) và không đụng API, schema hay auth. Tuy vậy `loading.tsx` đổi cách Next 16 stream phản hồi cho **mọi** route trong `(public)`, nên có rủi ro chéo sang trạng thái HTTP (AC-28, R-137) và SEO (R-40, R-44, R-46). Phần này tôi soi kỹ hơn mức NORMAL.

## Blast radius
- Mọi route trong `app/(public)/**`. Riêng `(public)/loading.tsx` bọc Suspense quanh toàn bộ segment con của `(public)/layout.tsx`, nên route **không** có `loading.tsx` riêng cũng bị ảnh hưởng (`dieu-khoan`, `chinh-sach-bao-mat`, `huong-dan-xoa-du-lieu`, `dat-ve/[showtimeId]`, `ve/[bookingCode]`...).
- Không ảnh hưởng `(auth)`, `admin`, `staff`, `apps/api`, `packages/shared` hay `supabase`.

## Scope check
`git diff a698ad6..HEAD --stat` gồm 14 file: `components/common/page-skeleton.tsx`, `components/common/__tests__/page-skeleton.test.tsx`, 11 `loading.tsx` và task file.
- Không đụng `globals.css`, `scrub.tsx`, các `page.tsx`, `catalog/*`, `error.tsx`/`global-error.tsx`/`ErrorState`, auth, layout hay spec. Đạt.
- `dat-ve/don/loading.tsx` nằm ngoài danh sách file của task. Task cho phép thêm ("nếu bố cục khác nhau nhiều thì thêm loading.tsx riêng") và builder đã ghi lý do. Chấp nhận.

## Verify commands + result
Chạy trong worktree. Chỉ được chạy các lệnh trong allowlist; `pnpm --filter ./apps/web ...` bị agent-guard chặn vì không có trong allowlist.

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | `apps/web typecheck: Done` (sạch), `packages/shared` sạch. `apps/api` lỗi TS2307 hàng loạt do `apps/api/node_modules` không có trong worktree (lỗi môi trường, diff không đụng api). |
| `pnpm lint` | PASS (shared, api, web đều Done). |
| `pnpm test` | `packages/shared` 39/39 PASS. `apps/api` fail ngay vì `'vitest' is not recognized` (thiếu node_modules trong worktree), nên `pnpm -r` dừng trước khi có kết quả web. **Reviewer CHƯA tự xác nhận được bộ test web**; builder báo 54 file / 708 test PASS. **Dispatcher phải chạy test web sau merge, ở repo gốc nơi có node_modules.** |
| `pnpm build` | Không chạy (worktree, theo brief). |
| aislop / oxlint / ocr | skip: không nằm trong allowlist verify của reviewer. Repo dùng eslint và lint đã sạch. |

## Findings

### CRITICAL
Không có.

### MAJOR

**M1. Mã rạp/slug phim sai không còn trả HTTP 404 mà thành 200 + noindex (soft 404), lệch AC-28 / R-137 và test-scope v34. Xung đột này nằm ở spec, không sửa trọn được bằng code.**

Bằng chứng trong code:
- `apps/web/src/app/(public)/rap/[code]/page.tsx:135-138`: `fetchCinemaDetail` → `notFound()` gọi **trong page component**.
- `apps/web/src/app/(public)/phim/[slug]/page.tsx:83-86`: tương tự.
- `generateMetadata` của cả hai (`rap/[code]/page.tsx:97-107`, `phim/[slug]/page.tsx:48-57`) **không** gọi `notFound()`, chỉ trả metadata mặc định.
- Trước task này `app/` không có `loading.tsx` nào, nên page nằm trong shell và `notFound()` ném ra trước khi gửi header, cho HTTP 404 (nhánh catch shell trong Next 16.4.6 `dist/server/app-render/app-render.js:2507-2509` đặt `res.statusCode`).
- Sau task, page nằm trong Suspense của `rap/[code]/loading.tsx`, `rap/loading.tsx` và `(public)/loading.tsx`. Với trình duyệt thường (`supportsDynamicResponse=true`), shell gồm layout và skeleton được gửi trước với status 200. `notFound()` xảy ra sau đó, bên trong boundary, nên không còn đường nào sửa được status. Next chỉ chèn `<meta name="robots" content="noindex">` và giao diện not-found. Tài liệu Next (`loading.js` › Status Codes) cũng nói đúng điều này.

Lệch spec:
- R-137 (`SPECIFICATIONS.md:127`): "Mã rạp không tồn tại vẫn 404".
- AC-28 (`SPECIFICATIONS.md:397`): "mã rạp sai vẫn 404".
- `spec/test-scope/current.json:913` (scope v34 của chính CR này) đã cảnh báo: "mã phim/rạp không tồn tại vẫn ra trang 404 (nên kiểm cả mã HTTP, vì khi đã stream có thể là 200 + noindex)".
- `current.json:1072`: "/phim/[slug] slug không tồn tại → 404 như cũ".

Builder không kiểm và không ghi nhận điểm này trong Repro/Residual của task file. Phần đo thực tế chỉ nói về thời gian hiện skeleton.

Cùng hậu quả, mức nhẹ hơn vì đều là trang noindex hoặc nằm trong luồng riêng tư: `dat-ve/[showtimeId]/page.tsx:51`, `dat-ve/don/[id]/ket-qua/page.tsx:23,25`, `ve/[bookingCode]/page.tsx:16,19`.

Vì sao sửa code khó đạt (để builder không đốt attempt vào ngõ cụt):
- **Metadata stream với trình duyệt thường.** Trong Next 16, metadata chỉ chặn (blocking) với UA thuộc `htmlLimitedBots` (`base-server.js:1286`, `shouldServeStreamingMetadata`). Gọi `notFound()` trong `generateMetadata` vì vậy chỉ có thể sửa được cho bot đó; trình duyệt thường vẫn nhận 200.
- **Boundary tổ tiên vẫn còn.** Xoá riêng `rap/[code]/loading.tsx` hoặc `phim/[slug]/loading.tsx` không giải quyết được, vì `rap/loading.tsx`, `phim/loading.tsx` và `(public)/loading.tsx` vẫn bọc segment động. Chỉ cần còn một boundary tổ tiên là shell 200 đã được gửi trước khi `notFound()` chạy.
- **Hệ quả.** NFR-20 (skeleton cho mọi route khách, gồm cả chi tiết phim/rạp) xung đột về cấu trúc với AC-28/R-137 (mã sai vẫn 404) khi Next stream phản hồi. Đây là quyết định spec, không phải lỗi builder sửa được.

Việc cần làm:
1. **Builder đo trước (bắt buộc), ghi vào Evidence.** Dùng request thật (curl/fetch, `next dev` hoặc `start`) tới `/rap/<mã-sai>` và `/phim/<slug-sai>`, mỗi URL với 2 UA: trình duyệt thường và bot (vd Googlebot). Ghi lại status HTTP và có hay không thẻ `<meta name="robots" content="noindex">`. Kiểm thêm theo yêu cầu của test-scope v34:
   - rạp CLOSED/TEMP_CLOSED/COMING_SOON vẫn 200 + thông báo;
   - JSON-LD và lịch chiếu SSR vẫn có trong HTML (R-46).
2. **Escalate cho change-request, không lặp sửa code tới giới hạn 3 attempt.** Session chính/change-request quyết định một trong hai hướng (user duyệt):
   - chấp nhận "200 + noindex" cho mã sai: sửa AC-28/R-137 và test-scope qua CR;
   - hoặc bỏ skeleton cho các route động `phim/[slug]`, `rap/[code]`: sửa phạm vi NFR-20/AC-35 qua CR, kèm bỏ/đổi boundary tổ tiên tương ứng.

   **Không** được tự hạ AC hay tự sửa intent doc cho khớp code.
3. Tuỳ chọn, không thay cho bước 2: gọi `notFound()` trong `generateMetadata` để ít nhất bot thuộc `htmlLimitedBots` nhận 404. Chỉ làm nếu số liệu đo ở bước 1 cho thấy có tác dụng.

### MINOR

**m1. Skeleton `/dat-ve` có một khối không tồn tại trên trang thật, gây dịch bố cục.**
`apps/web/src/app/(public)/dat-ve/loading.tsx:8` vẽ `Skeleton h-5 w-48` ("thẻ rạp"), nhưng trang thật `dat-ve/[showtimeId]/page.tsx:73` chỉ có `<CinemaTag>`, mà component này trả `null` (`lib/monitoring/cinema-tag.tsx:12`). Khi dữ liệu về, stepper, tiêu đề và sơ đồ ghế nhảy lên khoảng 36px (20px khối + 16px gap). Mục tiêu "không nhảy bố cục" (NFR-20) và giới hạn CLS < 0.1 nên bỏ khối này.

**m2. `(public)/loading.tsx` (skeleton trang chủ: hero cao gần full màn hình, lưới phim, lưới rạp) là fallback cho mọi route `(public)` không có `loading.tsx` riêng.**
Builder đã ghi nhận ở Residual (2). Cần kiểm thêm: khi điều hướng client từ một segment cấp 1 sang segment khác (vd `/phim` → `/rap/HAN1`), Next 16 có thể hiện skeleton trang chủ trước rồi mới tới skeleton đúng của route. Builder báo "skeleton hiện" nhưng không ghi **skeleton nào**. Đề nghị ghi rõ trong Evidence khi đo lại. Nếu thấy skeleton trang chủ chớp lên thì đó là nhảy bố cục, đáng sửa.

**m3. Lệch nhỏ so với bố cục thật.**
- `CinemaGridSkeleton` dùng `gap-4 md:gap-6` (`page-skeleton.tsx:77`), còn `/rap` thật dùng `gap-6` ở mọi breakpoint (`rap/page.tsx:124`).
- Skeleton `rap/[code]` thiếu tiêu đề section "Vị trí trên bản đồ" phía trên khối bản đồ `h-56` (`rap/[code]/loading.tsx:22` so với `page.tsx:309-317`).

Dịch chuyển nhỏ, không chặn.

**m4. Stepper thật nằm trong vùng `role="status"` (`dat-ve/loading.tsx:9`, `lich-chieu/loading.tsx:14`).**
`nav` có aria-label dài nằm trong live region, nên một số trình đọc màn hình có thể đọc cả tiến trình cùng nhãn tải. Không sai luật "1 role=status", ghi để cân nhắc.

## Kiểm theo checklist của brief
1. Bố cục: nhìn chung khớp. `MovieGridSkeleton` dùng chính `MovieGrid` nên số cột đúng. Chi tiết phim dùng `md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]` giống trang thật. Hai chỗ lệch là m1 và m3.
2. A11y: mỗi `loading.tsx` có đúng 1 `role=status` + `aria-busy="true"` + nhãn sr-only tiếng Việt có dấu. Các khối `Skeleton` đều `aria-hidden`. Không `data-scrub`, không nội dung giả. Đạt.
3. Không có `"use client"`, không hex thô, không em-dash trong chuỗi hiển thị. Shimmer dùng `animate-pulse motion-reduce:animate-none`. Đạt.
4. Không đụng `error.tsx`/`ErrorState`. Lỗi ném ra vẫn tới `app/error.tsx`; `ErrorState` inline thay skeleton khi page resolve. Đạt.
5. Phủ đủ 9 nhóm route của NFR-20 (+ `dat-ve/don`), không đụng file ngoài scope. Đạt.
6. Test (`page-skeleton.test.tsx`): mỗi `loading.tsx` render được, có 1 status, `aria-busy`, nhãn, không scrub, không chữ số/lorem. Hợp lý, không rỗng. Test không phủ được hành vi stream/HTTP (M1), vì chuyện đó cần đo bằng request thật.
7. Rủi ro build/HTTP: xem M1 (MAJOR).

## Verdict
**FAIL**: 1 MAJOR (M1: soft 404 lệch AC-28/R-137 và test-scope v34, builder không kiểm; cần đo thật rồi escalate quyết định spec qua change-request), 4 MINOR (nên sửa m1). Sau khi có quyết định spec cho M1 thì review lại round 2. Test web phải chạy lại ở repo gốc sau merge.
