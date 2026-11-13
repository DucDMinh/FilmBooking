# Review — bug/layer34-review · phase-2-task-08 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** auth/session (re-auth trước khi xoá tài khoản), thao tác phá huỷ dữ liệu (soft-delete user + ẩn danh PII), helper auth dùng chung (`common/auth/recent-login.ts`) cho cả link-intent.
- **Blast radius:** `DELETE /me` (nhánh OAuth-only), `POST /me/identities/link-intent`. Không đổi DB/schema/shared DTO. `AuthGuard`/`AuthUser.authTime` không đổi (task-07).

## Phạm vi đã xem
- `git diff HEAD -- apps/api` (4 file sửa) + 2 file mới `apps/api/src/common/auth/recent-login.ts`, `apps/api/test/recent-login.spec.ts`.
- Đối chiếu: `apps/api/src/common/auth/auth.guard.ts` (nguồn `authTime`), `profile.service.ts` (`deleteAccount` / `assertReauthenticated`), migration `supabase/migrations/20261113090000_identity_link_intent_hardening.sql` (cho comment identity.service).
- Grep toàn `apps/` cho `iat|decodeJwt|authTime|RECENT_LOGIN|REAUTH_MAX|allow_identity_link`.

## Verify commands + result (chạy ở root theo `.context/project-config.md`)
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, web, api) |
| `pnpm lint` | PASS (shared, web, api — `eslint src test`) |
| `pnpm test` | PASS — shared 1 file/14 test; api 15 file/230 test; web 8 file/93 test; `node --test scripts/*.test.mjs` 16/16 |
| `pnpm db:test` | không chạy — task không đụng DB |
| oxlint | skip, oxlint not configured (không có `.oxlintrc.json`/`oxlint.json` trong repo) |
| aislop / ocr | skip — không có trong allowlist verify của project-config |

Ghi chú: hook `agent-guard` cấm reviewer nối lệnh (`&&`, `|`, `;`) và chỉ cho tiền tố `cd "<dir>" && ` khi dir nằm trong `.worktrees/`. Lần gọi `cd "E:/FilmBooking" && pnpm ...` và `git diff ... && cat ...` bị chặn; tôi chạy lại đúng dạng guard cho phép: lệnh đơn `pnpm typecheck|lint|test` ở cwd vốn đã là root, `git -C ... diff` tách riêng, file mới đọc bằng Read. Không có lệnh nào vượt guard.

## Kiểm tra theo điểm

