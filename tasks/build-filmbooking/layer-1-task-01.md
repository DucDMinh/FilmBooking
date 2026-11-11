# Task 01: Scaffold Next.js (App Router) + Tailwind v4 tokens + shadcn/ui + trang hệ thống

## Layer
1

## Type
build (initial)

## Requirements
- R-xx: — (hạ tầng/wiring, không R-xx trực tiếp)
- AC-xx: —

## Description
Khởi tạo apps/web: App Router TS, Tailwind v4, chép khối globals.css từ `skills/react-nodejs/design-tokens.md` (CINEMO, **chỉ dark theme** — D1), font, shadcn init + bộ component cơ bản, trang 404/500/403 (B25), `lang="vi"`.

## Dependencies
- layer-0-task-01 (Monorepo pnpm + tooling + packages/shared nền (mã lỗi, enum, tiền/giờ))

## Acceptance Criteria
- [ ] `pnpm --filter web build` và `pnpm --filter web typecheck|lint|test` PASS.
- [ ] globals.css khớp token trong design-tokens.md (màu/radius/spacing/shadow-overlay); không có light mode, không nút đổi theme (D1).
- [ ] Trang 404/500/403 render đúng tiếng Việt, có link về trang chủ.
- [ ] Không có `SUPABASE_SERVICE_ROLE_KEY` hay biến không phải `NEXT_PUBLIC_*` trong code client.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/next.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/postcss.config.mjs`
- `apps/web/components.json`
- `apps/web/vitest.config.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/not-found.tsx`
- `apps/web/src/app/error.tsx`
- `apps/web/src/app/forbidden/page.tsx`
- `apps/web/src/lib/utils.ts`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/label.tsx`
- `apps/web/src/components/ui/dialog.tsx`
- `apps/web/src/components/ui/alert-dialog.tsx`
- `apps/web/src/components/ui/sheet.tsx`
- `apps/web/src/components/ui/select.tsx`
- `apps/web/src/components/ui/checkbox.tsx`
- `apps/web/src/components/ui/tabs.tsx`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/components/ui/card.tsx`
- `apps/web/src/components/ui/table.tsx`
- `apps/web/src/components/ui/skeleton.tsx`
- `apps/web/src/components/ui/dropdown-menu.tsx`
- `apps/web/src/components/ui/sonner.tsx`
- `apps/web/src/components/ui/form.tsx`
- `apps/web/src/app/__tests__/layout.test.tsx`

## Notes
Không sửa package.json/lockfile (đã khai ở layer-0-task-01; thiếu package của shadcn → báo Blocked). Wrapper sonner của shadcn phải bỏ `next-themes` (chỉ dark — D1). NFR-11 (≥360px), NFR-12 (focus ring, tương phản AA) áp ngay từ token.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
