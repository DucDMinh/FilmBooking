# Task 06: Identity/social: trigger email liên kết + API liên kết/huỷ liên kết, Facebook không email, chặn tự gộp trùng email

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-19, R-20, R-21, R-22, R-23, R-24
- AC-xx: AC-04, AC-05

## Description
Trigger trên auth.identities insert/delete → enqueue email thông báo liên kết/huỷ (R-24). API: `GET /me/identities`, `DELETE /me/identities/:provider` (từ chối nếu là phương thức đăng nhập cuối — AC-05), `POST /me/password` thêm mật khẩu cho tài khoản OAuth (R-22), `POST /auth/oauth/missing-email` cho Facebook không email (#18: luôn thông báo chung, email cho chủ tài khoản nếu trùng). 1 tài khoản MXH ↔ 1 user (R-23).

## Dependencies
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [x] **Spike đầu tiên:** xác minh Supabase Auth có tự gộp identity OAuth vào user có cùng email đã xác nhận không. Nếu có → cấu hình/hook (vd Auth Hook hoặc kiểm ở callback) để AC-04 đúng: Google `a@x.com` lần đầu khi đã có tài khoản mật khẩu → không tạo user mới, không tự liên kết, yêu cầu đăng nhập mật khẩu rồi liên kết. Ghi kết quả spike vào Notes task.
- [x] AC-05: tài khoản chỉ còn Facebook → DELETE identity facebook → 409 kèm hướng dẫn thêm phương thức khác.
- [x] Liên kết/huỷ liên kết → 1 email thông báo trong outbox.
- [x] Facebook không email + email nhập trùng → phản hồi chung 'kiểm tra email', không tạo user trùng, không lộ email tồn tại.

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111040500_identity_hooks.sql`
- `apps/api/src/modules/identity/identity.module.ts`
- `apps/api/src/modules/identity/identity.controller.ts`
- `apps/api/src/modules/identity/identity.service.ts`
- `packages/shared/src/schemas/identity.ts`
- `apps/api/test/identity.e2e-spec.ts`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod. Rủi ro cao: hành vi auto-linking của Supabase (xem PLAN § Rủi ro).
- **Kết quả Spike (Supabase GoTrue Auto-linking — AC-04 & R-23):**
  1. Mặc định Supabase GoTrue có xu hướng tự động gộp (auto-link) identity OAuth mới vào tài khoản đã tồn tại có cùng email đã xác nhận (`email_confirmed_at is not null`).
  2. Giải pháp phòng vệ 2 lớp đã triển khai:
     - **Lớp 1 (Database Trigger `trg_guard_identity_insert` BEFORE INSERT ON `auth.identities` trong `20261111040500_identity_hooks.sql`):** Nếu `NEW.provider not in ('email', 'phone')` và user `NEW.user_id` đã có phương thức mật khẩu (`provider = 'email'` hoặc `encrypted_password <> ''`) mà biến phiên `current_setting('app.allow_identity_link', true) <> 'true'` → chặn đứng bằng lỗi `OAUTH_AUTO_MERGE_BLOCKED` (`23514`). Chỉ RPC `public.link_user_identity` (khi user đã đăng nhập chủ động liên kết) mới bật `app.allow_identity_link = 'true'`. Đồng thời cưỡng chế `(provider, provider_id)` duy nhất toàn hệ thống (`OAUTH_IDENTITY_ALREADY_LINKED`, R-23).
     - **Lớp 2 (API Callback Guard `POST /auth/oauth/callback-check` gọi RPC `public.check_oauth_collision`):** Kiểm tra trước khi hoàn tất OAuth callback, trả `409 Conflict` (`OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED`) hướng dẫn người dùng đăng nhập bằng mật khẩu trước rồi vào trang Hồ sơ để liên kết.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
