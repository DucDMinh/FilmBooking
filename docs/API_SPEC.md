# API Specification — Overview & Pointers

> ⚠️ **Không nhúng code/schema tay ở đây** — sẽ lệch với code thật.
> File này là **overview + pointer** tới source of truth.

## Source of truth (theo thứ tự ưu tiên)

1. **Code thật** — route/controller/validation trong `source_roots` (xem `.context/project-config.md`).
2. **Shared contract types** — `src/shared/types/api.ts` (client & server cùng import).
3. **Generated inventory** — `docs/generated/` (tạo bằng `check_commands.docs_inventory`; chỉ chạy lại, không sửa tay).
4. **OpenAPI/Swagger** (nếu có) — file do tooling sinh, không sửa tay.

> Nếu overview này khác code → **code thắng**. Cập nhật overview hoặc chạy lại inventory.

## Base URL

```
Development: http://localhost:3000/api
Production:  https://<domain>/api
```

## Authentication

`Authorization: Bearer <JWT>` — chi tiết hardening: `skills/security/jwt-security.md`.

## Response contract (bất biến)

Mọi response đi qua helper chung `ok()` / `fail()` (không viết tay `res.json()`):

```typescript
// Success
{ "success": true, "data": <payload> }

// Error
{ "success": false, "error": "<message>", "details": [...] }
```

## Endpoint overview

> Bảng dưới chỉ liệt kê **nhóm endpoint**; request/response chi tiết lấy từ code + `src/shared/types/api.ts`.

| Nhóm | Ví dụ | Auth | Ghi chú |
|------|-------|------|---------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` | public/refresh | rate-limit chặt (`skills/security/*`) |
| Users | `GET/POST /users`, `GET/PUT/DELETE /users/:id` | required | `:id` phải verify ownership — BOLA/IDOR |
| <Resource> | `...` | ... | ... |

## Error codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request — validation failed |
| 401 | Unauthorized — missing/invalid token |
| 403 | Forbidden — insufficient permissions |
| 404 | Not Found |
| 409 | Conflict — duplicate resource |
| 429 | Too Many Requests — rate limited |
| 500 | Internal Server Error |

## Rate limiting (policy)

- Auth endpoints: 10 req/phút/IP
- API endpoints: 100 req/phút/user

## Webhooks (nếu có)

> Payload shape lấy từ code publisher, không copy tay vào đây.
