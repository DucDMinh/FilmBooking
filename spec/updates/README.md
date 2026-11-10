# spec/updates/

> Mỗi lần update spec → 1 file `YYYY-MM-DD-<slug>.md` ghi delta (thêm/sửa/xoá requirement nào, lý do, ảnh hưởng).
> Template: xem `docs/SPEC_VERSIONING.md`.

## Template delta

```markdown
# Spec Update — <ngày> <slug>
**spec_version:** 1.4.0 → 1.5.0 (MINOR)
**Requirements:**
- THÊM: R-12 <mô tả>
- SỬA: R-05 <cũ → mới>
- XOÁ: R-08 <lý do>
**Ảnh hưởng:** code module X, test luồng Y
**Scope sinh:** spec/test-scope/current.json (scopeVersion N)
```
