# Review — bug admin-self-lock-last-admin-guard · phase-1-task-01 · round 3

Agent: reviewer

- **Review level:** STRICT
- **Reason:** auth/RBAC (quyền Admin), migration DB (hàm + trigger trên `auth.users` và `public.user_roles`), race giữa các request đồng thời, cron xoá tài khoản.
- **Blast radius:** `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role` (và grant/revoke), `DELETE /profile` (tự xoá tài khoản), mọi UPDATE/DELETE trên `auth.users` (GoTrue: ban, khoá, xoá mềm, xoá cứng, xác nhận email), cron `delete_unconfirmed_users`, RLS `user_roles_admin_delete`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: shared 31/31, api 672/672, web 664/664, scripts 31/31. Lần chạy này 2 test flaky ở `account.test.tsx` (CR-013) không đỏ. |
| `pnpm db:test supabase/tests/068_last_active_admin_guard.test.sql supabase/tests/069_last_active_admin_concurrency.test.sql` | PASS: 2 file, 41 test (068 31/31, 069 10/10). Chạy trên DB local mà builder đã áp lại migration. |
| `aislop`, `oxlint`, `ocr` | skip (không có trong allowlist / oxlint chưa cấu hình / ocr chưa cài) |
| AI-friendly web | N/A (task nội bộ) |

## Kiểm theo brief

1. **Chữ ký 4 tham số và `drop function`:** OK.
   - Grep toàn repo `auth_account_is_active`: không còn lời gọi 3 tham số nào. Các chỗ dùng: migration dòng 61, 71, 94, 101, 147, 150; ACL dòng 173; 068 dòng 41-47 và 117; 069 dòng 41 và 125; `database.types.ts:968`. Không có migration cũ nào dùng hàm này.
   - `drop function if exists ...(timestamptz, jsonb, timestamptz)` an toàn. Không có view hay policy nào phụ thuộc. Các hàm gọi nó đều viết bằng plpgsql hoặc là SQL function không dùng `BEGIN ATOMIC`, nên Postgres không ghi phụ thuộc và lệnh drop không bị chặn. Các hàm đó được `create or replace` ngay sau đó.
   - Chạy lại migration vẫn idempotent: `drop ... if exists`, `create or replace`, `drop trigger if exists`, `revoke`/`grant`.
2. **Ngữ nghĩa trigger trên `auth.users`:**
   - Chỉ vào hàng rào khi OLD đang hoạt động và NEW không còn hoạt động, hoặc khi DELETE. Cột `email_confirmed_at` đã nằm trong `UPDATE OF`.
   - Xác nhận email (chuyển không hoạt động → hoạt động) không đi qua hàng rào nên không bị chặn sai.
   - Khoá hoặc xoá user chưa xác nhận: OLD không hoạt động nên không vào hàng rào. Cron không bị kẹt (chứng minh qua code, không chỉ qua test).
   - Đặt `email_confirmed_at = null` cho Admin cuối: có vào hàng rào và bị chặn FB409.
   - **Race "xác nhận email" song song với "gỡ Admin":** chiều tăng tập Admin không lấy khoá. Bên đếm chỉ thấy lần xác nhận đã commit, nên nếu chưa commit thì kết quả là chặn (bảo thủ, không mất Admin). Mọi chuyển active→inactive đều đi qua advisory lock. Hai update trên cùng một dòng được row lock xếp tuần tự, và BEFORE trigger thấy OLD mới nhất. Kết luận: không có đường race làm chuỗi còn 0 Admin.
3. **Ca 27–30 / 31 của 068:**
   - 27–30 sẽ đỏ nếu bỏ điều kiện email. Khi đó a03 được đếm, nên 27–29 không ném lỗi và 30 trả false.
   - **Ca 31 không phân biệt được** (xem F2).
