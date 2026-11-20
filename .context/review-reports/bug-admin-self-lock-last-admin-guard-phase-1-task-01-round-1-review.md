# Review: bug admin-self-lock-last-admin-guard · phase-1-task-01 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đụng auth/RBAC (gỡ quyền Admin, khoá user), DB migration (hàm + trigger trên `public.user_roles` và `auth.users`), race đồng thời, response 409 mới trên API admin.
- **Blast radius:** `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role`, `PUT|DELETE /admin/users/:userId/roles/admin`; mọi UPDATE/DELETE trên `auth.users` (GoTrue: đăng nhập, đổi email, ban, xoá mềm/xoá cứng), mọi DELETE/UPDATE `user_roles` (RLS `user_roles_admin_delete`, service_role); **`DELETE /profile` (xoá tài khoản, R-29)** bị ảnh hưởng gián tiếp; cleanup của integration test (`cleanupScope` → `deleteUser`).
- **Verdict:** **FAIL** (1 MAJOR)

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (shared 31, api 669, web 664, scripts 31) |
| `pnpm db:test supabase/tests/068_… supabase/tests/069_…` | PASS (2 file, 36 test: 26 + 10) |
| `pnpm db:test` cho 010, 020, 030, 031, 033, 040, 041, 042, 043, 044, 050, 063, 090 | FAIL do môi trường, có từ trước (xem F-6) |
| aislop / oxlint / ocr | không chạy được: lệnh không nằm trong allowlist `.context/project-config.md` và repo chưa cấu hình oxlint/ocr |

## Findings

### F-1 [MAJOR, regression do diff này] Admin hoạt động cuối tự xoá tài khoản → 500 và mất PII nửa chừng
`apps/api/src/modules/profile/profile.service.ts:135-172` (`DELETE /profile`, route `profile.controller.ts:84` không giới hạn role, nên Admin gọi được).
Thứ tự hiện tại:
1. Ẩn danh hoá `profiles` (email, họ tên, sđt, ngày sinh…) và commit ngay.
2. Xoá `favorite_cinemas`, `staff_assignments`, rồi `user_roles` (`:154-157`).
3. Lệnh DELETE `user_roles` ADMIN đi vào trigger mới `user_roles_last_admin_guard_delete` và bị chặn FB409, kể cả khi chạy bằng service_role.
4. `throw error` ném PostgrestError trần, không phải `AppException`. `AllExceptionsFilter` (`all-exceptions.filter.ts:96-104`) trả về **500 "Internal server error"**.

Hậu quả: tài khoản vẫn là Admin hoạt động duy nhất nhưng profile đã bị xoá sạch PII (không khôi phục được), cùng với rạp yêu thích và gán nhân sự. Gọi lại thì luôn fail ở cùng bước, nên comment "idempotent, lỗi giữa chừng thì gọi lại" không còn đúng. Trước diff này luồng chạy hết (sai nghiệp vụ là còn 0 Admin). Trigger mới khiến nó vỡ nửa chừng, đúng loại "đường làm mất Admin cuối" mà task yêu cầu phủ.
`profile.e2e-spec.ts` vẫn xanh vì mock `deleteUser` và `user_roles` không mô phỏng trigger FB409, nên đây là false-confidence.

**Cần sửa:**
- Trong `deleteAccount`, gọi `is_last_active_admin(user.id)` TRƯỚC bước ẩn danh hoá. Nếu true thì ném `AppException(CONFLICT, …)` với message tiếng Việt.
- Map `error.code === 'FB409'` ở bước xoá `user_roles` sang 409. Ở bước `deleteUser` thì tra lại rồi trả 409, giống `lockUser`.
- Thêm ca e2e: Admin cuối xoá tài khoản thì nhận 409 và profile không đổi; Admin không phải cuối thì xoá được.

### F-2 [MINOR] Header migration ghi sai số đối tượng
`supabase/migrations/20261119100000_last_active_admin_guard.sql:4` ghi "chỉ thêm 4 hàm + 3 trigger". Thực tế có 5 hàm và 4 trigger (danh sách rollback ở dòng 5-9 thì đúng).

### F-3 [MINOR] Migration không idempotent như task yêu cầu (task §Hướng sửa 3)
Dùng `create function` / `create trigger` trần, không có `or replace` hay `drop trigger if exists`. Migration có version và chỉ chạy một lần nên rủi ro thấp. Ghi lại vì lệch brief.

