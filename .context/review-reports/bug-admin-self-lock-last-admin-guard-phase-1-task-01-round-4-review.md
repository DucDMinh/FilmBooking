# Review — bug admin-self-lock-last-admin-guard · phase-1-task-01 · round 4

Agent: reviewer

- **Review level:** STRICT
- **Reason:** auth/RBAC (quyền Admin), migration DB (hàm SECURITY DEFINER + trigger trên `auth.users`, `auth.identities`, `public.user_roles`), race giữa các request đồng thời, cron xoá tài khoản.
- **Blast radius:**
  - API: `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role`, `DELETE /admin/users/:userId/roles/admin`, `DELETE /me`, và `DELETE /me/identities/:provider` (endpoint này mới chịu ảnh hưởng qua trigger identities).
  - DB: mọi UPDATE/DELETE trên `auth.users`, mọi DELETE trên `auth.identities` (GoTrue: ban, khoá, xoá mềm, xoá cứng cascade, xác nhận email, unlink).
  - Cron `delete_unconfirmed_users`.
- **Quyết định đã chốt (không bàn lại):** Admin hoạt động = role ADMIN, không xoá mềm, không bị khoá, và (`email_confirmed_at` not null HOẶC có identity `facebook`).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test supabase/tests/068_last_active_admin_guard.test.sql supabase/tests/069_last_active_admin_concurrency.test.sql` | PASS: 2 file, 48 test (068 38 + 069 10). Ca 3, 26 (chữ ký 5 tham số) và 35 (trigger identities) đều xanh, chứng tỏ DB local đang chạy đúng bản migration mới nhất. |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | shared 31/31, api 672/672. web 662/664: 2 test đỏ đều là flaky `account.test.tsx` > ChangePasswordForm (timeout / gõ phím lẫn ký tự), lỗi có sẵn của backlog CR-013, không liên quan diff này. Vì web đỏ nên `&&` không chạy tới `node --test scripts/*.test.mjs`. Diff không đụng `scripts/`. |
| `aislop`, `oxlint`, `ocr` | skip (không có trong allowlist / oxlint chưa cấu hình / ocr chưa cài) |
| AI-friendly web | N/A (task nội bộ) |

## Kiểm theo brief

### 1. Logic `auth_account_is_active` và trigger identities (`supabase/migrations/20261119100000_last_active_admin_guard.sql`)

**Hàm `auth_account_is_active` (dòng 29-49)**
- Khai báo `stable security definer set search_path=''`.
- Mọi tham chiếu đều qualify schema (`auth.identities`).
- Hàm chạy dưới quyền owner nên tra được `auth.identities`.

**Không chặn sai**
- Ca 33-34: Admin F (Facebook, không email) đang hoạt động thì khoá được Admin A.
- Gỡ, khoá hoặc xoá một Admin khi còn Admin hoạt động khác: guard (dòng 75-84) thấy Admin kia nên cho qua.
- Trigger identities (dòng 191-195) chỉ vào guard khi provider là `facebook` và user chưa xác nhận email. Guard cũng trả về sớm nếu người này không phải Admin hoạt động.
- Vì vậy unlink của khách thường, của user đã xác nhận email, hay của provider khác đều không tốn advisory lock.

**Không mất Admin cuối, theo từng đường active→inactive**
- Gỡ hoặc chuyển role: trigger trên `user_roles`.
- Ban, `locked`, xoá mềm, bỏ xác nhận email: trigger UPDATE OF trên `auth.users` (đã có `email_confirmed_at`).
- Xoá cứng: trigger DELETE trên `auth.users`.
- Gỡ identity FB của Admin không email: trigger mới trên `auth.identities`. Vì là BEFORE DELETE, dòng identity vẫn còn trong snapshot, nên guard thấy người này đang hoạt động rồi mới đếm "Admin khác". Ca 35 chặn đúng.
- Cả ba trigger đều gọi `guard_last_active_admin`, nên dùng chung `pg_advisory_xact_lock` và đếm lại sau khi lấy khoá.
- Thêm identity FB hoặc xác nhận email làm tập Admin tăng lên, nên không cần chặn.

**Race chéo: gỡ FB của F song song với khoá A**
- Hai bên xếp hàng qua advisory lock.
- Bên vào sau lấy snapshot mới (read committed, mỗi lệnh plpgsql một snapshot), thấy thay đổi đã commit của bên trước và ném FB409.

**Xoá user cascade identities**
- Trigger DELETE trên `auth.users` chạy trước.
- RI cascade xoá identities trong một lệnh mới, khi đó dòng user đã bị xoá nên trigger identities thấy `not exists` và bỏ qua.
- Nếu trigger identities vẫn thấy user, guard chỉ lặp lại kết luận mà trigger users vừa cho qua. Không có 500 sai.

**Luồng GoTrue khác**
- Đăng nhập OAuth và link identity là INSERT/UPDATE, trong khi trigger chỉ chạy BEFORE DELETE nên không bị ảnh hưởng.
- Web chỉ unlink qua `DELETE /me/identities/:provider` (`linked-accounts.tsx:136`).

**ACL**
- `revoke` dùng đúng chữ ký 5 tham số (dòng 207), trigger identities có revoke (dòng 212).
- Ca 26 xác nhận `service_role` không gọi được `auth_account_is_active` và `guard_last_active_admin`.
- Trigger function là SECURITY DEFINER nên GoTrue không cần quyền EXECUTE.

**Lỗi tìm thấy:** đường unlink FB của Admin cuối không email đi tới được và trả **500** (xem F1).

### 2. Khớp cron

So từng dòng với `20261111020100_security_ops.sql:200-204`:
- Cron xoá khi `email_confirmed_at is null` AND `not exists (auth.identities ... provider = 'facebook')`.
- `auth_account_is_active` dòng 45-48 là phủ định đúng của điều kiện đó: cùng cột, cùng literal, cùng khoá `user_id`.

Đánh giá các ca test:
- **31-32:** gọi cron thật `public.delete_unconfirmed_users()` sau khi lùi `created_at` 8 ngày. a03 bị xoá, không ném FB409.
- **33-36 sẽ đỏ nếu logic sai:**
  - Bỏ nhánh FB: 33 trả true, 34 ném FB409.
  - Bỏ trigger identities: 35 không ném lỗi.
  - Cron xoá nhầm a04: count = 0, hoặc FB409 vì a04 là Admin cuối.
  - Không ca nào là tautology.
- **37-38:** khoá nhánh `email_confirmed_at` (đóng F3 của round 3).

### 3. Migration

- Idempotent:
  - `drop function if exists` cho 2 chữ ký cũ;
  - `create or replace` cho mọi hàm;
  - `drop trigger if exists` trước khi `create trigger`;
  - `revoke` / `grant`.
- Không phá huỷ dữ liệu.
- Drop chữ ký cũ không làm vỡ hàm phụ thuộc, vì chúng là plpgsql hoặc SQL không `BEGIN ATOMIC` nên Postgres không ghi phụ thuộc.
- Grep toàn repo `auth_account_is_active` chỉ còn lời gọi 5 tham số:
  - migration dòng 70, 80, 103, 110, 156, 159;
  - test 068 dòng 41-47, 117;
  - test 069 dòng 41, 125;
  - `database.types.ts:968`.
- Header "6 hàm + 5 trigger" và hướng dẫn rollback khớp nội dung.
- File migration còn untracked, mới chỉ áp ở local.

### 4. Không hồi quy round 1-3

`users.controller.ts` và `profile.service.ts` không đổi logic so với round 3:
- tự khoá / tự gỡ trả 409 trước khi đổi dữ liệu;
- FB409 được map sang 409;
- `DELETE /me` xoá `user_roles` trước khi ẩn danh.

Comment của mock e2e (`admin.e2e-spec.ts:50`) đã ghi rõ là mô phỏng rút gọn (đóng F4 của round 3).

### 5. Docs

- `docs/ERD.md` chính xác: định nghĩa, chữ ký 5 tham số, 6 hàm, 5 trigger, phạm vi phủ, rollback. Lý do sai của round 3 đã được sửa.
- `docs/API_SPEC.md` đúng cho các endpoint admin và `DELETE /me`, nhưng **thiếu mã lỗi 409 mới** của `DELETE /me/identities/:provider` (xem F1).

## Findings

### F1 — MAJOR (chặn PASS): `DELETE /me/identities/facebook` trả 500 khi trigger mới ném FB409, đi tới được qua UI thường

**Vị trí lỗi:** `apps/api/src/modules/identity/identity.service.ts:85-100`. Hàm chỉ map `22023`, `23514`, `P0002`. FB409 do trigger mới `auth_identities_last_admin_guard_delete` ném ra rơi vào `throw error` ở dòng 100, nên client nhận **500**. Đây là 500 mới do chính diff này tạo ra, trên endpoint mà brief yêu cầu kiểm.

**Đường tái hiện (theo code):**
1. Admin F đăng nhập bằng Facebook, không có email, `email_confirmed_at = null`, và là Admin hoạt động cuối của chuỗi.
2. F bấm "Đặt mật khẩu" (`linked-accounts.tsx:198-201`).
   - `POST /me/password` gọi `updateUserById(password)` rồi `mark_password_set` (`identity.service.ts:128-131`). Hai bước này ghi `encrypted_password` và thêm identity `email`.
   - Hai bước này không đặt `email_confirmed_at`.
3. `get_user_identities` (`20261112050000_identity_rpc_hardening.sql:59-86`) tính `hasPassword = true`, `totalMethods = 1 (facebook) + 1 = 2`, nên `canUnlink = true`.
4. F bấm "Huỷ liên kết Facebook" (`linked-accounts.tsx:221-229`), gọi `DELETE /me/identities/facebook`.
   - `unlink_user_identity` qua được kiểm tra LAST_LOGIN_METHOD và chạy `delete from auth.identities` (dòng 125-126).
   - Trigger chạy guard, guard ném FB409, API trả 500.

**Chặn là đúng nghiệp vụ.** Sau khi gỡ FB, F không còn đăng nhập được (không có email cho đăng nhập mật khẩu) và sẽ bị cron xoá. Chỉ có **mã HTTP sai**: lỗi DB không được dịch, nên client nhận 500 thay vì 409 nghiệp vụ. Theo luật review (errcode DB → HTTP status) đây là FAIL.

**Sửa (nhỏ, giữ surgical):**
- Trong `unlinkIdentity`, map `error.code === "FB409"` (hoặc message chứa `LAST_ADMIN`) sang `AppException(ERROR_CODES.CONFLICT, "<message tiếng Việt: không thể huỷ liên kết vì đây là Admin hoạt động cuối cùng; hãy xác nhận email hoặc thêm Admin khác trước>")`.
- Thêm 1 test e2e: mock RPC trả `{ code: "FB409" }` thì endpoint trả 409.
- Thêm 1 dòng vào `docs/API_SPEC.md` cho `DELETE /me/identities/:provider` (409 khi là Admin hoạt động cuối chưa xác nhận email).

### F2 — MINOR (residual risk, chỉ qua SQL thủ công): race "bỏ xác nhận email" ‖ "gỡ FB" trên cùng một Admin

**Kịch bản** (hai thao tác đồng thời trên Admin F, chưa bên nào commit):
- T3 chạy `update auth.users set email_confirmed_at = null`.
  - `auth_account_is_active(new)` vẫn thấy identity FB, vì lệnh xoá của T1 chưa commit.
  - Vì vậy T3 không vào guard.
- T1 chạy `delete auth.identities ... facebook`.
  - Điều kiện `email_confirmed_at is null` (dòng 192) vẫn thấy email đã xác nhận, vì T3 chưa commit.
  - Vì vậy T1 cũng không vào guard.
- Hai thao tác ghi khác dòng nên không bị row lock xếp hàng. Cả hai commit, F mất tư cách Admin mà không qua lock.

**Phạm vi:** app và GoTrue không có đường nào đặt `email_confirmed_at = null`, nên chỉ xảy ra khi chạy SQL thủ công đồng thời.

**Đề xuất:** chỉ ghi residual risk vào task file.
- Không nên bỏ điều kiện kiểm email trước trong trigger identities. Guard không xét "sau thay đổi còn hoạt động không", nên làm vậy sẽ chặn sai Admin cuối *đã xác nhận email* khi họ gỡ FB.
- Muốn đóng hẳn thì cả hai trigger phải lấy advisory lock trước rồi mới đánh giá trạng thái. Như vậy là quá mức cho rủi ro này.

### F3 — NIT: ca 31 của 068 không tự phân biệt hồi quy "bỏ điều kiện email"

Vị trí: `068:136-137`. Khi chạy ca này, a01 vẫn hoạt động, nên guard cho xoá a03 dù a03 có được đếm hay không. Giá trị của ca 31-32 là kiểm tích hợp với cron thật. Hồi quy định nghĩa đã được ca 3 và ca 27-30 bắt.

## Không phải lỗi (đã soát)

- Trigger identities không khoá với user thường hoặc đã xác nhận email, và không chạy với provider khác.
- Xoá cascade không ném lỗi sai.
- INSERT/UPDATE identities không bị ảnh hưởng.
- `search_path=''` có ở cả 6 hàm. Không có lỗ phân quyền: hàm nội bộ và trigger function đều đã revoke khỏi mọi role client.
- Định nghĩa "Admin hoạt động" khớp đúng ngoại lệ của cron. Tình trạng Admin FB không email bị loại nhầm (F1 round 3) đã được đóng.
- 2 test web flaky ở `account.test.tsx` thuộc CR-013, không ảnh hưởng verdict.

## Verdict

**FAIL** vì F1 (MAJOR). Trigger identities mới ném FB409 trên một đường UI bình thường (Admin FB không email đặt mật khẩu rồi huỷ liên kết Facebook), nhưng `identity.service.ts:85-100` không dịch mã này nên client nhận 500 thay vì 409. Bản sửa nhỏ: map FB409 sang CONFLICT, thêm test e2e và thêm 1 dòng API_SPEC.

Phần DB (định nghĩa, khớp cron, guard + lock, idempotent, ACL, pgTAP 38+10) đạt; không cần sửa migration.

F2 chỉ ghi residual risk. F3 là NIT.
