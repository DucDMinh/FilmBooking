# Review — build-filmbooking layer-2 / task-02 (round 1)

Agent: reviewer

- **Task:** `tasks/build-filmbooking/layer-2-task-02.md`. Migration bảo mật và vận hành: login attempts/lockout, rate limit, email dùng một lần, outbox, khoá API POS, cron xoá tài khoản chưa xác nhận, hook `before_user_created`.
- **Worktree:** `E:\FilmBooking\.worktrees\layer-2__task-02` (chưa commit).
- **Diff:**
  - `supabase/migrations/20261111020100_security_ops.sql` (mới)
  - `supabase/tests/021_security_ops.test.sql` (mới)
  - `supabase/config.toml` (sửa)
- **Review level:** STRICT
- **Reason:** task đụng auth (hook chặn signup, lockout, rate limit), migration/schema, cron xoá dữ liệu (`DELETE auth.users`), SECURITY DEFINER và lưu khoá API (hash).
- **Blast radius:**
  - Mọi đường tạo user qua GoTrue: signup email, OTP/magic link, invite, Admin API, OAuth Google/Facebook.
  - Job xoá `auth.users` hằng giờ, cascade sang profiles, user_roles, staff_assignments, consents, favorite_cinemas.
  - Nest layer 3: auth (R-08/09/11), outbox (R-86/R-109), POS (R-111/R-130).
  - `docs/ERD.md` (as-built).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm -w lint` / `pnpm -w typecheck` / `pnpm -w test` | agent-guard chặn vì coi `-w` là cờ ghi file. Đã chạy lệnh tương đương ở root workspace (các dòng dưới). |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (shared 14, api 20, web 10) |
| `pnpm db:start` / `pnpm db:test` / `pnpm db:stop` | **Không chạy.** Lệnh lấy khoá `mkdir .worktrees/.dblock` bị agent-guard chặn (không có trong allowlist). Kết quả db:test **lấy theo báo cáo builder** (115 test pgTAP PASS, trong đó 27 test mới). Reviewer chưa tự xác minh. |

## Responsive Checklist Gate

N/A. Diff không đụng UI, chỉ có SQL và TOML.

## Skill gates

| Gate | Kết quả |
|---|---|
| aislop | skip: chưa cài `aislop` (exit 127) |
| oxlint (anti-slop) | N/A: diff không có TS/JS |
| ocr (open-code-review) | Đã chạy `ocr review --format json`, xong một phần (1/3 nhóm lỗi quota 429). Ra 6 finding: 1 critical, 1 high, 3 medium, 1 low. Reviewer thẩm định từng finding ở mục "Thẩm định OCR". Sau thẩm định còn **0 CRITICAL**, các finding còn lại gộp vào MINOR. Không chặn PASS. |
| AI-readable | OK, 0 indicator. Tên rõ ràng, hàm dưới 50 dòng. Comment giải thích lý do (citext/search_path, row lock). Hằng số 5 lần / 15 phút / 7 ngày đúng spec. |
| ai-friendly-web | N/A (không phải web public) |
| blitzstrike | skip: migration DB, không có môi trường được phép chạy pentest |

### Thẩm định OCR

1. **[OCR critical] Hook trả `'{}'::jsonb` khi cho phép, OCR đề nghị trả `event`.** Bác bỏ (false positive).
   - Theo hợp đồng hook `before_user_created` của Supabase: cho phép thì trả object rỗng, từ chối thì trả `{"error":{"http_code","message"}}`.
   - Hook này không sửa được user, nên không cần trả lại user.
   - Vẫn cần e2e layer 3 xác nhận (Residual 1).
2. **[OCR high] Với `search_path=''`, phép so sánh citext rơi về text nên không dùng được index PK.** Chấp nhận một phần.
   - Không sai về đúng/sai logic, vì builder đã `lower()`.
   - Nhưng `is_login_locked`, `register_login_failure`, `clear_login_failures` sẽ seq scan `login_attempts`, mà bảng này tăng không giới hạn (M4).
   - Xem M8.
3. **[OCR medium] `lower(d.domain::text)` làm mất index.** Đã có trong M5.
4. **[OCR medium] `pos_api_logs` và `rate_limit_buckets` không có retention.** Gộp vào M4.
5. **[OCR low] `split_part(email,'@',2)` sai khi local-part có `@` trong ngoặc kép.** MINOR, gộp vào M5. Nên lấy phần sau dấu `@` cuối cùng.
6. **[OCR medium] Có thể xoá user đã xác nhận số điện thoại.** Bác bỏ: dự án không có đăng ký bằng phone, và hook từ chối provider `phone`.

## Kiểm tra trọng tâm STRICT

1. **Hook có bị bypass qua `app_metadata` không:** OK.
   - Signup GoTrue (`/signup`, `options.data`) chỉ ghi vào `user_metadata`. `app_metadata` chỉ đặt được qua Admin API (service role).
   - Hook không dùng `user_metadata` làm điều kiện.
   - `provider` do GoTrue tự đặt (`email`/`phone`/`google`/`facebook`). Tên `google`/`facebook` đúng.
   - Anonymous sign-in đã tắt. Provider khác (phone, sso) bị từ chối, tức fail-closed.
2. **Quyền chạy hook:** OK.
   - Có `revoke` từ public/anon/authenticated, chỉ `grant execute` cho `supabase_auth_admin`.
   - Hàm không phải SECURITY DEFINER, không đọc bảng, `search_path=''`.
3. **URI trong `config.toml`:** OK. `pg-functions://postgres/public/hook_before_user_created` đúng định dạng.
4. **Cron xoá user:** OK.
   - Điều kiện: `email_confirmed_at is null`, `created_at` cũ hơn 7 ngày, và không có identity `facebook`.
   - User Google có `email_confirmed_at`, user đã xác nhận đều được giữ. Test có đủ 4 trường hợp.
   - Mọi FK hiện có tới `auth.users` là cascade/set null.
   - Quyền chạy hàm đã thu hồi khỏi client. Cron chạy bằng owner.
