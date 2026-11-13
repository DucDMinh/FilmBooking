# Review: bug-layer34-review — phase-2-task-07 (round 1)

Agent: reviewer

> Ghi chú: file `bug-layer34-review-phase-2-task-07-round-1-review.md` (đúng tên quy ước) đã bị ghi đè bởi một nguồn khác trong lúc review bằng nội dung "STRICT PASS" có các khẳng định không đúng với bằng chứng (vd "oxlint PASS", "ocr preview OK" — reviewer không chạy các lệnh này; coi `auth_time` là claim của Supabase — sai). Đây là report thật của reviewer; session chính đã thay file quy ước bằng nội dung này ngày 2026-11-13 theo quyết định user (bản "STRICT PASS" còn trong commit c675fdb).

## Review level: STRICT

## Reason
Auth/identity (re-auth, liên kết MXH), migration DB mới + thay thân trigger `guard_identity_insert` trên `auth.identities`, mã lỗi shared mới (`REAUTH_REQUIRED`), `AuthUser` (shared guard) đổi shape.

## Blast radius
- `AuthGuard` / `AuthUser`: mọi route có JWT (thêm field `authTime`, không đổi hành vi xác thực).
- Trigger `trg_guard_identity_insert`: mọi INSERT vào `auth.identities` (signup OAuth lần đầu, auto-link GoTrue, `linkIdentity`, `mark_password_set`).
- Endpoint mới `POST /me/identities/link-intent`; bảng mới `public.identity_link_intents`.
- `packages/shared` errors map (web + api), `database.types.ts`.

## Verify commands + result
Tôi tự chạy (lệnh từ `.context/project-config.md`):

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — Files=27, Tests=783 (045, 046, 048, 049, 058 ok) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 14, api 214, web 93, scripts 16 |
| `aislop scan --changes --json` | skip — không có trong allowlist verify, không xác minh được đã cài |
| `npx oxlint` | skip — không xác minh được oxlint config (glob timeout) |
| `ocr` | skip — ocr not verified/installed |

Suite xanh KHÔNG chứng minh re-auth đúng (xem C-1).

## Verdict: ❌ FAIL

## Summary
Phần DB (bảng intent, trigger consume nguyên tử, RLS/grant, R-23, AC-04 cho user mới) đạt. Nhưng kiểm tra re-auth ở API thực tế dựa vào `iat` của access token — phiên cũ chỉ cần refresh là qua — trái quyết định user; test e2e false-confidence. Task file thiếu `Repro Verification`.

## Findings

### ✅ Good
- Trigger: SECURITY DEFINER + `set search_path = public, auth, pg_temp`; `revoke all ... from public, anon, authenticated` (migration :107); `create or replace` giữ ACL; 048 allowlist PASS. R-23 (23505) giữ ở đầu hàm. Luật va chạm email cho user mới (AC-04) giữ nguyên. Signup OAuth lần đầu không cần intent (058:169-173). `email`/`phone` return sớm nên `mark_password_set` không bị ảnh hưởng.
- Khớp intent (user_id, provider), còn hạn, chưa dùng, consume trong cùng giao dịch; `select ... limit 1 for update` (:64-72) → insert đồng thời thứ 2 chờ khoá, re-check `consumed_at is null` sau commit → không còn dòng → 23514 (fail-closed).
- 058 phủ: không intent, OAuth-only không intent (M-05), hết hạn, đã dùng, sai provider, hợp lệ + consumed_at, tái dùng, OAuth-only có intent, user mới, `authenticated` SELECT/INSERT 42501. (Báo cáo builder nói khoá "anon và authenticated" nhưng 058:178-193 chỉ test `authenticated` — over-claim nhỏ.)
- Bảng: RLS bật, revoke public/anon/authenticated, grant service_role; index partial `(user_id, provider) where consumed_at is null`; FK `on delete cascade`.
- `REAUTH_REQUIRED` đồng bộ `packages/shared/src/errors.ts` (code + 401) và `apps/web/src/lib/api/error-messages.ts`. Web không có handler 401 global gây sign-out. Spam endpoint bị giới hạn bởi `ThrottlerGuard` global (`apps/api/src/app.module.ts:39`).
- `database.types.ts` khớp cột/nullable/default của migration.
- 045/046 gỡ `app.allow_identity_link`, thay bằng intent thật — assert không yếu đi (lives_ok 045 nay chứng minh đường intent thật).
- Migration additive (CREATE TABLE + `create or replace function`), không sửa migration đã apply, không có op HIGH_RISK → không gắn `HIGH_RISK_MIGRATION`. Thay đổi hành vi có chủ đích: auto-link GoTrue vào user OAuth-only nay bị chặn (M-05).

### ❌ Issues

