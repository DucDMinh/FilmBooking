---
name: karpathy-guidelines
description: "Behavioral guidelines giảm lỗi lập trình LLM thường gặp (curate từ andrej-karpathy-skills). Dùng trong Phase 4 Loop khi edit code cũ (surgical changes) và Phase 5 Review khi review diff (mỗi dòng phải trace về yêu cầu user). Bổ sung 2 nguyên tắc còn thiếu so với ponytail/superpowers: Surgical Changes + Think Before Coding."
---

# Karpathy Guidelines — Behavioral Rules giảm lỗi coding

Curate từ [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (theo [Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) về LLM coding pitfalls).

> 🎯 **Vị trí skill:** BỔ SUNG, không thay thế. Trong 4 nguyên tắc gốc, template đã có 2 nguyên tắc qua skill khác:
> - **Simplicity First** → đã có `skills/ponytail/SKILL.md` (lazy senior dev ladder, YAGNI, deletion > addition)
> - **Goal-Driven Execution** → đã có `skills/superpowers/test-driven-development.md` (test-first RED→GREEN) + Loop Iron Law
>
> Skill này chỉ giữ **2 nguyên tắc còn thiếu**: Surgical Changes + Think Before Coding, và tham chiếu chéo tới ponytail/superpowers.

## WHEN TO USE

- **Phase 4 Loop** (`.agent/loop.md`): **ĐỌC `references/surgical-changes.md` TRƯỚC khi edit bất kỳ code cũ/nâng cấp/refactor.** Chỉ chạm đúng phần cần sửa.
- **Phase 5 Review** (`.agent/reviewer.md`): Chạy **Surgical Diff Check** + **Assumption Check** khi review — mỗi dòng thay đổi phải trace về yêu cầu user; agent phải nêu giả định chứ không im lặng "chạy theo".
- **Phase 1 Brainstorm** (tham chiếu): Think Before Coding nối với clarify/surface-tradeoffs đã có ở brainstorm + design.

## FILES

- `references/surgical-changes.md` — Chạm đúng phần cần sửa, không "improve" code liền kề, chỉ dọn dẹp thứ mình gây ra, match style có sẵn.
- `references/think-before-coding.md` — State assumptions rõ ràng, present multiple interpretations, push back khi có cách đơn giản hơn, dừng khi không rõ.

## SURGICAL DIFF CHECK (GATE — Phase 5 Review)

> Checklist cho việc **review diff / code thay đổi**. Task/Layer KHÔNG PASS nếu vi phạm.

### Surgical Changes
- [ ] MỌI dòng thay đổi trace được về yêu cầu user (task/acceptance criteria)
- [ ] KHÔNG "improve" code liền kề, comment, formatting ngoài scope
- [ ] KHÔNG refactor thứ không hỏng
- [ ] Match style có sẵn (dù có thể làm khác đi)
- [ ] Dead code không liên quan → CHỈ mention, không xóa (trừ user yêu cầu)
- [ ] Orphan do MÌNH tạo (import/var/function thừa) → đã xóa
- [ ] KHÔNG có drive-by refactor / "improvement" ngoài task

### Think Before Coding (Assumption check)
- [ ] Giả định quan trọng được nêu RÕ trong task/comment/handoff — không im lặng tự chọn
- [ ] Nếu có nhiều cách hiểu → đã present (không chọn thầm)
- [ ] Nếu có cách đơn giản hơn → đã nói ra (không tự over-engineer)
- [ ] Nếu có điểm mơ hồ quan trọng → đã dừng hỏi, không đoán

### REFUSE (đánh dấu FAIL nếu thấy)
- ❌ Drive-by refactor: sửa formatting/đổi tên/refactor code không liên quan task
- ❌ "Improve" comment/code liền kề không nằm trong yêu cầu
- ❌ Giả định lớn tự chọn thầm, không nêu, không hỏi
- ❌ Over-engineer dù đã có ponytail (abstraction/feature/config không ai yêu cầu)

## Integration Points (AGENT.md)

- **Phase 4 Loop** (`.agent/loop.md`): Đọc `references/surgical-changes.md` trước khi edit code cũ. Kết hợp ponytail (simplicity) + TDD (goal-driven).
- **Phase 5 Review** (`.agent/reviewer.md`): Chạy **Surgical Diff Check** trên mọi code change; verify không có drive-by refactor + assumptions được nêu.