4. **Seed và fixture:**
   - `supabase/seed.sql:877-885`: Admin demo có `email_confirmed_at = now()`. File không bị sửa, vốn đã như vậy.
   - Tài khoản nhân sự tạo qua `createStaffAccount` có `email_confirm: true` (`auth-ext.service.ts:205`). Factory int-test có tham số `confirmed`.
   - `applyAdminRole` vẫn cấp ADMIN được cho tài khoản chưa xác nhận. Đây là trạng thái hợp lệ: người đó trở thành Admin hoạt động khi xác nhận email; nếu không xác nhận thì bị cron xoá.
5. **ERD:** mô tả đúng chữ ký, trigger và cột, nhưng có lý do sai cho tài khoản Facebook (xem F1).
6. Verify: xem bảng trên.

## Findings

### F1 — MAJOR (chặn PASS): định nghĩa "Admin hoạt động" loại nhầm tài khoản Facebook không email, là Admin dùng được thật

- `supabase/migrations/20261119100000_last_active_admin_guard.sql:20-21, 36` (và `docs/ERD.md` dòng thêm mới) lấy lý do: "chưa xác nhận thì không đăng nhập được và cron `delete_unconfirmed_users` sẽ xoá sau 7 ngày". Lý do này **sai với tài khoản Facebook không trả email**:
  - Spec R-19 và quyết định #18 (`SPECIFICATIONS.md:101, 578`) cho phép tài khoản Facebook không có email. Cột `profiles.email` nullable (`20261111010000_core_identity_chain.sql:57`), nên `email_confirmed_at` của các tài khoản này là null cho tới khi bổ sung email.
  - Người dùng này vẫn **đăng nhập được** qua OAuth Facebook (`supabase/config.toml:387-388`). `enable_confirmations = true` chỉ chặn đăng nhập email/mật khẩu.
  - Cron **không xoá** họ: quyết định #14 (`SPECIFICATIONS.md:576`), `20261111020100_security_ops.sql:203-204` có `not exists ... provider = 'facebook'`.
  - Tài khoản này nhận được ADMIN:
    - Admin tìm được họ theo `full_name`/`phone` (`users.controller.ts:80-83`) rồi gọi `PATCH /admin/users/:id/admin-role`.
    - Không guard nào bắt Admin phải xác nhận email: `isEmailConfirmed` chỉ dùng ở booking và `/me`.
    - `me.e2e-spec.ts:120` còn mô hình hoá sẵn trạng thái `emailConfirmed false, isAdmin true`.
- **Hệ quả (tái hiện được, đi theo logic):** chuỗi có Admin A (đã xác nhận) và Admin F (Facebook, không email, đăng nhập và quản trị bình thường).
  - Khi A tự xoá tài khoản (`DELETE /profile`), bị gỡ quyền hoặc bị khoá, `is_last_active_admin(A)` trả true và trigger ném FB409, nên API trả **409 "Admin hoạt động cuối cùng"**.
  - Điều này trái AC trong task (`phase-1-task-01.md:7`): "Admin hoạt động = có role ADMIN và tài khoản không bị khoá … Không chặn thao tác bình thường khi còn ≥ 1 Admin khác". F là Admin khác, đang hoạt động thật.
  - Chiều này bảo thủ: không làm chuỗi còn 0 Admin. Nhưng đây là lệch HTTP status so với AC trong một kịch bản với tới được, và lời giải thích trong migration/ERD sai sự thật.
- **Hướng sửa (builder chọn một):**
  - (a) Cho điều kiện khớp đúng ngoại lệ của cron: tài khoản chưa xác nhận vẫn được tính là hoạt động nếu có identity `facebook`. Cần truyền `user_id` hoặc join `auth.identities` trong `guard_last_active_admin` / `is_last_active_admin` / trigger. Phải xét thêm đường gỡ liên kết Facebook (DELETE trên `auth.identities`) của một Admin cuối không có email, vì sau khi gỡ thì người đó không còn đăng nhập được: hoặc thêm trigger, hoặc ghi rõ là ngoại lệ có chủ đích.
  - (b) Nếu chủ động giữ cách bảo thủ hiện tại: phải ghi đây là quyết định/residual risk có chủ đích (task file + gap register), sửa câu lý do trong migration header và ERD cho đúng (bỏ "không đăng nhập được", nêu rõ Admin Facebook không email không được đếm), và thêm pgTAP xác nhận hành vi đó. Phương án này đổi nghĩa AC ("Admin hoạt động"), nên cần ghi qua spec delta, không được im lặng.

