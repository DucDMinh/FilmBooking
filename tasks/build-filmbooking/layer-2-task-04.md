# Task 04: Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR, middleware phiên

## Layer
2

## Type
build (initial)

## Requirements
- R-xx: R-15, R-16
- AC-xx: —

## Description
Client fetch tới `NEXT_PUBLIC_API_URL` dùng được ở Server Component và client, tự gắn access token Supabase; parse `{error:{code}}` → `ApiError`. error-messages.ts map **toàn bộ** catalog mã lỗi shared sang thông điệp tiếng Việt (file duy nhất cho map này). Supabase SSR cookie (`HttpOnly/Secure/SameSite=Lax`). middleware: refresh phiên, chặn `/tai-khoan`, `/ve`, `/admin`, `/staff`, `/pos` khi chưa đăng nhập → `/dang-nhap?next=<path>` (R-16).

## Dependencies
- layer-1-task-01 (Scaffold Next.js (App Router) + Tailwind v4 tokens + shadcn/ui + trang)

## Acceptance Criteria
- [ ] Test: response lỗi `SEAT_TAKEN` → ApiError có message tiếng Việt; mã chưa biết → thông điệp chung.
- [ ] Test middleware: truy cập `/ve` khi chưa đăng nhập → redirect `/dang-nhap?next=%2Fve`; `next` ngoài domain bị loại (open-redirect).
- [ ] Mọi mã lỗi trong `@filmbooking/shared/errors` có message (test lặp toàn bộ enum).
- [ ] Không import service role ở web.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/api/error-messages.ts`
- `apps/web/src/lib/api/__tests__/client.test.ts`
- `apps/web/src/lib/supabase/browser.ts`
- `apps/web/src/lib/supabase/server.ts`
- `apps/web/src/lib/supabase/env.ts`
- `apps/web/src/lib/supabase/cookie-options.ts`
- `apps/web/src/lib/auth/safe-next.ts`
- `apps/web/src/proxy.ts` (thay `middleware.ts` — Next 16.4.6)
- `apps/web/src/app/api/proxy/[...path]/route.ts`
- `apps/web/src/app/api/proxy/[...path]/__tests__/route.test.ts`

> **Quyết định (user, 2026-11-11):** cookie phiên HttpOnly + proxy mỏng `/api/proxy/*` qua Next (BRD NFR-06). Proxy không phải lớp authz: không có session thì forward không `Authorization`, Nest quyết định 401. Đăng nhập/OAuth callback/đăng xuất (layer 5) phải chạy phía server và gọi `sanitizeNext` trước khi redirect. Env server-only mới: `API_URL`.

## Notes
middleware.ts chỉ task này sửa trong layer 2. 'Ghi nhớ 30 ngày' vs phiên trình duyệt (R-15) hoàn thiện ở form đăng nhập layer-5-task-10.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
