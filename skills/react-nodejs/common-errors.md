# React + Node.js — Common Errors & Fixes

## 1. Module Import Errors

### "Cannot find module '@/...'"
**Symptoms:** TypeScript/build error on import with `@/` alias
**Root Cause:** Path alias not configured in both `tsconfig.json` AND `vite.config.ts`
**Fix:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```
```typescript
// vite.config.ts
import path from 'path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
});
```
**Prevention:** Always configure path aliases in both tsconfig and bundler config.

---

## 2. Prisma Client Issues

### "PrismaClient is unable to be run in the browser"
**Symptoms:** Runtime error when frontend accidentally imports server code
**Root Cause:** Frontend code imports from `server/` directory
**Fix:** Ensure import paths don't cross boundary. Use `shared/` for shared types.
**Prevention:** Separate `client/` and `server/` concerns strictly.

### "prisma generate" not run
**Symptoms:** Types missing, PrismaClient has no methods
**Fix:** `npx prisma generate` after schema changes
**Prevention:** Add to `postinstall` script in package.json.

---

## 3. React Hydration Errors

### "Text content did not match"
**Symptoms:** Console warning about hydration mismatch
**Root Cause:** Server renders different content than client (dates, random values)
**Fix:** Use `useEffect` for client-only values, or `suppressHydrationWarning`
**Prevention:** Never render `Date.now()` or `Math.random()` directly.

---

## 4. CORS Errors

### "Access-Control-Allow-Origin missing"
**Symptoms:** Browser blocks API request
**Root Cause:** Backend CORS not configured for frontend origin
**Fix:**
```typescript
import cors from 'cors';
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
```
**Prevention:** Configure CORS early in middleware chain.

---

## 5. Auth Token Issues

### "jwt malformed" / "invalid signature"
**Symptoms:** Auth middleware rejects valid-looking tokens
**Root Cause:** Wrong secret, token from different env, or token expired
**Fix:** Verify `JWT_SECRET` matches between sign and verify
**Prevention:** Single source of truth for secrets (env vars).

---

## 6. Database Connection

### "Connection refused" / "ECONNREFUSED"
**Symptoms:** Server crashes on startup or first DB query
**Root Cause:** DB not running, wrong connection string, or port conflict
**Fix:** Check `DATABASE_URL` in `.env.local`, ensure DB is running
**Prevention:** Add connection health check on server start.

---

## 7. React State Issues

### "Cannot read properties of undefined"
**Symptoms:** Runtime error accessing nested data
**Root Cause:** Rendering before data loads (no loading state)
**Fix:** Add loading/error states, use optional chaining
```typescript
// Bad
<div>{user.profile.name}</div>

// Good
<div>{user?.profile?.name ?? 'Loading...'}</div>
```
**Prevention:** Always handle loading/error/empty states.

---

## 8. Type Errors

### "Type 'X' is not assignable to type 'Y'"
**Symptoms:** TypeScript compile error
**Root Cause:** Frontend/backend types out of sync
**Fix:** Use shared types from `shared/types/`
**Prevention:** Single source of truth for shared interfaces.

---

## 9. N+1 Query Problem

### Slow API responses with multiple DB records
**Symptoms:** Response time grows linearly with data size
**Root Cause:** Querying related data in a loop
**Fix:** Use Prisma `include` or batch queries
```typescript
// Bad: N+1
const users = await prisma.user.findMany();
for (const user of users) {
  user.posts = await prisma.post.findMany({ where: { userId: user.id } });
}

// Good: Include
const users = await prisma.user.findMany({ include: { posts: true } });
```
**Prevention:** Always check for N+1 patterns in review.

---

## 11. React Compiler Errors

### "Module 'oxc-transform-react' not found" | "reactCompilerPreset" deprecated
**Symptoms:** Build fails after bumping Vite/plugin-react; old Babel preset import error
**Root Cause:** Template migrated to native Rust compiler — `@rolldown/plugin-babel` + `reactCompilerPreset` removed
**Fix:**
```bash
npm install -D oxc-transform-react
```
```typescript
// vite.config.ts — new (Rust native)
import react from '@vitejs/plugin-react';
plugins: [react({ compiler: true })]
// NOT: babel({ presets: [reactCompilerPreset()] })
```
**Prevention:** Don't re-add `@rolldown/plugin-babel`; keep `oxc-transform-react` in devDependencies.

### Component memoization not applied (compiler bailout)
**Symptoms:** Perf regression on a component; compiler silently skips it
**Root Cause:** One of the 2 unsupported patterns: `throw` inside `try` block, or logical assignment (`??=`, `&&=`, `||=`)
**Fix:** Extract the bailout logic into a separate function/variable so the compiler can optimize the rest.
**Prevention:** Run `eslint-plugin-react-compiler` to catch these patterns at write-time.

---

### "Cannot read process.env.X" (undefined)
**Symptoms:** Feature silently fails or throws
**Root Cause:** Env var not loaded or wrong file name
**Fix:** 
- Backend: ensure `dotenv` loads early (`import 'dotenv/config'`)
- Frontend: prefix with `VITE_` for Vite projects
**Prevention:** Validate all required env vars at startup.
