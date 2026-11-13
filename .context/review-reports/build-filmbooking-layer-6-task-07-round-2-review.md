# Review: build-filmbooking layer-6 task-07, round 2

Agent: reviewer
Task: Harness kiểm thử tích hợp API <-> Supabase local (`pnpm test:int`)
Worktree: E:/FilmBooking/.worktrees/layer-6__task-07 (branch wt/layer-6__task-07, chưa commit)
Round trước: `.context/review-reports/build-filmbooking-layer-6-task-07-round-1-review.md` (FAIL vì F1, F2)

## Review level
STRICT

## Reason
Harness ghi và xoá dữ liệu bằng service_role, là hạ tầng chung mà Layer 8 sẽ dùng, và có đụng tới CI. Round này kiểm lại phần sửa F1–F5.

## Blast radius
- File mới thêm trong round này: `apps/api/test/integration/helpers/local-guard.ts` và `local-guard.spec.ts`. Spec này khớp pattern `test/**/*.spec.ts` nên chạy trong `pnpm test`.
- File sửa: `helpers/supabase-test.ts` (guard, CI throw, cleanup), `helpers/factories.ts` (`scope.userIds`), `smoke.int-spec.ts` (assert 200).
- Các file ngoài scope đã ghi nhận ở round 1 (package.json, tsconfig, ci.yml, docs) không thay đổi gì thêm.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm test:int` (Supabase local đang chạy) | PASS: 5/5 test chạy thật, không skip. `afterAll` cleanup không throw, nghĩa là mọi lệnh xoá đều trả `error = null` |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/api && pnpm test` | PASS: 24 file, 436 test (round 1 là 428; tăng 8 test của local-guard.spec) |
| Đếm dữ liệu `it_` còn sót bằng `docker exec psql` | **Blocked**: agent-guard chặn `docker` với reviewer. Builder báo `0\|0\|0\|0`. Tôi chưa tự xác nhận được; dispatcher cần chạy SELECT đếm |
| aislop / oxlint / ocr | skip (oxlint chưa cấu hình, ocr chưa cài, aislop không có trong allowlist) |

## Kiểm lại F1–F5

### F1 (guard URL local): ĐÃ SỬA
`local-guard.ts:1-19` dùng allowlist chặt trên `new URL(raw).hostname`, sai thì throw (không skip). Nó được gọi ở `loadLocalSupabaseEnv` (`supabase-test.ts:60`), trước khi ping health, và ở `createAdminClient` (`:98`). Tôi đã phân tích các cách lách theo chuẩn WHATWG URL:
- userinfo: `http://127.0.0.1@evil.com` có hostname `evil.com`, bị từ chối. `http://user@evil.com#@127.0.0.1` có trong spec, bị từ chối.
- subdomain: `127.0.0.1.evil.com` và `localhost.evil.com` bị từ chối (có trong spec).
- IPv6 dạng khác: `[::ffff:127.0.0.1]` được chuẩn hoá thành `[::ffff:7f00:1]`, không có trong set nên bị từ chối. `[0:0:0:0:0:0:0:1]` được chuẩn hoá thành `[::1]`, được chấp nhận, mà đây đúng là loopback.
- `0.0.0.0` bị từ chối. Như vậy là an toàn hơn cần thiết, chấp nhận được.
- `localhost.` (dấu chấm cuối) bị từ chối. `LOCALHOST` được chuẩn hoá thành `localhost`, vẫn là local.
- `http://0x7f.1` được chuẩn hoá thành `127.0.0.1`, vẫn là loopback.

Không có cách nào khiến host ngoài lọt qua. Phần tử `"::1"` (không ngoặc) trong set không bao giờ khớp, vì `URL.hostname` của IPv6 luôn có ngoặc. Nó vô hại.

