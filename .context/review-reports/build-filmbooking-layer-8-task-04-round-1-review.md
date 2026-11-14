# Review — build-filmbooking · layer-8 · task-04 · round 1

Agent: reviewer
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-04` (branch `wt/layer-8__task-04`, chưa commit)
Task: Test huỷ suất + email hàng loạt + luồng auth (AC-01..05, AC-24..26)

## Review level
**STRICT**

## Reason
Task chỉ thêm test, nhưng các test này là bằng chứng nghiệm thu cho những vùng rủi ro cao: auth (lockout, cooldown, gộp tài khoản OAuth, huỷ liên kết phương thức cuối), email hàng loạt khi huỷ suất, hoàn tiền thủ công và chặn đóng rạp. Ngoài ra helper mới chạy SQL thẳng vào schema `auth` và chạy job outbox trên toàn DB local.

## Blast radius
- File mới: `apps/api/test/integration/cancel-showtime.int-spec.ts`, `apps/api/test/integration/auth-flows.int-spec.ts`, `apps/api/test/integration/helpers/app-harness.ts`. Sửa: `tasks/build-filmbooking/layer-8-task-04.md`.
- Không sửa source hay migration (đã kiểm `git status --short`).
- Tác dụng phụ lúc chạy: chỉ trên DB local. Gồm `email_outbox` (drain toàn DB), `rate_limit_buckets`, `login_attempts`, `auth.identities`/`auth.users` (qua `docker exec psql`).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `cd apps/api && pnpm test:int cancel-showtime auth-flows` (lần 1) | PASS, 2 file, 30/30 test (22.7s) |
| `cd apps/api && pnpm test:int cancel-showtime auth-flows` (lần 2) | PASS, 2 file, 30/30 test (21.7s), không flaky giữa 2 lần |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS (tsconfig api có include `test`) |
| aislop | skip, chưa cài `aislop` |
| oxlint | skip, oxlint chưa cấu hình (chỉ có `.oxlintrc` trong node_modules) |
| Open Code Review | skip, chưa cài `ocr` |
| AI-friendly web | N/A (task test nội bộ) |

Lưu ý: test xanh không phải căn cứ để PASS. Các nhận định bên dưới dựa trên việc đối chiếu với code thật và migration.

## Đối chiếu code thật / DB (cross-boundary)
- Lockout (`auth-ext.service.ts:107-138, 212-230`): `is_login_locked` chạy trước signIn. Lần sai thứ 5 gọi `register_login_failure` trả về `is_locked`, rồi enqueue `ACCOUNT_LOCKED_ALERT` và trả 423. Test AC-03 khớp: 4 lần 401, lần 5 và lần 6 (mật khẩu đúng) đều 423, đúng 1 email cảnh báo, drain xong thì thành SENT. Turnstile được mock pass, nên ngưỡng captcha sau 3 lần sai không cản đường test.
- Cooldown (`auth-ext.service.ts:140-147`): `rateLimit(resend:cooldown)` chạy TRƯỚC `sendConfirmation`. Vì vậy 429 kéo theo việc không gửi thêm mail. Test dùng đúng key `resend:cooldown:${sha256(email)[0..32]}`, khớp `emailKey` của service.
- Guard OAuth (`supabase/migrations/20261113090000_identity_link_intent_hardening.sql:15-95`): 3 nhánh R-23 / AUTO_MERGE / EMAIL_COLLISION được test chạm đúng điều kiện. Ca "stranger" xoá identity và đặt `encrypted_password=''` để rơi vào nhánh 3, khớp điều kiện dòng 45-53. Email `identity_linked` do trigger `on_identity_change` sinh ra (`20261111040500_identity_hooks.sql:176`), nên test bắt được nó qua outbox.
- Huỷ suất: email chỉ được enqueue khi `contact_email` có giá trị (`20261112150000_cancel_showtimes_hardening.sql:309-328`). Test set `contact_email` thẳng qua admin, mô phỏng trạng thái sau checkout. Chấp nhận được.
- `hold_seats` ném `SHOWTIME_CANCELLED` (`20261112140000_hold_seats_hardening.sql:111`), và `booking.helper.ts:22` map sang code này. Test hiện KHÔNG assert code này (xem MAJOR-1).
- Template (`mail/templates.ts:303-349`) có hotline `1900 0000` (`DEFAULT_HOTLINE`) và không có CTA đổi suất. Khớp spec 3.0.0. Không có ca POS nào.

## Findings

### MAJOR

**MAJOR-1: Assertion "giữ ghế mới bị từ chối" sau huỷ suất là xanh giả**
`apps/api/test/integration/cancel-showtime.int-spec.ts:210-217` (liên quan `:110`, `:145`)
- Suất chỉ có 12 ghế (`rows: 3, cols: 4`). Ghế 0..9 thuộc 10 đơn paid, ghế 10 thuộc đơn holding.
- Test đối chứng ở `:145` đã mua `seatIds[PAID_ORDERS + 1]`, tức `seatIds[11]`, ghế trống cuối cùng. Comment `:110` ("1 trống") vì thế đã sai.
- Test `:205` cho buyer "late" giữ đúng `seatIds[11]`, một ghế đã SOLD. `expect(hold.status).toBeGreaterThanOrEqual(400)` sẽ pass dù suất có bị huỷ hay không: ghế đã bán vẫn bị từ chối. Test cũng không assert error code. Ngay cả một lỗi 500 cũng pass.
- Check `showtime_seat_states ... state = HELD` có độ dài 0 cũng vô nghĩa, vì giữ ghế đã bán thì không tạo HELD trong mọi trường hợp.
- Kết quả: vế "giữ ghế mới bị từ chối vì suất đã huỷ" của AC-24 không được chứng minh. Hiện chỉ assert `seatmap.body.error.code === "SHOWTIME_CANCELLED"` (`:208`) là có giá trị.
- **Cách sửa (1-2 dòng):** giữ ghế `seatIds[PAID_ORDERS]` (ghế 10, đã nhả khi đơn holding bị `cancelled`), hoặc tăng lưới lên 13 ghế trở lên để còn ghế trống thật. Thêm `expect(hold.body.error.code).toBe("SHOWTIME_CANCELLED")`, có thể thêm `expect(hold.status).toBe(409)`. Sửa comment `:110` cho khớp.

### MINOR (không chặn; khuyến nghị sửa cùng round 2 nếu tiện)

1. **Check Mailpit có thể vô nghĩa** — `auth-flows.int-spec.ts:112-125`. `countLocalInbox` trả `null` khi Mailpit không truy cập được, lúc đó `toBe(inboxAfterFirst)` thành `null === null`. Đảm bảo thật nằm ở thứ tự gọi trong service (cooldown chạy trước send), nên AC-02 vẫn đúng nhờ assert 429 + `retryAfter`. Nên assert `inboxAfterFirst` khác null, hoặc ghi rõ là skip.
2. **`drainOutbox` quét outbox toàn DB** — `helpers/app-harness.ts:63-72`. Job `/jobs/send-emails` claim mọi dòng PENDING, kể cả của suite khác hay dữ liệu dev, và đánh dấu SENT qua Resend mock.
   - Đã kiểm: không làm sai suite khác. `payos-webhook.int-spec.ts` (task-03) chỉ assert `kind`/`to_email` theo `order_id` (`:144`, `:244`), không assert số lượng theo status. Task-01/02 không đụng outbox. Vitest `fileParallelism: false` nên trong cùng một lượt `test:int` không có file nào chạy chen.
   - Rủi ro còn lại đi theo chiều ngược: `cancel-showtime.int-spec.ts:237` assert mọi dòng còn `PENDING`. Nếu có drainer đồng thời (agent khác chạy song song trên cùng DB, hoặc pg_cron `job-send-emails` khi vault đã cấu hình `api_base_url`, xem `20261113180000_cron_http_jobs.sql:29-35,104`) thì dòng này có thể flaky. Local mặc định thiếu vault secret nên cron bỏ qua. Ghi residual.
3. **Comment `runLocalSql` gây hiểu nhầm** — `helpers/app-harness.ts:76-82`. JSDoc ghi "đã có local-guard", nhưng hàm không tự gọi guard. Guard chạy ở `loadLocalSupabaseEnv()` lúc load module, và suite `skipIf(!supabaseEnv)`. Về bản chất hàm đã local-only: `docker exec` vào container cố định `supabase_db_filmbooking` trên Docker daemon local, không thể chạm DB remote/staging/prod. Không phải lỗi bảo mật. Nên sửa comment, và có thể nhận `env` rồi gọi `assertLocalSupabaseUrl` để guard đặt đúng chỗ.
4. **Không rò `TRUST_PROXY_HOPS`/env**: giá trị được truyền vào object `parseEnv(...)` rồi `overrideProvider(ENV)`, không ghi vào `process.env`. Vitest cô lập module theo file. Kết luận không rò sang file khác. (Ghi nhận, không phải lỗi.)
5. **Phạm vi / DRY**: `helpers/app-harness.ts` nằm ngoài "Files to Create/Modify". Builder đã khai trong task file và brief cho phép helper mới. Task-01 cũng thêm `helpers/api-app.ts`, cũng là một harness `Test.createTestingModule({imports:[AppModule]}).overrideProvider(ENV)`, tức trùng chức năng. Nên gom lại sau merge layer-8, không chặn.
6. **Test phụ thuộc thứ tự, số đơn khác AC** — `cancel-showtime.int-spec.ts:156` dùng `orders.push(probe)`, nên AC-24 thực chạy với 11 đơn paid chứ không phải 10 như AC ghi. Các test sau phụ thuộc test trước (lọc `-t` sẽ hỏng). Assertion dùng `orders.length` nên vẫn nhất quán. Nên tách probe sang suất riêng để giữ đúng 10 đơn.
7. **Dữ liệu sót**: bucket `rate_limit_buckets` theo IP giả (`register:ip`, `login:ip`, `resend:ip`) và `register:email` không được dọn. Các bucket này tự hết cửa sổ thời gian, vô hại trên local.
8. **Assertion status lỏng**: nhiều chỗ `toBeLessThan(300)` hoặc `toBeGreaterThanOrEqual(400)` (vd `:164, :188, :207, :268, :285, :325, :389, :398`) thay vì status chính xác. Nên chốt 200/201/409.
9. **AC-04 "intent dùng 1 lần" chưa được chứng minh** — `auth-flows.int-spec.ts:243-244`. Comment nói intent đã dùng 1 lần, nhưng ca chặn lại dùng provider `facebook` (chưa từng có intent), nên chỉ chứng minh "không intent thì bị chặn". Nên assert `identity_link_intents.consumed_at` khác null, hoặc thử chèn một identity google thứ hai (provider_id khác) mà không tạo intent mới.
10. **"Ngừng bán trên web"** mới chỉ kiểm qua seatmap và giữ ghế. Chưa kiểm danh sách suất công khai đã loại suất CANCELLED. Có thể bổ sung, không bắt buộc.

### Các điểm đã đánh giá là HỢP LÝ
- **Trả tiền qua `confirm_paid` trực tiếp:** đây là chính RPC service-role mà webhook gọi. Đường chữ ký/idempotency đã được task-03 phủ. `confirm_paid` chấp nhận đơn `holding`/`pending_payment`.
- **Xoá bucket cooldown (AC-02) và lùi `locked_until` (AC-03):** cả hai thao tác đúng phần trạng thái mà code thật đọc (`hit_rate_limit` / `is_login_locked`), là cách mô phỏng thời gian trôi hợp lệ. Sau khi mở khoá, test assert đăng nhập 200 và `failed_count` về 0 qua đường API thật.
- **AC-04 mô phỏng GoTrue:** ca 1 (chèn identity google vào user có mật khẩu, không có intent → `OAUTH_AUTO_MERGE_BLOCKED`) phản ánh đúng auto-linking của GoTrue. Ca link-intent dùng API thật (`/me/identities/link-intent` → 204) rồi trigger cho phép và sinh email `identity_linked`. Ca R-23 trung thực. Ca "stranger" là mô phỏng tổng hợp (GoTrue thật thường không tạo user trùng email), chấp nhận được vì đã có checklist kiểm tay. Checklist 4 mục trong task file đủ cho AC-04 (UI yêu cầu đăng nhập mật khẩu), R-24 (liên kết + email), AC-05 (UI), và Facebook thiếu email (không lộ email tồn tại).
- **AC-05:** đi trọn qua API thật: 409 `LAST_LOGIN_METHOD` kèm hướng dẫn, thêm mật khẩu (yếu thì 400, mạnh thì 200), rồi huỷ liên kết được, sau đó còn `email`.
- **AC-25 / AC-26:** đủ ca 422 (thiếu số tiền, thiếu mã, mã toàn khoảng trắng, số tiền 0, số tiền vượt), 403 rạp khác, 409 hoàn trùng, xuất hiện trong báo cáo suất bị huỷ. Đóng rạp bị 409 kèm đúng danh sách 3 suất, Manager bị 403, huỷ hàng loạt kèm 3 email rồi mới đóng được. Assertion chặt.
- **Cleanup:** `afterAll` dọn outbox, `login_attempts` và `oauth_missing_email_requests` theo prefix scope, cùng `cleanupScope` (đơn/suất/rạp/phim/user). Identity chèn bằng SQL được xoá theo user nhờ cascade.

## Verdict
**FAIL** (STRICT) — 1 MAJOR.

MAJOR-1 là xanh giả thật: assertion "giữ ghế mới bị từ chối sau huỷ suất" giữ một ghế đã bán sẵn và không kiểm error code, nên không chứng minh được vế này của AC-24. Sửa nhỏ (đổi ghế + assert `SHOWTIME_CANCELLED`) rồi review lại round 2. Các MINOR khuyến nghị sửa cùng lúc, ưu tiên MINOR-1, 3, 6, 9.
