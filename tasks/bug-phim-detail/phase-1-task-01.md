# Bug phim-detail · phase-1-task-01 — /phim/[slug]: dải 7 ngày chỉ có "Hôm nay" có suất; có ?date= thì bấm ngày không đổi (scan D1 + D2)

- Classification / Risk: BUG · severity=high (chọn suất từ trang phim là luồng đặt vé chính) · scope=apps/web `/phim/[slug]` + `ShowtimeSchedule` · root cause category=UI lọc client trên dữ liệu server đã giới hạn 1 ngày; controlled prop không có handler · expected review level=NORMAL · blast radius: `/phim/[slug]`; `ShowtimeSchedule` còn được `/lich-chieu` dùng (với `hideDateStrip`, `onDateChange` qua ScheduleDateNav) → không được hồi quy · doc impact: no doc impact (kiểm API_SPEC/DESIGN nếu nhắc hành vi trang) · decision impact: none (cùng hướng `/lich-chieu`, commit 55f3373).
- Phạm vi do user chốt: **D1 + D2**. D3 (`?province=` sai → 404, API lỗi → 404) KHÔNG nằm trong task. D4 (`?date=` ngoài 7 ngày) được giải quyết tự nhiên khi dùng `resolveScheduleDate`.
- Root cause (có bằng chứng, scan `tasks/bug-phim-detail/scan.md`):
  1. `apps/web/src/app/(public)/phim/[slug]/page.tsx:76` gọi `/movies/:slug` một lần với `date` thô (thường undefined); API chỉ trả đúng 1 ngày, mặc định hôm nay (`apps/api/src/modules/catalog/movies.service.ts:257`, `vnDayRange` :89-91).
  2. `apps/web/src/components/catalog/showtime-schedule.tsx:147-192`: đổi ngày chỉ đổi state nội bộ rồi lọc client trên dữ liệu 1 ngày đó → 6 ngày còn lại luôn rỗng (D1).
  3. `page.tsx:223-227` truyền `selectedDate={date}` nhưng không truyền `onDateChange` → `activeDate = propSelectedDate ?? internalDate` bị prop che, bấm ngày không đổi gì (D2).
- Hướng sửa (dispatcher chốt, nhất quán `/lich-chieu`):
  - Page đọc `?date=` qua `resolveScheduleDate` (rơi về hôm nay nếu sai/ngoài 7 ngày), gọi `fetchMovieData(slug, activeDate, province)` và truyền `selectedDate={activeDate}`.
  - Đổi ngày = điều hướng: một client component nhỏ (vd `components/catalog/movie-showtime-schedule.tsx`) bọc `ShowtimeSchedule`, truyền `onDateChange` → `router.push` tới `?date=<d>` giữ các query khác (vd `province`), `{ scroll: false }` và giữ neo `#lich-chieu`. Không đổi chữ ký `ShowtimeSchedule` nếu không cần (prop `onDateChange` đã có). Giữ nhánh "phim sắp chiếu chưa có suất" của ShowtimeSchedule nguyên vẹn.
  - `generateMetadata` không đổi.
  - Dải ngày client dùng `new Date()` (lệch ngắn sát nửa đêm VN) là residual đã biết, không sửa ở đây.
- Files to Modify (dự kiến): `apps/web/src/app/(public)/phim/[slug]/page.tsx`, component mới `apps/web/src/components/catalog/movie-showtime-schedule.tsx`, (nếu cần) `showtime-schedule.tsx`; test: `components/catalog/__tests__/` (wrapper: bấm ngày → `router.push` đúng URL, giữ province), test page `app/(public)/phim/[slug]/__tests__/page.test.tsx` (gọi apiFetch đúng `date`, `?date=abc`/ngoài khoảng → hôm nay), giữ `schedule.test.tsx` xanh.
- Acceptance:
  - `/phim/<slug>` (không tham số): bấm ngày 17/11…22/11 → URL `?date=…#lich-chieu`, nút ngày được chọn đổi, suất hiển thị đúng số suất API trả cho ngày đó (~11/ngày với phim demo).
  - `/phim/<slug>?date=2026-11-18` bấm 19/11 → chuyển sang 19/11 (D2).
  - `?date=abc` / `?date=2030-01-01` → hiển thị hôm nay, không lỗi, không trang trống.
  - `/lich-chieu` không hồi quy; phim sắp chiếu không suất vẫn ra EmptyState "Sắp chiếu".
  - Test đỏ trước fix, xanh sau; lint/typecheck/test/build web PASS.
- Status: done (reviewer NORMAL PASS round 2)

## Repro Verification
- Original repro: mở http://localhost:3000/phim/spider-man-beyond-the-spider-verse → bấm ngày 17/11…22/11 trong dải 7 ngày; và mở `?date=2026-11-18` rồi bấm 19/11.
- Expected: hiện suất của ngày đã chọn (API có 11 suất/ngày cho 17→22/11); bấm ngày khi có `?date=` thì chuyển ngày.
- Actual before fix (2026-11-16, `node tasks/bug-phim-detail/repro-phim-detail.mjs` + đọc code): API không `?date` = 12 suất toàn 16/11; API theo ngày 17→22/11 = 11 suất mỗi ngày; UI (lọc client trên dữ liệu không `?date`) = 0 suất cho cả 6 ngày. Có `?date=` → `activeDate` bị prop che, nút không đổi.
- Actual after fix (dispatcher, 2026-11-16, SSR curl web:3000 phim spider-man-beyond-the-spider-verse; đếm href="/dat-ve/", "Mua tại quầy", nút aria-pressed): ?date=2026-11-17..22 -> 200, 11 link đặt vé mỗi ngày, nút được chọn đúng ngày (17/11..22/11) — trước fix cả 6 ngày = 0 suất. ?date=2026-11-16 và không ?date -> 12 suất hôm nay, đều đã quá cutoff 15 phút (giờ VN ~17h) nên render "Mua tại quầy", 0 link — đúng hành vi. ?date=abc, ?date=2030-01-01, ?date=a&date=b, ?date[]=2026-11-18 -> 200, rơi về hôm nay (nút 16/11 được chọn), không 404/500. D2: Chrome thật (builder, ?province=HA_NOI): bấm 18->20->22->19->17 URL đổi đúng mỗi lần, giữ province + #lich-chieu; bấm tiếp từ trạng thái đã có ?date= vẫn chuyển ngày.
- Evidence: test đỏ trước fix (builder: 5 fail/3 pass trên 2 file mới: wrapper thiếu module; page: ?date hợp lệ, abc, 2030, mảng, bấm ngày không push) -> xanh sau (12 test mới; web 565, shared 31, api 483); lint/typecheck/build PASS (builder); reviewer round 1 chạy lại lint/typecheck/test PASS (shared 31, api 483, web 565, scripts 31). Lệnh repro: vòng for curl như trên (reviewer bị agent-guard chặn curl nên dispatcher chạy). Mock test parse path như fetch thật + assert path chính xác; reviewer xác nhận test đỏ nếu bỏ resolveScheduleDate hoặc onDateChange.
- Residual: D3 (province sai -> 404) ngoài scope; dải ngày client dùng new Date() (lệch ngắn sát nửa đêm VN); generateMetadata gọi API không date (thêm 1 call, có cache 60s); không có trạng thái loading khi đổi ngày.
- Status: PASS
