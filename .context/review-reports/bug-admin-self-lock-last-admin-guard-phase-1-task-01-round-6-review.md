# Review — bug admin-self-lock-last-admin-guard · phase-1 task-01 · round 6

Agent: reviewer

- **Review level:** STRICT
- **Reason:** auth/RBAC (Admin cuối cùng), DB trigger/migration, mã lỗi HTTP của API contract. Round này chỉ xác nhận hẹp F2/F3/F4 của round 5, không mở lại phần đã PASS.
- **Blast radius:** `supabase/tests/066_cinema_status_schedule.test.sql` (fixture), `apps/api/test/identity.e2e-spec.ts`, `apps/api/src/modules/identity/identity.service.ts` (comment), `docs/API_SPEC.md:72`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm exec supabase test db supabase/tests/066_cinema_status_schedule.test.sql` | **Blocked** (agent-guard: không có trong allowlist). Tôi không lách, mà chạy lệnh allowlist bên dưới thay thế |
| `pnpm db:test` (full) | **066 ok** (chỉ còn WARNING `T66_BOOM` là kịch bản lỗi có chủ đích ở `:255`), **067, 068, 069 ok**. 13 file còn đỏ đều do `provinces_name_key` / `price_rules_chain_key`: 010, 020, 030, 031, 033, 040, 041, 042, 043, 044, 050, 063, 090. Đây là DB local bẩn, có sẵn từ round 1, đúng tập round 5 trừ 066. Không file nào còn lỗi `LAST_ADMIN` |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: shared 31/31, api 29 file 673/673, web 53 file 664/664, scripts 31/31 |

## Findings

### F2 (round 5): ĐÃ ĐÓNG
- `066:62-66`: `insert into public.user_roles (… admin66 …, 'ADMIN')` (`:64`) đã nằm trước `update auth.users set email_confirmed_at = null where id::text not like '…066%'` (`:66`), có comment giải thích. Migration/trigger không đổi.
- Ngữ nghĩa số kỳ vọng không đổi. Lệnh update chỉ đổi `auth.users` của user ngoài prefix 066, còn admin66 (prefix 066, `email_confirmed_at = now()` ở `:46`) không bị đụng ở cả hai thứ tự. Việc đổi thứ tự chỉ làm role ADMIN tồn tại sớm hơn một câu lệnh, không thay đổi tập user hoạt động hay người nhận email. Bằng chứng: 066 chạy đủ plan 60 và ok.
- Đã rà lời dispatcher về `010_core_rls.test.sql:93` (`update auth.users set email=…`). Trigger `auth_users_last_admin_guard_update` chỉ theo dõi `banned_until, raw_app_meta_data, deleted_at, email_confirmed_at` (migration `:172`), nên đổi `email` không kích hoạt trigger. Round 5 đã grep: không fixture nào khác vô hiệu hoá seed Admin.

### F3 (round 5): ĐÃ ĐÓNG
- `identity.e2e-spec.ts:508` giờ là `expect(res.body.error.details.code).toBe("LAST_ADMIN")`, khớp shape `{ error: { code, message, details } }` của `AllExceptionsFilter`. Bộ api PASS.

### F4 (round 5): ĐÃ ĐÓNG
- `docs/API_SPEC.md:72`: "409 `LAST_ADMIN` khi Admin hoạt động cuối cùng chưa xác nhận email gỡ Facebook (trigger DB `FB409`)".
- `identity.service.ts:100`: comment "Admin đăng nhập Facebook, chưa xác nhận email, gỡ liên kết Facebook". Cả hai khớp điều kiện trigger `email_confirmed_at is null` (migration `:191-192`).

### Mới
- Không có finding mới.

### Residual risk
- `pnpm db:test` toàn bộ vẫn đỏ trên DB local vì 13 file đụng unique do dữ liệu seed/demo. Lỗi này có sẵn, không do diff gây ra. Tôi không chạy được 066 riêng lẻ (Blocked), nhưng kết quả 066 trong lần chạy full đã đủ bằng chứng.

## Verdict

**STRICT PASS**
