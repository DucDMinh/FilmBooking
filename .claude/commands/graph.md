---
description: "Graph — chia spec/design thành layer + task theo dependency order (tasks/<slug>/layer-N-task-NN.md + layer-plan diagram). Thường chạy tự động trong /start; dùng tay để chạy lại/điều chỉnh kế hoạch."
---

Chạy **Graph (task/layer decomposition)** cho repo hiện tại. Thực thi `.agent/graph.md`:

`$ARGUMENTS`

## Báo danh dashboard (prompt-level)
`/graph` chạy trong session chính → **tự gọi** `enter`/`leave` (hook `Agent` không bắt được):
```bash
node tools/agent-live.mjs enter --agent graph --role graph   # → Theo, phase orchestrating
# ... xong ...
node tools/agent-live.mjs leave --agent graph
```
Lỗi/thiếu file này KHÔNG chặn flow.

## Việc phải làm
1. Đọc `SPECIFICATIONS.md` + design doc (`docs/specs/*-design.md`) + `docs/**` + `.context/project-config.md`.
2. Chia **layer** theo dependency: Layer 0 (hạ tầng) → backend → frontend → integration → advanced → polish.
3. Sinh `tasks/<slug>/layer-{N}-task-{NN}.md` (format trong `.agent/graph.md`).
4. Vẽ **layer-plan diagram** (`skills/archify`) → `docs/diagrams/layer-plan.html`.
5. Update `.context/progress.json`: `totalLayers`, `currentLayer: 0`, `completedTasks: []`, `inProgressTask: null`.
6. **DỪNG chờ user duyệt plan** (human checkpoint) trước khi chạy layer 0.

## Rule
- Tasks trong cùng layer không phụ thuộc nhau; task nhỏ (1-3 files), acceptance criteria testable.
- **Layer N+1 chỉ unlock khi toàn bộ layer N PASS review + user approve.**
- Spec/design chưa có → chạy `/spec-init` + `/brainstorm` trước, đừng bịa layer.