### F2 (cleanup nuốt lỗi): ĐÃ SỬA
`supabase-test.ts:131-164`: mọi lệnh select/delete/deleteUser đều được `check(error)`, lỗi được gom lại và throw ở cuối. Đối chiếu thứ tự xoá với FK trong migration:
- `payments.order_id ON DELETE RESTRICT` (`20261111030100_booking_tables.sql:174`) và `affected_order_actions.order_id RESTRICT` (`:226`) được xoá trước `orders`. Đúng.
- `orders` kéo cascade sang order_seats (`:108`), showtime_seat_states (`:128`), tickets (`:157`), voucher_redemptions (`:210`), affected_order_cases (`rpc_cancel.sql:19`), pos_requests (`rpc_hold.sql:11`). Còn `payment_events.payment_id` là SET NULL. Đúng.
- `orders.showtime_id RESTRICT` (`:69`), `tickets.showtime_id RESTRICT` (`:159`) và `order_seats.seat_id RESTRICT` (`:109`) đều đã hết vì orders bị xoá trước showtimes/cinemas. Đúng.
- `orders.cinema_id`, `payments.cinema_id`, `affected_order_actions.cinema_id` không cascade, nhưng các bản ghi này đã xoá trước cinemas. Đúng.
- `showtimes.(room_id,cinema_id)` không cascade (`catalog.sql:123`), nên phải xoá showtimes trước cinemas. Đúng. `showtimes.movie_id` không cascade (`:114`), nên phải xoá trước movies. Đúng. `cinemas.province_id` không cascade (`core_identity_chain.sql:89`), nên phải xoá trước provinces. Đúng.
- User: `user_roles` và `staff_assignments` cascade theo auth.users. Các cột tham chiếu user khác (orders.user_id, checked_in_by…) đều là SET NULL. Đúng.

Lệnh xoá vẫn chỉ nhắm vào cinema theo prefix của scope, movie theo slug prefix, province theo `eq`, user theo id do factory ghi lại. Không có lệnh xoá rộng.

### F3 (CI xanh giả): ĐÃ SỬA
`supabase-test.ts:61-63`: khi stack không chạy và có `process.env.CI` thì throw. GitHub Actions luôn đặt `CI=true`. Job `verify` không chạy `test:int`, nên không bị ảnh hưởng.

### F4 (listUsers 1000): ĐÃ SỬA
User được xoá theo `scope.userIds` (`supabase-test.ts:157-159`, `factories.ts:59`), không còn quét `listUsers`.

### F5 (assert status): ĐÃ SỬA
`smoke.int-spec.ts:76,79`.

## Findings mới (round 2)

### N1: MINOR. User có thể bị sót nếu signIn trong factory lỗi
`factories.ts:54-59`: `scope.userIds.add(...)` chạy **sau** `signInWithPassword`. Nếu `createUser` của GoTrue thành công mà `signIn` lỗi thì hàm throw trước khi ghi id, user đó không bao giờ được dọn. Nên chuyển lệnh `add` lên ngay sau dòng 52. Lỗi này chỉ gây sót dữ liệu khi test đã fail, không xoá nhầm gì.

### N2: INFO. Dọn dữ liệu của run bị crash (F6 round 1)
Vẫn chưa có cơ chế. Mức MINOR, không chặn.

### N3: INFO. `createAnonClient` không gọi guard
Hiện tại env luôn đi qua `loadLocalSupabaseEnv` (đã có guard), và anon key không có quyền service_role. Rủi ro thấp.

## Residual risk
- Chưa tự xác nhận được số dữ liệu `it_` còn sót trên DB thật, vì docker bị chặn với reviewer. Dù vậy, cleanup giờ throw khi bất kỳ lệnh xoá nào lỗi, và `pnpm test:int` PASS, nên đây là bằng chứng gián tiếp rằng không còn sót. Dispatcher nên chạy 4 câu SELECT đếm (`auth.users email like 'it\_%'`, `cinemas code like 'IT%'`, `movies slug like 'it-%'`, `provinces code like 'IT\_%'`) trước khi commit.

## Verdict
**STRICT PASS**. F1–F5 đã sửa đúng, guard không lách được, thứ tự xoá khớp FK, không có regression (436 test và 5 test int PASS). Còn 1 MINOR (N1), Builder có thể sửa kèm hoặc để sau.
