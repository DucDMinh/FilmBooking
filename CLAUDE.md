@AGENTS.md

# Claude Code adapter

Template này gốc viết cho opencode, đã chuyển sang Claude Code. `AGENTS.md` (import ở trên) vẫn là router và luật nền; phần dưới chỉ ánh xạ khái niệm sang Claude Code.

| Trong tài liệu template | Trong Claude Code |
|---|---|
| Subagent `.claude/agents/<tên>.md` | Gọi bằng **Agent tool** với `subagent_type: "<tên>"` |
| Chạy nhiều builder **song song** | Gửi **nhiều Agent tool call trong CÙNG một message** (mỗi task một call) |
| Human checkpoint / hỏi user | **AskUserQuestion** (chỉ session chính hỏi được; subagent không hỏi user) |
| Gate quyền (cấm push main, force push, reset --hard, DB destructive; reviewer chỉ đọc) | `.claude/settings.json` + hook `.claude/hooks/agent-guard.mjs` (chặn bằng exit 2) |
| `builder-strong` chỉ dùng khi user yêu cầu rõ | hook `agent-guard.mjs` (`permissionDecision: "ask"`) → luôn hiện prompt duyệt |
| Sau compact phải re-read journal | Hook `SessionStart` (matcher `compact`) tự nhắc + liệt kê journal |
| Skills | Đọc theo path `skills/<tên>/SKILL.md` như workflow ghi (không cần đăng ký) |

## Quy tắc riêng cho Claude Code

- **Orchestration chạy ở session chính.** `/start`, `/change`, `/bug`, `/feature` và loop dispatcher chạy trong session chính (vì chỉ session chính có human checkpoint). Không có subagent `change-request`: quy trình `.agent/change-request.md` được session chính thực thi trực tiếp, rồi gọi các subagent lá (`builder`, `reviewer`, `spec-validator`, `spec-publisher`, …).
- **Builder trong worktree:** brief của builder phải ghi **đường dẫn tuyệt đối** của worktree. Read/Edit/Write dùng path tuyệt đối dưới worktree đó (đổi thư mục shell không làm Edit/Write đổi theo); lệnh Bash chạy với `cd "<worktree>" && ...`.
- **Model theo vai:** Claude Code chỉ có model Claude, nên "reviewer khác model builder" = khác tier (vd builder `opus`, reviewer/spec-validator `sonnet`). Đặt trong frontmatter `model:` của `.claude/agents/*.md`.
- **Không có tool `usage()`.** Usage gate thay bằng: ở mỗi checkpoint hết layer/phase, nếu session đã dài (nhiều task, đã compact) → hỏi user bằng AskUserQuestion có muốn kết thúc và `/resume` ở session mới không.
- Bị `agent-guard` chặn → **DỪNG**, không đổi biến thể lệnh để lách; ghi `Blocked` hoặc hỏi user.
- Xưng hô tôi - bạn
