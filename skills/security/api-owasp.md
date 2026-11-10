# API Security — OWASP Top 10 (Web)

Systematically assesses REST/GraphQL API endpoints against the OWASP API Security Top 10 (2023). Ensures backend endpoints are hardened before they ship.

> **BẮT BUỘC:** Áp dụng cho mọi task tạo/sửa backend route, controller, middleware, hoặc xử lý input từ client.

## When to Use

- Creating or modifying API endpoints
- Adding auth, authorization, or rate-limiting logic
- Validating request bodies / user input
- Before final review of any backend feature

## The OWASP API Top 10 Checks

### 1. Broken Object Level Authorization (BOLA/IDOR)
- Ensure every object-fetch endpoint checks the **owning user** (not just "is authed").
- `GET /users/:id`, `GET /orders/:id` → verify `:id` belongs to requesting user. FAIL if missing.
- **Pattern**: `const resource = await db.find(id); if (resource.userId !== req.user.id) return 403;`

### 2. Broken Authentication
- Valid session/token on every protected route (middleware, not per-handler).
- No weak default credentials. Password hashing = **Argon2/bcrypt** (never plain/MD5/SHA1).
- Lockout/rate-limit on login. FAIL on missing auth middleware.

### 3. Broken Object Property Level Authorization
- Prevent **mass assignment** — don't blindly `Object.assign(req.body)` to DB models.
- Whitelist allowed fields before write. FAIL on mass assignment.

### 4. Unrestricted Resource Consumption
- Rate limiting on sensitive endpoints (auth, search, uploads) — `express-rate-limit` or similar.
- Input size limits. FAIL if login/resource-heavy endpoints have NO rate limit.

### 5. Broken Function Level Authorization
- Admin-only routes must check role/permission — not just presence of a token.
- FAIL if any admin action route lacks an admin check.

### 6. Unrestricted Access to Sensitive Business Flows
- Guard high-value flows (payments, password reset) with extra checks/rate limits.

### 7. Server-Side Request Forgery (SSRF)
- User-controlled URLs fetched server-side → validate against allowlist. FAIL if user URL flows to `fetch`/`axios` unchecked.

### 8. Security Misconfiguration
- CORS allowlist explicit (no `*` with credentials). No verbose error leaks. Security headers set (Helmet/CORS).
- FAIL on permissive CORS or debug errors in prod.

### 9. Improper Inventory Management
- No deprecated/unsupported routes or libs exposed. Versioned, documented endpoints only.

### 10. Unsafe Consumption of APIs
- Validate/limit response data from third-party APIs; never eval external responses.

## Validation & Output

- Validate input on EVERY endpoint (schema via zod/joi/express-validator) before business logic.
- For every finding, state severity: **FAIL** (blocks PASS) vs **MAJOR** (should fix).
- **Any FAIL finding blocks review PASS** until resolved.

## Tone

Be specific — "POST /api/orders/:id links to any user's order (no ownership check)" not "IDOR issue".
