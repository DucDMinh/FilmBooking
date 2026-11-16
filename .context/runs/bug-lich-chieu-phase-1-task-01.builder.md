# builder summary — bug lich-chieu phase-1-task-01
- Đã làm: ScheduleFilters + ScheduleDateNav (client, router.push, giữ tham số, đổi tỉnh xoá cinema); tách ScheduleDateStrip + prop hideDateStrip (mặc định false) trong showtime-schedule.tsx; resolveScheduleDate trong lib/vn-date.ts; viết lại lich-chieu/page.tsx (mặc định mọi phim có suất, allSettled, EmptyState chung, rạp lọc thêm theo phim).
- Test: schedule-filters.test.tsx, lich-chieu/__tests__/page.test.tsx, schedule.test.tsx (+2). Lint/typecheck/build PASS.
- Còn dở: chưa commit (dispatcher). common.test.tsx SiteHeader fail do site-header.tsx dirty ngoài scope.
