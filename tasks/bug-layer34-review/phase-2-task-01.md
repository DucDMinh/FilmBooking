# Bug layer34-review · phase-2-task-01 — Vòng đời đơn: pending_payment hết hạn + huỷ đơn cũ khi giữ ghế mới

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M1a/b, M2)
- Yêu cầu: expire_overdue_holds và hold_seats §3.14 chuyển cả pending_payment quá hạn sang expired (+ huỷ payment link, nhả voucher qua orders_voucher_status_sync); hold_seats §3.13 huỷ cả đơn pending_payment cũ của khách (+ huỷ payment); unique index một-đơn-đang-giữ phủ cả pending_payment (HIGH_RISK_MIGRATION nếu index trên dữ liệu cũ — kiểm trùng trước, fail rõ).
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: builder PASS (chờ reviewer STRICT)

## Root cause
- `expire_overdue_holds` và `hold_seats` §3.14 chỉ chuyển `status='holding'` sang `expired` nhưng xoá mọi ghế HELD hết hạn -> đơn `pending_payment` treo vĩnh viễn, voucher HELD không nhả (trigger `orders_voucher_status_sync` không chạy), payment PENDING mãi.
- `hold_seats` §3.13 chỉ huỷ `holding`; unique index `orders_one_holding_per_user_key` chỉ phủ `holding` -> khách giữ nhiều bộ ghế cùng lúc, trái R-64/quyết định #9.

## Fix
Migration `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql` (mới, additive; CREATE OR REPLACE giữ chữ ký/SECURITY DEFINER/search_path/ACL, 048 vẫn xanh):
- `expire_overdue_holds` + `hold_seats` §3.14: `holding` và `pending_payment` quá `hold_expires_at` -> `expired`; ghế của đơn bị xoá; payment PENDING -> EXPIRED; voucher RELEASED qua trigger (guard cho phép pending_payment -> expired/cancelled).
- `hold_seats` §3.13: khoá (`FOR UPDATE`, order by id) rồi huỷ cả `holding` + `pending_payment` cũ của khách; nhả ghế; payment PENDING -> CANCELLED; voucher RELEASED qua trigger.
- Index mới `orders_one_active_hold_per_user_key` (status in holding, pending_payment), drop index cũ; precheck trùng + create index mới + drop index cũ nằm trong MỘT khối `do $$` (atomic, `lock table orders in access exclusive mode` ngay đầu), không còn begin/commit tường minh (review F2).

## Repro Verification
- Test: `supabase/tests/050_order_lifecycle.test.sql` (17 assert: lazy-expire, job, huỷ đơn cũ, unique, ca âm).
- RED (trước migration, `npx supabase test db`): `Failed tests: 2-9, 11-14`, `Failed 12/14 subtests`; ví dụ: "(b) đơn pending_payment quá hạn -> expired: have pending_payment want expired", "(a) expire_overdue_holds: 0 >= 1", "(c) U4 tạo đơn mới...: SEAT_TAKEN: Ghế A3, A4 đã có người giữ hoặc mua", "(d) caught: no exception wanted 23505".
- GREEN (sau `npx supabase migration up`): `All tests successful. Files=19, Tests=682, Result: PASS`. `pnpm test` 16 pass, `pnpm lint`, `pnpm typecheck` OK. Không đổi chữ ký -> không cần `pnpm db:types`. Test cũ không phải sửa.
- Status: PASS

