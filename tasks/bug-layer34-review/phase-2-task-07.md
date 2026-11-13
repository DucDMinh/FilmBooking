# Bug layer34-review · phase-2-task-07 — F-2: link-intent cho liên kết MXH thủ công (đóng luôn M-05)

- Classification / Risk: BUG (chặn chức năng spec) · severity=high · review level expected=STRICT (auth/identity)
- Nguồn: `.context/review-reports/bug-layer34-review-phase-1-task-04-round-1-review.md` (F-2), task phase-1-task-04 mục "Gap F-2".
- Spec: R-20 (SPECIFICATIONS.md:102), R-21 (:103), AC-04 (:367), NFR-17 (:357), M-05.
- Thiết kế đề xuất (chờ user duyệt chi tiết):
  1. Bảng `identity_link_intents(user_id, provider, expires_at, consumed_at)`; RLS khoá, chỉ service_role.
  2. `POST /me/identities/link-intent {provider}`: JWT + yêu cầu đăng nhập gần đây (re-auth), TTL ngắn; trả 204.
  3. Web gọi link-intent rồi `supabase.auth.linkIdentity({provider})`.
  4. Trigger `guard_identity_insert`: identity OAuth chèn vào user ĐÃ tồn tại chỉ được qua khi có intent khớp (user_id, provider), còn hạn, chưa dùng → đánh dấu consumed. Không có intent → coi là auto-merge → chặn, bất kể user có mật khẩu hay không (đóng M-05).
  5. pgTAP + e2e + smoke với GoTrue local; sửa test 045 "KNOWN GAP F-2"; gỡ cờ allow_identity_link thừa trong fixture 045/046 (N-1).
- Status: done (reviewer PASS round 1, report: .context/review-reports/bug-layer34-review-phase-2-task-07-round-1-review.md)
- Implementation Summary:
  - Database:
    - Tạo migration additive `supabase/migrations/20261112170000_identity_link_intent.sql`.
    - Tạo bảng `public.identity_link_intents` (RLS chỉ cho service_role; index lọc `where consumed_at is null`).
    - Cập nhật trigger `public.guard_identity_insert()` kiểm tra intent cho mọi user đã tồn tại (chặn auto-merge, đóng cả F-2 và M-05).
    - Tạo test pgTAP `supabase/tests/058_identity_link_intent.test.sql` (12 tests PASS).
    - Dọn dẹp cờ `app.allow_identity_link` cũ trong `045_identity_hooks.test.sql` và `046_identity_rpc_privileges.test.sql` (N-1), dùng intent thật.
  - Backend NestJS (`apps/api`):
    - Cập nhật `AuthUser` và `AuthGuard` thêm trường `authTime`.
    - Thêm mã lỗi `REAUTH_REQUIRED` (status 401) vào `packages/shared/src/errors.ts` và map tiếng Việt trong `apps/web/src/lib/api/error-messages.ts`.
    - Thêm `createLinkIntentInputSchema` vào `packages/shared/src/schemas/identity.ts`.
    - Thêm endpoint `POST /me/identities/link-intent` trong `MeController`: kiểm tra re-auth ≤ 5 phút (300s), tạo link-intent TTL 10 phút, trả về 204 No Content.
    - Bổ sung test e2e cho `POST /me/identities/link-intent` trong `apps/api/test/me.e2e-spec.ts`.
  - Verification results:
    - `pnpm db:test`: 27 files, 783 tests PASS.
    - `pnpm typecheck`: PASS toàn bộ monorepo.
    - `pnpm lint`: PASS toàn bộ monorepo.
    - `pnpm test`: PASS 337/337 tests (packages/shared, apps/api, apps/web, scripts).
- Quyết định user (2026-11-12T04:25:22Z): TTL link-intent 10 phút; BẮT BUỘC re-auth gần đây (đăng nhập trong ≤ 5 phút, kiểm qua claim auth_time/iat của phiên đăng nhập thật — không dựa iat của token refresh).