### F2 — MINOR: ca 31 của 068 không phân biệt được (nhãn sai)

- `supabase/tests/068_last_active_admin_guard.test.sql:136-137`: khi chạy ca 31, a01 vẫn là Admin đã xác nhận. Nếu bỏ điều kiện email, xoá a03 sẽ gọi guard, guard thấy a01 hoạt động và cho qua. Vì vậy ca 31 **vẫn xanh khi không có bản sửa**, nó không mô phỏng được tình huống cron bị kẹt.
- Ca này cũng không gọi `public.delete_unconfirmed_users()` (thiếu `created_at < now() - 7 days` và ngoại lệ Facebook).
- Hồi quy vẫn bị 3 và 27–30 bắt, nên finding này không chặn. Đề xuất sửa ca 31:
  - Dựng trạng thái a03 là Admin duy nhất bằng `set local session_replication_role = replica` (gỡ role a01 khi trigger tắt), rồi trả về `origin`.
  - Lùi `created_at` của a03 quá 7 ngày.
  - Gọi `select public.delete_unconfirmed_users()`, assert chạy được và a03 đã bị xoá.

### F3 — MINOR: thiếu test cho chuyển trạng thái do `email_confirmed_at`

Không có pgTAP cho hai ca:
- (a) `update auth.users set email_confirmed_at = null` trên Admin cuối phải ra FB409.
- (b) Xác nhận email của Admin B (null → now()) không bị chặn, và sau đó A không còn là Admin cuối.

Logic đúng theo phân tích code, nhưng nhánh `UPDATE OF email_confirmed_at` vừa thêm chưa có test khoá lại. 069 cũng không có ca race nào liên quan đến email.

### F4 — MINOR: mock e2e trôi so với DB

`apps/api/test/admin.e2e-spec.ts:44, 50-55`: comment ghi "Mô phỏng public.auth_account_is_active" nhưng mock không có `email_confirmed_at` và `deleted_at`. Hiện không test API nào assert vào vùng khác biệt, vì API chỉ đọc boolean từ RPC. Nên đây không phải false-confidence, chỉ là comment/mock lệch so với DB. Nên sửa comment hoặc bổ sung trường.

## Không phải lỗi (đã soát)

- Gate quyền: `auth_account_is_active` và `guard_last_active_admin` không ai gọi được (kể cả `service_role`). `is_last_active_admin` chỉ `service_role` gọi được (068 ca 25–26).
- Tự khoá / tự gỡ / gỡ Admin cuối ở API trả 409 và map FB409 từ PostgREST. Riêng đường GoTrue gói lỗi thì API tra lại trước khi trả 500. Logic này không đổi so với round 2.
- `deleteAccount` xoá `user_roles` trước khi ẩn danh, nên nếu race thắng bước tra cứu sớm thì FB409 chặn trước khi có thay đổi PII. Không đổi.
- Test web flaky `account.test.tsx` (CR-013) là lỗi có sẵn, không ảnh hưởng verdict; lần chạy này cũng không đỏ.

## Verdict

**FAIL** — F1 (MAJOR): định nghĩa "Admin hoạt động" loại Admin Facebook không email. Người dùng này đăng nhập được, cron không xoá, nhưng không được đếm, nên API trả 409 trái AC ("không chặn khi còn ≥ 1 Admin khác"). Ngoài ra lời giải thích trong migration header và ERD sai sự thật. Chiều lỗi là bảo thủ (không làm mất Admin cuối). F2–F4 là MINOR, nên sửa cùng đợt.
