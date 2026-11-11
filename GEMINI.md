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

0. **Xưng hô (bắt buộc):** Luôn xưng hô **bạn - tôi** với người dùng, tuyệt đối không dùng "anh - em".
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

## 3. Trạng thái dự án hiện tại (Hoàn tất Layer 4 → Chuẩn bị Layer 5)

- **Mode:** `initial-build`
- **Work item:** `build/build-filmbooking`
- **Đã hoàn thành:**
  - Layer 0 (task-01, task-02): Bootstrap, monorepo pnpm, tooling, Supabase init, CI.
  - Layer 1 (task-01, task-02, task-03): Next.js App Router, NestJS core, migration lõi RLS.
  - Layer 2 (task-01..05): Catalog schema, bảo mật/vận hành, Nest guards, Web data layer & shell. Phase review: PASS.
  - Layer 3 (task-01..07): Pricing 2 cấp + ngày lễ (`price_quote`), Booking schema + RLS, AuthModule global + JWKS + MeModule, CatalogModule, CinemaOpsModule, AuthExtModule, ProfileModule. Phase review: PASS (`layer-3-done`).
  - Layer 4 (task-01..12): RPC giữ ghế (`hold_seats`), RPC thanh toán & POS (`confirm_paid`, `confirm_pos_sale`), RPC voucher (`apply_voucher`), RPC huỷ suất hàng loạt (`cancel_showtimes`, `set_cinema_status`), RPC soát vé & 4 view báo cáo (`checkin_ticket`), Identity hooks + `IdentityModule`, Wiring API #2 (`AppModule` + `database.types.ts`), `PricingModule`, Seed demo idempotent (`supabase/seed.sql`), Web công khai (`/`, `/phim`, `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`, `sitemap.ts`, `robots.ts`). Phase review: PASS (`layer-4-done`).
- **Tiếp theo:** **Layer 5** (13 tasks — chờ user duyệt Human Checkpoint 4):
  - `layer-5-task-01..09`: API Booking, PayOS Webhook, Mail Worker (`email_outbox`), API Check-in, API POS `/pos/v1/*`, API Quản trị, API Đơn hàng & Báo cáo, API Huỷ suất/Đơn bị ảnh hưởng, Wiring API #3.
  - `layer-5-task-10..13`: Web Auth, Web Hồ sơ/Tài khoản, Web Liên kết MXH/Bảo mật, Web Admin Shell (`/admin`).
