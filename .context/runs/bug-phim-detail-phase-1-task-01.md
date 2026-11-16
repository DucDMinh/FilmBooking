# Run Journal — bug/phim-detail · phase-1-task-01

```yaml
workItem: bug/phim-detail
phaseTask: phase-1-task-01
step: done
agent: spec-publisher
status: done
attempt: 0
interrupted: false
updatedAt: 2026-11-16
filesTouched: []
filesNew: [tasks/bug-phim-detail/scan.md, tasks/bug-phim-detail/phase-1-task-01.md, tasks/bug-phim-detail/repro-phim-detail.mjs]
evidence: { reportPath: .context/review-reports/bug-phim-detail-phase-1-task-01-round-2-review.md, round: 2, verdict: PASS }
next: "commit close-out"
loopSignal: none
approvals: []
batchQueue: []
```

## History
- 2026-11-16 /bug D1-D2 (từ scan bug-check). User chốt gộp D1+D2 (cùng root cause: đổi ngày không refetch). D3 loại khỏi scope; D4 được giải khi dùng resolveScheduleDate. ▶ START [agent: builder] task-01 running — cancel sẽ redo.
- 2026-11-16 ✅ DONE [agent: builder] task-01: page.tsx (resolveScheduleDate, fetch theo ngày, selectedDate), movie-showtime-schedule.tsx mới (onDateChange -> router.push giữ province, #lich-chieu, scroll:false), 12 test mới (wrapper 4 + page 8; 5 đỏ trước fix). lint/typecheck/build PASS; test shared 31 api 483 web 565. SSR ?date=2026-11-18 -> 11 link đặt vé, nút 18/11 aria-pressed; ?date=abc/2030-01-01 -> hôm nay 200; Chrome thật: bấm 18->20->22->19->17 URL đổi, giữ province + #lich-chieu. Chưa commit.
- 2026-11-16 ▶ START [agent: reviewer] task-01 round 1 NORMAL running — cancel sẽ rerun.
- 2026-11-16 ✅ DONE [agent: reviewer] task-01 round 1 NORMAL FAIL (report .context/review-reports/bug-phim-detail-phase-1-task-01-round-1-review.md): code/test/lint/typecheck/test đạt; MAJOR duy nhất = Repro Verification trong task file còn "(chưa)/BLOCKED" (phần của dispatcher) + reviewer bị agent-guard chặn curl. Minor: generateMetadata gọi API không date; không có loading khi đổi ngày. Dispatcher đã chạy curl SSR 16..22/11 + ?date rác (11 link/ngày 17..22, rác -> hôm nay 200) và điền Repro Verification. attempt không tăng (không đổi code). ▶ START [agent: reviewer] task-01 round 2 NORMAL running (resume reviewer cũ) — cancel sẽ rerun.
- 2026-11-16 ✅ DONE [agent: reviewer] task-01 round 2 NORMAL PASS (report .context/review-reports/bug-phim-detail-phase-1-task-01-round-2-review.md). Dispatcher xác nhận: suất hôm nay đều 14:00 (+1 suất 09:48), bây giờ ~17:48 VN nên "Mua tại quầy" là đúng, không phải bug. ▶ START [agent: spec-publisher] bug-fix scope running — cancel sẽ redo.
- 2026-11-16 ✅ DONE [agent: spec-publisher]: scope v18 -> v19 (tích luỹ: giữ dependents/regression/acceptance v18, thêm phần phim-detail), spec 3.1.0 không bump, spec/updates/2026-11-16-phim-detail.md, CHANGELOG +1 dòng. Residual: D3 province sai -> 404 (ngoài scope); dải ngày client new Date() sát nửa đêm; generateMetadata không date; không có loading khi đổi ngày. step: done. Close-out commit.
