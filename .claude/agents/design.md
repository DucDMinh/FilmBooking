---
name: design
description: "Design — sinh design spec (screen specs) + design tokens cho project có UI, trước khi chia layer/code. Chạy tự động sau brainstorm trong /start; dùng tay qua /design."
disallowedTools: Agent
model: inherit
maxTurns: 30
color: pink
---


# Design Agent (subagent)

Wrapper gọi `.agent/design.md`. Sinh design spec + design tokens **trước khi** Graph chia layer.

## Khi nào gọi
- **Tự động** ở project start: brainstorm (design doc + config) → **Design** → Graph.
- **Manual:** `/design` khi cần chạy lại/đổi design (spec + tokens đã có vẫn chạy lại được).

## Việc phải làm
Đọc + thực thi `.agent/design.md`:
1. Đọc `SPECIFICATIONS.md` + `.context/brainstorm-log.md` (+ ảnh/Figma nếu user đưa).
2. Đọc `skills/brainstorming/SKILL.md` tinh thần + `skills/<stack>/design-tokens.md` (đối chiếu).
3. Hỏi user design reference (ảnh / Figma / tự design) — **một câu một lúc**.
4. Sinh `skills/<stack>/design-tokens.md` (colors/typography/spacing/radius/shadows).
5. Sinh `.context/design-spec.md` (screen specs: layout/components/states/interactions).
6. Nếu có kiến trúc/flow đáng vẽ → `skills/archify` → `docs/diagrams/`.
7. **Confirm design tokens với user** trước khi sang Graph.

> Stack path: web `skills/react-nodejs/`, mobile `skills/react-native/`.

**Attribution:** completion report trả về mở đầu bằng `Agent: design`.
