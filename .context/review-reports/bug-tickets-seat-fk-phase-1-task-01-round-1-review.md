# Review — bug tickets-seat-fk · phase-1-task-01 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** DB/schema migration có gắn HIGH_RISK_MIGRATION (FK mới trên bảng `tickets` đang có dữ liệu); đổi thứ tự khoá trên đường thanh toán `confirm_paid` / `confirm_zero_amount`, chạy song song với `hold_seats` (race/deadlock 40P01).
- **Blast radius:** `public.sell_order_seats` (nội bộ, SECURITY DEFINER; caller hiện còn: `confirm_paid` @20261113160000, `confirm_zero_amount` @20261112120000), bảng `public.tickets` (FK + index mới), xoá `public.seats` (từ `seat-layout.service.ts:292` `replaceSeats`). Không đổi API/web/DTO.
- **Scope đã đọc:** 2 migration mới, pgTAP 071/072, `docs/ERD.md` diff, `BACKLOG.md` diff, bản `sell_order_seats` cũ (20261112060000 §2), `confirm_paid` (20261113160000), `confirm_zero_amount` (20261112120000), `hold_seats` (20261112140000 §3.8b–3.15), trigger `showtime_seat_states_fill`, DDL `tickets`/`order_seats`/`showtime_seat_states`/`showtime_seat_locks`, `throwDbError` (seat-layout.service.ts:62-70).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 39/39; api 29 file / 679/679; web 53 file / 669/669 (2 test flaky CR-013 lần này không đỏ); scripts 31/31 |
| `pnpm exec supabase test db supabase/tests/<file>` | **Blocked** bởi agent-guard (ngoài allowlist) → dùng `pnpm db:test` |
| `pnpm db:test` | Tổng FAIL, nhưng **071 ok, 072 ok**, cùng 047, 051, 052, 053, 054, 056, 057, 064, 065, 066, 067, 068, 069, 070 ok. 13 file đỏ (010, 020, 030, 031, 033, 040, 041, 042, 043, 044, 050, 063, 090) đều "ran 0" do DB local bẩn có từ trước (`provinces_name_key` "Hà Nội" / `price_rules_chain_key`), không phải do task này. 063 đỏ do insert provinces ở dòng 44 (trước insert tickets ở dòng 127). Số file đỏ khớp với báo cáo builder (13). |
| aislop / oxlint / ocr | skip: diff chỉ có SQL + Markdown, không có TS/JS; chưa cài ocr |

Trong lượt chạy 071 của tôi, diag cho thấy: A (`confirm_paid` tiền về muộn) = `ok`, C (`hold_seats`) = `23514 SEAT_TAKEN`, B = `P0001 T71_B_RELEASE`, sau cùng `order_a=paid, tickets=1, seat_rows=1`. Không có 40P01, đúng như phân tích bên dưới.

## Phân tích chính

### 1. Khoá: phủ đủ mọi đường INSERT `tickets`
- Grep không phân biệt hoa thường `insert into public.tickets` trên toàn bộ migrations: các bản hàm còn hiệu lực chỉ có `confirm_paid` (20261113160000:302) và `confirm_zero_amount` (20261112120000:141). Cả hai đều gọi `sell_order_seats` rồi mới INSERT (`confirm_paid`:261 → 302 chỉ khi `v_reason is null`; `confirm_zero_amount`:98 → raise nếu false → 141). Các bản trong `20261111040100` / `20261112060000` / `20261112110000` đã bị `create or replace` thay thế.
- `confirm_pos_sale` đã bị `DROP` ở `20261112130000_remove_pos.sql:594`, nên không còn caller đó.
- Không có app/script nào insert `tickets` (chỉ có `apps/api/test/integration/rls-scope.int-spec.ts:513`, là test integration).
- Thân hàm mới giống hệt bản 20261112060000 §2, chỉ thêm khối `perform ... order by s.id for key share` (dòng 40-44) sau early-return và trước khi khoá `showtime_seat_states`, nằm ngoài khối `begin ... exception` nên không bị nhả khi rollback savepoint. Chữ ký, `security definer`, `search_path=''` và `revoke all` giữ nguyên.
- Early-return khi đơn không có ghế: trường hợp này không INSERT tickets (không có `order_seats`), nên không ảnh hưởng.
- Tương thích khoá: KEY SHARE xung đột với `FOR UPDATE` của `hold_seats` §3.9 (đúng như mong muốn), không xung đột với KEY SHARE của phiên `confirm_paid` khác. Kiểm FK khi INSERT `tickets` chỉ cần KEY SHARE, và phiên đã giữ sẵn khoá này, nên không phải nâng cấp khoá.
- Thứ tự với `hold_seats`: orders (§3.8b) → seats FOR UPDATE id tăng dần (§3.9) → seat_states (§3.13/§3.14). `sell_order_seats`: orders (đã khoá ở caller) → seats KEY SHARE id tăng dần → seat_states FOR UPDATE → tickets. Hai bên cùng chiều và cùng sắp tăng dần, nên không còn chu trình seats↔seat_states. Ca đa ghế {S1,S2} × {S2,S3} cũng không tạo chu trình.
- Không có hàm DB nào `UPDATE`/`DELETE public.seats`. Đường xoá ghế duy nhất là `seat-layout.service.ts:292`, vốn đã bị `order_seats_seat_id_fkey` RESTRICT chặn khi ghế có vé; `throwDbError` map 23503 chung thành CONFLICT/REFERENCE, nên không đổi HTTP.
- Trigger `tickets_fill_seat` là BEFORE INSERT. Kiểm RI là AFTER trigger, nên `seat_id` luôn được điền trước khi FK kiểm. Không có UPDATE `tickets.seat_id`, nên kiểm FK khi update không bao giờ chạy.

