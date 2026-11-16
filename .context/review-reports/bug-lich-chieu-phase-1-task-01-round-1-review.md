Agent: reviewer

# Review — bug lich-chieu · phase-1-task-01 · round 1

- **Review level:** NORMAL
- **Reason:** UI public, không đụng auth/DB/schema/payment. Có sửa component dùng chung `ShowtimeSchedule` (dùng ở `/phim/[slug]`), nên phải kiểm tra hồi quy ở trang đó.
- **Blast radius:** `/lich-chieu` (viết lại), `/phim/[slug]` (qua `ShowtimeSchedule` + `ScheduleDateStrip`), `lib/vn-date.ts` (`resolveScheduleDate` mới; `getVnDateString` không đổi).
- **Scope reviewed:** `apps/web/src/app/(public)/lich-chieu/page.tsx`, `.../lich-chieu/__tests__/page.test.tsx`, `apps/web/src/components/catalog/schedule-filters.tsx`, `.../__tests__/schedule-filters.test.tsx`, `showtime-schedule.tsx`, `.../__tests__/schedule.test.tsx`, `apps/web/src/lib/vn-date.ts`. Đối chiếu với API thật: `apps/api/src/modules/catalog/{movies,cinemas}.controller.ts`, `movies.service.ts:246-273`, `apps/api/src/common/pipes/zod-validation.pipe.ts`, `packages/shared/src/schemas/catalog.ts:25-38,151-152`.
- **Ngoài phạm vi (không tính cho task):** `components/shell/site-header.tsx`, `admin/__tests__/shell.test.tsx`, `apps/web/AGENTS.md`, `.context/runs/build-filmbooking-layer-8.md`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | shared 31/31 PASS; api 483/483 PASS; web 520/521: 1 fail `common.test.tsx > SiteHeader > đã đăng nhập: link tài khoản trỏ /tai-khoan` (`useRouter` không có trong mock, do `SignOutButton` mới ở `site-header.tsx`). Lỗi này **ngoài phạm vi**. Vì `&&` dừng ở bước fail, `node --test scripts/*.test.mjs` **không chạy**. |
| `pnpm build` | Không chạy lại (tránh đụng `.next` của dev server). Dùng evidence build PASS của builder. |
| aislop / oxlint / ocr | skip: chưa cấu hình trong project-config (oxlint not configured, ocr not installed). |
| Script phụ kiểm tra chuẩn hoá URL bằng `node -e` | bị agent-guard chặn (ngoài allowlist), không chạy. Kết luận F1 dựa trên đặc tả WHATWG URL + đọc code. |

## Findings

### F1 — MAJOR: `?movie=.` hoặc `?cinema=.` làm trang `/lich-chieu` lỗi 500 (path dot-segment chưa được chặn)
- Vị trí: `apps/web/src/app/(public)/lich-chieu/page.tsx` (hàm `fetchMovieSchedule` ~l.56-60, `fetchCinemaDetail` ~l.62-68, `loadMovieBlocks` ~l.148-151, `CinemaResults` ~l.84).
- Chuỗi gây lỗi:
  1. `encodeURIComponent` **không** mã hoá `.`, nên `?movie=.` tạo ra `/movies/.?date=…`.
  2. `fetch` (WHATWG URL) chuẩn hoá dot-segment thành `/movies/?date=…`.
  3. Nest/Express routing không strict, nên route `GET movies` (list) khớp.
  4. `listMoviesQuerySchema` là `z.object` thường, **strip** key lạ `date` (`zod-validation.pipe.ts:11-12`). Kết quả: 200 kèm `MovieDto[]`.
  5. Khi đã chọn phim thì `loadMovieBlocks` bỏ qua `hasShowtimeOnDate` (l.150). Mảng đó thành `data`, `MovieBlock` đọc `data.movie.ageRating`, ném TypeError, trang lỗi 500.
