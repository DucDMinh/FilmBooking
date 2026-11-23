# Run Journal — feature/nav-skeleton-first-row · phase-2-task-02 (builder)

```yaml
workItem: feature/nav-skeleton-first-row
phaseTask: phase-2-task-02
step: done
agent: null
status: done
attempt: 2
interrupted: false
updatedAt: 2026-11-23
worktree: E:/FilmBooking/.worktrees/feature-nav-skeleton-first-row__phase-2__task-02 (branch wt/feature-nav-skeleton-first-row__phase-2__task-02)
filesTouched: [globals.css, scrub.tsx, scrub.test.tsx, section-heading.tsx, movie-card.tsx, showtime-schedule.tsx, 6x (public) page.tsx, e2e/scrub/scrub.spec.ts, tasks/.../phase-2-task-02.md]
filesNew: []
evidence: {builderCommit: 10ab08e, reportPath: ".context/review-reports/feature-nav-skeleton-first-row-phase-2-task-02-round-1-review.md", round: 1, verdict: FAIL}
next: "đã close-out (CR commit)"
loopSignal: none
```
- 2026-11-23 ▶ START builder task-02 (song song với task kia, 1 wave).
- 2026-11-23 ✅ DONE builder task-02 (9ff8886; web 691 test PASS, typecheck/lint OK, Chromium scrub 25/25; 3 test cũ chuyển sang hàng 2). Lệch: container attr data-scrub-grid chưa có trong design-spec (thêm 1 dòng khi close-out). ▶ START reviewer task-02 round 1 STRICT.
- 2026-11-23 reviewer round 1 STRICT FAIL: M-1 ShowtimeSchedule first theo instance làm mất scrub cả khối ở /lich-chieu (cần prop first, chỉ /phim/[slug] + khối đầu /lich-chieu), M-2 test e2e (i) không assert hàng sau; minor: cỡ 560-1023, clip-path đang chạy, px vs rem. Thêm theo spec 3.6.1: notFound() trong generateMetadata của /rap/[code] và /phim/[slug]. ▶ START builder fix round 2 (task-02).
- 2026-11-23 ✅ DONE builder fix round 2 task-02 (10ab08e; M-1 first prop, M-2 test (i2)(i3), rem, notFound trong generateMetadata; Chromium 34/34; typecheck/1 test lệch do base thiếu CR-017, hết sau merge). ▶ START reviewer task-02 round 2 STRICT.
- 2026-11-23 ✅ DONE close-out: task-02 STRICT PASS round 2, merged fe024a3
