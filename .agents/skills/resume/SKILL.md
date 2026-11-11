---
name: resume
description: "Resume công việc dở dang từ Run Journal (không classify lại). Dùng khi mở session mới để làm tiếp."
argument-hint: "<feature|bug>/<slug>"
---

Chạy **Session Start Protocol** trong `AGENTS.md` § Session Handoff để resume công việc.

Tham số (tùy chọn): `$ARGUMENTS` — có thể là `<type>/<slug>` (vd `feature/schedule-change-requests`);
để trống → dùng `activeWorkItem` trong `.context/progress.json`.

Quy tắc bắt buộc:

1. **Xác định work item:** có `$ARGUMENTS` → dùng; không → đọc `activeWorkItem` trong `.context/progress.json`.
2. **Đọc journal:** `.context/runs/<type>-<slug>-<phaseTask>.md`.
   - Nếu có **nhiều** journal khớp workItem: chọn journal có `status != done`, ưu tiên `updatedAt` mới nhất.
   - Không có journal → coi pointer là **hint**, dựng lại trạng thái từ đĩa (git + task file + report).
3. **Reconcile với đĩa** (đĩa là sự thật, pointer là hint):
   - `git status --short` → so với `filesTouched`/`filesNew`; file dirty **ngoài** manifest = nhiễm chéo → cảnh báo.
   - `git log --oneline` → task đã có commit chưa (đã commit = done, **không redo**).
   - Đọc `evidence.reportPath` → reviewer đã chạy chưa, round mấy.
4. **In Resume Briefing:** workItem · step · status · dirty files vs manifest · evidence · `next`.
5. **Thực hiện `next`** theo resume matrix (`.agent/FEATURE_WORKFLOW.md` § Session handoff & resume):
   - `builder` / `running` → **redo builder** (read-before-write, không revert).
   - `builder` / `awaiting` → **chạy reviewer**.
   - `reviewer` / `running` → **rerun reviewer** (dọn report dở trước).
   - `reviewer` / `awaiting` → `fix` | `spec_validator` | close-out.
   - `fix` / `spec_validator` / `closeout` → xem matrix mở rộng trong `.agent/FEATURE_WORKFLOW.md` § Session handoff & resume.
   - `done` → sang phase/task kế.
6. **KHÔNG** chạy lại change-request classify / phase plan. Nếu state mơ hồ (pointer lệch đĩa nhiều, không rõ step) → **hỏi user** trước khi làm.
7. **Write-ahead checkpoint:** trước khi gọi subagent ghi journal `status=running` + in `▶ START`; sau khi subagent trả về ghi `status=awaiting` + `evidence` + `next`, **rồi mới** in `✅ DONE`.
8. **Usage gate:** ở mỗi checkpoint hết layer/phase, nếu session đã dài (nhiều task / đã auto-compact) →
   hỏi user bằng AskUserQuestion: `[End — mở session mới] / [Làm tiếp] / [Tiếp, đừng hỏi lại trong session này]`.
   Chọn End → in Resume Briefing + dòng `/resume <type>/<slug>` để copy sang session mới, rồi dừng turn.
