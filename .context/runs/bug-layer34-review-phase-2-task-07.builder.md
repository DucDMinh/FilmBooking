# builder phase-2-task-07

- **Làm:**
  1. Test mới `supabase/tests/058_identity_link_intent.test.sql` (12 assert: chặn khi không có intent, M-05 chặn auto-merge vào OAuth-only user, chặn intent hết hạn, chặn intent đã dùng, chặn intent sai provider, PASS khi có intent hợp lệ + intent được đánh dấu consumed_at, chặn tái sử dụng intent, M-05 cho phép liên kết OAuth-only user khi có intent, user mới đăng ký lần đầu qua OAuth không cần intent, RLS khoá anon và authenticated khỏi `identity_link_intents`).
  2. Migration additive `supabase/migrations/20261112170000_identity_link_intent.sql`:
     - Tạo bảng `public.identity_link_intents(id, user_id, provider, expires_at, consumed_at, created_at)` với index lọc `(user_id, provider) where consumed_at is null`.
     - RLS enabled, revoke all từ public/anon/authenticated, cấp select/insert/update/delete cho `service_role`.
     - Cập nhật trigger `public.guard_identity_insert()`:
       - Bỏ qua provider 'email' / 'phone'.
       - Kiểm tra R-23 (1 tài khoản MXH chỉ gắn 1 user, ném 23505).
       - Kiểm tra nếu `NEW.user_id` đã là user tồn tại trong hệ thống (đã có identity nào đó trong `auth.identities`):
         Tra cứu intent hợp lệ trong `public.identity_link_intents` (`consumed_at is null and expires_at > now()`). Nếu có -> `update consumed_at = now()` và `return NEW`. Nếu không có -> ném `23514 OAUTH_AUTO_MERGE_BLOCKED: Email nay da co tai khoan mat khau — hay dang nhap de lien ket.` (chặn toàn bộ auto-merge, đóng F-2 và M-05).
       - Với user mới đăng ký lần đầu qua OAuth (chưa có identity nào): cho phép chèn, tuân theo luật collision email với user khác (AC-04).
       - Revoke all trên function `guard_identity_insert()` để bảo toàn allowlist cứng của `048_function_privileges.test.sql`.
  3. Cập nhật `045_identity_hooks.test.sql` và `046_identity_rpc_privileges.test.sql`:
     - Gỡ bỏ hoàn toàn workaround `set local app.allow_identity_link = 'true'` / `'false'` cũ (N-1).
     - Dùng intent thật cho việc liên kết danh tính thứ 2 trở đi.
  4. Backend NestJS (`apps/api`):
     - `AuthGuard` / `AuthUser`: thêm `authTime` (từ `auth_time` hoặc `iat` của JWT payload) vào `request.user`.
     - `packages/shared/src/errors.ts`: thêm `REAUTH_REQUIRED: "REAUTH_REQUIRED"` (status 401).
     - `apps/web/src/lib/api/error-messages.ts`: cập nhật thông điệp tiếng Việt cho `REAUTH_REQUIRED`.
     - `packages/shared/src/schemas/identity.ts`: thêm `linkIntentProviderSchema` và `createLinkIntentInputSchema`.
     - `MeController` (`apps/api/src/modules/me/me.controller.ts`):
       - Endpoint `POST /me/identities/link-intent`: kiểm tra re-auth (`authTime` ≤ 300s trước hiện tại, nếu quá ném `AppException(ERROR_CODES.REAUTH_REQUIRED)` status 401); chèn bản ghi vào `identity_link_intents` (TTL 10 phút); trả về 204 No Content.
  5. Test e2e NestJS:
     - Thêm describe block `POST /me/identities/link-intent` trong `apps/api/test/me.e2e-spec.ts` (4 tests: 401 without token, 400 invalid provider, 401 REAUTH_REQUIRED khi token cũ > 5 phút, 204 No Content khi token mới và provider hợp lệ).
     - Cập nhật test `apps/api/test/auth-guards.spec.ts` cho `keys` của `req.user` có `authTime`.
- **Evidence đỏ -> xanh (TDD):**
  - Database pgTAP:
    - Trước fix: test 058 FAIL do M-05 không bị chặn (`caught: no exception, wanted: 23514`) và bảng `identity_link_intents` chưa tồn tại.
    - Sau migration + sửa test fixtures: `pnpm db:test` 27 files / 783 tests PASS 100% (bao gồm 045, 046, 048, 058 xanh 12/12).
  - API e2e:
    - Trước implement `MeController`: test `POST /me/identities/link-intent` FAIL 4/4 tests (404 Not Found).
    - Sau implement: `me.e2e-spec.ts` PASS 9/9 tests.
  - Toàn bộ verification:
    - `pnpm db:test`: 27 files, 783 tests PASS.
    - `pnpm typecheck`: packages/shared, apps/api, apps/web PASS.
    - `pnpm lint`: packages/shared, apps/api, apps/web PASS (0 warnings, 0 errors).
    - `pnpm test`: packages/shared (14 tests), apps/web (93 tests), apps/api (214 tests), scripts (16 tests) PASS (tổng 337 tests PASS).
- **Trạng thái:** Builder PASS, chưa commit code, chờ reviewer (attempt 0).

## Fix round 1

- C-1: bỏ `auth_time`/`iat`; `AuthUser.authTime: number | null` = max(amr[].timestamp) (auth.guard.ts `latestLoginTimestamp`); me.controller fail-closed; hằng `REAUTH_MAX_AGE_SECONDS`, `LINK_INTENT_TTL_MS`; sửa comment decorators.ts. Xác minh GoTrue local: amr.timestamp giữ nguyên qua refresh, iat đổi (xem task file Repro Verification). Test e2e me (+6 case, 4 đỏ trước fix) và auth-guards (+2).
- C-2: thêm Repro Verification vào task file, Status in_review.
- M-1/M-2/M-3: migration mới 20261113090000_identity_link_intent_hardening.sql (đã apply local bằng `pnpm db:migrate`); 058 plan 12 -> 16 (đỏ 3 trước migration: thông điệp, M-1, CHECK provider).
- Verify: db:test 27 files/787 PASS; typecheck, lint PASS; test: shared 14, api 221, web 93, scripts 16 PASS.
- Chưa commit; chờ reviewer round 2.
