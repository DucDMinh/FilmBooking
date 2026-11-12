Agent: reviewer

# Review — bug-layer34-review · phase-2 · task-01 · round 1

- Task: `tasks/bug-layer34-review/phase-2-task-01.md` (M1a/b + M2: vòng đời đơn pending_payment)
- Diff (chưa commit): `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql` (mới), `supabase/tests/050_order_lifecycle.test.sql` (mới), task file.
- Review level: **STRICT**
- Reason: schema/migration (unique index trên dữ liệu cũ, HIGH_RISK_MIGRATION), thay RPC dùng chung `hold_seats` / job `expire_overdue_holds`, đụng luồng thanh toán/voucher, có rủi ro concurrency/khoá.
- Blast radius: `public.hold_seats` (mọi lượt giữ ghế Web/POS), `public.expire_overdue_holds` (pg_cron mỗi phút), index `orders` (`orders_one_holding_per_user_key` -> `orders_one_active_hold_per_user_key`), gián tiếp `payments`, `voucher_redemptions` (trigger `orders_voucher_status_sync`), `confirm_paid` / `sell_order_seats` (tranh khoá).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (supabase test db, local stack, không reset/seed) | PASS — Files=19, Tests=682, 050 ok, 048 allowlist ok |
| `pnpm test` | PASS — shared 14, api 210, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip — diff chỉ SQL, không đụng TS/JS; ocr chưa cài |

Test xanh **không** đủ để PASS: 050 chạy một phiên duy nhất nên không thể bắt lỗi thứ tự khoá dưới đây.

## Đối chiếu yêu cầu

1. **CREATE OR REPLACE giữ nguyên phần còn lại** — so với định nghĩa gần nhất (`20261111040000_rpc_hold.sql:69-565`, `:725-759`; không migration nào sau đó định nghĩa lại hai hàm này): §3.1–3.12 và §3.15–3.24 trùng khớp (khoá `seats FOR UPDATE ORDER BY id`, INVALID_SEATS, HOLD_LIMIT, khoá ghế bởi Manager, kiểm tuổi, ORPHAN_SEAT, POS idempotent/quyền, cutoff). Chữ ký, `RETURNS TABLE`, SECURITY DEFINER, `search_path=''`, REVOKE/GRANT giữ nguyên. Chỉ §3.13/§3.14 và thân job thay đổi. OK.
2. **Chuyển trạng thái** — `orders_guard_transition` (`20261111040100_rpc_payment.sql:35`) đã cho phép `pending_payment -> cancelled/expired`. Enum `payment_status` có `CANCELLED`/`EXPIRED` (`20261111030100_booking_tables.sql:26`). Trigger `orders_voucher_status_sync` là `AFTER UPDATE OF status` (`20261111040200_rpc_voucher.sql:312-315`) nên chạy thật; test (a)(b)(c) chứng minh voucher chuyển RELEASED. Ghế được nhả. OK.
   **Deadlock: KHÔNG ổn, xem F1.**
3. **Race với confirm_paid** — UPDATE có điều kiện `status in ('holding','pending_payment')` đủ để không đè đơn đã paid (READ COMMITTED đánh giá lại WHERE sau khi chờ khoá). Tiền về sau khi đơn đã expired/cancelled sẽ rơi vào case A/B của `confirm_paid` (M1c/M3) — thuộc task-02, chỉ ghi nhận. Thứ tự khoá có lỗi, xem F1.
4. **Migration** — precheck trùng + LOCK + index mới thay index cũ đều đúng. HIGH_RISK_MIGRATION trong task file ghi đủ op/lock/precheck/rollback/staging. Việc bọc begin/commit xem F2.
5. **Test 050** — RED 12/14 trước migration là hợp lý (2 assert pass sẵn là (b) `lives_ok` không chạy được và (a) ghế trống do job cũ đã xoá HELD hết hạn — khớp log "Failed 2-9, 11-14"). Các assert cụ thể theo trạng thái đơn, payment, voucher và seat_state. Case (d) đặc thù thật: index mới là unique duy nhất mà insert đó có thể chạm. Còn thiếu vài case, xem F4.

## Findings

### F1 — MAJOR (chặn PASS): thứ tự khoá orders ↔ showtime_seat_states không nhất quán, tạo deadlock mới
Tìm ra bằng phân tích thứ tự khoá; chưa tái hiện được bằng 2 phiên thật (allowlist không có công cụ chạy 2 phiên). Test 050 chỉ có 1 phiên nên không bắt được — đây là lỗ hổng của bộ test.

- **Code cũ nhất quán** (đều seat_states trước, orders sau):
  - job cũ: `DELETE showtime_seat_states` rồi `UPDATE orders` (`20261111040000_rpc_hold.sql:742-751`)
  - §3.14 cũ: `DELETE` rồi `UPDATE` (`:334-350`)
- **Code mới đảo một nửa:**
  - job mới: `UPDATE orders` (`20261112100000_order_lifecycle_pending_payment.sql:553-560`) **rồi** `DELETE showtime_seat_states` (`:563-565`)
  - `hold_seats` §3.14 mới vẫn `DELETE showtime_seat_states` HELD hết hạn trước (`:302-305`), **rồi** `UPDATE orders` (`:307-313`)
