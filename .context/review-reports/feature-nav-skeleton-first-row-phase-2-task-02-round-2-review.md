# Review: feature-nav-skeleton-first-row / phase-2 / task-02, round 2

Agent: reviewer

- Worktree: `E:\FilmBooking\.worktrees\feature-nav-skeleton-first-row__phase-2__task-02`, fix commit `10ab08e` (sau `9ff8886`, base `a698ad6`)
- Phạm vi soát: `git diff 9ff8886..HEAD`, gồm 12 file. Đối chiếu với report round 1, SPECIFICATIONS 3.6.1 (R-137, AC-28, NFR-19, NFR-20) và mục "Fix round 2" trong task file.

## Review level
**STRICT**

## Reason
- Diff đụng `globals.css`, phần chuyển động theo cuộn dùng chung cho mọi trang khách.
- Diff đụng component dùng chung `ShowtimeSchedule`.
- Diff đổi hành vi HTTP status/SEO của `generateMetadata` ở 2 route động (spec 3.6.1).
- Round 1 có 2 MAJOR, round này phải xác nhận đã đóng.

## Blast radius
- Các trang bị ảnh hưởng: `/phim/[slug]`, `/lich-chieu` (cả `?cinema=`), `/rap/[code]`, và mọi trang có `[data-scrub-grid]` (`/`, `/phim`, `/rap`).
- Không bị đụng: hero, `QuickBookBar`, `/dat-ve/*`, admin/staff, API. Đã kiểm theo danh sách file trong diff.

## Verify commands + result
| Lệnh (trong `apps/web` của worktree) | Kết quả |
|---|---|
| `pnpm typecheck` | Có đúng 1 lỗi: `src/lib/api/error-messages.ts(7,14)` thiếu `CONSENT_VERSION_INVALID, DOB_REQUIRED, SEAT_REQUIRED, DUPLICATE_SEATS, INVALID_SEATS`. Đây là lỗi môi trường (symlink `@filmbooking/shared` trỏ về repo gốc đã có CR-017), không thuộc task-02. Không có lỗi nào khác |
| `pnpm lint` | PASS (eslint sạch) |
| `pnpm test` | 701 pass / 1 fail. Test fail duy nhất là `client.test.ts > phủ toàn bộ mã lỗi shared`, cùng nguyên nhân môi trường ở trên. Không có test fail nào khác |
| `pnpm exec playwright test -c playwright.scrub.config.ts` | Hook allowlist chặn. Reviewer **chưa tự kiểm** con số 34/34; chỉ có evidence của builder. Số lượng khớp: 25 − 4 test (i) cũ + 5 (i) + 5 (i2) + 3 (i3) = 34 |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, không có trong allowlist / chưa cài |

## Xác nhận từng điểm

### M-1: ĐÃ ĐÓNG
- `showtime-schedule.tsx`: thêm prop `first?: boolean`, mặc định `false` (`:39`, `:144`). Khối rạp chỉ nhận cờ khi `first && groupIndex === 0` (`:229`).
- Các nơi truyền `first`:
  - `/phim/[slug]` truyền `first` qua `MovieShowtimeSchedule` (`page.tsx:231`). Prop được spread xuống `ShowtimeSchedule` (`movie-showtime-schedule.tsx:16,26`), và `first` nằm trong `ShowtimeScheduleProps`.
  - `/lich-chieu` chế độ mặc định: `MovieResults` chỉ truyền `first={index === 0}` (`lich-chieu/page.tsx:202`).
  - `/lich-chieu?cinema=`: `CinemaResults` chỉ truyền `first={movieIndex === 0}` (`:154`).
- Không còn nơi gọi nào khác. Grep cho thấy `ShowtimeSchedule` ở admin là component khác, cùng tên.
- `/rap/[code]` không đổi so với round 1 (`index === 0`, `:375`).
- Có unit test cho cả mặc định (không có `data-scrub-first`) và `first` (chỉ khối đầu) (`schedule.test.tsx:241-273`).

### M-2: ĐÃ ĐÓNG
Assertion là thật, không rỗng:
- **(i)**:
  - Chạy thêm cỡ `768x1024`, phủ khoảng 560-1023px. m-1 đã đóng.
  - Clip của hàng đầu giờ báo lỗi khi `!== "none"`. m-2 đã đóng.
  - `MARK_FIRST_ROW_SCRIPT` xác định hàng đầu của lưới theo **bố cục thật** (top nhỏ nhất), không theo quy tắc CSS. Vì vậy test kiểm độc lập: nếu mốc breakpoint CSS lệch với số cột thật, thẻ cuối hàng 1 sẽ còn scrub và test fail.
- **(i2)**:
  - Mỗi route phải có ít nhất một `[data-scrub]` không phải hàng đầu, nằm ngoài footer, đang gắn `scrubPop`. Không có thì ghi problem.
  - Phần tử sâu nhất phải có opacity < 0.999 khi đỉnh nằm cách mép dưới 40px.
  - Có chốt `hiddenChecked > 0`, nên test không pass rỗng khi mọi route bị bỏ qua.
  - Ở `/phim`, test quét từng 12px và yêu cầu thấy clip poster mở dở, thấy opacity trung gian, và `beamLine` còn gắn.
  - Tên keyframe `scrubPop`/`beamLine` khớp `globals.css:410,419,444,455`.
- **(i3)**:
  - Kiểm `/lich-chieu`, `/lich-chieu?cinema=SGN1`, `/phim/phim-1`, mỗi route cần ít nhất 2 khối.
  - Khối đầu phải có `data-scrub-first` và `animation-name: none`; các khối sau không có cờ và vẫn chạy `scrubPop`.
  - Đây là test bắt đúng lỗi M-1.