### 2. Migration FK (`20261121100100`)
- Precheck vé mồ côi: đếm, rồi RAISE 23503 kèm số dòng; không tự xoá/sửa dữ liệu. Đúng. `seat_id` NOT NULL, nên `not exists` là đủ. Nếu có vé mồ côi chen vào giữa precheck và ADD, VALIDATE vẫn bắt được.
- `ON DELETE RESTRICT` đúng intent. Index `tickets_seat_id_idx` hợp lý (unique `(showtime_id, seat_id)` không dẫn đầu bằng `seat_id`).
- Không destructive. Rollback ghi đủ ở header migration và ERD.

## Findings

| # | Severity | file:line | Mô tả | Đề xuất |
|---|---|---|---|---|
| F1 | MINOR | `supabase/migrations/20261121100100_tickets_seat_fk.sql:12-13, 20, 36-44` | Header ghi "VALIDATE CONSTRAINT quét bảng với SHARE UPDATE EXCLUSIVE (không chặn đọc/ghi)". Điều này sai khi ADD NOT VALID, VALIDATE và CREATE INDEX nằm trong cùng một file. `supabase migration up` chạy mỗi file trong một transaction (điều kiện để `set local lock_timeout` có hiệu lực), nên khoá SHARE ROW EXCLUSIVE trên `tickets` và `seats` từ ADD được giữ đến hết VALIDATE và CREATE INDEX (index không CONCURRENTLY giữ SHARE trên `tickets`). INSERT `tickets` (`confirm_paid`) bị chặn suốt thời gian quét. `NOT VALID` vì thế không giảm khoá. Ngược lại, nếu runner không bọc transaction thì `set local` không có tác dụng (chỉ WARNING). Với bảng cỡ demo, tác động không đáng kể, nên không chặn PASS. Tuy vậy, ghi chú của một HIGH_RISK_MIGRATION không nên mô tả sai mức khoá. | Tách `VALIDATE CONSTRAINT` (và tuỳ chọn index) sang một migration sau, hoặc sửa comment cho đúng mức khoá thực tế. Cần ghi đúng trong báo cáo HIGH_RISK. |
| F2 | MINOR | `supabase/tests/071_tickets_seat_fk_lock_order.test.sql:117-123` | Test chỉ đồng bộ bằng `pg_sleep(0.6)` cố định. Sau fix, test xanh ổn định theo cả hai thứ tự đến (A trước hay C trước đều không tạo chu trình), nên không phải "xanh nhờ may". Tuy nhiên, test yếu ở vai trò chặn hồi quy: nếu sau này ai đó đảo lại thứ tự khoá, test chỉ đỏ một phần số lần (builder báo bản cũ cho 1 xanh, 1 đỏ). Kết quả xanh cũng không phân biệt được "C chờ ở `seats`" (đúng fix) với "C chờ ở `showtime_seat_states`" (thứ tự cũ), vì cả hai đều kết thúc bằng SEAT_TAKEN. Bằng chứng "đỏ trước khi sửa" chỉ là lời builder; reviewer không tự tái hiện được (lệnh chạy riêng từng file bị chặn, fix đã áp lên DB). Chỉ là MINOR vì Acceptance chính thức (task dòng 11-14) chỉ yêu cầu "không 40P01, tối đa 1 vé"; gốc rễ đã được tái hiện ở round 3 (`repro-p2t03-round3-confirm-paid-deadlock.test.sql`); thứ tự khoá kiểm được bằng đọc code. | Thay sleep bằng rào đồng bộ: từ `t71_setup` poll `pg_stat_activity` cho tới khi pid của A có `wait_event_type='Lock'` (đang chờ transactionid của B) rồi mới gửi C; poll tiếp cho tới khi C đang chờ; rồi assert khoá chưa cấp của C thuộc `public.seats` (`pg_locks.relation = 'public.seats'::regclass`, hoặc tuple/transactionid gắn với dòng ghế). Assertion này làm test đỏ chắc chắn nếu thứ tự khoá bị đảo, kể cả khi không xảy ra deadlock. |
| F3 | NIT | `docs/ERD.md` (dòng mới "Thứ tự khoá chuẩn"), `20261121100000:12` | Dòng "showtimes → orders → payments → seats" chưa khớp `hold_seats`: hàm này UPDATE `payments` ở §3.13/§3.14, sau `seats FOR UPDATE` ở §3.9. Trên thực tế vẫn an toàn, vì `hold_seats` chỉ đụng payments của những đơn đã khoá ở §3.8b, nên tranh chấp được tuần tự hoá ở `orders`. Doc lại đang nêu như một luật mà code hiện tại không theo. | Ghi rõ: "payments của đơn đã khoá; hold_seats cập nhật payments sau seats, an toàn nhờ khoá orders trước". |
| F4 | NIT | `20261121100000:7`; `20261121100100:5, 16` | Comment còn nhắc `confirm_pos_sale` (đã DROP ở 20261112130000). Comment cũng trỏ sai tên test `tests/071_tickets_seat_fk.test.sql`; file thật là `071_tickets_seat_fk_lock_order.test.sql`, còn FK được kiểm ở `072_tickets_seat_fk.test.sql`. | Sửa comment khi tiện; không đụng hành vi. |
| F5 | INFO | `20261121100100:36-39` | `add constraint` không chạy lại được (không idempotent). Chấp nhận được với migration versioned; index đã dùng `if not exists`. | — |
| F6 | INFO | `supabase/tests/071_*`, `072_*` | 071: dữ liệu commit thật qua dblink, cleanup chạy trước và sau, kể cả nhánh exception; có assertion "dữ liệu race đã dọn". Chỉ tạo 2 user khách (`...d1`, `...d2`); không đụng Admin/user demo hay guard Admin cuối (CR-004). 072 chạy trong transaction rồi rollback; `drop constraint order_seats_seat_id_fkey` nằm trong transaction đó nên không rò ra ngoài; dùng `matches(... 'tickets_seat_id_fkey')` để chứng minh lỗi đến từ đúng FK mới. Ca vé mồ côi không mô phỏng được bằng test (đã ghi chú); review precheck bằng mắt: đúng. | — |
| F7 | INFO | DB local | 13 file pgTAP đỏ do dữ liệu bẩn có từ trước (`provinces_name_key`, `price_rules_chain_key`). Hệ quả: 040 (hold), 041 (payment rpc), 043 (cancel) không chạy được nên không phủ hồi quy cho đường bán vé. Phần bù: 047/051/052/053/054/056/064/065/071/072 xanh. | Dọn DB local (ngoài phạm vi task) rồi chạy lại 040/041/043 khi có dịp. |

**Nhắc close-out (không tính lỗi round này):** task file chưa có `## Repro Verification`. Dispatcher cần viết phần này ở close-out, dẫn chứng 071 (diag A=ok, C=23514, tickets=1), 072 6/6 và repro round 3.

## Verdict

**STRICT PASS** — kèm 2 MINOR (F1 comment sai mức khoá của NOT VALID+VALIDATE trong cùng transaction; F2 test 071 đồng bộ bằng sleep, chặn hồi quy yếu), 2 NIT, 3 INFO. Không có khoá thiếu đường, migration không phá dữ liệu, không hồi quy trong các test chạy được.
