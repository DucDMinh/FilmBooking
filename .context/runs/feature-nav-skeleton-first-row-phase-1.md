# Run Journal — feature/nav-skeleton-first-row · phase-1 (spec + plan)

```yaml
workItem: feature/nav-skeleton-first-row   # CR-016, change doc spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md
phaseTask: phase-1 (spec delta + plan)
step: done
agent: null
status: done
attempt: 0
interrupted: false
updatedAt: 2026-11-23
filesTouched: [spec/changes/BACKLOG.md, SPECIFICATIONS.md]
filesNew: [spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md]
evidence: {reportPath: ".context/review-reports/feature-nav-skeleton-first-row-visible-phase-1-round-2-spec.md", round: 2, verdict: PASS}
next: "đã close-out (CR commit)"
loopSignal: none
approvals: [{gate: phase_plan, at: 2026-11-23, ok: true}]
batchQueue: []
```

## Notes
- Classify MODIFY (đổi hành vi UI trang khách; không đổi API/DB/nghiệp vụ). Risk MEDIUM (shared skeleton + globals.css scrub).
- Root cause đo bằng đọc code: `apps/web/src/app` không có loading.tsx nào; Scrub (`globals.css` animation-range entry + `--scrub-inset: min(36%,300px)`) giữ opacity 0 cho hàng đầu nằm gần mép dưới.
- NFR-19 hiện nói "bộ điều khiển trong khung nhìn lúc vào trang không giảm opacity" nhưng KHÔNG nói dữ liệu hàng đầu -> bổ sung.
- 2026-11-23 user duyệt plan (task-01 skeleton, task-02 hàng đầu tĩnh, wave2 task-03 e2e). SPECIFICATIONS.md sửa: 3.6.0, NFR-19 sửa, NFR-20 + AC-35 thêm. ▶ START spec-publisher + spec-validator (song song).
- 2026-11-23 spec-publisher xong (spec/updates + CHANGELOG + test-scope scopeVersion 34, risk giữ high). spec-validator round 1 FAIL: C-1 design-spec §16.4 còn scrub hàng đầu, C-2 §5 loading ở client, F-2 wording "khi vào khung nhìn", F-3 admin/staff. Đã sửa: design-spec §5 + §16.4 (ngoại lệ hàng đầu), NFR-19/AC-35 wording (luôn opacity 1 mọi vị trí cuộn), change doc chốt admin/staff ngoài phạm vi, bỏ design-spec khỏi file list task-01/02. ▶ START spec-validator round 2.
- 2026-11-23 spec-validator round 2 PASS; đồng bộ wording MINOR (updates, test-scope, change doc, design-spec). ✅ DONE phase 1. Commit spec 3.6.0 để worktree phase 2 thấy spec.
- 2026-11-23 spec sửa tiếp 3.6.0 -> 3.6.1 (R-137/AC-28/NFR-20: mã sai 200+noindex mọi client, đã đo); spec-publisher xong (scope 35 CR-016, 36 CR-017). ▶ START spec-validator round 3 (delta 3.6.1, hẹp).
- 2026-11-23 ✅ DONE close-out: spec 3.6.1 PASS (validator round 4), scope 35
