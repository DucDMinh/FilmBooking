# React + Node.js — Tech Stack

> Example/default for React + Node projects only. Không phải rule global.
> Luôn đọc `.agent/PROJECT_PROFILE.md` trước: ORM lấy từ `db_tool`, package manager lấy từ
> `package_manager`. Nếu unset/`none`, không giả định Prisma/pnpm.

## Core

| Category | Technology | Version |
|----------|-----------|---------|
| Language | TypeScript | 7.0.2 (pin exact — Rust-based `tsc`, ~10x nhanh) |
| Runtime | Node.js | 24 LTS (minimum — active LTS); CI matrix test thêm Node 26 LTS, không phải default |
| Frontend | React | 19.3.1 (pin exact) |
| Bundler | Vite | 8.3.4 (pin exact) |
| React Compiler | oxc-transform-react (native Rust) | latest |
| Backend | Express | 4.x |
| ORM | From `PROJECT_PROFILE.db_tool` | `none` / `prisma` / `drizzle` / `other`; không giả định Prisma |
| Validation | Zod | 4.x (4.6.7) |

## Frontend Stack

| Category | Library | Notes |
|----------|---------|-------|
| Routing | React Router | v8 (8.4.0) |
| Server State | TanStack Query | v5 (5.104.4) |
| State | Zustand | Simple, no boilerplate |
| Server State | TanStack Query | Cache, refetch, mutations |
| Forms | React Hook Form + Zod | Validation |
| UI Framework | Tailwind CSS | Utility-first |
| UI Components | shadcn/ui | Copy-paste, customizable |
| Icons | Lucide React | Tree-shakeable |
| HTTP Client | ky / fetch | Lightweight |
| Date | date-fns | Immutable, tree-shakeable |
| React Compiler | oxc-transform-react | Native Rust compiler via `@vitejs/plugin-react` `compiler: true` |
| Animation | `<ViewTransition>` (React 19.3 — **stable**) | View Transitions API native: enter/exit/update/share qua Transitions/Suspense; `addTransitionType`; **Fragment Refs** stable — ưu tiên hơn kéo lib animation ngoài cho chuyển cảnh |

## Backend Stack

| Category | Library | Notes |
|----------|---------|-------|
| Framework | Express | Mature, vast ecosystem |
| Validation | Zod | Shared with frontend |
| Auth | jose (JWT) | Standard JWT library |
| Password | bcryptjs | Hashing |
| File Upload | multer | Multipart |
| Email | nodemailer | SMTP |
| Logging | pino | Fast, structured |
| Env | dotenv | .env loading |
| CORS | cors | Middleware |
| Rate Limit | express-rate-limit | Protection |

## Database

| Option | Use When |
|--------|----------|
| PostgreSQL | Production, complex queries, relations |
| MySQL | Legacy systems, specific hosting |
| MongoDB | Flexible schema, rapid prototyping |
| SQLite | MVP, single-server, development |

## Testing

| Category | Tool |
|----------|------|
| Unit (FE) | Vitest + Testing Library |
| Unit (BE) | Vitest |
| Integration | Vitest + supertest |
| E2E | Playwright |
| Coverage | c8 / istanbul |

## DevOps

| Category | Tool |
|----------|------|
| Package Manager | From `PROJECT_PROFILE.package_manager`; không giả định pnpm |
| Linting | ESLint |
| Formatting | Prettier |
| Git Hooks | husky + lint-staged |
| CI | GitHub Actions / GitLab CI |

## Version Pinning

Always pin exact versions in `package.json`:
```json
"dependencies": {
  "react": "19.3.1",          // ✅ exact
  "react-router": "8.4.0",    // ✅ exact
  "zod": "4.6.7",             // ✅ exact
  "@tanstack/react-query": "5.104.4", // ✅ exact
  "express": "4.19.2"         // ✅ exact
}
"devDependencies": {
  "typescript": "7.0.2",      // ✅ exact — TS 7 (Rust tsc), không dùng 5.x/6.x
  "vite": "8.3.4",            // ✅ exact
  "vitest": "5.0.5",          // ✅ exact (5.x, không dùng 4.x)
  "@vitejs/plugin-react": "6.1.1",
  "oxc-transform-react": "1.0.0"
}
// NOT "^18.2.0" or "~18.2.0"
```

## Optional upgrade path — Vite+ (`vp` CLI)

> ⚠️ **Optional, KHÔNG bắt buộc.** Không phải dependency hiện tại của template. Chỉ cân nhắc khi
> muốn gộp toolchain; template vẫn chạy tốt với Vite 8 + Vitest 5 + ESLint + Prettier như bảng trên.

**Vite+ 1.x** (1.0 ra 9/2026; tại 10/2026 đã 1.4.0) gộp nhiều tool vào 1 dependency: Vite 8 + Vitest 5 + **Rolldown** +
**Oxlint** + **Oxfmt** + **tsdown** (+ Vite Task). Binary `vp`.

Điểm đáng cân nhắc nhất:

- `vp check` — format + lint + **type-check** trong 1 lượt (thay chuỗi ESLint → Prettier → `tsc --noEmit`).
- `vp dev` / `vp test` / `vp build` — build qua **Rolldown** (thay Rollup).
- `vp migrate` — gộp config rời (`.oxlintrc*`, `.oxfmtrc*`, lint-staged) vào 1 `vite.config.ts`.
- `vp env` — quản lý luôn Node + package manager.

**Đối chiếu với template hiện tại:** bảng DevOps ở trên khai **ESLint + Prettier**; Oxlint chỉ xuất
hiện lẻ tẻ (README, `anti-slop`) và template **chưa có Oxfmt** → nếu đi Vite+ thì đó chính là phần
toolchain còn thiếu, gộp lại sẽ bớt 3–4 config file rời.

**Engine:** `vite-plus` yêu cầu `node ^22.18.0 || ^24.11.0 || >=26.0.0` — khớp baseline
**Node 24 LTS** ở bảng Core (Node 26 cũng nằm trong dải hỗ trợ).

**Khi nào KHÔNG nên đi:** project đã ổn định với ESLint/Prettier + plugin ESLint riêng, hoặc cần
rule ESLint đặc thù chưa có bản Oxlint tương đương.

Verify lại version trước khi dùng: `npm view vite-plus version` (tại 10/2026 = 1.4.0).
