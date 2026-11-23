# Run Journal — feature/nav-skeleton-first-row · phase-1 (spec + plan)

```yaml
workItem: feature/nav-skeleton-first-row   # CR-016, change doc spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md
phaseTask: phase-1 (spec delta + plan)
step: done (phase 1)
agent: null
status: done
attempt: 0
interrupted: false
updatedAt: 2026-11-23
filesTouched: [spec/changes/BACKLOG.md, SPECIFICATIONS.md]
filesNew: [spec/changes/2026-11-23-nav-skeleton-and-first-row-visible.md]
evidence: {reportPath: ".context/review-reports/feature-nav-skeleton-first-row-visible-phase-1-round-2-spec.md", round: 2, verdict: PASS}
next: "phase 2: setup worktree task-01 + task-02 (song song), builder x2 -> reviewer; sau merge: phase 3 task-03 (Playwright)"
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
