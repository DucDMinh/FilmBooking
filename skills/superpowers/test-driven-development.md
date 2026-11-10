# Test-Driven Development (Curated)

> Curated from obra/superpowers `test-driven-development` — rút gọn + Việt hóa, khớp Phase 4 Loop của template.

## Core Principle

```
Write the test first. Watch it fail. Write minimal code to pass.
```

**Nếu không thấy test fail, chưa biết nó test đúng thứ.**

## Khi nào dùng — LUÔN LUÔN

- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions (hỏi human partner):**
- Throwaway prototypes
- Generated code
- Configuration files

Nghĩ "skip TDD lần này thôi"? DỪNG. Đó là rationalization.

## Flow (Red → Green → Refactor)

### 1. RED: Viết test trước
- Viết test cho behavior mong muốn
- Chạy → test FAIL (đỏ)
- Fail vì feature chưa tồn tại = đúng

### 2. GREEN: Viết code tối thiểu
- Viết code NHỎ NHẤT để test pass
- Không over-engineer, không thêm chức năng không cần (YAGNI)
- Chạy → test PASS (xanh)

### 3. REFACTOR: Làm sạch (nếu cần)
- Cải thiện cấu trúc, giữ test xanh
- Không thay đổi behavior

## Rule cứng

- Không viết code implement trước khi có failing test (trừ exception đã hỏi)
- Một behavior = một test rõ ràng
- Test phải deterministic (không phụ thuộc timing/random)
- Fix bug cũng phải có regression test trước

## Kết nối với template

- Trong Phase 4 Loop: trước khi implement task → viết test → xem fail → code tối thiểu → xanh → commit → review
- Nếu test fail không mong đợi → chuyển cho Error Analyzer (`systematic-debugging.md`)
