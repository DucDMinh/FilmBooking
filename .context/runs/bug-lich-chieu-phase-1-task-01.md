# Run Journal — bug/lich-chieu · phase-1-task-01

```yaml
workItem: bug/lich-chieu
phaseTask: phase-1-task-01
step: done
agent: builder
status: done
attempt: 0
interrupted: false
updatedAt: 2026-11-16
filesTouched: []
filesNew: [tasks/bug-lich-chieu/phase-1-task-01.md, tasks/bug-lich-chieu/repro-lichchieu.mjs]
evidence: { reportPath: null, round: 0, verdict: null }
next: "builder task-01 -> reviewer NORMAL -> dispatcher chạy lại repro Playwright + pnpm e2e -> spec-publisher (scope) -> commit"
loopSignal: none
approvals: []
batchQueue: []
```

## Notes
- Working tree có thay đổi KHÔNG thuộc bug này: `apps/web/src/components/shell/site-header.tsx` (thêm SignOutButton vào header public — không do dispatcher/builder tạo, chưa rõ nguồn), `shell.test.tsx` (line ending), `.context/runs/build-filmbooking-layer-8.md`, `apps/web/AGENTS.md`. Không stage.
- "Mua tại quầy" ở suất 14:00 là đúng hành vi (cutoff 15 phút), không phải bug.

## History
- 2026-11-16 /bug: /lich-chieu lỗi. Dispatcher tái hiện bằng Playwright (filters không điều hướng, 1 phim, ngày không đổi); root cause 3 điểm (page.tsx:111-161, :65; showtime-schedule.tsx:100). Một bug cùng gốc "UI không nối sự kiện" -> 1 task. ▶ START [agent: builder] task-01 running — cancel sẽ redo.
- 2026-11-16 ✅ DONE [agent: builder] task-01: schedule-filters.tsx (ScheduleFilters + ScheduleDateNav, router.push, đổi tỉnh xoá cinema), showtime-schedule.tsx (ScheduleDateStrip + hideDateStrip), lib/vn-date.ts resolveScheduleDate, lich-chieu/page.tsx viết lại (mặc định mọi phim có suất, Promise.allSettled). Playwright repro: URL/phim/ngày đổi đúng (4 phim mặc định; ?date=2026-11-19 -> THỨ NĂM 19/11). lint/typecheck/build PASS, web 520/521: 1 fail `common.test.tsx > SiteHeader > link tài khoản trỏ /tai-khoan` do site-header.tsx dirty NGOÀI scope (thêm SignOutButton, không phải của batch này). Chưa commit.
- 2026-11-16 ▶ START [agent: reviewer] task-01 round 1 NORMAL running — cancel sẽ rerun.
- 2026-11-16 reviewer task-01 round 1 NORMAL FAIL (report .context/review-reports/bug-lich-chieu-phase-1-task-01-round-1-review.md): F1 MAJOR ?movie=. / ?cinema=. -> encodeURIComponent không mã hoá '.', fetch chuẩn hoá /movies/. -> /movies/ khớp endpoint danh sách -> trả mảng, page đọc data.movie.ageRating -> TypeError 500 (lich-chieu/page.tsx fetchMovieSchedule/fetchCinemaDetail/loadMovieBlocks/CinemaResults); sửa: validate movie/cinema bằng slugParamSchema/codeParamSchema trước khi fetch + test '.'. F2 MAJOR page.test.tsx:44-59,118-132 mock bỏ qua query string, trả suất mọi ngày, không assert đường dẫn apiFetch -> xanh giả; sửa: assert apiFetch.mock.calls (date/province/cinema) hoặc mock lọc theo date. F3 INFO ngoài scope: /phim/[slug] dải ngày vốn hỏng (API chỉ trả đúng 1 ngày; có ?date= thì không có onDateChange) -> bug riêng. Minor: test biên resolveScheduleDate; ScheduleDateNav không nhận now từ server (sát nửa đêm); fetch không timeout; ONE_DAY_MS lặp. attempt=2. ▶ START [agent: builder] task-01 attempt 2 running (resume builder cũ) — cancel sẽ redo.
- 2026-11-16 ✅ DONE [agent: builder] task-01 attempt 2: F1 (parseParam validate movie/cinema/province bằng slugParamSchema/codeParamSchema/listCinemasQuerySchema.shape.province + kiểm shape sau fetch + settledList), F2 (page.test.tsx viết lại: mock parse path như fetch, assert apiFetch.mock.calls, test đổi ngày/bad-input/wrong-shape), M1 vn-date.test.ts biên, M4 ONE_DAY_MS. Red-check F1: tắt validate -> 18 test đỏ. lint/typecheck/build PASS, test shared 31 api 483 web 553 PASS. curl /lich-chieu?movie=. ?cinema=. ?movie=%2e ?province=. -> 200. Playwright repro vẫn đạt. Chưa commit.
- 2026-11-16 ▶ START [agent: reviewer] task-01 round 2 NORMAL running (resume reviewer cũ) — cancel sẽ rerun.
- 2026-11-16 ✅ DONE [agent: reviewer] task-01 round 2 NORMAL PASS (report .context/review-reports/bug-lich-chieu-phase-1-task-01-round-2-review.md; lint/typecheck/test shared 31 api 483 web 553 scripts 16 PASS). Dispatcher: repro Playwright đạt (4 phim mặc định; đổi phim/rạp/tỉnh đổi URL; ngày #4 -> ?date=2026-11-19), /lich-chieu?movie=. ?cinema=. -> 200. e2e không có spec dùng /lich-chieu nên không chạy. ✅ DONE [agent: spec-publisher]: scope v17 -> v18 (spec 3.1.0 không bump), spec/updates/2026-11-16-lich-chieu.md. Residual: F3 dải ngày /phim/[slug] vốn hỏng (bug riêng chưa mở); M2 lệch giờ sát nửa đêm; M3 không timeout. step: done. Close-out commit.
