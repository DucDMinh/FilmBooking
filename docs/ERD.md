# ERD — Overview & Pointers

> ⚠️ **Không nhúng schema tay ở đây** — sẽ lệch với migration thật.
> File này là **overview + pointer** tới source of truth.

## Source of truth

1. **Migration files** — versioned, đã commit (tool: `.context/project-config.md` → `migrations.tool`).
2. **Schema file** — vd `prisma/schema.prisma` / `drizzle/schema.ts` / model files trong `source_roots`.
3. **Generated inventory** — `docs/generated/` (chạy lại, không sửa tay).

> Nếu overview này khác migration/schema → **migration/schema thắng**.

## Database

**Type:** PostgreSQL (Supabase) · **Migration tool:** Supabase CLI (`supabase/migrations/*.sql`, versioned) · **ORM:** không (supabase-js + RPC)

## Entity overview (as-built — cập nhật theo layer)

> Chỉ mô tả **mục đích + quan hệ**; cột/kiểu/index/policy chi tiết lấy từ migration. Mọi bảng `public` bật RLS.

| Entity | Mục đích | Quan hệ chính | Migration |
|--------|----------|---------------|-----------|
| `provinces` | Tỉnh/thành (lọc khu vực) | has many `cinemas` | 20261111010000 |
| `profiles` | Hồ sơ người dùng (1-1 `auth.users`, tự tạo bằng trigger; email citext unique, nullable cho Facebook không email) | belongs to `auth.users` | 20261111010000 |
| `user_roles` | Vai trò toàn chuỗi (ADMIN) — chỉ Admin ghi | belongs to `profiles` | 20261111010000 |
| `cinemas` | Rạp (mã duy nhất, trạng thái COMING_SOON/OPEN/TEMP_CLOSED/CLOSED, cấu hình dọn phòng/đóng bán online) | belongs to `provinces` | 20261111010000 |
| `staff_assignments` | Gán user ↔ rạp ↔ vai trò (STAFF/MANAGER); Manager chỉ thêm/bớt STAFF rạp mình | belongs to `profiles`, `cinemas` | 20261111010000 |
| `app_settings` | Cấu hình toàn chuỗi (key/value, đọc công khai — không chứa secret) | has many `cinema_settings` | 20261111010000 |
| `cinema_settings` | Override cấu hình theo rạp (chỉ Admin ghi) | belongs to `cinemas`, `app_settings` | 20261111010000 |
| `consents` | Bằng chứng đồng ý điều khoản/chính sách (bất biến, `accepted_at` do DB đặt) | belongs to `profiles` | 20261111010000 |
| `favorite_cinemas` | Rạp yêu thích của khách | belongs to `profiles`, `cinemas` | 20261111010000 |
| `audit_logs` | Nhật ký thay đổi (actor, cinema_id, before/after) — ghi bằng trigger `audit_row_change` | (không FK, giữ lâu hơn dữ liệu gốc) | 20261111010000 |

Hàm RLS dùng chung: `is_admin()`, `has_cinema_role(cinema_id, staff_role[])` (SECURITY DEFINER, search_path rỗng).

## Relationships

```
provinces ──< cinemas ──< staff_assignments >── profiles ── auth.users
cinemas ──< cinema_settings >── app_settings
profiles ──< consents · profiles ──< favorite_cinemas >── cinemas · profiles ──< user_roles
```

## Notes (business rules dữ liệu)

- Soft delete? (`deleted_at`) — nếu có, ghi rõ ở đây.
- Archival / retention policy.
- Index đặc biệt: mô tả **lý do**; định nghĩa index nằm ở migration/schema.