## HIGH_RISK_MIGRATION
- Op: tạo unique index `orders_one_active_hold_per_user_key` (mở rộng sang pending_payment) + drop index cũ trên bảng `orders`.
- Lock: `LOCK TABLE orders IN ACCESS EXCLUSIVE MODE` trong khối DO (chặn CẢ đọc lẫn ghi `orders` trong lúc precheck + CREATE INDEX + DROP INDEX; bảng nhỏ, thời gian ngắn), kèm `lock_timeout = 5s` (set_config local) để fail nhanh thay vì làm mọi SELECT phía sau bị treo. Áp ngoài giờ cao điểm.
- Precheck: migration tự raise `MIGRATION_PRECHECK_FAILED` (23505) nếu có user có >1 đơn holding/pending_payment. Staging: chạy trước `select user_id, count(*) from orders where status in ('holding','pending_payment') and user_id is not null group by 1 having count(*)>1`; nếu có -> expire/huỷ đơn cũ thủ công rồi mới áp. Không có data thay đổi/backfill.
- Rollback: `begin; drop index orders_one_active_hold_per_user_key; create unique index orders_one_holding_per_user_key on orders(user_id) where status='holding' and user_id is not null; commit;` + phục hồi 4 hàm từ định nghĩa trước đó: `hold_seats`, `expire_overdue_holds`, `release_seats` từ `20261111040000_rpc_hold.sql` (không migration nào sau đó định nghĩa lại); `cancel_showtimes` từ `20261112080000_function_privileges_hardening.sql` (KHÔNG phải 20261111040300). Hành vi cũ có bug (M1/M2).
- Không promote prod trước khi verify staging (áp migration + `npx supabase test db`/smoke hold -> create payment -> hold lại).

## Doc impact
`docs/ERD.md` / `docs/DESIGN.md` không nhắc index hay vòng đời hold/pending_payment (đã grep) -> no doc impact. Spec R-63/R-64/R-77/§8.5 giữ nguyên (code nay khớp spec).

## Residual risk
- Tiền về sau khi đơn pending_payment bị expired/cancelled: `confirm_paid` case A vẫn không kiểm `hold_expires_at` (M1c) và case B voucher (M3) -> task-02 xử lý.
- Race: `hold_seats`/job expire một đơn pending_payment đúng lúc `confirm_paid` đang chạy: dựa vào khoá dòng orders (confirm_paid `FOR UPDATE`; §3.13 khoá `FOR UPDATE`). Job `expire_overdue_holds` và §3.14 dùng UPDATE có điều kiện status nên đơn đã paid không bị đổi; chưa có test đồng thời thật cho đường này.
- Payment link PayOS phía nhà cung cấp không bị huỷ từ DB (chỉ đổi trạng thái payments); phía API cần gọi huỷ link nếu muốn (ngoài phạm vi DB).

## Review round 1 fixes
- Thứ tự khoá toàn cục (ghi ở đầu migration): orders (id tăng dần) -> payments -> seats (chỉ hold_seats §3.9) -> showtime_seat_states ((showtime_id, seat_id) tăng dần). confirm_paid/sell_order_seats khớp thứ tự này.
- F1: `hold_seats` thêm §3.8b khoá `orders` (đơn holding/pending_payment của khách + đơn quá hạn của suất, `order by id for update`) TRƯỚC khoá `seats` §3.9; §3.13/§3.14 đổi sang UPDATE orders -> payments -> DELETE seat_states (xoá qua subquery `order by showtime_id, seat_id for update`). Job `expire_overdue_holds` cùng thứ tự.
- F2: bỏ begin/commit; kiểm tra bằng cách đưa DB local về trạng thái trước (drop index mới, tạo lại index cũ) rồi chạy nguyên file qua psql: DO/CREATE FUNCTION/REVOKE/GRANT đều OK. File đã thay đổi so với bản "migration up" ban đầu nhưng chỉ khác nội dung; schema_migrations vẫn ghi 20261112100000 (local). Staging/prod chưa áp nên không cần repair.
- F3: comment `orders_one_active_hold_per_user_key` đã sửa. F4: 050 thêm assert O1, exact count = 1, âm O4 chưa hết hạn, âm đơn paid (17 assert).
- Test đồng thời thật `051_order_lifecycle_concurrency.test.sql` (dblink, 3 phiên confirm_paid / expire_overdue_holds / hold_seats, 20 vòng lệch thời gian): 0 deadlock 40P01, trạng thái cuối nhất quán, tự dọn, không để extension. Trung thực: KHÔNG chạy được trên code round-1 (file round-1 đã bị ghi đè, không dựng lại), nên không có bằng chứng "đỏ trước"; test chỉ chứng minh bản mới không deadlock trong các interleaving lấy mẫu (10 vòng hold_seats thắng, 10 vòng thua SEAT_TAKEN/vì confirm_paid bán ghế trước), không chứng minh tuyệt đối.
- Residual: deadlock hold_seats(seats FOR UPDATE) vs confirm_paid khi hai đơn KHÁC nhau tranh cùng ghế là hành vi cũ (task K4), ngoài phạm vi.

