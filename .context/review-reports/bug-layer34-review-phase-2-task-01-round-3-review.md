Agent: reviewer

# Review — bug-layer34-review · phase-2 · task-01 · round 3 (vòng bổ sung, user duyệt)

- Task: `tasks/bug-layer34-review/phase-2-task-01.md`
- Diff (chưa commit): `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql`, `supabase/tests/050_order_lifecycle.test.sql`, `supabase/tests/051_order_lifecycle_concurrency.test.sql`, task file.
- Review level: **STRICT**
- Reason: migration/schema (unique index, ACCESS EXCLUSIVE), thay 4 RPC dùng chung (`hold_seats`, `expire_overdue_holds` cron, `release_seats`, `cancel_showtimes`), đổi thứ tự khoá toàn cục (concurrency), đổi hợp đồng lỗi của RPC đặt vé chính.
- Blast radius: mọi hold Web/POS, job expire mỗi phút, huỷ suất (Manager/Admin), nhả ghế (khách/nhân viên), gián tiếp confirm_paid/sell_order_seats, payments, voucher_redemptions.

## Verify commands + result

| Command | Result |
|---|---|
| `pnpm db:test` (local stack, không reset/seed) | PASS — Files=20, Tests=692. Log 051: `[1:ok/ok/23505] ... [13:ok/ok/23505] ...` — **hold_seats trả 23505 ở 2/20 vòng**; part 2 `[k1:ok/ok][k2:ok/ok]` |
| `pnpm test` | PASS — shared 14, api 210, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip — diff chỉ SQL, không đụng TS/JS; ocr not installed |

Không chạy được psql để so thân hàm live với file (ngoài allowlist) — giới hạn đã nêu từ round 2, vẫn còn.

## Xác minh theo brief

### 1. R2-F1 — release_seats / cancel_showtimes: CLOSED (code), header chưa đúng hoàn toàn (xem R3-F2)
- `release_seats` (`migration:621-693`) so với `20261111040000_rpc_hold.sql:570-643`: khác duy nhất `for update` ở `:635`. Chữ ký, `SECURITY DEFINER`, `search_path ''`, REVOKE/GRANT giống hệt. Các check quyền chạy sau khi đã khoá: chấp nhận được (người không có quyền chỉ giữ khoá ngắn rồi raise).
- `cancel_showtimes` (`migration:696-884`) so với `20261112080000_function_privileges_hardening.sql:283-458`: chỉ thêm §5.1b `:760-765` (orders holding/pending_payment/paid `order by id for update`) và DELETE §5.2 `:768-773` qua subquery `order by showtime_id, seat_id for update`. Các phần còn lại giống từng dòng. §5.3/§5.4 khoá lại các dòng đã khoá, vô hại.
- ACL: `grant ... to authenticated, service_role` (`:884`). `20261111040300_rpc_cancel.sql:405-409` chỉ grant `authenticated` và chỉ revoke public/anon, nên service_role đã có EXECUTE sẵn theo default Supabase. Thêm service_role ở đây là **no-op**, không mở quyền mới. 048 allowlist xanh.
- Cặp đã sửa trong R2-F1 nay đúng thứ tự orders → seat_states:
  - release_seats vs job
  - release_seats vs hold_seats §3.8b
  - cancel_showtimes vs job
- release_seats không đụng `showtimes`: DELETE con và UPDATE orders không đổi cột FK đều không lấy KEY SHARE. Vì vậy release_seats không xung đột với cancel_showtimes ở tầng showtimes.

### 2. §3.9 `for no key update` (`:243-248`)
- Hai `hold_seats` cùng ghế vẫn tuần tự hoá, vì NO KEY UPDATE xung đột với NO KEY UPDATE. Đúng.
- Residual-1 của round 2 (KEY SHARE từ FK `(seat_id, room_id)` khi sell_order_seats insert) được gỡ.
- **Nhưng đổi hợp đồng lỗi → R3-F1 (MAJOR).**

### 3. lock_timeout (`:30-31`) — OK
- `set_config('lock_timeout','5s', true)` nằm trong DO block, tức cùng transaction của statement. Nó có hiệu lực cho `lock table` ngay sau và tự reset khi transaction kết thúc. Đúng.
- Task file `:27` đã ghi ACCESS EXCLUSIVE (chặn cả đọc lẫn ghi) + lock_timeout. R2-F2 **CLOSED** về nội dung lock (còn chỗ stale khác, xem R3-F3).

### 4. 051 (7 assert) — part 2 hợp lệ, part 1 có lỗ hổng assert
- Part 2 tạo áp lực đồng thời thật:
  - Trigger `BEFORE DELETE ... FOR EACH ROW` (`:87-92`) chạy sau khi tuple đã bị khoá (GetTupleForTrigger), nên phiên A thật sự giữ dòng ghế 0.6s.
  - Job chen vào ở 0.2s.
