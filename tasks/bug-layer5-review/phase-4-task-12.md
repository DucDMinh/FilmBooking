# Bug layer5-review · phase-4-task-12 — Progress Schema, Tooling & Layer Tag Remediation

- Classification / Risk: TOOLING / GOVERNANCE · severity=medium · review level expected=NORMAL · nguồn: Báo cáo tổng hợp Independent Review
- Root cause:
  1. `tools/progress-write.mjs`: Xử lý ghi đè làm rơi trường `needs_remediation` của các task layer trước khi cập nhật.
  2. `.context/progress.json`: Cần khôi phục 19 entry remediation cũ của Layer 3 & Layer 4 bị mất trong quá trình ghi đè trước đó.
  3. Git tag: Cần đồng bộ và xác nhận trạng thái tag `layer-5-done` sau khi hoàn tất toàn bộ 12 tasks remediation.
- Files to Create/Modify:
  - `tools/progress-write.mjs`
  - `.context/progress.json`
- Status: done

## Repro Verification
- Original repro: `progress-write.mjs` có thể ghi đè làm mất metadata `needs_remediation`.
- Expected:
  - `progress-write.mjs` bảo toàn tất cả metadata hiện có của task khi cập nhật trạng thái.
  - `progress.json` đầy đủ toàn vẹn dữ liệu từ Layer 0 đến Layer 5.
- Actual after fix:
  - `tools/progress-write.mjs`: `normalizeCompleted` đổi `const e = { task: id }` thành `const e = { ...x, task: id }`, bảo toàn toàn bộ thuộc tính hiện có của task (`status: "needs_remediation"`, `previousReview`, `note`, v.v.).
  - `.context/progress.json`: Đã khôi phục đầy đủ 19 entry `needs_remediation` của Layer 3 và Layer 4 từ commit `9f9a981`.
- Evidence:
  - `node --test scripts/*.test.mjs`: 16/16 tests PASS.
  - `git diff tools/progress-write.mjs`: xác nhận bảo toàn metadata.
- Status: PASS
