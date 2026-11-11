# Task 01: Monorepo pnpm + tooling + packages/shared nền (mã lỗi, enum, tiền/giờ)

## Layer
0

## Type
build (initial)

## Requirements
- R-xx: R-57
- AC-xx: —

## Description
Dựng pnpm monorepo (apps/web, apps/api, packages/shared, supabase). Root script chạy đệ quy `pnpm -r --if-present <x>`. **Khai báo TRƯỚC toàn bộ dependency dự kiến** của apps/web và apps/api trong package.json + lockfile (để các task song song sau không đụng `pnpm-lock.yaml`). packages/shared: catalog mã lỗi đầy đủ (SEAT_TAKEN, ORPHAN_SEAT, SALES_CLOSED, HOLD_LIMIT, HOLD_EXISTS, EMAIL_NOT_CONFIRMED, ACCOUNT_LOCKED, RATE_LIMITED, DISPOSABLE_EMAIL, CAPTCHA_FAILED, VOUCHER_*, WRONG_CINEMA, TICKET_USED, SHOWTIME_CANCELLED, POS_KEY_INVALID, FORBIDDEN_CINEMA, VALIDATION_ERROR…), enum (vai trò, trạng thái đơn theo §8.5, kênh WEB/POS, loại ghế, trạng thái suất/rạp, nhãn tuổi), tiện ích VND (số nguyên, không thập phân) + Asia/Ho_Chi_Minh (lưu UTC). Export wildcard `"./*": "./src/*.ts"` để mỗi module có file schema riêng `packages/shared/src/schemas/<module>.ts` mà không sửa `index.ts`.

## Dependencies
- (không)

## Acceptance Criteria
- [ ] `pnpm install --frozen-lockfile` thành công trên máy sạch (Node theo `.nvmrc`).
- [ ] Chốt verify commands (root script): `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build` — đều chạy `pnpm -r --if-present …` và PASS (package chưa có script thì bỏ qua).
- [ ] Chốt script DB: `pnpm db:start` (supabase start — cần Docker Desktop), `pnpm db:stop`, `pnpm db:migrate` (supabase migration up, chỉ local), `pnpm db:test` (supabase test db / pgTAP), `pnpm db:types` (sinh `packages/shared/src/database.types.ts`), `pnpm test:int` (integration API, dùng từ layer 6), `pnpm e2e` (Playwright, layer 8).
- [ ] apps/web/package.json khai sẵn: next, react, tailwindcss v4, @supabase/ssr, @supabase/supabase-js, zod, lucide-react, leaflet, react-leaflet, qrcode.react, html5-qrcode, @marsidev/react-turnstile, @sentry/nextjs, các dependency shadcn (@radix-ui/react-dialog, -alert-dialog, -checkbox, -select, -tabs, -dropdown-menu, -label, -slot, class-variance-authority, clsx, tailwind-merge, tw-animate-css, sonner, react-hook-form, @hookform/resolvers), vitest, @testing-library/react, vitest-axe. apps/api/package.json khai sẵn: @nestjs/*, @nestjs/throttler, @supabase/supabase-js, jose, zod, helmet, resend, @payos/node, @sentry/nestjs, csv-stringify, reflect-metadata, rxjs, @nestjs/testing, vitest, supertest. Root devDeps: typescript, eslint, prettier, supabase CLI, @playwright/test, @lhci/cli.
- [ ] Unit test money/time: `formatVnd(120000)` → `120.000 ₫`; 17:00 giờ VN ↔ 10:00Z; không có số thập phân.
- [ ] `.env.example` liệt kê đủ biến web/api theo design doc (không có giá trị secret); `.gitignore` chặn `.env*.local`.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `.prettierrc.json`
- `.gitignore`
- `.env.example`
- `.nvmrc`
- `apps/web/package.json`
- `apps/api/package.json`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/vitest.config.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/errors.ts`
- `packages/shared/src/enums.ts`
- `packages/shared/src/money.ts`
- `packages/shared/src/time.ts`
- `packages/shared/src/__tests__/money-time.test.ts`

## Notes
Layer 0 chạy được không cần Docker. Primary điền `.context/project-config.md` từ AC #2–#3 sau khi task PASS. Dependency mới phát sinh ở layer sau: tối đa 1 task/layer được sửa package.json + lockfile.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
