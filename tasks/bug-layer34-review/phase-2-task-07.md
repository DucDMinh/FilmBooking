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
- Status: done (reviewer round 1 = FAIL C-1/C-2 → fix round 1 → reviewer round 2 = STRICT PASS. Report: .context/review-reports/bug-layer34-review-phase-2-task-07-round-2-review.md)
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
  - Verification results (sau fix round 1, reviewer round 2 tự chạy lại; 058 nay 16 assert):
    - `pnpm db:test`: 27 files, 787 tests PASS.
    - `pnpm typecheck`: PASS toàn bộ monorepo.
    - `pnpm lint`: PASS toàn bộ monorepo.
    - `pnpm test`: PASS 344/344 tests (shared 14, api 221, web 93, scripts 16).
- Quyết định user (2026-11-12T04:25:22Z): TTL link-intent 10 phút; BẮT BUỘC re-auth gần đây (đăng nhập trong ≤ 5 phút, kiểm qua `max(amr[].timestamp)` của phiên đăng nhập thật — KHÔNG dùng `iat`/`auth_time` (GoTrue không phát hành auth_time, iat đổi theo refresh)).

## Fix round 1 (sau reviewer round 1 FAIL)

- C-1: bỏ `auth_time`/`iat`. `AuthGuard` tính `authTime = max(amr[].timestamp)` (null khi amr thiếu/rỗng/string[]/sai dạng); `MeController` fail-closed `REAUTH_REQUIRED` khi null hoặc > `REAUTH_MAX_AGE_SECONDS` (300). Hằng `LINK_INTENT_TTL_MS` (10 phút).
- M-1/M-2/M-3: migration mới `supabase/migrations/20261113090000_identity_link_intent_hardening.sql` (không sửa migration cũ).

## Repro Verification

Status: PASS (reviewer round 2 STRICT PASS)

## Doc Impact / Reconcile
- `docs/API_SPEC.md`: thêm `POST /me/identities/link-intent`, `REAUTH_REQUIRED` 401, bỏ ghi chú Gap F-2.
- `docs/ERD.md`: bảng `identity_link_intents`, hành vi mới của `trg_guard_identity_insert`.

## Residual risk
- `amr[].timestamp` giữ nguyên qua refresh mới được builder kiểm với GoTrue local cho luồng mật khẩu; reviewer không tự kiểm lại được (lệnh bị agent-guard chặn). Chưa kiểm luồng đăng nhập OAuth; chưa có smoke login → refresh → endpoint thật. Thiếu `amr` thì fail-closed.
- Follow-up ghi ở `progress.json`: xoá tài khoản OAuth-only còn kiểm re-auth bằng `iat` (`profile.service.ts:219-222`).

### (a) F-2: user có mật khẩu không liên kết được MXH thủ công
- Expected: user có mật khẩu + link-intent hợp lệ -> chèn identity google thành công; không intent -> 23514.
- Actual before fix: test 045 ghi "KNOWN GAP F-2" (không có đường hợp lệ nào cho user mật khẩu vì chỉ có cờ `app.allow_identity_link` dùng nội bộ). Nguồn: `tasks/bug-layer34-review/phase-1-task-04.md` mục "Gap F-2"; bằng chứng đỏ builder: `.context/runs/bug-layer34-review-phase-2-task-07.builder.md` (058 FAIL do bảng `identity_link_intents` chưa tồn tại / `caught: no exception, wanted: 23514`).
- Actual after fix (chạy lại ở round 1): `pnpm db:test` -> `Files=27, Tests=787, Result: PASS`; 058 gồm assert "intent hợp lệ -> lives_ok + consumed_at", "không intent -> 23514", 045/046 dùng intent thật.
- Status: PASS

### (b) M-05: user OAuth-only bị auto-merge
- Expected: không intent -> 23514 `OAUTH_AUTO_MERGE_BLOCKED`.
- Actual before fix: nguồn builder.md như (a): `caught: no exception, wanted: 23514` (058 assert M-05 trước migration `20261112170000`).
- Actual after fix: `pnpm db:test` PASS (787), assert "M-05: Chặn chèn identity OAuth vào user OAuth-only khi không có link intent" ok.
- Status: PASS

### (c) Phiên cũ refresh token vẫn qua re-auth (C-1)
- Original repro: token có `iat` mới (đã refresh) nhưng đăng nhập thật cách đây > 5 phút, gọi `POST /me/identities/link-intent`.
- Expected: 401 `REAUTH_REQUIRED`. Actual before fix: 204 (code cũ dùng `iat`).
- Evidence đỏ (code cũ, test mới): `cd apps/api && npx vitest run test/me.e2e-spec.ts` -> `Tests 4 failed | 10 passed (14)`:
  - "iat fresh + amr cũ 400s": `expected 204 to be 401`
  - "amr missing", "amr empty array", "amr string[]": `expected 204 to be 401`
- Actual after fix: `me.e2e-spec.ts` + `auth-guards.spec.ts` PASS (38/38 khi chạy chung); `pnpm test` api 221 tests PASS.
- Xác minh GoTrue local (user tạm tạo bằng admin API rồi xoá): login password -> claim `amr=[{method:"password",timestamp:1794536826}]`, `iat=1794536826`; sau 3.5s `grant_type=refresh_token` -> `iat=1794536830` (đổi) nhưng `amr=[{method:"password",timestamp:1794536826}]` (KHÔNG đổi), cùng `session_id`. Kết luận `amr[].timestamp` là nguồn đúng, không cần tra `auth.sessions`.
- Status: PASS
