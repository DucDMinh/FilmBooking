Agent: reviewer

# Review — bug-layer34-review · phase-2 · task-01 · round 4 (vòng bổ sung, user duyệt)

- **Task:** `tasks/bug-layer34-review/phase-2-task-01.md`
- **Diff (chưa commit):**
  - `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql`
  - `supabase/tests/050_order_lifecycle.test.sql`
  - `supabase/tests/051_order_lifecycle_concurrency.test.sql`
  - task file
- **Review level:** STRICT
- **Reason:**
  - Đụng migration/schema: unique index, ACCESS EXCLUSIVE.
  - Thay 4 RPC dùng chung: `hold_seats`, cron `expire_overdue_holds`, `release_seats`, `cancel_showtimes`.
  - Đổi thứ tự khoá toàn cục và hợp đồng lỗi của RPC đặt vé chính.
- **Blast radius:**
  - Trực tiếp: mọi hold Web/POS, job expire mỗi phút, huỷ suất, nhả ghế.
  - Gián tiếp: confirm_paid/sell_order_seats, payments, voucher_redemptions.

## Verify commands + result

| Command | Result |
|---|---|
| `pnpm db:test` (local stack, không reset/seed) | PASS — Files=20, Tests=693. Log 051: phiên C 20 vòng chỉ ra `ok`/`23514` (10 ok, 10 23514), **không còn 23505**. Phần 2 `[k1:ok/ok][k2:ok/ok]` |
| `pnpm test` | PASS — shared 14, api 210, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip — diff chỉ có SQL, không đụng TS/JS; ocr chưa cài |
| `git status --short` | không có file probe lạ, chỉ có file của task và report/journal |

**Giới hạn còn lại:** không chạy được psql để so thân hàm đang chạy trên DB với file, vì psql nằm ngoài allowlist. Có hai bằng chứng gián tiếp cho thấy DB local đang chạy bản `for update` + sub-block:
- 23505 đã biến mất khỏi log 051 so với round 3.
- Assert `c_bad` mới đã chạy (Tests 692 → 693).

## Xác minh theo brief

### 1. R3-F1 — CLOSED

**§3.9** (`migration:248-252`)
- Giống từng ký tự với `20261111040000_rpc_hold.sql:265-269`: comment, `perform 1 from public.seats s`, `where s.id = any(p_seat_ids)`, `order by s.id`, `for update;`.
- Trong file không còn `no key update`.
- `for update` ở `:246` thuộc §3.8b (khoá orders), có từ round 1.

**§3.22** (`migration:533-569`)
- Cấu trúc: nested `declare v_violated_constraint text; begin … exception when unique_violation then … end;`. Câu `insert` (`:539-555`) giống bản gốc `20261111040000:527-543`.
- Lọc constraint: `get stacked diagnostics … = constraint_name` (`:557`). Tên khác `'showtime_seat_states_showtime_seat_key'` thì `raise;` nguyên trạng (`:558-560`). Vì dùng `is distinct from` nên tên NULL cũng được re-raise, đúng ý.
- Tên constraint khớp schema thật: `20261111030100_booking_tables.sql:131` khai báo `constraint showtime_seat_states_showtime_seat_key unique (showtime_id, seat_id)`.
  - Đã grep mọi `create unique index` và mọi dòng có "unique" kèm `showtime_seat_states` trong migrations.
  - Bảng này không có unique constraint/index nào khác ngoài PK `id` (default gen_random_uuid).
- Khi đúng constraint đó: query lại nhãn ghế (`:561-566`), rồi `raise exception 'SEAT_TAKEN: Ghế % …' using errcode = '23514'` (`:567-568`). Định dạng giống §3.15 (`:369-370`).
- Không nuốt lỗi khác: handler chỉ bắt `unique_violation`; FK 23503, check… vẫn lan ra. Ràng buộc `orders_one_active_hold_per_user_key` phát sinh ở §3.20 (`:491`), nằm ngoài sub-block, nên không bị map nhầm.
- Không rollback sai phần trước đó:
  - Savepoint ngầm của BEGIN..EXCEPTION chỉ bao câu insert seat_states.
  - Handler luôn raise, nên lỗi lan ra và toàn bộ RPC rollback, đúng ngữ nghĩa cũ.
  - Không có nhánh nuốt lỗi rồi chạy tiếp, nên các bước trước (orders/order_seats, huỷ §3.13, expire §3.14) không bị bỏ dở.

**Phần còn lại của hold_seats** — đã đối chiếu từng đoạn với `20261111040000:69-562`:
- §3.1–§3.8 (`migration:85-236` ↔ gốc `:112-263`) giống hệt.
- §3.9–§3.12 (`:248-296` ↔ `:265-313`) giống hệt.
- §3.15–§3.19 (`:359-487` ↔ `:352-480`) giống hệt.
- §3.21, §3.23, §3.24 (`:515-531`, `:571-587` ↔ `:508-524`, `:545-561`) giống hệt.
- Chỉ khác ở các chỗ chủ ý:
  - §3.8b (`:238-246`)
  - §3.13 (`:298-328`)
  - §3.14 (`:330-357`)
  - comment §3.20 đổi tên index (`:490`)
  - sub-block §3.22
- Giữ nguyên: chữ ký, `SECURITY DEFINER`, `search_path ''`, REVOKE/GRANT (`:590-591`).
- Độ lệch dòng so với round 3 khớp đúng phần thêm (header +5, sub-block +18): `release_seats` dời từ `:621` sang `:644`, `cancel_showtimes` từ `:696` sang `:719`.

