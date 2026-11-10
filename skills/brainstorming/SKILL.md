---
name: brainstorming
description: "Dùng TRƯỚC khi làm bất kỳ feature mới, component, hay thay đổi lớn nào. Explore ý tưởng, clarify requirements, propose approaches, và viết design doc trước khi code."
---

# Brainstorming — Từ Ý Tưởng Đến Design

Biến ý tưởng thành design rõ ràng qua đối thoại có cấu trúc.

<HARD-GATE>
KHÔNG invoke implementation, KHÔNG viết code, KHÔNG scaffold bất cứ thứ gì cho đến khi:
1. Design đã được present đầy đủ
2. User đã approve
3. Spec/design doc đã được viết vào `docs/specs/` và commit
</HARD-GATE>

---

## Khi Nào Dùng Skill Này

✅ Dùng khi:
- Bắt đầu project mới (Phase 0)
- Thêm feature mới đáng kể
- Thay đổi architecture
- Có sự thay đổi lớn về data model hoặc API
- Bất cứ khi user nói "tôi muốn thêm..." hoặc "hãy build..."

❌ Không dùng cho:
- Bug fix nhỏ đã rõ nguyên nhân
- Cập nhật copy/text đơn giản
- Refactor nhỏ không thay đổi behavior

> 💡 Skill này là nửa "clear yêu cầu" của **brainstorm** (`.agent/brainstorm.md` / `/brainstorm`).
> Nửa còn lại là chốt **config dự án** (`.context/project-config.md`). Chạy cùng một phiên brainstorm.

---

## Checklist (Làm Theo Thứ Tự)

- [ ] 1. Explore project context
- [ ] 2. Đọc BRIEF / yêu cầu hiện tại
- [ ] 3. Clarify từng câu một
- [ ] 4. Propose 2-3 approaches + trade-offs
- [ ] 5. Present design theo sections, confirm từng phần
- [ ] 6. Viết design doc → commit
- [ ] 7. Tự review spec (placeholder, contradiction, scope, ambiguity)
- [ ] 8. User review + approve
- [ ] 9. Chuyển sang lập tasks

---

## Process Chi Tiết

### Bước 1: Explore Context
Trước khi hỏi bất cứ gì, check:
- Các file hiện có trong project
- `AGENTS.md` (router, stack, conventions)
- `SPECIFICATIONS.md` + `spec/` (spec hiện tại, change requests, test-scope)
- `docs/` (BRD, DESIGN, API_SPEC, ERD, diagrams)
- `.context/progress.json` (đang ở task/phase nào)
- `tasks/` (đang làm gì)

Mục tiêu: hiểu project đủ để hỏi câu đúng, không hỏi thứ đã rõ.

### Bước 2: Scope Assessment
Trước khi đi vào chi tiết, đánh giá scope:
- Nếu yêu cầu mô tả nhiều subsystem độc lập → flag ngay, đề xuất chia nhỏ
- Nếu scope hợp lý → tiến hành clarify bình thường

### Bước 3: Clarify (một câu một lúc)
- Chỉ hỏi MỘT câu mỗi message
- Ưu tiên multiple choice khi có thể
- Tập trung vào: purpose, constraints, success criteria
- Những gì đã rõ → KHÔNG hỏi lại

### Bước 4: Propose 2-3 Approaches
Đề xuất 2-3 hướng tiếp cận khác nhau:
- Lead với recommendation + lý do
- So sánh trade-offs rõ ràng
- Đợi user chọn trước khi design

### Bước 5: Present Design (từng section)
Sau mỗi section, hỏi "Phần này ok chưa?" trước khi tiếp:

**Section 1: Architecture**
- Tổng quan hệ thống
- Các layer và relationship

**Section 2: Components**
- Từng component làm gì
- Interface giữa các component

**Section 3: Data Flow**
- Data di chuyển như thế nào
- State management

**Section 4: Error Handling**
- Các edge cases
- Failure scenarios

**Section 5: Testing Strategy**
- Unit test coverage
- Integration test points
- E2E scenarios

### Bước 6: Viết Design Doc
Lưu vào: `docs/specs/YYYY-MM-DD-[topic]-design.md`

Template:
```markdown
# Design: [Topic]
Date: YYYY-MM-DD
Status: Draft → Approved

## Overview
[1-2 câu tóm tắt]

## Problem Statement
[Vấn đề cần giải quyết]

## Approach
[Approach được chọn và lý do]

## Architecture
[Diagram + mô tả]

## Components
[Từng component]

## Data Flow
[Mô tả flow]

## Error Handling
[Edge cases + failures]

## Testing Strategy
[Các test cần viết]

## Out of Scope
[Những gì KHÔNG làm trong lần này]

## Open Questions
[Câu hỏi chưa giải quyết nếu có]
```

Commit ngay sau khi viết:
```bash
git add docs/specs/
git commit -m "docs: add design spec for [topic]"
```

### Bước 7: Tự Review Spec
Check 4 điều sau khi viết xong:

1. **Placeholder** — còn TBD, TODO, [...] nào không? → Fix
2. **Consistency** — các section có mâu thuẫn nhau không? → Fix
3. **Scope** — quá lớn cho 1 implementation plan không? → Chia nhỏ
4. **Ambiguity** — requirement nào có thể hiểu 2 nghĩa không? → Làm rõ 1 nghĩa

Fix inline, không hỏi lại user.

### Bước 8: User Review Gate
Sau khi tự review xong:
> "Spec đã viết và commit tại `docs/specs/YYYY-MM-DD-[topic]-design.md`. Anh review và cho em biết có cần chỉnh gì không trước khi bắt đầu implement?"

Đợi user approve. Nếu có changes → update + re-run bước 7.

### Bước 9: Chuyển Sang Tasks
Sau khi approved:
- Tạo tasks trong `tasks/`
- Mỗi task đủ nhỏ để implement trong 1 session
- Cập nhật trạng thái hiện tại trong `.context/progress.json` nếu cần

---

## Key Principles

| Principle | Chi tiết |
|-----------|---------|
| **Một câu một lúc** | Không hỏi nhiều câu cùng lúc |
| **Multiple choice** | Dễ trả lời hơn open-ended |
| **YAGNI** | Loại bỏ feature không cần thiết |
| **2-3 approaches** | Luôn propose alternatives |
| **Incremental validation** | Confirm từng section |
| **Design for isolation** | Mỗi unit có 1 purpose rõ ràng |

---

## Với Existing Codebase

Khi thêm feature vào project đang chạy:
1. Explore structure hiện tại trước
2. Follow existing patterns
3. Nếu code hiện tại có vấn đề liên quan → include targeted improvement trong design
4. KHÔNG propose refactor không liên quan đến feature đang build
