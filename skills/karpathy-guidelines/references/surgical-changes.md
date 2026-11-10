# Surgical Changes — Chỉ chạm đúng phần cần sửa

Nguyên tắc quan trọng nhất khi **edit/nâng cấp/refactor code có sẵn** — đặc biệt khi coding agent chạy trên một codebase nhiều layer.

## Vấn đề LLM hay mắc

Khi sửa task A, model dễ "tiện tay" sửa luôn code B nằm cạnh, đổi comment, reformat, đổi tên biến không liên quan. Kết quả: **diff phình to, khó review, nguy cơ hỏng thứ không liên quan.**

Nguyên tắc: **Mọi dòng thay đổi phải trace được về yêu cầu user.** Không có "drive-by" thay đổi.

## Rules

### 1. KHÔNG "improve" code liền kề
- Không sửa comment, formatting, đặt tên lại code KHÁC task.
- Không refactor thứ không hỏng, dù thấy "xấu".
- Match style có sẵn của codebase, dù cá nhân làm khác đi.

### 2. Chỉ dọn dẹp OO MÌNH gây ra
- Nếu mình làm biến/import/hàm trở thành orphan → xóa (thứ mình TẠO ra).
- KHÔNG xóa pre-existing dead code trừ khi user yêu cầu.

### 3. Dead code không liên quan → chỉ mention, không xóa
- Nếu thấy dead code/bug không liên quan task → ghi chú trong report/comment, để user quyết.
- Đừng tự ý xóa — có thể nó đang được dùng ở nơi khác.

### 4. Mỗi thay đổi = 1 lý do rõ ràng
- Tự hỏi: "Dòng này có cần đổi để hoàn thành task không?"
- Nếu không → đừng đổi.

## Test (gate)

> **Mỗi dòng thay đổi trong diff phải trace trực tiếp về yêu cầu của user/task.**
> Nếu không — bỏ nó đi, hoặc nêu rõ lý do cho user duyệt.

## Liên hệ với ponytail

- **Surgical Changes** bổ trợ cho ponytail (`skills/ponytail/SKILL.md`):
  - Ponytail: "deletion hơn addition, boring hơn clever" — về **what to write**.
  - Surgical: "chỉ chạm đúng phần cần, không dọn dẹp code người khác" — về **what to touch**.
- Cả hai đều chống over-engineering, nhưng surgical quan trọng hơn khi **codebase đã có nhiều layer** (đúng tình huống template này).

## Ví dụ

```text
❌ SAI (drive-by):                        ✅ ĐÚNG (surgical):
- sửa luôn format file B                  - CHỈ sửa đúng phần task A
- đổi tên biến trong hàm khác            - match style file có sẵn
- xóa dead code không liên quan           - mention dead code trong note
- thêm abstraction "để sau này"           - không thêm gì ngoài scope
```