- Bằng chứng đỏ với release_seats cũ hợp lý về cơ chế. A (không khoá đơn) giữ dòng ghế → job khoá O rồi chờ dòng ghế → A UPDATE O chờ job → 40P01.
- Tự dọn đầy đủ:
  - trigger và function bị drop trong `tap51_cleanup_sql` (`:20-21`), gọi trước, sau và trong handler lỗi;
  - dblink tạo trong begin…rollback nên không để lại extension;
  - assert 7 kiểm fixture đã sạch;
  - đã kiểm, không còn file probe.
- Rủi ro nhỏ: nếu tiến trình test bị kill giữa chừng, trigger còn sót trên bảng thật. Nó chỉ lọc theo seat id fixture và lần chạy sau sẽ dọn, nên rủi ro thấp.
- **Chưa được chứng minh:**
  - cancel_showtimes chỉ có xanh, không có đỏ riêng;
  - cancel_showtimes vs confirm_paid / hold_seats;
  - hold_seats vs release_seats (cùng user);
  - mọi cặp liên quan `showtimes`.
- Part 1 vẫn là smoke (R2-F3 giữ nguyên, MINOR).
- **False-confidence:** part 1 không assert kết quả phiên C (hold_seats), nên 23505 lọt qua xanh (xem R3-F1).

## Findings round 3

### R3-F1 — MAJOR (chặn PASS): hold_seats trả 23505 thô thay vì SEAT_TAKEN 23514 — lệch R-62/AC-06, do vòng này gây ra
- **Nguyên nhân** (`migration:243-248` → `:355-367` → `:530-546`):
  - Khi confirm_paid/sell_order_seats (`20261112060000_prevent_double_sell.sql:106-120`) insert dòng SOLD cho ghế chưa có dòng, insert này lấy KEY SHARE trên `seats`. Ví dụ là nhánh tiền về muộn sau khi job/§3.14 đã xoá ghế.
  - Trước đây `FOR UPDATE` ở §3.9 xung đột với KEY SHARE đó, nên hold_seats chờ confirm_paid commit rồi §3.15 thấy SOLD và raise SEAT_TAKEN.
  - Nay `NO KEY UPDATE` không chờ. §3.15 không thấy dòng chưa commit, §3.22 insert thường chờ unique index, rồi nổ `23505 showtime_seat_states_showtime_seat_key`.
- **Bằng chứng trên đĩa:** `pnpm db:test` vòng này, log 051 `[1:ok/ok/23505]`, `[13:ok/ok/23505]` (2/20 vòng có tranh chấp). Builder tự ghi nhận ở task file `:50` nhưng để "ngoài phạm vi". Thay đổi này do chính vòng này gây ra nên thuộc phạm vi.
- **Lệch hợp đồng:**
  - SPECIFICATIONS R-62 (`SPECIFICATIONS.md:171`) yêu cầu "báo **ghế nào bị trùng**".
  - AC-06 (`:369`) yêu cầu người thua "nhận thông báo E5 vừa có người chọn".
  - Mã lỗi ổn định `SEAT_TAKEN` (`docs/specs/2026-11-10-filmbooking-mvp-design.md:109`).
  - 23505 không có prefix `SEAT_TAKEN`, không có nhãn ghế, và lộ tên constraint + UUID qua PostgREST, vì `hold_seats` GRANT cho `authenticated` (`:568`).
  - Ở tầng PostgREST, 23505 → 409 còn 23514 → 400: mã HTTP cũng khác đường SEAT_TAKEN thường.
  - Chưa có API caller không làm giảm mức: hợp đồng RPC đã mở cho client.
- **Mức:** hiếm trong prod (cần webhook bán lại ghế đúng lúc khách khác giữ ghế đó). Nhưng đây là đường đặt vé chính, lệch AC, và là regression của chính task này → MAJOR.
- **Sửa gọn:** bọc §3.22 (`:530-546`) trong sub-block:
  ```sql
  begin
    insert into public.showtime_seat_states (...) select ...;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'showtime_seat_states_showtime_seat_key' then raise; end if;
    -- requery nhãn ghế đang SOLD/HELD còn hạn (dòng thắng đã commit, READ COMMITTED thấy được)
    raise exception 'SEAT_TAKEN: Ghế % đã có người giữ hoặc mua', <labels> using errcode = '23514';
  end;
  ```
  - **Phải lọc theo constraint name.** hold_seats còn nguồn 23505 thứ hai: `orders_one_active_hold_per_user_key` ở §3.20 (`:487`) khi hai hold cùng user. Nguồn đó không được đổi thành SEAT_TAKEN.
  - Thêm assert trong 051 part 1: kết quả C ∈ {`ok`, `23514`} (đếm số vòng sai = 0).

