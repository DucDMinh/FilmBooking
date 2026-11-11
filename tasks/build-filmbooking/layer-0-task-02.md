# Task 02: Supabase init + extension + CI GitHub Actions

## Layer
0

## Type
build (initial)

## Requirements
- R-xx: R-04, R-07, R-15, R-18
- AC-xx: —

## Description
`supabase init`; cấu hình Auth local: bật xác nhận email, site_url/redirect cho web, provider Google/Facebook (đọc env), captcha Turnstile (env), SMTP qua env (Resend), thời hạn JWT/refresh phù hợp phiên 'Ghi nhớ 30 ngày'. Migration extension: pgcrypto, citext, btree_gist, pg_cron, pg_net, pgtap (test). seed.sql để trống (layer 4 điền). CI: install → lint → typecheck → test → build; job DB riêng `supabase start` + `pnpm db:test`.

## Dependencies
- (không)

## Acceptance Criteria
- [ ] `pnpm db:start` chạy được (Docker Desktop) và migration extension apply sạch; `pnpm db:test` chạy smoke pgTAP PASS.
- [ ] config.toml KHÔNG chứa secret thật (chỉ `env(...)`).
- [ ] `.github/workflows/ci.yml` chạy trên push/PR vào `staging`: pnpm cache, `pnpm install --frozen-lockfile`, `pnpm -w lint|typecheck|test|build`, job db-test (supabase start + `pnpm db:test`).
- [ ] docs/dev-setup.md: yêu cầu Docker Desktop, các lệnh `pnpm db:*`, cách điền `.env.local`, cấm `db push`/`reset` ngoài local.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/config.toml`
- `supabase/migrations/20261111000000_extensions.sql`
- `supabase/seed.sql`
- `supabase/tests/000_smoke.test.sql`
- `.github/workflows/ci.yml`
- `docs/dev-setup.md`

## Notes
Không đụng package.json (thuộc layer-0-task-01; script tên đã chốt ở đó). CI chỉ thực sự xanh sau khi merge cả 2 task L0.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
