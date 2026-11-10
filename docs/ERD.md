# ERD — Overview & Pointers

> ⚠️ **Không nhúng schema tay ở đây** — sẽ lệch với migration thật.
> File này là **overview + pointer** tới source of truth.

## Source of truth

1. **Migration files** — versioned, đã commit (tool: `.context/project-config.md` → `migrations.tool`).
2. **Schema file** — vd `prisma/schema.prisma` / `drizzle/schema.ts` / model files trong `source_roots`.
3. **Generated inventory** — `docs/generated/` (chạy lại, không sửa tay).

> Nếu overview này khác migration/schema → **migration/schema thắng**.

## Database

**Type:** PostgreSQL / MySQL / MongoDB / SQLite
**ORM:** Prisma / Drizzle / TypeORM / Mongoose

## Entity overview

> Chỉ mô tả **mục đích + quan hệ**; cột/kiểu/index chi tiết lấy từ schema file.

| Entity | Mục đích | Quan hệ chính |
|--------|----------|---------------|
| User | Tài khoản đăng nhập | has many `<Entity2>` |
| `<Entity2>` | ... | belongs to User |
| `<Entity3>` | ... | ... |

## Relationships

```
User ─── has many ──→ <Entity2>
<Entity2> ─── belongs to ──→ User
<Entity2> ─── has many ──→ <Entity3>
```

## Notes (business rules dữ liệu)

- Soft delete? (`deleted_at`) — nếu có, ghi rõ ở đây.
- Archival / retention policy.
- Index đặc biệt: mô tả **lý do**; định nghĩa index nằm ở migration/schema.