## Review round 2 fixes
- R2-F1: migration CREATE OR REPLACE thêm `release_seats` (khoá đơn `FOR UPDATE` ngay đầu, trước seat_states) và `cancel_showtimes` (khoá đơn holding/pending_payment/paid `order by id for update` TRƯỚC DELETE seat_states; DELETE có thứ tự (showtime_id, seat_id) qua subquery FOR UPDATE). Lấy từ định nghĩa live, giữ chữ ký/ACL/SECURITY DEFINER/search_path; phần còn lại giữ nguyên.
- hold_seats §3.9: `for update` -> `for no key update` (không còn xung đột KEY SHARE của FK với sell_order_seats; hold_seats cùng ghế vẫn tuần tự). Hệ quả quan sát được: khi hold_seats và confirm_paid tranh một ghế vừa hết hạn, hold_seats có thể nhận 23505 (unique index seat_state) thay vì SEAT_TAKEN 23514; an toàn dữ liệu không đổi (không bán trùng), chỉ khác mã lỗi. Chưa map 23505 -> SEAT_TAKEN (ngoài phạm vi vòng này).
- Header migration ghi thứ tự khoá toàn cục gồm showtimes; residual có từ trước: confirm_pos_sale khoá orders rồi showtimes FOR SHARE, ngược cancel_showtimes (showtimes -> orders), không đổi ở đây.
- `lock_timeout` 5s thêm vào khối DO của index.
- Test: 051 thêm phần 2, dùng trigger tạm (ngủ 0.6s sau khi khoá dòng seat_state bị DELETE) để tạm dừng release_seats / cancel_showtimes giữa chừng, job expire_overdue_holds chen vào sau 0.2s. RED có bằng chứng: cài lại bản release_seats cũ (không khoá đơn trước) -> test 5-6 fail (deadlock 40P01); bản mới xanh. Hành vi release_seats/cancel_showtimes vẫn được 040/043 bảo vệ (xanh). Test chứng minh đúng cặp release_seats/cancel_showtimes vs job với 1 đơn 1 ghế; cancel_showtimes vs job chưa có red riêng (chỉ xanh), và các cặp khác dựa vào phân tích thứ tự khoá.

## Review round 3 fixes
- hold_seats §3.9 trở lại `for update` như trước task (bỏ `for no key update`).
- §3.22: insert seat_state nằm trong sub-block bắt `unique_violation`; chỉ ràng buộc `showtime_seat_states_showtime_seat_key` được map thành `SEAT_TAKEN` (errcode 23514, query lại nhãn ghế); ràng buộc khác (vd `orders_one_active_hold_per_user_key`) `raise` lại nguyên trạng.
- Header migration: ghi Residual có từ trước (showtimes KEY SHARE sau khi khoá orders ngược cancel_showtimes + ghi chú cho task-02; deadlock nhiều ghế hold_seats seats FOR UPDATE vs FK KEY SHARE; hai hold_seats đồng thời của cùng khách).
- 051 phần 1: thêm assert kết quả phiên C (hold_seats) chỉ là `ok` hoặc `23514`, không bao giờ 23505.
