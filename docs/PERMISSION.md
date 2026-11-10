# PERMISSION.md — Roles & Guard Order

> ⚠️ Phải **sync với code thật** (model `Role` + seed + middleware guard). Nếu lệch → code thắng.
> Cách sync: đọc seed/quyền trong code + chạy `check_commands.docs_inventory`, rồi cập nhật file này.
> Source of truth: model/enum Role, seed data, và middleware guard trong `source_roots`.

## Roles

| Role | Mô tả | Nguồn (code) |
|------|-------|--------------|
| `USER` | Người dùng thường | `<seed/enum path>` |
| `ADMIN` | Quản trị | `<seed/enum path>` |
| ... | ... | ... |

## Guard order (thứ tự middleware trên route)

> Thứ tự quan trọng: auth → role → ownership → rate-limit → handler.

1. `authenticate` — verify token, gắn `req.user` (401 nếu thiếu/sai).
2. `authorize(role)` — check role (403 nếu thiếu quyền).
3. `checkOwnership` — BOLA/IDOR: `:id` phải thuộc `req.user` (hoặc admin) — `skills/security/bola-idor.md`.
4. `rateLimit` — login/resource-heavy endpoints.
5. handler — validate input (schema) trước business logic.

## Route ↔ permission matrix

> Điền từ code; đây là bảng **overview** để review, không phải nguồn thực thi.

| Route | Method | Auth | Role | Ownership |
|-------|--------|------|------|-----------|
| `/auth/login` | POST | no | — | — |
| `/users` | GET | yes | ADMIN | — |
| `/users/:id` | GET/PUT/DELETE | yes | USER/ADMIN | self hoặc ADMIN |
| ... | ... | ... | ... | ... |

## Ghi chú sync

- Khi thêm/sửa role hoặc guard → cập nhật file này **trong cùng task**.
- Không hardcode role string rải rác; dùng enum/hằng chung.
