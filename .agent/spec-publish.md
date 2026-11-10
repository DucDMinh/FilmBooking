# Spec Publisher — quy trình TỰ ĐỘNG phát hành spec cho template test

> **Mục đích:** sau khi Change Request (bug/feature) xử lý xong → **tự động** bump version spec + ghi delta + sinh `spec/test-scope/current.json` để template TEST nắm được ngay feature/bug mới cần test gì.
> **Bắt buộc:** chạy ở cuối MỌI bug-fix / feature-update **và initial build** (trước commit close-out). Không cần user nhắc.

## Khi nào chạy
- **Sau** Change Request Agent xử lý ADDITIVE/MODIFY/REMOVE (feature) — cuối §3.6/§3.9b
- **Sau** bug PASS review (bug workflow §2.7b)
- **Lần đầu initial build xong** (sau layer cuối, mọi task PASS): spec-init đã tạo bản nháp `trigger: initial-build` → spec-publisher CẬP NHẬT theo phạm vi thật đã build (`scopeVersion` +1, `risk` theo kết quả verify).
- Trigger tự động; đây là bước cuối trước commit close-out.

## 4 việc phải làm (theo thứ tự)

### 1. Bump `spec_version` (nếu spec đổi)
Sửa frontmatter `SPECIFICATIONS.md`:
```yaml
---
spec_version: 1.5.0   # MAJOR breaking / MINOR thêm req,feature / PATCH làm rõ
updated_at: 2026-10-05
---
```
- Chỉ bump khi requirement đổi (thêm/sửa/xoá/đổi ngữ nghĩa). Bug fix thuần không đổi requirement → giữ nguyên version, chỉ sinh scope.

### 2. Ghi delta `spec/updates/YYYY-MM-DD-<slug>.md`
```markdown
# Spec Update — 2026-10-05 <slug>
**spec_version:** 1.4.0 → 1.5.0 (MINOR)
**Trigger:** feature-update | bug-fix
**Requirements:** THÊM R-12 ... / SỬA R-05 ... / XOÁ R-08 ...
**Ảnh hưởng:** module X, test luồng Y
```

### 3. Thêm dòng `spec/CHANGELOG.md`
```
| 1.5.0 | 2026-10-05 | MINOR | Thêm R-12 <mô tả> | scope v4 |
```

### 4. Sinh/cập nhật `spec/test-scope/current.json` (bàn giao cho TEST)
```jsonc
{
  "specVersion": "1.5.0",
  "scopeVersion": 4,                 // tăng 1 mỗi lần sinh
  "generatedAt": "2026-10-05T14:12:00+07:00",
  "trigger": "feature-update | bug-fix | initial-build",
  "workItem": "feature-stripe-selfserve",
  "specRefs": ["R-12"],              // requirement mới/đổi
  "changed": { "files": [...], "modules": [...] },
  "impact": {
    "direct": [...],                  // test mới/sửa
    "dependents": [...],              // test lại
    "regression": [...]               // luồng cũ cần retest
  },
  "acceptance": [...],
  "risk": "low | medium | high"
}
```

## Bàn giao cho test (tự động, không cần kể lại)
- Commit spec + scope cùng close-out commit.
- Template TEST sync spec tự động khi chạy `/autotest` → thấy `scopeVersion` mới + `specVersion` mới → tạo test case cho phần mới, test đúng phạm vi.
- **Không cần** thông báo thủ công — test đọc `spec/test-scope/current.json`.

## Rules
1. **Tự động** — không chờ user nhắc mới làm.
2. Bug fix thuần (không đổi requirement) → không bump version, vẫn sinh scope (test cần biết vùng vừa sửa).
3. Feature/thay đổi requirement → bump version + delta + changelog + scope.
4. `specRefs` phải trỏ requirement thật trong `SPECIFICATIONS.md`.
5. Luôn tăng `scopeVersion` (không ghi đè cùng số).
6. Close-out commit gồm: code + `spec/updates/*` + `spec/CHANGELOG.md` + `spec/test-scope/current.json`.
