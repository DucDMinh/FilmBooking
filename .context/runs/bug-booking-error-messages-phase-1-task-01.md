# Run Journal — bug/booking-error-messages · phase-1-task-01

```yaml
workItem: bug/booking-error-messages   # CR-017, change doc spec/changes/2026-11-23-booking-error-messages.md
phaseTask: phase-1-task-01
step: ready
agent: change-request
status: awaiting
attempt: 0
interrupted: false
updatedAt: 2026-11-23
filesTouched: []
filesNew: [spec/changes/2026-11-23-booking-error-messages.md, tasks/bug-booking-error-messages/phase-1-task-01.md]
evidence: {reportPath: null, round: 0, verdict: null}
next: "setup worktree bug-booking-error-messages phase-1 task-01 -> builder -> reviewer NORMAL -> close-out (no bump, test-scope bug-fix)"
loopSignal: none
approvals: []
```
- 2026-11-23 /change <mô tả>: classify BUG; root cause = web toApiError bỏ message server + nhiều lỗi nghiệp vụ gộp VALIDATION_ERROR. Không đụng SPECIFICATIONS.md (mã lỗi chỉ ở docs/API_SPEC.md). Chạy song song với CR-016 (file không trùng).
