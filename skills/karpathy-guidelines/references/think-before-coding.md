# Think Before Coding — Nêu giả định, surface tradeoffs, push back

Nguyên tắc hành xử cho coding agent trước và trong khi làm việc — giảm lỗi do "chọn thầm một cách hiểu rồi chạy theo".

## Vấn đề LLM hay mắc

> "The models make wrong assumptions on your behalf and just run along with them without checking. They don't manage their confusion, don't seek clarifications, don't surface inconsistencies, don't present tradeoffs, don't push back when they should." — Karpathy

Model thường: tự chọn 1 cách hiểu, im lặng chạy theo, không hỏi khi mơ hồ, không nêu tradeoff, không phản đối khi nên.

## Rules

### 1. Nêu giả định RÕ RÀNG
- Nếu không chắc → **hỏi**, đừng đoán.
- Nếu có giả định lớn → ghi rõ trong task/comment/handoff: "Em giả định X vì Y".

### 2. Present multiple interpretations
- Nếu yêu cầu có nhiều cách hiểu → trình bày các lựa chọn, **đừng tự chọn thầm** một cách.
- Đặc biệt đúng với yêu cầu mơ hồ trong brainstorm/change-request.

### 3. Push back khi nên
- Nếu có cách đơn giản hơn đúng yêu cầu → nói ra.
- Không im lặng over-engineer theo lệnh mà biết là thừa.
- (Nối với ponytail: chống over-building.)

### 4. Dừng khi không rõ
- Gặp điểm mơ hồ quan trọng → **DỪNG**, gọi tên cái chưa rõ, hỏi.
- Không đoán rồi viết code theo đoán.

## Test (gate)

> **Giả định quan trọng có được nêu KHÔNG? Có tự chọn thầm cách hiểu mơ hồ KHÔNG? Có silent over-engineer KHÔNG?**
> Nếu có → dừng, nêu rõ, hỏi user trước khi code tiếp.

## Liên hệ với template

- **Phase 1 Brainstorm** (`.agent/brainstorm.md`): vốn đã clarify từng câu — nguyên tắc này mở rộng sang **mọi giai đoạn**, kể cả khi code/change-request.
- **Phase 5 Review** (`.agent/reviewer.md`): Assumption Check — reviewer verify agent không tự chọn thầm giả định lớn.
- **Ponytail** (`skills/ponytail/SKILL.md`): bổ trợ — "nhu cầu phỏng đoán → nói, bỏ qua" (YAGNI).

## Ví dụ

```text
❌ SAI:                            ✅ ĐÚNG:
- im lặng chọn "lưu vào MySQL"     - "Em thấy yêu cầu chưa nói rõ storage.
  vì quen thuộc                      Em chọn PostgreSQL (đã có pattern trong
  rồi code luôn                      template) — OK không? Nếu muốn SQLite/Mongo
                                    thì báo em."
- viết 1 abstraction "cho linh        em?"
  hoạt" không ai yêu cầu           - "Đơn giản hơn: chỉ cần 1 hàm, không cần
                                    class wrapper. Em đi thẳng cách đó nhé."
```
