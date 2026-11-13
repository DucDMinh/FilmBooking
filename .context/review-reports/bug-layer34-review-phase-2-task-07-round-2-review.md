# Review: bug-layer34-review — phase-2-task-07 (round 2)

Agent: reviewer

## Review level: STRICT

## Reason
Auth/identity (re-auth trước khi liên kết MXH), shared `AuthUser` đổi kiểu (`authTime: number | null`), migration DB mới thay thân trigger `guard_identity_insert` trên `auth.identities` + thêm CHECK.

## Blast radius
- `AuthGuard`/`AuthUser`: mọi route có JWT. `authTime` chỉ được đọc ở `me.controller.ts:52` (grep `authTime|auth_time|\biat\b` trong `apps/*/src`), nên kiểu đổi sang `number | null` không làm vỡ chỗ nào khác; typecheck PASS.
- Trigger `trg_guard_identity_insert`: mọi INSERT vào `auth.identities` (đăng ký OAuth lần đầu, GoTrue auto-link, `linkIdentity`, `mark_password_set`).
- `public.identity_link_intents`: thêm CHECK `provider in ('google','facebook')`.
- Phạm vi: commit `c675fdb` + diff chưa commit (auth.guard.ts, decorators.ts, me.controller.ts, auth-guards.spec.ts, me.e2e-spec.ts, 058, task file, migration `20261113090000`).

## Verify commands + result (tôi tự chạy, lệnh lấy từ `.context/project-config.md`)

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — Files=27, Tests=787, 058 ok |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 14, api 221 (14 files), web 93, scripts 16 |
| `aislop` / `npx oxlint` / `ocr` | skip — không có trong allowlist verify |
| `pnpm exec supabase status -o env` (để lấy anon key cho smoke GoTrue) | **Blocked** bởi agent-guard (ngoài allowlist), không thử biến thể khác |
| `docker exec supabase_db_FilmBooking psql ...` (đếm dạng `encrypted_password` trong auth.users, chỉ đọc) | **Blocked** bởi agent-guard (ngoài allowlist) |

**Xác minh GoTrue:** tôi KHÔNG tự xác minh được vì lệnh bị chặn. Kết luận "refresh đổi `iat`, giữ `amr[].timestamp` và `session_id`" chỉ dựa vào báo cáo builder (task file:61). Các nguồn sau khớp với báo cáo đó: auth-js `types.d.ts:329-336` (`AMREntry.timestamp` tính bằng giây UNIX, ghi "khi method được dùng thành công") và custom access token hook ở `supabase/config.toml` đang bị comment (chỉ GoTrue phát hành `amr` dạng object). Timestamp builder ghi (1794536826 ≈ 2026-11-13) khớp ngày hiện tại.

## Trạng thái finding round 1

| ID | Trạng thái | Bằng chứng |
|---|---|---|
| C-1 (re-auth dựa `iat`) | **Closed** | `auth.guard.ts:27-37` `latestLoginTimestamp` chỉ nhận entry có `timestamp` là number hữu hạn và lấy max; `:90` không còn `iat`/`auth_time`; `SupabaseClaims` (`:9-13`) đã bỏ `iat`/`auth_time`. `me.controller.ts:52` fail-closed khi `null` hoặc `> REAUTH_MAX_AGE_SECONDS`. Test `me.e2e-spec.ts` case "iat fresh + amr 400s → 401": helper `token()` (:62-73) luôn đặt `iat` = now, nên code cũ (`auth_time ?? iat`) trả 204 → test này bắt đúng lỗi cũ (khớp bằng chứng đỏ "4 failed" ở task file:57-59). Các case amr thiếu/rỗng/string[] → 401; amr mới → 204; max timestamp → 204; insert lỗi → 500. `auth-guards.spec.ts:230-247` kiểm route khác vẫn 200 với `authTime: null`. `decorators.ts:15-20` đã sửa comment. |
| C-2 (thiếu Repro Verification) | **Closed** | Task file:38-62 có (a) F-2, (b) M-05, (c) phiên cũ refresh → 401. Mỗi mục có expected, before/after, nguồn (builder.md, lệnh vitest + output đỏ, `pnpm db:test` 787) và Status PASS. Status tổng `in_review` hợp lệ vì `.agent/workflows/bug.md` không quy định format status tổng; cần đổi khi close-out (m-4). |
| M-1 (bỏ nhánh `encrypted_password`) | **Closed** | `20261113090000...sql:45-53`: thêm `or exists(auth.users ... encrypted_password is not null and <> '')`. Không chặn nhầm luồng hợp lệ: provider `email`/`phone` return sớm (:27-29), nên đăng ký email/password và `mark_password_set` không bị ảnh hưởng. User OAuth mới có `encrypted_password` NULL hoặc `''` nên vẫn rơi vào bước 3. 058 7b đã test. |
| M-2 (thông điệp sai ngữ cảnh) | **Closed** | Migration :72 dùng thông điệp trung tính, giữ tiền tố `OAUTH_AUTO_MERGE_BLOCKED` và errcode 23514. Grep chuỗi cũ "da co tai khoan mat khau": chỉ còn trong migration lịch sử (`20261111040500:106`, `20261112170000:82`), không có code/test TS nào so khớp. 058:62 khớp chuỗi mới. `identity.service.ts:15` nhắc tên mã, không so chuỗi. |
| M-3 (thiếu CHECK provider; nhánh 500 chưa có test) | **Closed** | Migration :11-13 thêm CHECK `('google','facebook')`, khớp `linkIntentProviderSchema` (`packages/shared/src/schemas/identity.ts:61`). 058 7c test chặn `twitter` và cho qua `facebook`. Test mới `me.e2e-spec.ts` "500 INTERNAL_ERROR" phủ nhánh `me.controller.ts:63-65`. |

