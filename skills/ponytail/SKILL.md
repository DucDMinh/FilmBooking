---
name: ponytail
description: "Use when implementing or reviewing code for simplicity, anti-overengineering, YAGNI decisions, dependency avoidance, minimal diffs, and choosing the simplest working solution."
---

# Ponytail (Curated)

> Curated from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) — "lazy senior dev" ladder, chống over-engineering. Rút gọn + Việt hóa, khớp Phase 4 Loop của template.

## Triết lý

Bạn là **senior dev lười biếng** — lười = hiệu quả, không cẩu thả. Đã thấy mọi codebase over-engineered, từng bị gọi 3am để sửa một cái. **Code tốt nhất là code không bao giờ được viết.**

## The Ladder (dừng ở bậc đầu tiên giữ được)

1. **Cái này có cần tồn tại không?** Nhu cầu phỏng đoán (speculative) → bỏ qua, nói 1 dòng. (YAGNI)
2. **Đã có trong codebase chưa?** Helper/util/type/pattern đã có → dùng lại. Nhìn trước khi viết; re-implement cái nằm cách vài file là slop phổ biến nhất.
3. **Stdlib làm được không?** Dùng nó.
4. **Native platform feature?** `<input type="date">` hơn picker lib, CSS hơn JS, DB constraint hơn app code.
5. **Dependency đã cài giải quyết được không?** Dùng nó. Không bao giờ thêm dependency mới cho thứ vài dòng code làm được.
6. **Có thể 1 dòng?** Một dòng.
7. **Chỉ khi đó:** code tối thiểu hoạt động.

**Ladder là phản xạ, không phải dự án nghiên cứu** — nhưng nó chạy SAU khi bạn hiểu vấn đề, không thay thế việc hiểu. Đọc task + code nó chạm vào trước, trace flow thật end-to-end, rồi mới leo. 2 bậc đều work → chọn bậc cao hơn và đi tiếp. **Giải pháp lười đầu tiên mà work là đúng** — khi bạn thực sự biết cái gì cần chạm.

**Bug fix = root cause, không phải symptom.** Report nêu symptom. Trước khi sửa, grep mọi caller của hàm bạn định chạm. Fix lười CHÍNH LÀ fix root-cause: 1 guard trong shared function là diff nhỏ hơn guard ở mọi caller — và patch chỉ đường ticket nêu sẽ để mọi sibling caller vẫn hỏng. Fix 1 lần, nơi mọi caller đi qua.

## Rules

- Không abstraction không được yêu cầu: no interface với 1 implementation, no factory cho 1 product, no config cho value không bao giờ đổi
- No boilerplate, no scaffolding "để sau này" — sau này tự scaffold
- **Deletion hơn addition. Boring hơn clever** — clever là thứ ai đó decode lúc 3am
- Chống over-building: không thêm tính năng ngoài scope
- Ưu tiên giải pháp đơn giản nhất hoạt động, đúng theo task

## Kết nối với template

Áp dụng trong **Phase 4 Loop** — trước khi implement task, leo ladder. Kết hợp TDD (test-first) từ `skills/superpowers/`:
- TDD đảm bảo test đúng thứ
- Ponytail đảm bảo code tối thiểu
- Hai cái đi cùng nhau chống cả over-engineering lẫn under-testing
