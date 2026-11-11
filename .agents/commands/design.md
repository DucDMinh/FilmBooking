---
description: "Design — sinh design spec (screen specs) + design tokens trước khi chia layer/code. Thường chạy tự động trong /start; dùng tay để chạy lại/đổi design."
---

Chạy **Design** cho repo hiện tại. Thực thi `.agent/design.md`:

`$ARGUMENTS`

## Báo danh dashboard (prompt-level)
`/design` chạy trong session chính → **tự gọi** `enter`/`leave` (hook `Agent` không bắt được):
```bash
node tools/agent-live.mjs enter --agent design --role design   # → Pixel, phase designing
# ... xong ...
node tools/agent-live.mjs leave --agent design
```
Lỗi/thiếu file này KHÔNG chặn flow.

## Việc phải làm
1. Đọc `SPECIFICATIONS.md` + `.context/brainstorm-log.md` (+ ảnh/Figma nếu có).
2. Đọc `skills/<stack>/design-tokens.md` để đối chiếu (web: `skills/react-nodejs/`, mobile: `skills/react-native/`).
3. Hỏi user design reference: ảnh / Figma link / tự design — **hỏi một câu một lúc**.
4. Sinh/ cập nhật `skills/<stack>/design-tokens.md` (colors, typography, spacing, radius, shadows).
5. Sinh `.context/design-spec.md` (mỗi screen: layout, components, states loading/empty/error, interactions).
6. (best-effort) Có kiến trúc/flow đáng vẽ → `skills/archify/SKILL.md` → `docs/diagrams/`. archify chưa cài/bị chặn/lỗi → **ghi blocker rồi bỏ qua**, không fail bước design.
7. **DỪNG confirm design tokens với user** trước khi sang `/graph`.

## Rule
- Ảnh không rõ → hỏi lại trước khi extract.
- Đọc `skills/impeccable` + `taste-skill-v2` (trong agent) chống AI-slop; SVG icon not emoji.
- Không bịa token — theo product type + brainstorm đã chốt.
- Xong design → bàn giao `/graph` (chia layer/task).