### F-4 [NIT] `database.types.ts` sửa tay sai thứ tự
`packages/shared/src/database.types.ts:959` đặt `auth_account_is_active` giữa `apply_due_cinema_status_changes` và `apply_voucher`, không theo thứ tự bảng chữ cái của generator. Lần chạy `pnpm db:types` sau sẽ tạo churn. Kiểu Args/Returns thì khớp chữ ký SQL.
Ngoài ra `grant execute … auth_account_is_active … to service_role` (dòng 169) là thừa vì API không gọi hàm này.

### F-5 [INFO] Có thể deadlock (Postgres tự phát hiện, không mất an toàn)
- T1 `delete from auth.users` (Admin A, khi còn Admin khác): giữ khoá dòng auth A, lấy advisory lock, sau đó cascade cần khoá dòng `user_roles` của A.
- T2 `delete from user_roles where user_id=A` cùng lúc: giữ khoá dòng `user_roles` A, rồi chờ advisory lock.

Hai giao dịch chờ nhau, Postgres huỷ một bên với 40P01. Bất biến "≥ 1 Admin" vẫn giữ nhưng phía API sẽ thấy 500. Xác suất rất thấp, chỉ ghi nhận.

### F-6 [INFO, xác nhận] 13 file pgTAP cũ fail do môi trường có sẵn
Tôi chạy lại độc lập. Cả 13 file đều chết ngay ở câu INSERT fixture đầu tiên, trước mọi assertion:
- Có `provinces_name_key (Hà Nội)`: 010:38, 020:42, 030:39, 031:43, 033:36, 040:33, 041:26, 042:47, 043:28, 044:36, 063:45, 090:73.
- Có `price_rules_chain_key`: 050:49.

Nguyên nhân là DB local còn dữ liệu demo đè unique, không liên quan diff. Grep `supabase/tests` (ngoài 068/069) cho thấy không file nào xoá hoặc đổi `user_roles`, ban, đặt `raw_app_meta_data.locked` hay xoá mềm Admin. Chỉ có `066:59` xoá mềm một khách thường. `seed.sql:1065` có Admin `70000000-…0001` hoạt động, nên trên DB sạch các file này không chạm tới trigger mới.
Residual: chưa chạy được trên DB sạch, vì `db reset` bị cấm với reviewer.

## Đối chiếu theo yêu cầu kiểm

