# Review: bug admin-self-lock-last-admin-guard · phase-1-task-01 · round 2

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đụng auth/RBAC (gỡ Admin, khoá user, xoá tài khoản), DB migration (hàm + trigger trên `public.user_roles` và `auth.users`), race đồng thời, thêm 409 cho `DELETE /me` và API admin, và cron job bị trigger mới ảnh hưởng.
- **Blast radius:**
  - API: `DELETE /me` (luồng xoá tài khoản R-29 có đổi thứ tự bước), `PATCH /admin/users/:userId/lock`, `PATCH /admin/users/:userId/admin-role`, `PUT|DELETE /admin/users/:userId/roles/admin`.
  - DB: mọi UPDATE/DELETE trên `auth.users` (GoTrue, **cron `delete_unconfirmed_users` mỗi giờ**) và trên `user_roles`.
  - Test: helper `cleanupScope`.
- **Verdict:** **FAIL** (1 MAJOR mới: F-1). Các finding của round 1 (F-1..F-4) đều đã đóng.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` lần 1 | PASS: shared 31, api 672, web 664/664, scripts 31 |
| `pnpm test` lần 2 | FAIL ở web: 2/664, cùng file `apps/web/src/components/account/__tests__/account.test.tsx`. Shared 31 và api 672 PASS. Scripts không chạy vì `&&` dừng sau lỗi web. Chi tiết ở F-3. |
| `pnpm db:test supabase/tests/068_… supabase/tests/069_…` | PASS: 2 file, 36 test |
| aislop / oxlint / ocr | skip: không nằm trong allowlist, chưa cấu hình |

## Đối chiếu các finding của round 1

### Round-1 F-1 (MAJOR): ĐÃ ĐÓNG
Mã ở `apps/api/src/modules/profile/profile.service.ts:139-188`. Thứ tự các bước:
1. `assertReauthenticated`.
2. RPC `is_last_active_admin`. Nếu true thì trả 409, chưa ghi gì (`:145-147`).
3. DELETE `user_roles`. Nếu DB trả FB409 thì trả 409 (`:149-153`).
4. Ẩn danh hoá profile, xoá `favorite_cinemas` / `staff_assignments`, scrub `orders`, xoá avatar, rồi `deleteUser(id, true)`.

Các ca đã kiểm:
- **Admin cuối:** dừng ở bước 2, không dữ liệu nào bị đổi. Khi có race, trigger chặn ở bước 3 (advisory lock tuần tự hoá). Lúc đó chưa ẩn danh hoá gì và câu DELETE bị rollback, nên vẫn trả 409 và dữ liệu nguyên vẹn.
- **Người dùng thường:** `app_role` chỉ có `ADMIN`. DELETE trúng 0 dòng nên không gọi trigger, luồng giữ như cũ.
- **Admin còn Admin khác:** role bị xoá. Đến `deleteUser(id, true)`, trigger `auth.users` thấy người này không còn là Admin nên return. Vì vậy ở bước này không cần map FB409.
- **Staff/Manager:** quyền theo rạp nằm ở `staff_assignments`, vẫn ở vị trí cũ. Không có hậu quả mới.
- **Trạng thái dở dang khi một bước sau lỗi:**
  - Hiện tại: tài khoản mất role ADMIN nhưng chưa bị ẩn danh hoá hay xoá.
  - Trước đây: PII đã mất trong khi role vẫn còn.
  - Trạng thái mới an toàn hơn (gỡ quyền trước, xoá dữ liệu sau). Gọi lại `DELETE /me` sẽ chạy tiếp được vì các bước đều idempotent.
- **E2E không tautology:** tôi kiểm bằng suy luận trên bản trước diff, không chạy đối chứng.
  - Ca ở `profile.e2e-spec.ts:395-405`: bỏ fix thì profile bị update trước, sau đó DELETE `user_roles` gặp FB409 trần và trả 500. Cả assert `409` lẫn `mutations()==[]` sẽ đỏ.
  - Ca race ở `:417-426`: bỏ map FB409 thì trả 500. Bỏ việc dời bước thì `mutations()` khác rỗng.
  - Mock FB409 khớp với migration `:68-69`.
- **Không còn đường API nào chưa map FB409.** Tôi grep `deleteUser(|ban_duration|from("user_roles")|updateUserById` trong `apps/`:
  - `auth-ext.service.ts:291` chỉ rollback user vừa đăng ký, user này chưa có role.
  - Các chỗ đổi password không chạm cột mà trigger theo dõi.
  - Các chỗ trong `users.controller.ts` đã được xử lý từ round 1.

### Round-1 F-2 (header): ĐÃ ĐÓNG
Header migration ở `:4` giờ ghi "5 hàm + 4 trigger".

### Round-1 F-3 (idempotent): ĐÃ ĐÓNG
- Cả 5 hàm dùng `create or replace function`.
- Cả 4 trigger có `drop trigger if exists` đứng trước (`:121-128`, `:156-163`).
- Các câu `revoke`/`grant` vốn idempotent.
- Migration không phá huỷ dữ liệu. HIGH_RISK_MIGRATION không áp dụng.

### Round-1 F-4 (ACL / types): ĐÃ ĐÓNG
- `:168-173`: 4 hàm nội bộ đã REVOKE khỏi public, anon, authenticated và service_role.
- `is_last_active_admin` đã REVOKE khỏi public, anon, authenticated, và chỉ GRANT cho service_role.
- 068 dòng 112-116 kiểm đúng các quyền trên và PASS.
- `database.types.ts` đã sắp theo thứ tự chữ cái.

## Findings round 2

### F-1 [MAJOR, regression do diff này, gọi được qua API] Admin chưa xác nhận email được tính là "Admin hoạt động": cron R-10 kẹt và chuỗi có thể không còn Admin đăng nhập được

**Vị trí:**
- `supabase/migrations/20261119100000_last_active_admin_guard.sql:32-34`: `auth_account_is_active` không xét `email_confirmed_at`.
- `supabase/migrations/20261111020100_security_ops.sql:200-204`: cron `delete_unconfirmed_users` xoá hàng loạt bằng một statement.

**Bằng chứng gọi được qua API:**
- `supabase/config.toml:240` đặt `enable_confirmations = true`, nên user chưa xác nhận email không đăng nhập được.
- `auth-ext.service.ts:87-90`: khách tự đăng ký được tạo với `email_confirm: false`. Profile có ngay, nên user này hiện trong danh sách Admin.
- `users.controller.ts:341-358` (`applyAdminRole`, nhánh cấp quyền) chỉ kiểm profile tồn tại, không kiểm `email_confirmed_at`. Vì vậy `PUT /admin/users/:id/roles/admin` hoặc `PATCH …/admin-role {isAdmin:true}` cấp ADMIN được cho tài khoản chưa xác nhận.

**Kịch bản lỗi, gọi hoàn toàn qua API:**
1. Admin A cấp ADMIN cho B. B đã đăng ký nhưng chưa xác nhận email.
2. A gọi `DELETE /me`. `is_last_active_admin(A)` trả false vì B được tính là Admin hoạt động, nên tài khoản A bị xoá. Tương tự, nếu còn Admin C thì C khoá được A.
3. Kết quả 1: chuỗi chỉ còn B làm Admin nhưng B không đăng nhập được. Chuỗi thực tế có 0 Admin dùng được, đúng loại hậu quả mà task này phải ngăn.
4. Kết quả 2: sau 7 ngày, cron chạy `delete from auth.users …`. Trigger `auth_users_last_admin_guard_delete` ném FB409 ở dòng của B, nên **cả statement rollback**. Từ đó cron fail mỗi giờ và R-10 ngừng dọn mọi tài khoản chưa xác nhận.

Trước diff này, cron luôn chạy được. Kết quả 2 là regression do trigger mới. Bất biến "≥1 Admin" vẫn đúng về mặt DB, nhưng nó đang đếm một Admin không đăng nhập được.

**Cần sửa (chọn một, nên chọn cách đầu):**
- Đưa `email_confirmed_at is not null` vào định nghĩa Admin hoạt động. Hai cách:
  - thêm tham số `p_email_confirmed_at` cho `auth_account_is_active` và dùng ở cả 3 hàm, hoặc
  - kiểm thêm trong truy vấn đếm của `guard_last_active_admin` và `is_last_active_admin`.

  Lưu ý: trigger `auth.users` phải coi việc chuyển "chưa xác nhận → đã xác nhận" là bình thường. Hàm đã chỉ guard khi chuyển active→inactive nên không bị ảnh hưởng. Khi đổi chữ ký hàm cần drop hàm 3 tham số rồi tạo lại, hoặc tạo overload mới, trong một migration versioned mới. Không sửa migration đã apply nếu đã có môi trường nào áp nó; hiện chưa commit nên builder có thể sửa trực tiếp migration chưa phát hành.
- Hoặc chặn ở API: `applyAdminRole` từ chối cấp ADMIN cho tài khoản chưa xác nhận email (422/409). Cùng lúc phải làm cron không kẹt batch, ví dụ loại trừ user có `user_roles` ADMIN, hoặc xoá từng dòng và bắt FB409. Cách này hẹp hơn vì vẫn để DB đếm Admin chưa xác nhận.
- Kèm pgTAP: (a) Admin chưa xác nhận không được tính, nên gỡ hoặc khoá Admin đã xác nhận cuối cùng vẫn bị FB409; (b) `delete_unconfirmed_users()` chạy được khi có user chưa xác nhận mang role ADMIN. Kèm e2e nếu chọn cách chặn ở API.

### F-2 [NIT] `database.types.ts` sửa tay, lệch generator
`guard_last_active_admin(uuid) returns void` nằm ở schema `public`. Generator vẫn liệt kê hàm void (ví dụ `assert_identity_rpc_caller`), nên lần `pnpm db:types` sau có thể sinh thêm một entry. Không ảnh hưởng runtime.

### F-3 [INFO, có từ trước, không liên quan diff] Test web flaky
Tái hiện ở lần chạy `pnpm test` thứ 2; lần 1 thì 664/664 PASS. Cả hai test fail cùng file `apps/web/src/components/account/__tests__/account.test.tsx`:
- `ChangePasswordForm > báo lỗi khi mật khẩu mới vi phạm chính sách mật khẩu…` (`:179`): timeout 5000ms trong `userEvent.type`.
- `ChangePasswordForm > báo lỗi khi mật khẩu cũ không chính xác…` (`:224`): mock nhận `"2W3rongOld123"` thay vì `"WrongOld123"`. Phím gõ của test trước bị timeout tràn sang test này.

Nguyên nhân là test nhạy thời gian khi vitest web và api chạy song song làm máy tải nặng. Diff không đụng `apps/web`, và `ChangePasswordForm` không liên quan admin hay xoá tài khoản. Tôi ghi đây là lỗi có từ trước. Nên mở một bug riêng: tăng timeout, hoặc gõ ít ký tự hơn / dùng `user.paste`.

### F-4 [INFO, giữ từ round 1]
- Có thể xảy ra deadlock 40P01 giữa xoá `auth.users` và xoá `user_roles` chạy đồng thời. Postgres tự phát hiện và bất biến vẫn giữ.
- 13 file pgTAP cũ fail do dữ liệu demo trên DB local. Round này không chạy lại vì brief chỉ yêu cầu 068 và 069.

## Doc reconcile
- `docs/API_SPEC.md:70`: `DELETE /me` có 409 `CONFLICT` khi là Admin hoạt động cuối, kể cả khi race. Đúng route, đúng mã.
- `docs/API_SPEC.md:233-236`: các route lock / admin-role / DELETE roles/admin có 409. Đúng.
- `docs/ERD.md`: mô tả 5 hàm, 4 trigger, cột được theo dõi, advisory lock key, `FB409` và rollback, khớp migration. Khi sửa F-1 phải cập nhật định nghĩa "Admin hoạt động" (thêm điều kiện đã xác nhận email).
- R-105: spec-publisher sẽ làm khi close-out.

## Verdict: **FAIL**
Chặn: F-1 (MAJOR). F-2 và F-3 không chặn. Round 3 cần có: bản sửa F-1, pgTAP cho 2 ca ở F-1, chạy lại 068 và 069.
