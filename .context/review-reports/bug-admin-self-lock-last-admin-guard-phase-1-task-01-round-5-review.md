# Review — bug admin-self-lock-last-admin-guard · phase-1 task-01 · round 5

Agent: reviewer

- **Review level:** STRICT
- **Reason:** auth/RBAC (Admin cuối cùng), DB trigger + migration, mã lỗi HTTP của API contract `DELETE /me/identities/:provider`.
- **Blast radius:** `identity.service.ts` (unlinkIdentity), `identity.e2e-spec.ts`, `docs/API_SPEC.md`; gián tiếp toàn bộ bộ pgTAP chạy trên DB có seed Admin (migration `20261119100000_last_active_admin_guard.sql`).
- **Scope round 5:** đóng F1 (round 4) + rà đường FB409 còn sót + hồi quy. Không mở lại thiết kế DB đã PASS ở round 4.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 31/31, api 29 file 673/673, web 53 file 664/664 (lần chạy này `account.test.tsx` không flaky), scripts 31/31 |
| `pnpm db:test` (full, lệnh có trong allowlist; dạng có tham số file không thử lại) | FAIL tổng. **068 ok, 069 ok.** 12 file đỏ vì `provinces_name_key` / `price_rules_chain_key` (DB local bẩn, có sẵn, round 1 đã ghi). **066 đỏ vì `LAST_ADMIN` (FB409)**, xem F2 |
| `aislop` / `oxlint` / `ocr` | skip (không cấu hình / chưa cài) |

## Findings

### F1 (round 4): ĐÃ ĐÓNG
- `apps/api/src/modules/identity/identity.service.ts:100-107`: `error.code === "FB409" || msg.includes("LAST_ADMIN")` → `AppException(ERROR_CODES.CONFLICT, <vi>, { code: "LAST_ADMIN" })`. Thứ tự nhánh an toàn: trigger raise `'LAST_ADMIN: Không thể gỡ quyền...'` (migration `:82-83`), message không chứa `INVALID_OPERATION`/`LAST_LOGIN_METHOD`/`NOT_FOUND` nên không bị nhánh trước nuốt. Code 22023/23514/P0002 của `unlink_user_identity` (`20261112050000_identity_rpc_hardening.sql:113-131`) không trùng FB409. RPC không có `exception when others` nên FB409 truyền nguyên lên PostgREST.
- `AllExceptionsFilter` trả `{ error: { code, message, details } }` (`all-exceptions.filter.ts:59`, `app-exception.ts:14`) nên `res.body.error.details.code === "LAST_ADMIN"` đúng nhánh đầu.
- Test e2e mới (`identity.e2e-spec.ts:490-511`) không tautology: bỏ nhánh map thì service `throw error` (object thường) → 500 → `expect(res.status).toBe(409)` đỏ. Mock `FB409` + message `LAST_ADMIN:` khớp trigger thật.

### F2 (MAJOR, BLOCKING): migration làm đỏ pgTAP 066 trên DB có seed
- `supabase/tests/066_cinema_status_schedule.test.sql:63` chạy `update auth.users set email_confirmed_at = null where id::text not like '00000000-0000-0000-0000-066%'`, trước khi `:64` gán `ADMIN` cho `admin66`.
- Seed Admin `70000000-0000-0000-0000-000000000001` (`supabase/seed.sql:880-886` có `email_confirmed_at = now()`, chỉ identity email; `:1066` có `ADMIN`) đang là Admin hoạt động duy nhất ở thời điểm đó. Bỏ xác nhận email làm nó mất tư cách (`auth_account_is_active` `:45-47`), trigger `auth_users_last_admin_guard_update` (`:171-173`, có cột `email_confirmed_at`) → `guard_last_active_admin` raise FB409.
- Bằng chứng từ `pnpm db:test`: `psql:.../066_cinema_status_schedule.test.sql:63: ERROR: LAST_ADMIN ... trg_guard_last_admin_auth_users() line 8`, `Failed 60/60 subtests`.
- Lỗi này không phải do DB bẩn: mọi DB đã `db reset` + seed đều có Admin này, nên 066 đỏ chắc chắn. Round 1 kết luận "066 không chạm trigger" khi định nghĩa Admin hoạt động chưa gồm `email_confirmed_at`. Từ round 2 điều kiện mới được thêm vào, và round 4 chỉ chạy 068/069 nên không ai phát hiện.
- Hàng rào DB đang **đúng** (fixture đưa chuỗi về 0 Admin hoạt động). **Không** được nới trigger để test xanh.
- Hướng sửa cho Builder: trong 066, chuyển `insert into public.user_roles ... 'ADMIN'` cho `admin66` (`:64`) lên **trước** `:63`. `admin66` đã xác nhận email và khớp prefix `066%` nên vẫn hoạt động, và guard cho phép bỏ xác nhận seed Admin. Rà lại số liệu kỳ vọng của 066 (đếm người nhận email theo user hoạt động) xem có đổi không. File này nằm ngoài danh sách file của task, nên ghi lý do vào task file (regression do migration). Sau khi sửa, chạy lại 066 + 068 + 069.
- Đã grep `supabase/tests`: ngoài 066 không fixture nào khác bỏ xác nhận, ban, xoá mềm hoặc gỡ role hàng loạt seed Admin (068/069 tự quản Admin riêng và đã xanh; 067 ok).

### F3 (MINOR): assertion lỏng
- `identity.e2e-spec.ts:508`: `res.body.error?.details?.code ?? res.body.details?.code ?? JSON.stringify(res.body)` có fallback `JSON.stringify`. Hiện vẫn đúng vì message tiếng Việt và `error.code: "CONFLICT"` không chứa `LAST_ADMIN`, nhưng nên assert thẳng `res.body.error.details.code === "LAST_ADMIN"`.

### F4 (NIT): docs/comment chưa chính xác
- `docs/API_SPEC.md:72` và comment `identity.service.ts:100` ghi "không email", nhưng trigger (`migration:191-192`) kiểm `email_confirmed_at is null`, tức là **chưa xác nhận email**. Đề xuất sửa thành "Admin hoạt động cuối cùng chưa xác nhận email gỡ Facebook".

### Rà đường FB409 còn sót: không còn đường nào trả 500
- `admin/users.controller.ts:142-148` (ban/lock qua `updateUserById`) và `:356-365` (gỡ/đổi role `user_roles`) đều đã map FB409 → 409.
- `profile/profile.service.ts:144-151` (xoá tài khoản: xoá `user_roles` trước, map FB409) đã map. `deleteUser(id, true)` ở `:185` chạy sau khi role đã gỡ.
- `identity.service.ts:136` `addPassword` → `updateUserById({password})` không đụng cột trigger. `auth-ext.service.ts:185` (đổi mật khẩu) cũng không đụng cột trigger. `auth-ext.service.ts:291` `deleteUser` chỉ rollback user vừa tạo, không phải Admin.
- Đổi email (`profile.service.ts:98+`) đi qua GoTrue `PUT /auth/v1/user` và không reset `email_confirmed_at`. Phần này ngoài phạm vi, round 4 đã chấp nhận.

## Verdict

**FAIL**. F1 đã đóng đúng, nhưng migration của task làm hồi quy pgTAP `066_cinema_status_schedule` (F2, lệnh verify `pnpm db:test` đã cấu hình). Builder sửa fixture 066 (không nới trigger) rồi chạy lại 066/068/069. F3/F4 nên sửa kèm.