1. **Phủ mọi đường mất Admin cuối (DB):**
   - Đã phủ: DELETE `user_roles` (cả qua RLS authenticated, test 068#14), đổi `user_id` (#9), ban bằng `banned_until` (#10), `app_metadata.locked` (#11), xoá mềm `deleted_at` (#12), xoá cứng có cascade (#13), xoá hàng loạt trong 1 câu lệnh (#23, BEFORE ROW thấy thay đổi của các dòng trước trong cùng lệnh).
   - `app_role` chỉ có `ADMIN`, nên không có đường "đổi role sang role khác".
   - Cascade khi xoá auth user đã khoá: trigger `user_roles` gọi guard thấy auth row đã xoá nên return, đúng.
   - `TRUNCATE` bỏ qua trigger dòng. Chỉ owner làm được, chấp nhận.
   - Đường **chưa phủ ở API**: xoá tài khoản (F-1).
2. **Trigger trên `auth.users`:**
   - SECURITY DEFINER, `search_path=''`, mọi tham chiếu đều schema-qualified.
   - Chỉ lấy lock khi chuyển active→inactive. Cập nhật thường (đăng nhập, đổi email, đã test ở 068#4) chỉ tốn 2 lần gọi hàm SQL `stable`, không lấy lock, nên GoTrue không bị 500 ở luồng thường.
   - Lỗi FB409 qua GoTrue thành lỗi chung, API xử lý bằng tra lại.
   - Supabase cho phép trigger trên `auth.users`: repo đã có `on_auth_user_created` / `on_auth_user_email_changed` từ trước.
3. **Seed / Admin đầu tiên:** INSERT `user_roles` không bị chặn, `seed.sql` và `factories.createAdminUser` vẫn chạy. Integration `cleanupScope` (`supabase-test.ts:157-159`) `deleteUser` các Admin test: OK nhờ còn Admin seed. Trên DB không seed thì Admin test cuối cùng sẽ không xoá được (residual thấp).
4. **Advisory lock:**
   - Mọi đường dùng cùng key `hashtextextended('filmbooking.admin_set',0)` và chỉ lấy một lock duy nhất, nên không có vấn đề thứ tự giữa các advisory lock (xem F-5 cho tương tác với row lock).
   - `guard_last_active_admin` là plpgsql VOLATILE, mỗi câu lệnh lấy snapshot mới sau khi chờ khoá (READ COMMITTED), nên thấy commit của giao dịch trước. 069 chứng minh điều này.
   - Định nghĩa "Admin hoạt động" (deleted_at null, ban hết hạn coi là hoạt động, `locked<>'true'`) khớp cách API ghi khoá (`ban_duration` + `app_metadata.locked`, `users.controller.ts:141-145`), khớp enrich hiển thị `:457-458` và khớp định nghĩa tài khoản hoạt động ở 066.
5. **API:**
   - Tự khoá / tự gỡ được kiểm trước mọi đọc/ghi dữ liệu và trước audit (`:131`, `:342`).
   - FB409 khi DELETE `user_roles` map sang 409 (`:365`).
   - Lỗi GoTrue của lockUser: tra lại, đúng là Admin cuối thì 409, ngược lại 500 với lỗi thật (`:147-151`). Không nuốt lỗi thật, trừ ca hiếm: lỗi GoTrue khác xảy ra đúng lúc mục tiêu vừa thành Admin cuối (chấp nhận).
   - Cả PATCH `admin-role` lẫn PUT/DELETE `roles/admin` đều đi qua `applyAdminRole`.
   - `is_last_active_admin` chỉ service_role dùng được (REVOKE public/anon/authenticated, test 068#25-26). `guard_last_active_admin` bị REVOKE cả service_role. Message lỗi chung chung, không lộ danh tính.
6. **Migration:**
   - Có version (sau `20261118110000`), không phá huỷ (chỉ thêm hàm + trigger, không đổi dữ liệu hay type), có ghi rollback.
   - **HIGH_RISK_MIGRATION không áp dụng.** Tôi xác nhận: không có DROP, đổi type, SET NOT NULL, UNIQUE/FK hay backfill.
   - Không idempotent (F-3).
7. **Test:**
   - 068 là assertion thật (throws_ok FB409 và kiểm dữ liệu sau khi bị chặn), không tautology.
   - 069: cả 3 vòng A và B chạm **dòng khác nhau** (2 dòng `user_roles` khác nhau; dòng `auth.users` với dòng `user_roles`; 2 dòng `auth.users` khác nhau). Nếu bỏ advisory lock thì không có xung đột dòng, `busy` sẽ là 0 và B sẽ thành công, nên assertion 2/5/7 và 3/6/8/9 sẽ đỏ. Test thật sự phân biệt có khoá hay không, dù builder chưa chạy đối chứng bỏ lock.
   - Residual của 069: phụ thuộc thời gian `pg_sleep(0.5)`. Test commit dữ liệu thật và ban tạm Admin demo trên DB dùng chung; nếu process bị giết giữa chừng (handler exception không chạy) thì Admin demo bị ban 1 ngày. Cleanup cũng giả định còn Admin demo, vì trên DB không seed thì xoá a02 (Admin cuối) sẽ FB409.
   - Fake e2e mô phỏng trigger FB409 hợp lý (`admin.e2e-spec.ts:57-62, 176-181, 441-445`). Lệch nhỏ: user không có bản ghi auth bị coi là "hoạt động", trong khi DB dùng INNER JOIN. Không ảnh hưởng vì FK bắt buộc có auth row.
8. **Web:** `confirm-action-dialog.tsx:65-66` hiển thị `ApiError.message`, nên message 409 tiếng Việt tới được người dùng. Không có residual.

## Doc reconcile cần làm khi close-out
- `docs/API_SPEC.md`:
  - 409 `CONFLICT` cho `PATCH /admin/users/:userId/lock` (tự khoá, Admin cuối).
  - 409 cho `PATCH /admin/users/:userId/admin-role` và `PUT|DELETE /admin/users/:userId/roles/admin` (tự gỡ, Admin cuối).
  - Sau khi sửa F-1: 409 cho `DELETE /profile` khi là Admin hoạt động cuối.
- `docs/ERD.md`: thêm hàm `auth_account_is_active`, `guard_last_active_admin`, `is_last_active_admin` (chỉ service_role), 2 hàm trigger, 4 trigger (`user_roles_last_admin_guard_delete/_update`, `auth_users_last_admin_guard_update/_delete`), SQLSTATE `FB409`, advisory lock key.
- R-105 (spec, qua spec-publisher): thêm câu "luôn còn ≥ 1 Admin hoạt động; không tự khoá / tự gỡ".

## Verdict: **FAIL**
Blocking: F-1. F-2, F-3, F-4 nên sửa cùng vòng, không chặn PASS.
