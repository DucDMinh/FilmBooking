# Systematic Debugging (Curated)

> Curated from obra/superpowers `systematic-debugging` — đã rút gọn + Việt hóa để khớp flow template.

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Nếu chưa hoàn thành Phase 1, **KHÔNG được đề xuất fix**. Vi phạm chữ = vi phạm tinh thần.

## 4 Phases (bắt buộc tuần tự)

### Phase 1: Root Cause Investigation

1. **Đọc error message kỹ**
   - Đọc hết stack trace, ghi line number, file path, error code
   - Error/warning thường chứa sẵn solution

2. **Reproduce nhất quán**
   - Trigger được reliably không? Steps chính xác?
   - Không reproducible → thu thập data, đừng đoán

3. **Check recent changes**
   - git diff, recent commits, dependencies mới, config change

4. **Multi-component: gather evidence**
   - Nếu hệ thống có nhiều layer (CI → build → service → DB):
   - **TRƯỚC khi fix**, thêm diagnostic instrumentation ở mỗi boundary:
     ```
     Với MỖI component boundary:
       - Log data vào
       - Log data ra
       - Verify env/config propagation
       - Check state từng layer
     Chạy 1 lần để biết CHỖ NÀO fail, RỒI mới điều tra component đó
     ```
   - Cách này lộ ra layer nào fail

5. **Trace data flow**
   - Bad value từ đâu ra? Ai gọi với bad value?
   - Trace ngược tới source → **fix tại source, không tại symptom**

### Phase 2: Pattern Analysis

- Tìm code tương tự ĐANG HOẠT ĐỘNG trong codebase
- Đọc reference implementation ĐẦY ĐỦ, đừng skim
- Liệt kê MỌI khác biệt giữa working vs broken (dù nhỏ)
- Hiểu dependencies/config/environment cần thiết

### Phase 3: Hypothesis & Testing (phương pháp khoa học)

- **1 giả thuyết duy nhất**: "Tôi nghĩ X là root cause vì Y"
- **Test tối thiểu**: thay đổi NHỎ NHẤT để test giả thuyết, 1 biến 1 lần
- Work → Phase 4. Không work → giả thuyết MỚI (đừng chồng fix)
- Không hiểu → nói "tôi chưa hiểu X", đừng giả vờ

### Phase 4: Implementation

1. **Tạo failing test case** TRƯỚC khi fix (reproduction tối giản, tự động nếu có thể)
2. **Implement 1 fix duy nhất** (root cause, không "while I'm here")
3. **Verify fix**: test pass? không break test khác?
4. **Fix không work**:
   - Thử <3 lần → quay Phase 1, phân tích với thông tin mới
   - **Thử ≥3 lần → STOP, nghi architecture** — đừng thử fix #4

**3+ fixes fail = vấn đề kiến trúc:**
- Mỗi fix lộ shared state/coupling ở chỗ khác
- Fix đòi "massive refactoring"
- Mỗi fix tạo symptom mới ở nơi khác

→ DỪNG, đặt câu hỏi nền tảng, bàn với human trước khi fix tiếp. Đây KHÔNG phải failed hypothesis — là sai architecture.

## Red Flags — STOP & quay Phase 1

- "Fix nhanh trước, điều tra sau"
- "Thử đổi X xem sao"
- "Thêm nhiều thay đổi rồi chạy test"
- "Skip test, tôi tự verify"
- "Chắc là X, để tôi fix"
- "Tôi không hiểu rõ nhưng chắc work"
- "Đây là các vấn đề chính: [list fix chưa điều tra]"
- Đề xuất fix trước khi trace data flow
- "Thêm 1 lần fix nữa" (đã thử 2+)
- Mỗi fix lộ vấn đề mới ở chỗ khác

## Bào chữa thường gặp

| Bào chữa | Thực tế |
|----------|---------|
| "Issue đơn giản, không cần process" | Simple bug cũng có root cause. Process nhanh cho bug đơn giản |
| "Khẩn cấp, không có thời gian" | Systematic debugging NHANH HƠN guess-and-check |
| "Thử cái này trước, điều tra sau" | Fix đầu tiên đặt pattern. Làm đúng từ đầu |
| "Viết test sau khi fix xong" | Untested fixes không bền. Test-first chứng minh đúng |
| "Fix nhiều cùng lúc tiết kiệm thời gian" | Không isolate được cái nào work → gây bug mới |
| "Reference dài, tôi tự adapt pattern" | Hiểu một nửa đảm bảo bug. Đọc đủ |
| "Thấy vấn đề rồi, để tôi fix" | Thấy symptom ≠ hiểu root cause |
| "Thêm 1 lần fix nữa" (sau 2+ fail) | 3+ fail = vấn đề kiến trúc. Đừng fix tiếp |

## Quick Reference

| Phase | Hoạt động chính | Tiêu chí success |
|-------|----------------|------------------|
| **1. Root Cause** | Đọc errors, reproduce, check changes, gather evidence | Hiểu WHAT + WHY |
| **2. Pattern** | Tìm working examples, so sánh | Xác định khác biệt |
| **3. Hypothesis** | Hình thành theory, test tối thiểu | Confirm hoặc hypothesis mới |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## Khi process lộ "không có root cause"

Nếu điều tra kỹ mà lộ ra vấn đề environmental/timing/external:
1. Đã hoàn thành process
2. Document đã điều tra gì
3. Implement handling phù hợp (retry, timeout, error message)
4. Thêm monitoring/logging

**Nhưng: 95% case "no root cause" là điều tra chưa đủ.**
