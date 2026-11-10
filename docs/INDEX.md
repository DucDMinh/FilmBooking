# docs/ — Index

> `/spec-init` auto-scan và classify file trong `docs/`. File này phân loại rõ
> **canonical** (dùng để validate) vs **historical** (tham khảo, không dùng để chặn).

## Canonical (source of truth — dùng để validate)

| File | Loại | Ghi chú |
|------|------|---------|
| `BRD.md` | business_requirements | Yêu cầu nghiệp vụ |
| `DESIGN.md` | design_spec | Design spec / Figma notes |
| `API_SPEC.md` | api_spec | **Overview + pointer** → code + `src/shared/types/api.ts` |
| `ERD.md` | database_schema | **Overview + pointer** → migration/schema file |
| `PERMISSION.md` | business_rules | Role list + guard order, **sync từ seed + guards thật** |
| `generated/` | generated | Sinh tự động bằng `check_commands.docs_inventory` — **không sửa tay** |

## Historical (tham khảo — không dùng để validate)

| File | Ghi chú |
|------|---------|
| `diagrams/` | Diagram minh họa (archify) — verify với code trước khi tin |

## Optional: manual classification hint

Nếu muốn bỏ auto-detect, điền:

```yaml
# - filename.md: brd
# - filename.md: design
# - filename.md: api_spec
# - filename.md: erd
# - filename.md: architecture
# - filename.md: other
```

## Không có docs?

Để trống/điền tối thiểu — `/spec-init` sẽ dựng spec từ code.

## Quy tắc

- **Không nhúng code/schema tay** vào docs canonical → dùng pointer + `docs/generated/`.
- Mọi thay đổi code/config/docs/schema → commit-first tracking là source of truth.
