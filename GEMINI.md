# GEMINI.md — Antigravity (agy) Adapter

> `AGENTS.md` là router và luật nền tối cao của dự án. File này là adapter ánh xạ các khái niệm sang **Google Antigravity (AGY)** và Antigravity CLI/Agent.

## 1. Ánh xạ khái niệm sang Antigravity

| Trong tài liệu template | Trong Antigravity (`agy`) |
|---|---|
| Subagent `.claude/agents/<tên>.md` | `.agents/agents/<tên>.md` — gọi bằng **`invoke_subagent`** với `TypeName: "<tên>"`, `Role: "<role>"`, `Prompt: "..."` |
| Chạy nhiều builder **song song** | Gọi `invoke_subagent` song song cho các task độc lập theo từng wave (mỗi subagent chạy trong worktree riêng), hoặc background subagents |
| Human checkpoint / hỏi user | Dừng turn hỏi user hoặc gọi **`ask_question`** (chỉ session chính hỏi; subagent không hỏi user) |
| Gate quyền (cấm push main, force push, reset --hard, DB destructive; reviewer chỉ đọc) | `.agents/hooks.json` + hook `.agents/hooks/agent-guard.mjs` (trả về `{ "decision": "deny" \| "ask" \| "allow" }`) |
| `builder-strong` chỉ dùng khi user yêu cầu rõ | Hook `agent-guard.mjs` trả về `{ "decision": "ask", "reason": "..." }` → user duyệt mới được chạy |
| Sau compact / khởi động phải re-read journal | Hook `SessionStart` (`.agents/hooks/session-context.mjs`) tự động inject context nhắc nhở + liệt kê journal |
| Skills & slash commands | Đọc tự động qua `.agents/skills.json` và `.agents/skills/<tên>/SKILL.md` (start, brainstorm, design, graph, change, bug, bug-check, feature, resume, spec-init, spec-publish, dashboard) |
| Shell execution / commands | Tool **`run_command`** (chạy PowerShell trên Windows; với worktree: `cd "<worktree>"; <lệnh>`) |
| File editing / reading | Tools **`read_file`**, **`write_file`**, **`edit_file`** (dùng đường dẫn tuyệt đối dưới worktree) |

---

## 2. Quy tắc riêng cho Antigravity (agy)

1. **Orchestration chạy ở session chính:** Các workflow điều phối (`/start`, `/change`, `/bug`, `/feature`, `/resume`) và dispatcher chạy trong session chính (vì chỉ session chính có quyền tương tác với user ở checkpoint). Không có subagent `change-request`: quy trình `.agent/change-request.md` được session chính thực thi trực tiếp, sau đó gọi các subagent lá (`builder`, `reviewer`, `spec-validator`, `spec-publisher`).
2. **Builder trong worktree:**
   - Dispatcher giao cho builder đường dẫn tuyệt đối của git worktree (`.worktrees/layer-N__task-NN`).
   - `read_file`, `write_file`, `edit_file` **chỉ dùng path tuyệt đối dưới worktree đó**.
   - `run_command` chạy dạng: `cd "<worktree_path>"; <lệnh>` (PowerShell).
   - Builder KHÔNG commit, KHÔNG sửa file ở repo gốc, KHÔNG ghi `.context/progress.json`.
3. **Model cố định theo vai (Antigravity — `agy_models` trong `.context/project-config.md`):**
   Khi gọi `invoke_subagent`, dispatcher truyền đúng tham số `Model` tương ứng (đồng thời hook `.agents/hooks/agent-guard.mjs` tự động cưỡng chế qua `overwrite: { Model }` nếu thiếu hoặc lệch):
   - `builder`: `Model: "flash"`
   - `builder-strong`: `Model: "pro"` (opt-in gate: chỉ dùng khi user yêu cầu rõ, hook trả `decision: "ask"`)
   - `reviewer`: `Model: "pro"` (khác tier với `builder` `flash` để chống thiên lệch tự đánh giá)
   - `spec-validator`: `Model: "flash"`
   - `spec-publisher`, `design`, `graph`, `spec-init`: `Model: "inherit"`
4. **Bị agent-guard chặn:**
   - DỪNG NGAY nếu lệnh bị `agent-guard` deny (exit 2 hoặc `decision: "deny"`).
   - Tuyệt đối không tìm cách lách lệnh hoặc đổi biến thể; ghi nhận `Blocked` hoặc hỏi user.
5. **Ghi nhận tiến độ & Live Studio:**
   - Dispatcher gọi `tools/agent-live.mjs enter` / `leave` để hiển thị trên dashboard Vibe Studio (`tools/vibe-studio/`).
   - Cập nhật `.context/progress.json` tập trung qua `tools/progress-write.mjs`.

---

## 3. Trạng thái dự án hiện tại (Hoàn tất Layer 3 → Chuẩn bị Layer 4)

- **Mode:** `initial-build`
- **Work item:** `build/build-filmbooking`
- **Đã hoàn thành:**
  - Layer 0 (task-01, task-02): Bootstrap, monorepo pnpm, tooling, Supabase init, CI.
  - Layer 1 (task-01, task-02, task-03): Next.js App Router, NestJS core, migration lõi RLS.
  - Layer 2 (task-01..05): Catalog schema, bảo mật/vận hành, Nest guards, Web data layer & shell. Phase review: PASS.
  - Layer 3 (task-01..07): Pricing 2 cấp + ngày lễ (`price_quote`), Booking schema + RLS, AuthModule global + JWKS + MeModule, CatalogModule, CinemaOpsModule, AuthExtModule, ProfileModule. Phase review: PASS (`layer-3-done`).
- **Tiếp theo:** **Layer 4** (7 tasks — chờ user duyệt Human Checkpoint 3):
  - `layer-4-task-01`: RPC nguyên tử giữ ghế (`hold_seats`, `release_hold`, `release_expired_holds`)
  - `layer-4-task-02`: RPC áp mã giảm giá & chốt đơn thanh toán (`apply_voucher`, `confirm_order_paid`, `expire_order`)
  - `layer-4-task-03`: RPC huỷ suất chiếu hàng loạt + tự động hoàn tiền (`cancel_showtimes_and_refund`)
  - `layer-4-task-04`: RPC soát vé QR tại quầy (`checkin_ticket` — quy tắc -30' → +20')
  - `layer-4-task-05`: Seed dữ liệu mẫu (`supabase/seed.sql`)
  - `layer-4-task-06`: UI công khai xem phim/rạp/lịch chiếu (`apps/web/src/app/(public)/*`)
  - `layer-4-task-07`: Wiring API #2 (`CatalogModule`, `CinemaOpsModule`, `AuthExtModule`, `ProfileModule` vào `AppModule` + cập nhật `database.types.ts`)
