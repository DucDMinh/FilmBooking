---
name: dashboard
description: "Mở dashboard trực quan Vibe Code Studio (văn phòng pixel isometric 2.5D, PixiJS) xem agent nào đang build/review và task nào ở TODO/REVIEW/DONE. Chỉ ĐỌC, không đụng loop."
---

Chạy **Vibe Code Studio** — văn phòng pixel isometric 2.5D (PixiJS) xem trạng thái build loop.

`$ARGUMENTS`

## Chạy

```bash
cd tools/vibe-studio
npm install        # lần đầu
npm run dev
```

Mở **http://localhost:5173/studio.html** (cổng bận thì Vite tự nhảy 5174… — xem dòng `Local:`).
Server nghe `0.0.0.0` nên máy khác cùng LAN mở được bằng `http://<ip-máy>:5173/studio.html`.

Đèn **LIVE** xanh = đọc được file. Hiện **NO FILE** = sai đường dẫn hoặc project chưa ghi file lần nào —
mở `http://localhost:5173/state.json` để xem studio đang tìm file ở đâu (trường `file`).

## Dashboard là gì

Trang **độc lập, chỉ đọc** ở `tools/vibe-studio/`. Không ghi, không sửa, không can thiệp loop.

- **Scene văn phòng pixel**: mỗi agent active = 1 nhân vật (mapping role → nhân vật trong `src/live-state.ts`).
  Builder (Nova/Orion/Lyra/Vega/Atlas/Comet) ngồi khu Coding; reviewer (Sage/Iris/Juno/Echo) khu Review;
  merger + chat + general-purpose/claude-code-guide = Eve; dispatcher/change-request/graph/plan = Theo;
  spec-init/spec-validator/spec-publisher = Oracle; design = Pixel; error/bug = Sherlock; idle ngồi khu nghỉ.
- **Task board** + header: Layer, Phase, TODO/REVIEW/DONE, số task, số agent.

## Nguồn data (read-only)

Studio đọc 2 file mà loop đã ghi sẵn (đường dẫn khai trong `tools/vibe-studio/studio.config.json`,
mặc định trỏ `../../.context/`):

1. **`.context/agents-live.json`** → agent/role/phase/task/title (do loop ghi qua `tools/agent-live.mjs`).
2. **`.context/progress.json`** → task board, layer, completed/blocked (do dispatcher ghi qua
   `tools/progress-write.mjs`). Trường mở rộng `tasks` (danh sách toàn bộ task) giúp cột TODO hiện đủ.

Thiếu `agents-live.json` → đèn **NO FILE**, scene vẫn chạy nhưng không nhân vật nào "làm việc".
Thiếu `progress.json` → board trống, phần scene + agents vẫn bình thường. Studio **không crash**.
Poll `pollMs` (mặc định 2000ms) khai trong `studio.config.json`.

## Ghi state — loop làm, không phải anh

Helper (chỉ dùng `node` builtin, atomic) nằm ở root `tools/`:

```bash
# builder nhận task
node tools/agent-live.mjs enter --agent builder-1 --role builder \
  --task layer-1/task-02 --title "REST API /users" --phase building \
  --worktree .worktrees/wt/layer-1__task-02

# dispatcher/loop tự khai báo
node tools/agent-live.mjs enter --agent dispatcher --role dispatcher --phase orchestrating

# role khác cũng được (ROLES đầy đủ): change-request|spec-validator|spec-publisher|design|graph|
# general-purpose|claude-code-guide|builder-strong. Không truyền --phase thì lấy phase mặc định theo role.
node tools/agent-live.mjs enter --agent oracle-1 --role spec-validator   # → phase review

# builder PASS → release builder + reviewer nhận task
node tools/agent-live.mjs leave --agent builder-1
node tools/agent-live.mjs enter --agent reviewer-1 --role reviewer \
  --task layer-1/task-02 --title "REST API /users" --phase review

# reviewer PASS → release reviewer; bước merge bắt đầu / xong layer
node tools/agent-live.mjs leave --agent reviewer-1
node tools/agent-live.mjs enter --agent merger --role merger --phase merging
node tools/agent-live.mjs clear

# progress.json (dispatcher ghi 1 lần/layer)
node tools/progress-write.mjs complete --task layer-1/task-02 --review "STRICT PASS" --round 1
node tools/progress-write.mjs block --task layer-1/task-03 --reason "..."
node tools/progress-write.mjs set-layer --current 2 --total 5
```

> **Claude Code tự báo danh (không cần gọi tay):** `.claude/hooks/live-studio.mjs` + `.claude/settings.json`
> tự `enter`/`leave` cho chat (Eve) và subagent qua hook `UserPromptSubmit`/`Stop`/`PreToolUse(Agent)`/
> `PostToolUse(Agent)`/`SubagentStop`. builder/builder-strong/reviewer KHÔNG qua hook (loop tự lo), tránh
> trùng nhân vật. Subagent chạy nền (`run_in_background`) chỉ leave khi `SubagentStop`.
```

`agents-live.json` là **file DISPLAY**, không phải source of truth — `progress.json` vẫn là chính.
Mất file không ảnh hưởng loop. Cả 2 file nằm trong `.gitignore`.

## Lưu ý

- Cần **Node 20+**. Lần đầu phải `npm install` (Vite + PixiJS).
- Đây là tool quan sát, hoàn toàn tách khỏi logic loop/build. Không cần restart khi đổi file state
  (Vite đọc file mới mỗi request).