- Nhánh rạp tương tự: `?cinema=.` gọi `/cinemas/?date=…`, khớp list `CinemaDto[]`. `fetchCinemaDetail` không ném lỗi nên trả về mảng, rồi `CinemaResults` gọi `detail.showtimes.filter` trên `undefined`, trang lỗi 500.
- Ghi chú:
  - `..` hoặc `../../x` an toàn: `%2F` vẫn nằm trong một segment và bị regex slug/code của API trả 400; `..` lên tới root thì 404. Cả hai về EmptyState.
  - Lỗi này đã có trước (code cũ còn không encode). Nhưng builder đã viết lại đúng các dòng này và thêm `encodeURIComponent` như một lớp hardening chưa đủ. Task cũng yêu cầu tham số URL rác không được gây 500.
  - Không có rủi ro bảo mật: GET public, không gửi token. Đây là lỗi độ bền.
- Hướng sửa gợi ý: trước khi fetch, validate `movie` bằng `slugParamSchema.safeParse` và `cinema` bằng `codeParamSchema.safeParse` từ `@filmbooking/shared/schemas/catalog` (code thuần, import từ server được). Không hợp lệ thì coi như không có kết quả (EmptyState) hoặc bỏ qua tham số. Thêm test page cho `movie: "."` và `cinema: "."`, trong đó mock trả về mảng như API thật.

### F2 — MAJOR (false-confidence test): mock `page.test.tsx` không phản ánh hợp đồng API theo ngày, và không assert đường dẫn gọi API
- Vị trí: `apps/web/src/app/(public)/lich-chieu/__tests__/page.test.tsx:44-59` (`mockApi`), `:118-132`.
- API thật `GET /movies/:slug?date=&province=` chỉ trả suất của **đúng một ngày VN** (`movies.service.ts:257-267`, `vnDayRange`) và lọc theo tỉnh. Mock bỏ qua query string, lần nào cũng trả suất của mọi ngày. Mock `/cinemas/HN01` cũng bỏ qua `date`.
- Hệ quả:
  - Test `?date=2026-11-16` (l.95-100) xanh chỉ nhờ page lọc lại bằng `hasShowtimeOnDate`.
  - Nếu page ngừng chuyển `date` (hoặc `province`) sang API, mọi test vẫn xanh, nhưng ở production chọn ngày khác sẽ luôn rỗng. Đó chính là loại bug mà task này đang sửa.
  - Không test nào kiểm tra `apiFetch` được gọi với `/movies/<slug>?date=…&province=…` hoặc `/cinemas/<code>?date=…`.
- Yêu cầu: thêm assertion trên `apiFetch.mock.calls` (vd có `/movies/phim-b?date=2026-11-16`; có `province=HN` khi render với `province: "HN"`; có `/cinemas/HN01?date=…`), **hoặc** cho mock lọc theo `date` trong query giống `vnDayRange`.

### F3 — INFO (ngoài phạm vi, nên đưa vào backlog): dải ngày ở `/phim/[slug]` vốn đã hỏng, task này không làm hồi quy
- `apps/web/src/app/(public)/phim/[slug]/page.tsx:26-28,223-227`:
  - Không có `?date=`: API chỉ trả suất **hôm nay**. Bấm sang ngày khác (state nội bộ) thì lọc trên payload một ngày, nên luôn rỗng.
  - Có `?date=…`: page truyền `selectedDate={date}` mà không có `onDateChange`, nên gặp lại đúng root cause #3 và dải ngày đứng yên.
- Hành vi trước và sau task giống hệt nhau, nên acceptance "không hồi quy" vẫn đạt. Đề nghị tạo bug riêng (có thể dùng lại `ScheduleDateNav`/URL `?date=`).