1. **`recent-login.ts` biên:** null → false; `age == 300` → true; `301` → false; tương lai ≤60s → true, >60s → false; `NaN` → mọi so sánh false → false (fail-closed); `+Infinity` → age `-Infinity` → false; số âm/`0` → age rất lớn → false. `AuthGuard.latestLoginTimestamp` (`auth.guard.ts:27-37`) đã lọc `Number.isFinite` nên NaN/Infinity không tới đây. Đơn vị: `authTime` giây (amr timestamp của GoTrue), `now = Date.now()/1000` giây — khớp. Tham số mặc định: cả 2 call site chỉ truyền 1 đối số → không gọi sai thứ tự.
2. **`profile.service.ts`:** không còn `decodeJwt`/`iat` (import `jose` đã bỏ). Nhánh OAuth-only fail-closed khi `authTime` null (`profile.service.ts:218`). `assertReauthenticated` được `await` ở dòng 136, trước mọi update/delete (139-170) → không xoá dữ liệu trước khi xác nhận. Grep `apps/`: không còn chỗ nào dùng `iat` để quyết định "đăng nhập gần đây" (chỉ còn trong comment và test).
3. **`me.controller.ts`:** giữ 401 `REAUTH_REQUIRED` + message cũ. Hằng 5 phút chỉ còn 1 nơi (`recent-login.ts:2`). Khác biệt hành vi: bỏ `Math.floor` → ngưỡng chặt hơn < 1 giây; thêm từ chối `authTime` tương lai > 60s (m-1 của task-07, đúng scope). Chấp nhận.
4. **Test `profile.e2e-spec.ts`:** đối chiếu code HEAD (`decodeJwt(user.jwt).iat`): case "iat 10s + amr 3600s → 403" ở code cũ cho 200 → bắt đúng lỗi; "iat 1800s + amr 30s → 200" ở code cũ cho 403. Assert của test cũ (stale → 403 + `softDeleted` rỗng; fresh → 200 + `softDeleted == [[OAUTH_USER, true]]`) được giữ ở case 2 và case 3 mới. Mock `getUserById` trả `{ data: { user: { identities } } }` đúng shape Supabase admin API; `softDeleted`/`identities` reset trong `beforeEach` (dòng 171-173) → case 200 không xanh giả. JWT ký thật qua `SignJWT` + `AuthGuard` thật → `authTime` đi đúng đường production.
5. **`identity.service.ts`:** diff chỉ là comment; nội dung (link-intent qua bảng `identity_link_intents`, tạo bởi `POST /me/identities/link-intent`, trigger `guard_identity_insert` tiêu thụ intent qua `consumed_at`) khớp migration `20261113090000_identity_link_intent_hardening.sql:15,58,66`. `allow_identity_link` không còn xuất hiện trong `apps/`.
6. **Repro Verification:** đủ Expected / Actual before / Actual after / Status. Số "4 failed | 27 passed" nhất quán nội bộ: trong 5 case mới, với code cũ dựa `iat` chỉ case "amr cũ + iat cũ → 403" qua; 4 case còn lại đỏ đúng như builder liệt kê. Kết quả after khớp lần chạy của tôi (api 15 file/230 test).

## Findings

### CRITICAL
- Không có.

### MAJOR
- Không có.

### MINOR (không chặn)
- **m-1** `apps/api/src/common/auth/recent-login.ts:10-14` — `maxAgeSeconds` và `nowSeconds` cùng kiểu `number`, có thể bị đảo thứ tự ở call site tương lai mà typecheck không bắt. Hiện chưa call site nào truyền >1 đối số. Đề xuất (tuỳ chọn): đổi sang object options `{ maxAgeSeconds, nowSeconds }`.
- **m-2** `apps/api/test/me.e2e-spec.ts` — chưa có e2e link-intent cho `authTime` tương lai > 60s (hành vi mới của controller); đã phủ ở unit `recent-login.spec.ts:24-27`, đủ cho demo.

### Residual risk
- Nguồn `authTime = max(amr[].timestamp)` (`auth.guard.ts:27-37`, task-07) chỉ an toàn nếu GoTrue KHÔNG thêm entry amr mới khi refresh token (vd method `token_refresh`); nếu có, `max()` tái tạo đúng lỗi `iat`. Bằng chứng hiện chỉ có ở báo cáo builder task-07 + types auth-js; review task-07 round 2 (`bug-layer34-review-phase-2-task-07-round-2-review.md:70`) cũng ghi chưa tự xác minh được. Ngoài diff task này, không đổi verdict. Đề xuất follow-up: 1 test tích hợp với GoTrue local (đăng nhập → refresh → so `amr`).

### Follow-up (ngoài scope, đã ghi trong task)
- FU-B: `profile.service.ts:207` xác định `hasPassword` chỉ theo identity `email`.
- Nhánh xác nhận mật khẩu (`profile.service.ts:208-214`) không thuộc task này.

## Security / quality
- Fail-closed ở mọi trường hợp thiếu/sai nguồn. Không lộ thêm thông tin trong message. Không có PII/log mới.
- Surgical diff: mọi dòng trace về scope 1-4 của task. File/hàm ngắn, không magic number (hằng có tên + comment WHY). AI-chaos indicators: 0.
- UI: N/A. AI-friendly web: N/A (API nội bộ).

## Verdict
**STRICT PASS**