### 2. Test 051 — OK
- `plan(8)` (`051:14`).
- Assert mới `c_bad = 0` (`:175`, `:248-249`): kết quả phiên C phải thuộc {`ok`, `23514`}.
- Log `pnpm db:test` vòng này không còn 23505. Lỗ hổng false-confidence của round 3 đã được bịt.

### 3. R3-F2 — CLOSED
Header `migration:12-26`:
- Bước 3 ghi seats FOR UPDATE "giữ nguyên như trước migration này".
- Residual (a): hold_seats / sell_order_seats / confirm_pos_sale lấy showtimes KEY SHARE (FK/đọc suất) **sau** khi đã khoá orders, ngược thứ tự với cancel_showtimes. Có kèm ghi chú cho task-02: `showtimes … FOR SHARE` phải đặt trước khoá orders.
- Residual (b): hold_seats nhiều ghế ↔ confirm_paid (FK KEY SHARE trên seats).
- Residual (c): hai hold_seats của cùng một khách.

Cả ba đều được ghi trung thực là "CÓ TỪ TRƯỚC".

### 4. R3-F3 — CLOSED
- Task file `:20` ghi 17 assert, khớp `050:10` `plan(17)`.
- Rollback (`:29`) phục hồi đủ 4 hàm từ đúng nguồn:
  - `hold_seats`, `expire_overdue_holds`, `release_seats` lấy từ `20261111040000`. Đã grep: không migration nào khác định nghĩa lại ba hàm này.
  - `cancel_showtimes` lấy từ `20261112080000_function_privileges_hardening.sql:283`, có ghi rõ KHÔNG lấy 20261111040300.

### 5. Tổng thể task
- **M1a/b đạt:**
  - expire_overdue_holds và §3.14 chuyển cả holding lẫn pending_payment quá hạn sang expired.
  - payment PENDING → EXPIRED; voucher được nhả qua trigger.
  - 050 phủ lazy expire, job, và ca âm (đơn paid, đơn chưa hết hạn).
- **M2 đạt:**
  - §3.13 huỷ cả holding lẫn pending_payment cũ; payment → CANCELLED.
  - Index `orders_one_active_hold_per_user_key` phủ cả hai trạng thái.
- **HIGH_RISK_MIGRATION đầy đủ:**
  - ACCESS EXCLUSIVE trong khối DO (`migration:30-53`).
  - `lock_timeout` 5s, đặt local.
  - Precheck trùng raise `MIGRATION_PRECHECK_FAILED`, không tự sửa data.
  - Task file `:25-30` ghi op, lock, precheck SQL cho staging, rollback, và "không promote prod trước khi verify staging".

## Findings round 4

Không có finding CRITICAL/MAJOR. Không có MINOR nào chặn PASS.

Ghi chú INFO (không chặn):
- **I1** — `migration:556-568`: nhánh map 23505 → SEAT_TAKEN nay là defense-in-depth. Sau khi quay lại `for update`, race đó đã được tuần tự hoá, nên 051 không còn đi vào handler và chưa có test tất định nào kích hoạt nhánh này. Logic ngắn và đã đọc kỹ, chấp nhận được.
- **I2** — `migration:561-566`: query nhãn ghế trong handler không lọc theo state. Nếu dòng thắng bị xoá ngay sau đó, `v_taken_labels` có thể NULL và message in ra `<NULL>`. Cực hiếm; chỉ ảnh hưởng chữ hiển thị, errcode/prefix vẫn đúng.
- **I3** — Task file `:41` và `:50` (mục round 1/2) vẫn nhắc `for no key update` và "chưa map 23505". Đây là lịch sử theo từng vòng; mục round 3 (`:55-59`) đã ghi trạng thái hiện tại. Không gây hiểu sai nguy hiểm.
- **R2-F3** (round 2): phần 1 của 051 vẫn là smoke dựa trên sleep. Mức MINOR, đã chấp nhận từ trước.

## Residual (có từ trước, chỉ ghi nhận)
1. hold_seats, sell_order_seats, confirm_pos_sale lấy showtimes KEY SHARE/FOR SHARE sau khi khoá orders, ngược thứ tự với cancel_showtimes. Đã nêu ở header (a), kèm ghi chú cho task-02.
2. hold_seats nhiều ghế (seats FOR UPDATE) ↔ confirm_paid (FK KEY SHARE) có thể deadlock. Header (b), task K4.
3. Hai hold_seats đồng thời của cùng khách (snapshot §3.8b). Header (c). Index unique chặn trùng bằng 23505 trên orders, và lỗi này được re-raise nguyên.
4. hold_seats §3.5 đọc `showtimes.status` không khoá, nên có TOCTOU với cancel_showtimes.
5. M1c/M3 (confirm_paid case A/B) và huỷ link PayOS phía provider: thuộc task-02 / API.

## Kết luận
- **R3-F1 đóng:**
  - §3.9 đã về đúng `for update` như bản gốc.
  - §3.22 map đúng constraint seat_states → SEAT_TAKEN 23514 kèm nhãn ghế; constraint khác re-raise nguyên; không nuốt lỗi khác.
  - 051 có assert chặn 23505, và log thực tế sạch.
- **R3-F2, R3-F3 đóng.**
- Phần còn lại của hold_seats giống bản gốc, ngoài các điểm sửa chủ ý.
- Verify commands đều xanh.

## Verdict: **STRICT PASS**
