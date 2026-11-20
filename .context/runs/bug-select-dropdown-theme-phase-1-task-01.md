# Run Journal — bug/select-dropdown-theme · phase-1-task-01

```yaml
workItem: bug/select-dropdown-theme
phaseTask: phase-1-task-01
step: done
agent: null
status: done
attempt: 1
interrupted: false   # builder bị cắt ở 40 lượt 1 lần, resume trên đĩa, không tính attempt
updatedAt: 2026-11-20T00:00:00+07:00
filesTouched: [apps/web/src/app/globals.css, apps/web/src/components/catalog/filter-field.ts, apps/web/src/components/home/home-hero.css, 13 file dùng <select> (xem git status)]
filesNew: [apps/web/src/components/catalog/__tests__/select-theme.test.ts, spec/changes/2026-11-20-select-dropdown-theme.md, tasks/bug-select-dropdown-theme/phase-1-task-01.md]
evidence: {reportPath: ".context/review-reports/bug-select-dropdown-theme-phase-1-task-01-round-2-review.md", round: 2, verdict: PASS}
next: "commit rồi báo user"
loopSignal: none
approvals: []
batchQueue: []
```

## History
- 2026-11-20 builder xong (resume 1 lần); ▶ START reviewer round 1
- reviewer round 1 FAIL (STRICT): hover không vàng, MINOR class, thiếu bằng chứng; ▶ START builder fix round 2
- builder fix round 2 xong (lint/typecheck/test 657/build/scrub 21/21 PASS); ▶ START reviewer round 2
- reviewer round 2 PASS (STRICT)
- ▶ START spec-publisher (bug-fix, không bump)
