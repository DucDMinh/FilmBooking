---
name: superpowers
description: "Use when debugging, fixing bugs, investigating test/lint/build failures, finding root cause before changes, or applying test-driven development for feature and bug work."
---

# Superpowers Methodology (Curated)

> Curated from [obra/superpowers](https://github.com/obra/superpowers) — chọn phần hay nhất khớp với flow OpenCode Project Template, không copy nguyên xi.

## Dùng khi nào

Áp dụng cho **mọi task code**: debug, implement feature, bugfix, refactor. Cốt lõi: **tìm root cause trước khi fix** + **TDD trước khi viết code**.

## Kích hoạt

- Loop Agent gặp test/lint/build failure → đọc `systematic-debugging.md`
- Loop Agent sắp implement feature/bugfix → đọc `test-driven-development.md`
- Error Analyzer phân tích fail → tuân theo Iron Law bên dưới

---

## 1. Systematic Debugging — Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Nếu chưa hoàn thành Phase 1 (Root Cause), **KHÔNG được đề xuất fix**. Violating letter = violating spirit.

### 4 Phases (bắt buộc tuần tự)

**Phase 1: Root Cause Investigation**
1. Đọc error message kỹ (stack trace, line number, file path, error code)
2. Reproduce nhất quán — không reproducible → thu thập data, đừng đoán
3. Check recent changes (git diff, commits, dependencies, config)
4. **Multi-component systems**: thêm diagnostic instrumentation ở mỗi boundary (log input/output) để biết layer nào fail
5. Trace data flow ngược về nguồn — fix tại source, không tại symptom

**Phase 2: Pattern Analysis**
- Tìm code tương tự đang hoạt động → so sánh với code hỏng
- Liệt kê MỌI khác biệt (dù nhỏ) — đừng nghĩ "cái đó không quan trọng"
- Hiểu dependencies/config/environment cần thiết

**Phase 3: Hypothesis & Testing (phương pháp khoa học)**
- Hình thành 1 giả thuyết duy nhất: "Tôi nghĩ X là root cause vì Y"
- Test tối thiểu: 1 biến 1 lần, KHÔNG sửa nhiều thứ cùng lúc
- Confirm → Phase 4. Không confirm → giả thuyết mới
- Không hiểu → nói "tôi chưa hiểu X", đừng giả vờ

**Phase 4: Implementation**
1. Tạo failing test case (reproduction tối giản) TRƯỚC khi fix
2. Implement 1 fix duy nhất (root cause, không "while I'm here")
3. Verify fix (test pass + không break test khác)
4. Fix không work → STOP. Nếu thử <3 lần → quay Phase 1. **Nếu ≥3 lần → nghi architecture** (đừng thử fix #4)

### Red Flags — STOP & quay lại Phase 1

- "Fix nhanh trước, điều tra sau"
- "Thử đổi X xem sao"
- "Thêm nhiều thay đổi rồi chạy test"
- "Skip test, tôi tự verify"
- "Chắc là X, để tôi fix"
- "Đây là các vấn đề chính: [list fix mà chưa điều tra]"
- "Thêm 1 lần fix nữa" (khi đã thử 2+)

### Rationalization (bào chữa) thường gặp

| Bào chữa | Thực tế |
|----------|---------|
| "Issue đơn giản, không cần process" | Simple issues cũng có root cause. Process nhanh cho bug đơn giản |
| "Khẩn cấp, không có thời gian" | Systematic debugging NHANH HƠN guess-and-check |
| "Fix nhiều thứ cùng lúc tiết kiệm thời gian" | Không isolate được cái nào work → gây bug mới |
| "Fix xong mới viết test" | Untested fixes không bền. Test-first chứng minh đúng |

---

## 2. Test-Driven Development

**Core principle:** Write the test first. Watch it fail. Write minimal code to pass.
*Nếu không thấy test fail, chưa biết nó test đúng thứ.*

### Khi nào dùng — LUÔN LUÔN
- New features, bug fixes, refactoring, behavior changes

### Exception (hỏi human partner)
- Throwaway prototypes, generated code, configuration files

### Rule cứng
- Test fail → viết code tối thiểu để pass → xanh
- Đừng tự biện minh "skip TDD lần này thôi"

---

## 3. Verification Before Completion

Trước khi claim hoàn thành:
1. Chạy được không? (run)
2. Test pass?
3. Không break feature khác?
4. Code clean, không dead code?
5. Đúng kế hoạch/task?

---

## File tham khảo trong thư mục này

- `systematic-debugging.md` — chi tiết 4 phases + red flags + quick reference
- `test-driven-development.md` — TDD rules + flow
