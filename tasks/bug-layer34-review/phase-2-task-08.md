# Bug layer34-review · phase-2-task-08 — Xoá tài khoản OAuth-only: re-auth dựa `iat` (cùng lớp lỗi C-1 của task-07)

- Classification / Risk: BUG (bảo mật, re-auth) · severity=high · review level expected=STRICT (auth/session, xoá tài khoản)
- Nguồn: `.context/review-reports/bug-layer34-review-phase-2-task-07-round-2-review.md` (FU-A, FU-C, m-1). User yêu cầu sửa 2026-11-13.
- Spec: R-29 (xoá tài khoản, xác nhận lại danh tính).
- Root cause (đã xác minh bằng đọc code):
  - `apps/api/src/modules/profile/profile.service.ts:218-222`: nhánh OAuth-only của `assertReauthenticated` kiểm "đăng nhập gần đây" bằng `decodeJwt(user.jwt).iat`. `iat` là thời điểm phát hành access token, đổi mỗi lần refresh token → phiên đăng nhập cũ vẫn qua ngưỡng `RECENT_LOGIN_SECONDS` (5 phút). Ai cầm phiên còn sống của tài khoản OAuth-only xoá được tài khoản mà không cần đăng nhập lại qua nhà cung cấp.
  - Nguồn đúng đã có: `AuthUser.authTime` = `max(amr[].timestamp)` do `AuthGuard` tính (`apps/api/src/common/auth/auth.guard.ts`, commit bb68b3b), giữ nguyên qua refresh; null khi thiếu/sai dạng.
- Scope:
  1. `profile.service.ts`: nhánh OAuth-only dùng `user.authTime`; null hoặc quá hạn → từ chối (fail-closed), giữ mã lỗi/HTTP hiện tại của nhánh này. Bỏ `decodeJwt` nếu không còn dùng.
  2. Gom phép kiểm "đăng nhập gần đây" thành một helper dùng chung cho `me.controller.ts` (link-intent) và `profile.service.ts`; helper từ chối cả `authTime` ở tương lai quá độ lệch đồng hồ cho phép (m-1).
  3. Test `apps/api/test/profile.e2e-spec.ts`: token `iat` mới + `amr` cũ → bị từ chối (đỏ trước fix); `amr` mới → xoá được; thiếu `amr` → bị từ chối. Test link-intent hiện có vẫn xanh.
  4. Sửa comment lỗi thời `apps/api/src/modules/identity/identity.service.ts:15` (còn nhắc `app.allow_identity_link`) (FU-C).
- Ngoài scope: FU-B (`profile.service.ts:209` xác định "có mật khẩu" chỉ theo identity `email`) — hiện không có đường tạo user có mật khẩu mà thiếu identity `email`; giữ ở followups.
- Retry/Escalation: sau 3 attempt fail → `architecture_review_needed`.
- Status: done (reviewer round 1 STRICT PASS. Report: .context/review-reports/bug-layer34-review-phase-2-task-08-round-1-review.md)

## Implementation Summary
- Mới: `apps/api/src/common/auth/recent-login.ts` — `isRecentLogin(authTime, maxAge=RECENT_LOGIN_MAX_AGE_SECONDS, now)`; hằng `RECENT_LOGIN_MAX_AGE_SECONDS` (5 phút, một hằng chung) và `CLOCK_SKEW_TOLERANCE_SECONDS` (60). False khi null, quá hạn, hoặc authTime ở tương lai > 60s.
- `profile.service.ts`: nhánh OAuth-only dùng `isRecentLogin(user.authTime)`; giữ nguyên FORBIDDEN + message; bỏ import `decodeJwt` và hằng `RECENT_LOGIN_SECONDS`; sửa comment.
- `me.controller.ts`: dùng `isRecentLogin`, giữ 401 REAUTH_REQUIRED; bỏ hằng `REAUTH_MAX_AGE_SECONDS`.
- `identity.service.ts`: chỉ sửa comment (link-intent + `identity_link_intents` + `guard_identity_insert` thay cho `app.allow_identity_link`).
- Test: `apps/api/test/recent-login.spec.ts` (mới, 5 test); `apps/api/test/profile.e2e-spec.ts` — helper `sign` nhận `amr`, test cũ "needs a freshly issued token" thay bằng 5 test dựa `amr`.

## Repro Verification
- Expected: OAuth-only với token `iat` mới nhưng `amr` login > 5 phút, hoặc thiếu/`string[]` amr -> 403, không xoá; `amr` mới -> 200.
- Actual before fix (`cd apps/api && npx vitest run test/profile.e2e-spec.ts`): 4 failed | 27 passed. Đỏ: "rejects a refreshed token (fresh iat) whose amr login is older than 5 minutes" (nhận 200, mong 403), "rejects when amr is missing" (200 vs 403), "rejects when amr is string[]" (200 vs 403), "deletes when amr login is recent, even if the token iat is older" (403 vs 200).
- Actual after fix: `npx vitest run` toàn apps/api 15 files / 230 tests pass; `pnpm typecheck` (apps/api) sạch; `pnpm lint` (apps/api) sạch.
- Reviewer tự chạy ở root: `pnpm typecheck`, `pnpm lint` PASS; `pnpm test` PASS (shared 14, api 230, web 93, scripts 16).
- Status: PASS

## Doc Impact / Reconcile
- no doc impact: không đổi endpoint, mã lỗi, HTTP status hay schema (link-intent vẫn 401 `REAUTH_REQUIRED`, xoá tài khoản vẫn 403).

## Residual risk
- `authTime = max(amr[].timestamp)` chỉ đúng nếu GoTrue không thêm entry `amr` khi refresh token. Mới có builder task-07 kiểm luồng mật khẩu trên GoTrue local; chưa kiểm độc lập, chưa kiểm luồng OAuth. Follow-up ghi ở `progress.json`.