### R3-F2 — MINOR (sửa comment, không chặn riêng): header thứ tự khoá khẳng định sai về `showtimes`
- Header `:12-21` đặt `showtimes` ở bước 0 và chỉ nêu `confirm_pos_sale` là ngoại lệ. Thực tế còn hai đường lấy **KEY SHARE trên showtimes SAU khi đã khoá orders** (FK `orders.showtime_id` `20261111030100_booking_tables.sql:69`, `showtime_seat_states(showtime_id, room_id)` `:133`):
  - hold_seats: §3.8b khoá đơn (`:235-241`), rồi INSERT orders/seat_states (`:487`, `:530`).
  - confirm_paid → sell_order_seats: insert SOLD (`20261112060000:106`) trong khi đang giữ đơn.
- Cả hai đều xung đột với `cancel_showtimes` `showtimes FOR UPDATE` (`migration:749`) → khoá đơn (`:761-765`).
  - Ví dụ hold_seats khoá đơn quá hạn O của suất S rồi chờ KEY SHARE S, trong khi cancel giữ S và chờ O → 40P01.
  - Đây là lỗi **có từ trước**: code cũ cũng khoá orders ở §3.13/§3.14 trước insert. Vòng này không gây ra, chỉ ghi nhận.
- Round 2 residual #2 đã yêu cầu header nói rõ showtimes *không* được phủ, nhưng header nay lại khẳng định là phủ. Cần bổ sung hai đường trên vào dòng Residual `:21`.
- Ghi nhận thêm (có từ trước): hold_seats đọc `showtimes.status` ở §3.5 (`:139-167`) không khoá. Hold có thể được tạo trên suất vừa bị cancel commit (TOCTOU).
- **Cờ cho task-02:** nếu confirm_paid thêm `showtimes FOR SHARE` theo kế hoạch, phải khoá **trước** orders. Nếu không, nó nới rộng nghịch đảo với cancel_showtimes.

### R3-F3 — MINOR (sửa task file): nội dung stale
- `tasks/bug-layer34-review/phase-2-task-01.md:20` ghi "14 assert". 050 hiện có 17.
- `:29` Rollback ghi "phục hồi 2 hàm từ migration 20261111040000". Nay migration thay **4** hàm:
  - hold_seats và expire_overdue_holds lấy từ `20261111040000`;
  - release_seats lấy từ `20261111040000`;
  - cancel_showtimes lấy từ `20261112080000_function_privileges_hardening.sql`.
- Rollback thiếu 2 hàm sẽ để lại thân mới, hoặc tệ hơn là khôi phục cancel_showtimes bản cũ thiếu P0-08 (anti-spoofing) nếu lấy nhầm `20261111040300`.

### R2-F3 (round 2) — vẫn mở, MINOR
051 part 1 vẫn dùng sleep trước RPC (smoke), và nay có thêm lỗ hổng không assert C (đã gộp vào R3-F1).

## Residual (ghi nhận, không FAIL)
1. confirm_pos_sale khoá orders → showtimes FOR SHARE, ngược với cancel_showtimes (có từ trước, header đã nêu).
2. Hai hold_seats cùng user: đơn tạo bởi phiên 1 không nằm trong snapshot §3.8b của phiên 2 (round 2).
3. M1c/M3 (confirm_paid case A/B), huỷ link PayOS phía provider → task-02 / API.
4. Đường showtimes KEY SHARE sau orders (R3-F2) là lỗi có từ trước, cần task riêng nếu muốn khử triệt để.

## Kết luận
- R2-F1 đã đóng về code: release_seats và cancel_showtimes khoá đơn trước seat_states, phần còn lại giữ nguyên, ACL/048 xanh.
- R2-F2 đóng về lock: lock_timeout đúng.
- Part 2 của 051 là bằng chứng đồng thời thật, có đỏ hợp lý cho release_seats.
- Tuy nhiên, thay đổi §3.9 sang `NO KEY UPDATE` ở vòng này làm `hold_seats` trả **23505 thô** thay vì `SEAT_TAKEN 23514`, tái hiện ngay trong `pnpm db:test` (2/20 vòng). Điều này lệch R-62/AC-06 trên RPC đặt vé chính đã GRANT cho client, và 051 không assert nên lọt xanh (false-confidence).
- Cách sửa nhỏ: sub-block bắt `unique_violation` theo constraint `showtime_seat_states_showtime_seat_key` → `SEAT_TAKEN` kèm nhãn ghế, cộng 1 assert trong 051. Kèm theo đó sửa comment header (R3-F2) và task file (R3-F3).

## Verdict: **FAIL**