- **Kịch bản 1 — job ↔ hold_seats (lỗi mới hoàn toàn):** đơn O (pending_payment hoặc holding) quá hạn ở suất S. Job khoá O bằng UPDATE rồi chờ xoá các dòng seat_state của O. Cùng lúc, một khách khác gọi `hold_seats(S)`: §3.14 đã xoá các dòng đó (chưa commit) và chờ khoá O ở `UPDATE orders`. Hai bên chờ nhau -> `40P01`. Nếu Postgres huỷ `hold_seats`, khách nhận lỗi khi giữ ghế. Job chạy mỗi phút, suất đông thì điều kiện này xảy ra thật.
- **Kịch bản 2 — hold_seats §3.14 ↔ confirm_paid:** `confirm_paid` khoá đơn `FOR UPDATE` (`20261112060000_prevent_double_sell.sql:163`) rồi `sell_order_seats` khoá dòng seat_state (`:97-102`), tức orders trước, seat_states sau. §3.14 làm ngược lại. Trước đây §3.14 chỉ UPDATE đơn `holding` (chưa có payment link nên không nhận webhook), nên đường này gần như không chạm tới. Nay §3.14 UPDATE cả `pending_payment` — đúng trạng thái nhận webhook — nên đường này chạm tới được. Task-02 không gỡ được vì case B cũng đi qua `sell_order_seats`.
- **Sửa đề xuất:** trong `hold_seats` §3.14, chạy `UPDATE orders ... RETURNING id` trước, rồi mới `DELETE showtime_seat_states` (HELD hết hạn của suất + ghế của các đơn vừa expired). Như vậy cả ba đường (job, §3.13, `confirm_paid`) đều khoá orders trước, seat_states sau. Nên cân nhắc khoá đơn theo `ORDER BY id` (`SELECT ... FOR UPDATE` trước UPDATE) ở cả job và §3.14 để UPDATE nhiều dòng cũng khoá theo thứ tự ổn định. Nên kèm một ghi chú/test chứng minh thứ tự khoá, ví dụ test kiểm định nghĩa hàm hoặc ghi rõ trong Residual risk nếu không test được 2 phiên.

### F2 — MINOR: `begin;` / `commit;` tường minh trong migration (`20261112100000_...sql:13`, `:581`)
- Không migration nào khác trong repo dùng `begin;`/`commit;` ở top-level (đã grep `supabase/migrations`). Đây là ngoại lệ so với quy ước.
- Lý do trong task file (`phase-2-task-01.md:17` "CLI không tự mở transaction") **chưa được kiểm chứng**. Theo hiểu biết của tôi về Supabase CLI (`pkg/migration/file.go` `ExecBatch`), CLI gửi cả file trong một batch pipeline vốn đã là một transaction ngầm, và **nối lệnh INSERT lịch sử migration vào cuối cùng batch**. Tôi không kiểm chứng được mã CLI trong môi trường này. Nếu đúng như vậy, `COMMIT` tường minh sẽ commit phần schema **tách khỏi** dòng ghi `supabase_migrations.schema_migrations`. Rủi ro thực tế thấp, nhưng mất tính nguyên tử "schema đổi ⇔ đã ghi lịch sử" khi chạy `db push` trên staging/prod.
- Yêu cầu: hoặc đưa bằng chứng (log `migration up`/`db push --debug`, hoặc trích mã CLI), hoặc bỏ begin/commit cho khớp quy ước repo. Nếu bỏ thì phải chạy lại `migration up` + `db:test`, vì `LOCK TABLE` đòi hỏi transaction block — cần xác nhận nó vẫn chạy được trong transaction ngầm của CLI.
- Ghi chú nhỏ: giữ `SHARE` rồi `DROP INDEX` phải nâng lên `ACCESS EXCLUSIVE` (lock upgrade). Nếu có transaction dài đang đọc `orders` rồi ghi, có thể deadlock lúc migrate. Rủi ro thấp vì đã ghi "áp ngoài giờ cao điểm".

### F3 — MINOR (AI-readable): comment cũ
`20261112100000_...sql:458` vẫn nhắc `orders_one_holding_per_user_key` — index này bị drop ngay trong migration này (`:35`). Nên đổi thành `orders_one_active_hold_per_user_key`.

### F4 — MINOR: test 050 còn thiếu
- (b) không assert payment `...5001` EXPIRED và voucher `...7001` RELEASED của O1 (chỉ assert cho O2) — đơn thứ hai chỉ được kiểm trạng thái đơn.
- (a) `cmp_ok(expire_overdue_holds(), '>=', 1)` lỏng; nên `is(..., 1)` vì dữ liệu cố định.
- Thiếu case âm: sau (b), O4 (pending_payment còn hạn của U4) phải **giữ nguyên** `pending_payment` và payment PENDING. Thiếu đơn `paid` cùng suất có `hold_expires_at` quá khứ để chứng minh §3.14/job không động vào đơn paid.
- Không có test đồng thời (đã ghi ở Residual risk) — chính vì vậy F1 lọt.

### Ghi nhận (không FAIL, thuộc task-02 / ngoài DB)
- M1c: webhook muộn cho đơn `pending_payment` quá hạn mà job chưa chạy vẫn vào case A của `confirm_paid`, không kiểm `hold_expires_at`.
- M3: case B "hồi sinh" voucher đã RELEASED. Task này làm đường đó **thường gặp hơn**, vì đơn pending_payment nay thực sự chuyển expired/cancelled và nhả voucher. Task-02 cần ưu tiên.
- Payment link PayOS vẫn còn hiệu lực phía nhà cung cấp sau khi DB đánh `CANCELLED`/`EXPIRED` (spec dòng 554 yêu cầu "huỷ payment link") — cần task phía API.

## Kết luận
- Phần chức năng M1a/b + M2 đúng spec, logic khác của hai hàm không bị rơi, ACL/chữ ký giữ nguyên, các verify đều xanh.
- Tuy vậy, thay đổi gây **hồi quy thứ tự khoá** (F1): job mới và `hold_seats` §3.14 khoá orders/seat_states ngược nhau, đồng thời mở đường deadlock với `confirm_paid` trên đơn `pending_payment`.
- Builder cần sửa F1. F2–F4 nên sửa cùng vòng.

## Verdict: **FAIL**