- Rủi ro flaky: thấp. Test dựa vào lấy mẫu theo bước cuộn, dùng `markDeepestLaterScrub` đánh dấu bằng thuộc tính (chống dịch bố cục khi ảnh tải xong), và bỏ qua route ngắn hơn khung nhìn.

### m-3 (px vs rem): ĐÃ ĐÓNG
- Lưới rạp:
  - `globals.css:485` dùng `(width >= 48rem)` và `:497` dùng `(width >= 64rem)`, khớp `md`/`lg` của Tailwind v4.
  - Tách thành `@media` riêng, tách khỏi mốc 1024px của lưới phim. Đúng, vì khi đổi cỡ chữ thì 64rem ≠ 1024px.
- Lưới phim:
  - `movie-card.module.css` dùng `(width < 1024px)`/`(width < 560px)`, còn `globals.css:479,491` dùng `(width >= 560px)`/`(width >= 1024px)`. Hai bên đối ngẫu chính xác.
  - Ở 1023.5px: `< 1024` đúng nên lưới 3 cột, `>= 1024` sai nên quy tắc hàng đầu dùng 3 thẻ. Ở 559.5px: lưới 2 cột, quy tắc dùng 2 thẻ. Không còn khe.
- Thứ tự CSS:
  - Mọi khối mốc đều chỉ **thêm** thẻ (`nth-child(-n + k)` với k tăng dần) và đặt `animation: none`. Không có quy tắc nào gỡ.
  - Vì vậy thứ tự giữa các `@media` không ảnh hưởng kết quả. Tất cả vẫn đứng sau các quy tắc `animation-name` (`:444-455`) và nằm trong cổng reduced-motion + `@supports`.
  - Range syntax được mọi trình duyệt có `animation-timeline: view()` hỗ trợ.

### Spec 3.6.1 (`generateMetadata` + `notFound()`): ĐẠT
- `rap/[code]/page.tsx:87-111`:
  - `loadCinemaDetail` trả `missing` chỉ khi `ApiError` có `status === 404`. Khi đó `generateMetadata` gọi `notFound()`.
  - Lỗi 5xx/mạng: `missing=false`, giữ metadata "Không tìm thấy rạp" như cũ.
  - Rạp khác `OPEN` vẫn trả metadata `robots: { index: false, follow: true }`, không gọi `notFound`.
- `phim/[slug]/page.tsx:31-60`: cùng mẫu với rạp. `missing` thêm điều kiện `code === "NOT_FOUND"`, giữ nguyên điều kiện cũ; API chỉ trả mã này kèm 404.
- Không có request thừa:
  - `generateMetadata` vẫn gọi đúng 1 fetch với cùng URL/tham số như trước khi sửa.
  - Thân trang vẫn gọi `fetchCinemaDetail`/`fetchMovieData` như cũ. Đây là wrapper mỏng, hành vi giữ nguyên: `null` thì `notFound()` (`rap:146-149`, `phim:93-96`).
- Test: rạp có đủ 404 / 5xx / lỗi mạng / CLOSED·TEMP_CLOSED·COMING_SOON / đếm request = 1; phim có 404 / 5xx / mạng / có dữ liệu.

### Không hồi quy
- Các test AC-32 (cuộn hết trang), reduced-motion, focus, perf, a11y không bị sửa trong diff này.
- Quy tắc `:focus-within` (`globals.css:446-451`) không đổi.
- Hero, `QuickBookBar`, `/dat-ve` không bị đụng.

## Findings

### CRITICAL
Không có.

### MAJOR
Không có.

### MINOR
- **m-a.** Test đếm request (`rap/[code]/__tests__/page.test.tsx`, "chỉ 1 request API cho metadata") chỉ chứng minh `generateMetadata` tự nó gọi 1 lần.
  - Test không chứng minh việc dùng chung cache với thân trang. Điều đó phụ thuộc Next fetch cache, và ngày của thân trang có thể khác `today`.
  - Kết luận "không thêm request" vẫn đúng, nhưng là do đọc code, không phải do test chứng minh.
  - Phía phim không có test đếm request. Không chặn.
- **m-b (residual risk, không chặn).** Builder đo được 404 cho cả UA thường lẫn Googlebot trên worktree **chưa có** `loading.tsx`.
  - Kịch bản theo spec, tức trình duyệt nhận 200 + `noindex` + UI không tìm thấy khi đã có skeleton, chỉ kiểm được sau khi gộp task-01.
  - Nên chạy lại phép đo `curl` 2 UA trên integration branch.
- **m-4 (từ round 1, còn mở).** Cơ chế `data-scrub-grid` cần bổ sung vào design-spec §16.4 ở bước doc reconcile.

## AI-readable gate
Đạt.
- Comment giải thích lý do (WHY).
- Tên `loadX`/`missing` rõ nghĩa, có JSDoc.
- Không có hàm dài thêm, không có magic number mới ngoài các mốc breakpoint đã chú thích.

## Verdict
**STRICT PASS**
- M-1 và M-2 đã đóng, có test hồi quy thật. m-1, m-2, m-3 đã đóng. Spec 3.6.1 đã được triển khai đúng phạm vi.
- Lỗi typecheck/test duy nhất do môi trường CR-017 (symlink shared), không thuộc task-02.
- Còn lại: e2e Playwright 34/34 chưa được reviewer tự chạy vì hook allowlist chặn; chỉ dựa vào evidence của builder.