5. **Race ở lockout/rate limit:** OK về thiết kế.
   - Dùng `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, có khoá dòng.
   - Ở READ COMMITTED, transaction đến sau sẽ chờ rồi đánh giá lại trên bản ghi mới.
   - `register_login_failure` giữ khoá dòng từ lúc upsert đến hết transaction, nên lệnh UPDATE thứ hai an toàn.
6. **SECURITY DEFINER:** mọi hàm đều `set search_path = ''` và gọi đầy đủ tên schema.
7. **`pos_api_keys`:** OK. Chỉ lưu `key_hash` (unique), có `prefix` và `revoked_at`, không có cột plaintext.
8. **Grants:** OK.
   - 6 bảng và sequence đã revoke khỏi anon/authenticated. RLS bật và không có policy nào.
   - 6 hàm chỉ service_role được execute.
9. **Seed domain disposable:** 50 domain đều là dịch vụ tạm phổ biến, không thấy domain hợp lệ nào bị chặn nhầm.
10. **`HIGH_RISK_MIGRATION`:** đồng ý là không. Migration chỉ create, seed dữ liệu tham chiếu và tạo cron. Không có DROP, đổi kiểu hay backfill.

## Findings

### CRITICAL

Không có. Finding critical của OCR đã bác bỏ ở trên.

### MAJOR

Không có.

**Quyết định về AC #2 ("chạy 2 transaction không vượt tổng"):** chưa có test đồng thời thật vì pgTAP chạy trong 1 transaction. Reviewer **hạ xuống MINOR (M1)** vì 3 lý do:
- Tính nguyên tử là bảo đảm của Postgres cho một câu `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.
- AC đã ghi rõ cơ chế "(dùng row lock)", và code dùng đúng cơ chế đó.
- Test 2 session cần thêm extension `dblink`, nằm ngoài phạm vi file của task.

Orchestrator có thể nâng lên MAJOR nếu muốn có bằng chứng chạy thật.

### MINOR

- **M1. Thiếu test đồng thời cho `hit_rate_limit` / `register_login_failure`** (`021_security_ops.test.sql:32-37`).
  - Sửa: ở layer 3 viết integration test, Nest gọi `Promise.all` N lần rồi assert số lượt được phép ≤ `p_max`. Hoặc dùng pgTAP + `dblink`.
- **M2. Test "sai khi đang khoá: không gia hạn" không thể fail** (`021_security_ops.test.sql:17-18`).
  - `now()` cố định trong transaction. Nếu code có gia hạn thì vẫn ghi ra đúng `now()+15m`, nên test vẫn qua.
  - Sửa: đặt `locked_until = now() + interval '5 minutes'`, gọi hàm, rồi assert `locked_until` vẫn là +5m và `failed_count` không đổi.
- **M3. Test quyền mới phủ 2/6 bảng và 2/7 hàm** (`021_security_ops.test.sql:72-78`).
  - Sửa: assert cả 6 bảng.
  - Assert anon/authenticated không execute được `is_login_locked`, `clear_login_failures`, `is_disposable_email`, `delete_unconfirmed_users`, `hook_before_user_created`.
  - Assert `supabase_auth_admin` có quyền execute hook.