- **[CRITICAL] C-1 — Re-auth dựa vào `iat`; phiên cũ refresh token là qua (vi phạm quyết định user)**
  - `apps/api/src/common/auth/auth.guard.ts:74-79`: `authTime = auth_time ?? iat ?? 0`; `apps/api/src/modules/me/me.controller.ts:46-49`: `nowSec - user.authTime > 300`.
  - Bằng chứng GoTrue không phát hành `auth_time`: `node_modules/.pnpm/@supabase+auth-js@2.119.0/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:2014-2041` — required claims `iss, aud, exp, iat, sub, role, aal, session_id`; tuỳ chọn `amr?: AMREntry[] | string[]` (`AMREntry { method, timestamp }`, :329). Không có `auth_time`. `supabase/config.toml:311-314` custom access token hook đang comment. Grep `auth_time` toàn repo chỉ ra code/test của builder.
  - Hệ quả: token thật luôn rơi vào nhánh `iat`; access token refresh có `iat` = lúc refresh → phiên đăng nhập nhiều ngày trước vẫn qua ≤ 300s. Kẻ chiếm phiên có thể tạo intent và liên kết MXH của họ vào tài khoản nạn nhân.
  - False-confidence test: `apps/api/test/me.e2e-spec.ts:146-170` tự bơm `auth_time` (claim GoTrue không có). Helper `token()` (:57-68) luôn `setIssuedAt()` = now → bỏ `auth_time` thì case 204 vẫn PASS — chính là lỗ hổng. Không có case "iat mới, phiên cũ → 401".
  - Hướng sửa (builder tự xác minh với GoTrue local): bỏ hẳn fallback `iat`, thiếu nguồn → fail-closed `REAUTH_REQUIRED`; dùng `max(amr[].timestamp)` (GoTrue lấy từ `auth.mfa_amr_claims` của session, giữ qua refresh; dạng `string[]` → fail-closed) hoặc tra `auth.sessions` theo claim `session_id` bằng service_role. Test: `iat` mới + `amr` cũ → 401; `amr` mới → 204; thiếu `amr`/`session_id` → 401; nên có smoke GoTrue local (login → refresh → gọi endpoint). Sửa comment `decorators.ts:15`.

- **[CRITICAL — gate] C-2 — Thiếu `Repro Verification` (bug repro closure không kiểm chứng được)**
  - `tasks/bug-layer34-review/phase-2-task-07.md` không có mục `Repro Verification` (status/evidence). Theo luật bug repro closure → FAIL (unverifiable). Builder bổ sung: repro trước (vd 045 KNOWN GAP F-2 / user mật khẩu không link được; OAuth-only auto-merge M-05) → sau fix PASS, kèm lệnh + kết quả; sau khi sửa C-1 thêm repro "refresh phiên cũ → 401".

- **[MINOR] M-1 — Trigger bỏ nhánh `encrypted_password` khi xác định "user đã tồn tại"**
  - Cũ `20261111040500_identity_hooks.sql:100-103` (identity `email` OR `encrypted_password`); mới `20261112170000_identity_link_intent.sql:60-63` chỉ `exists(auth.identities ...)`. User có mật khẩu nhưng 0 identity → bước 3, check va chạm loại trừ chính user (:94) → auto-merge lọt.
  - Hiện khó xảy ra: `admin.createUser({email,password})` (`auth-ext.service.ts:85,197`) tạo identity `email`; `mark_password_set` (`20261112050000_identity_rpc_hardening.sql:195-206`) chèn identity `email`; chỉ lọt khi `updateUserById` thành công mà `mark_password_set` lỗi (`identity.service.ts:127-131`). Đề xuất OR lại điều kiện `encrypted_password` + 1 case pgTAP.

- **[MINOR] M-2 — Thông điệp 23514 sai ngữ cảnh**: `20261112170000_identity_link_intent.sql:82` "da co tai khoan mat khau" cũng trả cho user OAuth-only và intent hết hạn/đã dùng. Dùng thông điệp trung tính.

- **[MINOR] M-3 — `provider` không có CHECK; mock insert luôn thành công**: migration :12 `provider text not null` không ràng buộc ('google','facebook'). `me.e2e-spec.ts:38-43` mock `insert` luôn `{error:null}`; nhánh `INTERNAL_ERROR` (`me.controller.ts:58-60`) không có test.

### AI-readable gate (skills/ai-readable-codebase mục 6)
Indicators: (1) magic number `300` và `10 * 60 * 1000` inline (`me.controller.ts:47,51`), TTL lặp với default DB (migration :13); (2) comment gây hiểu sai `decorators.ts:15` ("thời điểm đăng nhập thực ... auth_time / iat"). Doc chưa cập nhật thuộc close-out (FU-4). → 2 indicators, **dưới ngưỡng** (≥3 mới FAIL).

### 💡 Suggestions / follow-up (không tính FAIL)
- FU-1: Không có job dọn intent hết hạn/đã dùng (demo chấp nhận).
- FU-2: Không có test đồng thời cho consume intent.
- FU-3: Web chưa nối link-intent → `supabase.auth.linkIdentity` (bước 3 thiết kế) — UI R-21 Layer 5.
- FU-4: Doc reconcile ở close-out: `docs/API_SPEC.md` (endpoint + `REAUTH_REQUIRED` 401), `docs/ERD.md` (bảng + trigger mới).

## Verdict Reasoning
FAIL do C-1 (CRITICAL — re-auth bypass bằng refresh token, trái quyết định user; test false-confidence) và C-2 (thiếu Repro Verification). Phần DB đạt. Sửa C-1, C-2 (bắt buộc), nên sửa M-1..M-3, rồi review round 2.