### Minor (không chặn)
- M1: Chưa có unit test trực tiếp cho `resolveScheduleDate` (`vn-date.ts:18-25`) ở các biên: hôm nay+6 (nhận), +7 (từ chối), `2026-13-45`, 16:59Z/17:00Z (nửa đêm VN). Logic so khớp chuỗi tuyệt đối với 7 ngày sinh ra thì đúng, vì chuỗi rác hoặc sai định dạng không thể khớp. Chỉ thiếu test chứng minh.
- M2: `ScheduleDateNav` không nhận `now` từ server, nên client tự dùng `new Date()`. Sát nửa đêm VN, server có thể resolve `date` = hôm qua trong khi client sinh 7 ngày từ hôm nay. Khi đó không nút nào `aria-pressed` và có thể lệch hydration. Hiếm gặp, chấp nhận được cho demo.
- M3: Mỗi phim một fetch, không có timeout: một phim chậm làm chậm cả trang (`allSettled` chỉ cô lập lỗi, không cô lập độ trễ). Với 4 phim demo thì chấp nhận được. N+1 bị giới hạn bởi số phim now_showing.
- M4: `ONE_DAY_MS` và logic sinh 7 ngày bị lặp giữa `vn-date.ts:12` và `showtime-schedule.tsx:82` (`generateNext7Days`). Có thể dùng chung, không bắt buộc.
- M5: Select controlled (`value=` + `router.push`) nhảy về giá trị cũ cho tới khi điều hướng xong. Không có trạng thái pending. Chấp nhận được.
- M6: Tham số lặp (`?movie=a&movie=b`) cho ra mảng ở runtime (kiểu `PageProps` khai báo `string`), không crash: chỉ 404 hoặc 400 rồi EmptyState. Có trước task, chỉ ghi nhận.

## Các điểm đã kiểm và đạt
- Hành vi theo acceptance (đọc code + test filters):
  - Mặc định gọi mọi phim now_showing qua `allSettled`, bỏ phim không có suất, không có phim nào thì hiện một EmptyState chung.
  - Chọn phim thì chỉ hiện phim đó. Chọn rạp thì xem theo rạp, lọc thêm theo phim nếu có.
  - Đổi tỉnh xoá `cinema`. Đổi phim/rạp/ngày giữ các tham số còn lại. Chọn "tất cả" xoá tham số.
  - `date` sai định dạng hoặc ngoài 7 ngày rơi về hôm nay.
  - `province` dùng cho `/cinemas` giờ đi qua `URLSearchParams` (hết chèn query).
- Một phim lỗi (reject) chỉ bị bỏ, không làm hỏng cả trang (`flatMap` fulfilled). Lưu ý: F1 là trường hợp *fulfilled sai shape*, khác với reject.
- Ranh giới client/server: `page.tsx` (server) chỉ **render** component từ module `"use client"` (`ScheduleFilters`, `ScheduleDateNav`, `ShowtimeSchedule`). Hàm được gọi trực tiếp chỉ đến từ `lib/vn-date.ts` (không có `"use client"`). Props truyền qua là object thuần. Không lặp lại lỗi GAP-030.
- `/phim/[slug]`: `hideDateStrip` mặc định false. Bỏ `selectedDate` thì vẫn dùng state nội bộ, có test mới `schedule.test.tsx` ("không truyền selectedDate…").
- A11y/mobile: 3 select có `<label htmlFor>`. Select `h-11` (44px) trên mobile, `md:h-10` ở desktop. Nút ngày `min-h-[44px]`, có `aria-pressed`. Dải ngày `overflow-x-auto`, `min-w-0` trên cột lưới. Builder có evidence không tràn ngang ở 360/768/1280.
- Test filters (`schedule-filters.test.tsx`) assert URL đủ chặt (pathname, từng param, xoá `cinema`, xoá param rỗng, ngày +3, giữ filter).
- Repro Verification có evidence Playwright trước và sau fix, kèm script `tasks/bug-lich-chieu/repro-lichchieu.mjs`.
- Docs: `docs/API_SPEC.md:267` chỉ liệt kê route `/lich-chieu`. `docs/DESIGN.md` không mô tả hành vi trang. Kết luận **no doc impact**.
- File ≤300 dòng (`page.tsx` ~229). Các hàm trong page đều <50 dòng. Chưa đủ 3 AI-chaos indicator.

## Verdict: **FAIL**

Lý do: F2 là test false-confidence: mock bịa hành vi khác API thật (trả mọi ngày) và không assert đường dẫn gọi API, nên không bảo vệ được đúng lớp bug của task. F1 là crash 500 có thể tái hiện bằng `?movie=.` / `?cinema=.` trên đúng các dòng builder vừa viết lại. Builder cần sửa F1 + F2 (kèm test), rồi review round 2. F3 tạo bug backlog riêng, không chặn task này.
