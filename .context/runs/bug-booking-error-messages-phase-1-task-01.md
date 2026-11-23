# Run Journal — bug/booking-error-messages · phase-1-task-01

```yaml
workItem: bug/booking-error-messages   # CR-017, change doc spec/changes/2026-11-23-booking-error-messages.md
phaseTask: phase-1-task-01
step: done
agent: null
status: done
attempt: 1
interrupted: false
updatedAt: 2026-11-23
filesTouched: []
filesNew: [spec/changes/2026-11-23-booking-error-messages.md, tasks/bug-booking-error-messages/phase-1-task-01.md]
evidence: {reportPath: ".context/review-reports/bug-booking-error-messages-phase-1-task-01-round-1-review.md", round: 1, verdict: FAIL}
next: "đã close-out (CR commit)"
loopSignal: none
approvals: []
```
- 2026-11-23 /change <mô tả>: classify BUG; root cause = web toApiError bỏ message server + nhiều lỗi nghiệp vụ gộp VALIDATION_ERROR. Không đụng SPECIFICATIONS.md (mã lỗi chỉ ở docs/API_SPEC.md). Chạy song song với CR-016 (file không trùng).
- 2026-11-23 ▶ START builder task-01 (worktree .worktrees/bug-booking-error-messages__phase-1__task-01; cancel = redo trên đĩa)
- 2026-11-23 builder xong code/test/docs (5337099) nhưng BLOCKED verify (classifier chặn junction node_modules). User chọn: merge vào staging rồi verify ở repo gốc. ▶ merge --no-ff wt/bug-booking-error-messages__phase-1__task-01.
- 2026-11-23 ✅ DONE verify ở repo gốc: api test A/MAJOR-2 đổi sang 409 CONSENT_VERSION_INVALID, voucher-input Enter ô trống (nút disabled nên cần onKeyDown). ▶ START reviewer round 1 NORMAL.
- 2026-11-23 reviewer round 1 FAIL (STRICT): MAJOR-1 task file còn BLOCKED/không bằng chứng; MAJOR-2 thiếu test SeatPicker DOB_REQUIRED; MINOR cancellation/payment/SEAT_REQUIRED/VOUCHER_NOT_APPLICABLE_CINEMA. Dispatcher sửa: ghi Evidence+Status PASS, thêm test seat-map DOB_REQUIRED (web 697 PASS). ▶ START reviewer round 2 hẹp.
- 2026-11-23 ✅ DONE close-out: CR-017 STRICT PASS round 2, merged 8ff2d52, scope 36
