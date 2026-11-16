# Spec Update — 2026-11-16 phim-detail
**spec_version:** 3.1.0 → 3.1.0 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · `tasks/bug-phim-detail/phase-1-task-01.md` (review NORMAL PASS round 2)

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Đây là đưa hành vi trang `/phim/[slug]` (web) về đúng requirement đã có: **R-44** (lịch 7 ngày tới trên chi tiết phim, chọn ngày → danh sách suất), **R-43** (lọc theo ngày chiếu), **R-46** (vẫn render phía server).

## Lỗi đã sửa (UI web, không đổi API)
1. Dải 7 ngày chỉ hôm nay có suất: page gọi `/movies/:slug` một lần không kèm `date` rồi `ShowtimeSchedule` lọc phía client → 6 ngày còn lại trống. Nay page đọc `?date=` qua `resolveScheduleDate` (rác / ngoài hôm nay..+6 theo ngày VN / lặp-mảng → hôm nay), gọi `/movies/:slug?date=<ngày>[&province=]` và truyền `selectedDate`.
2. Có `?date=` thì bấm ngày không đổi: `selectedDate` không đi kèm `onDateChange`. Nay component client mới `MovieShowtimeSchedule` (`apps/web/src/components/catalog/movie-showtime-schedule.tsx`) nối `onDateChange` → `router.push(?date=<d>[&province=]#lich-chieu, { scroll: false })`, giữ `province` và neo `#lich-chieu`.

## Ảnh hưởng
- Module: web `/phim/[slug]` (`page.tsx`), component mới `MovieShowtimeSchedule`. `ShowtimeSchedule` dùng chung KHÔNG đổi chữ ký/hành vi.
- Test: bấm từng ngày +1..+6 (URL, aria-pressed, suất đổi), có sẵn `?date=` vẫn đổi được, giữ `province` + `#lich-chieu`, `?date=` rác → 200 + hôm nay, SSR còn nguyên, `/lich-chieu` không hồi quy.
- Không đổi DB / schema / API contract.
- Residual (ngoài phạm vi, chưa sửa): D3 `?province=` sai vẫn 404; dải ngày client dùng `new Date()` nên có thể lệch sát nửa đêm VN; `generateMetadata` gọi API không kèm date; không có trạng thái loading khi đổi ngày.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 19, specVersion 3.1.0.