## Kiểm tra migration `20261113090000`
- Additive: ADD CONSTRAINT + `create or replace function`, không sửa migration đã apply.
- Giữ `security definer` + `set search_path = public, auth, pg_temp` (:18-19) và `revoke all ... from public, anon, authenticated` (:97). `create or replace` giữ ACL. 048 allowlist PASS.
- R-23 (23505) vẫn nằm đầu hàm. Luật trùng email cho user mới (AC-04, bước 3) giữ nguyên. Consume intent dùng `for update` (:62).
- **Không cần `HIGH_RISK_MIGRATION`.** `origin/staging` đang ở `e3c3d77`, nên `c675fdb` và bảng intent chưa từng được push, chưa có dữ liệu cũ để CHECK làm fail. API chỉ insert provider đã qua zod. Khi chạy local, `pnpm db:migrate` đã apply thành công.
- `database.types.ts` không cần đổi: CHECK không làm hẹp kiểu sinh ra (`provider: string`, :304), cột/nullable không đổi.

## Findings mới

### CRITICAL / MAJOR (chặn)
Không có.

### MINOR (không chặn)
- **m-1 — Thời điểm ở tương lai/mili-giây không bị từ chối** — `me.controller.ts:52`: nếu `authTime > nowSec` thì `nowSec - authTime` âm và request được cho qua. Claim do GoTrue ký và được tài liệu hoá là giây, nên không khai thác được. Đề xuất (hardening) từ chối khi `authTime > nowSec + 60`.
- **m-2 — pgTAP chưa phủ trường hợp `encrypted_password = ''`** — 058:160-173 chỉ test đăng ký OAuth lần đầu với `encrypted_password = null`, trong khi GoTrue thường lưu `''` cho user OAuth. Code đã xử lý `''` (migration :52) nhưng chưa có test. Đề xuất thêm 1 case `lives_ok` với `''`.
- **m-3 — Lỗ dư sau M-1** — user không có identity và không có mật khẩu vẫn rơi vào bước 3 (loại trừ chính mình) → auto-link không cần intent. Grep `apps/`: không có `inviteUserByEmail`/`generateLink`; các `createUser` đều kèm password (`auth-ext.service.ts:85-87,197-199`). Vì vậy hiện không có đường tạo ra user dạng này. Ghi nhận là residual risk.
- **m-4 — Task file còn số cũ** — `tasks/bug-layer34-review/phase-2-task-07.md:18,27,30` vẫn ghi 058 "12 tests", 783, 337, lệch với kết quả thật (16 / 787 / 344). Mục `Repro Verification` có `Status: in_review` (:40). Cần sửa khi close-out.

### Follow-up (ngoài scope, không tính FAIL)
- **FU-A (mức MAJOR, đề xuất mở bug riêng):** `apps/api/src/modules/profile/profile.service.ts:219-222` kiểm "đăng nhập gần đây" trước khi xoá tài khoản OAuth-only bằng `iat`. Đây đúng là lớp lỗi C-1: phiên cũ refresh token là qua được. Nên dùng chung `authTime` (amr).
- **FU-B:** `profile.service.ts:209` xác định "có mật khẩu" chỉ dựa vào identity `email`, cùng điểm yếu với M-1. User có `encrypted_password` nhưng thiếu identity `email` sẽ đi nhánh OAuth-only.
- **FU-C:** `apps/api/src/modules/identity/identity.service.ts:15` còn mô tả cơ chế `app.allow_identity_link` đã bỏ (file không thuộc diff task này).
- Các FU round 1 vẫn còn: dọn intent hết hạn, test đồng thời, nối web `linkIdentity`, reconcile doc `docs/API_SPEC.md`/`docs/ERD.md` khi close-out.

### AI-readable gate
Các magic number đã thành hằng có tên (`me.controller.ts:10-13`), comment `decorators.ts` đã sửa đúng. Indicator còn lại: 0 trong diff, nên đạt.

## Verdict: STRICT PASS

## Verdict Reasoning
C-1 đã đóng thật: không còn đường nào đưa `iat`/`auth_time` vào phép kiểm re-auth; trường hợp thiếu/sai dạng thì fail-closed; test bắt được lỗi cũ (helper luôn đặt `iat` mới). C-2 có đủ 3 mục repro với nguồn rõ. M-1/M-2/M-3 đóng bằng migration additive, không làm hỏng luồng hợp lệ, và toàn bộ verify tôi tự chạy đều xanh. Còn rủi ro dư: hành vi GoTrue khi refresh chưa được tôi tự xác minh (lệnh bị chặn), chỉ dựa vào báo cáo builder cùng types auth-js. Các MINOR và follow-up không chặn.