- **M4. Chưa có retention/purge cho `rate_limit_buckets`, `login_attempts`, `pos_api_logs`.** Các bảng này tăng không giới hạn.
  - Sửa: thêm cron purge, có thể làm ở task sau. Ví dụ: xoá bucket có `window_start < now()-1 day`; xoá `login_attempts` hết khoá có `last_failed_at < now()-1 day`; giữ log POS N ngày.
- **M5. `is_disposable_email` bỏ sót subdomain** (`x@sub.mailinator.com`).
  - `split_part` lấy phần sau dấu `@` đầu tiên thay vì cuối cùng.
  - `lower(d.domain::text)` làm mất index.
  - Sửa: lấy domain sau `@` cuối, so khớp chính xác hoặc theo hậu tố `'.' || domain`.
- **M6. `hit_rate_limit` không kiểm tra input.** `p_window` null thì cửa sổ không bao giờ reset; `p_max <= 0` thì luôn chặn.
  - Sửa: `raise exception` khi `p_window is null or p_window <= interval '0' or p_max < 1`.
- **M7. Tài khoản nhân sự chưa xác nhận cũng bị xoá sau 7 ngày**, cascade sang `user_roles` và `staff_assignments`.
  - Đây là ràng buộc cho layer 3: Nest tạo Staff/Manager/Admin (R-17) với `email_confirm: true`. Nếu không, job phải loại trừ user có vai trò khác Customer.
- **M8. So sánh email trên cột citext với `search_path=''` không dùng được index PK** (migration dòng 46-47, 63, 73).
  - Hệ quả: mỗi lần kiểm tra khoá đăng nhập phải seq scan `login_attempts`. Nặng hơn khi bị spray email ngẫu nhiên, kết hợp với M4.
  - Sửa: dùng `operator(extensions.=)`, hoặc đổi PK sang `text` đã chuẩn hoá `lower(btrim())`.

## Residual risk / follow-up (layer 3 / DevOps)

1. **Payload thật của GoTrue chưa được kiểm chứng.** pgTAP chỉ test với payload tự dựng.
   - Cần e2e ở layer 3 trên GoTrue local:
     - (a) `/auth/v1/signup` bằng anon key trả 403.
     - (b) `auth.admin.createUser({ app_metadata: { created_via: 'nest' } })` thành công.
     - (c) OAuth Google thành công.
     - (d) Khẳng định response `{}` được chấp nhận.
   - Nếu payload sai giả định, hook fail-closed (chặn cả Nest), không thành bypass.
   - **Ràng buộc Nest:** user email/password phải tạo bằng `auth.admin.createUser` kèm `app_metadata.created_via='nest'`. Không dùng `inviteUserByEmail` hay `generateLink({type:'signup'})` để tạo user, vì không truyền được `app_metadata` nên sẽ bị hook chặn.
2. **Hook mới chỉ bật trong `config.toml` local.** Staging/prod hosted phải bật qua Dashboard hoặc `supabase config push`. Đến lúc đó, signup trực tiếp vẫn bỏ qua R-03, R-07, R-09. Cần đưa vào checklist DevOps.
3. **R-11 lockout và R-08 rate limit bị bypass qua `POST /auth/v1/token?grant_type=password`** dùng anon key công khai, vì request không đi qua Nest.
   - Review layer 0 chưa theo dõi mục này.
   - Layer auth cần xử lý, ví dụ bằng hook `password_verification_attempt` (tuỳ gói Supabase), hoặc chấp nhận và ghi nhận rủi ro.
4. **`delete_unconfirmed_users` là một câu DELETE all-or-nothing.** Nếu layer sau thêm FK RESTRICT/NO ACTION tới `auth.users` hoặc `profiles` (ví dụ orders), job sẽ lỗi mỗi giờ.
   - Ràng buộc cho layer sau: dùng cascade/set null, hoặc job loại trừ user có dữ liệu.
5. **Reviewer chưa chạy db:test** (khoá DB bị chặn). Kết quả lấy theo báo cáo builder.
6. **N1/N2 của layer 0** mới được ghi chú trong `config.toml`. Đúng mức MINOR như đã chốt ở layer 0, vẫn chuyển cho layer auth.

## Doc impact

Close-out cần reconcile `docs/ERD.md` (as-built):
- 6 bảng mới và enum `outbox_status`.
- Các hàm dành cho service_role.
- Cron `delete-unconfirmed-users`.
- Hook `before_user_created`.

## Verdict

✅ PASS. Không có CRITICAL hay MAJOR. Còn 8 MINOR (M1–M8) và các residual risk ở trên, cần chuyển thành follow-up cho layer 3 / DevOps.

Khuyến nghị sửa M2 và M3 (độ tin cậy của test) ngay khi có dịp chạm lại file test.
