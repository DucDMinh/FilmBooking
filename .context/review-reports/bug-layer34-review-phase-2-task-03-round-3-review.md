# Review: bug-layer34-review · phase-2-task-03 · round 3

Agent: reviewer

- **Review level:** STRICT
- **Reason:** Round này có migration DB (FK mới trên bảng có dữ liệu) và CREATE OR REPLACE hai hàm bán vé. Thứ tự khoá trên đường bán vé và thanh toán bị đổi, test đa phiên ghi dữ liệu commit thật. Riêng round 3 thêm `seats FOR KEY SHARE`, đụng vào thứ tự khoá toàn cục.
- **Blast radius:** `confirm_zero_amount(uuid)`, `confirm_pos_sale(uuid,text)` và FK `tickets_seat_id_fkey`. FK này tác động lên **mọi** đường INSERT tickets, trong đó có `confirm_paid` (task-02, đã commit ở 327bd2a, là đường tiền của PayOS). Có tương tác với `hold_seats`, `sell_order_seats`, `cancel_showtimes`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (toàn bộ) | PASS: 23 file, 768 test. Diag của 054: `zero: affected=6 cancelled=6; pos: sold=6 seat_taken=6 hold_seats_c_ok=6` |
| `pnpm db:test supabase/tests/054_zero_amount_pos_concurrency.test.sql`, chạy thêm 2 lần | Cả hai lần PASS 8/8, diag giống hệt (6/6/6). Qua 3 lần chạy không gặp 40P01 nào |
| `pnpm db:test .context/review-reports/repro-p2t03-round3-defs.test.sql` (reviewer) | PASS 7/7. Định nghĩa hàm trên DB local có `order by st.id … for key share` (zero + POS) và có precheck F9. SECURITY DEFINER, `search_path=""` và ACL đều đúng (zero cho authenticated, không cho anon; POS chỉ service_role). `confirm_paid` **không có** KEY SHARE trên seats |
| `pnpm db:test .context/review-reports/repro-p2t03-round3-confirm-paid-deadlock.test.sql` (reviewer, chạy 2 lần) | **FAIL như dự đoán, cả 2 lần.** Lỗi 40P01 xảy ra trong `confirm_paid`, chi tiết ở F11 |
| lint / typecheck / aislop / oxlint | skip, diff chỉ có SQL và markdown |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A |

## Status findings round 2

| ID | Round 2 | Round 3 |
|---|---|---|
| F8 MAJOR: 054 phần 2 xanh giả | open | **Đóng.** `054:190` đặt `perform pg_sleep(0.3)` giữa hai `dblink_send_query`, tức là nằm ngoài câu lệnh của C, nên `now()` của C rơi sau mốc +0.25s. A chốt `now()` trước rồi mới ngủ 0.24–0.36s trong câu lệnh, nên A qua được precheck. Race xảy ra thật: `hold_seats_c_ok=6`, `seat_taken=6`. Assert `p_taken >= 1` (`054:248`) chặn việc test xanh giả quay lại. Kết quả tất định qua 3 lần chạy vì mảng delay chia hai nhóm quanh mốc 0.3s, nên test không flaky. Header của 054 và mục Residual trong task file đã ghi đúng nguyên nhân. Lưu ý: chuyện "đỏ trước khi sửa" (40P01 ở vòng 4 và 11) là builder tự báo. Reviewer không kiểm lại được vì không revert fix |
| F9 MINOR: precheck POS chẩn đoán lệch | open | **Đóng.** `migration:332` trả HOLD_EXPIRED khi `sss.id is null or (sss.state='HELD' and sss.expires_at <= now())`. Dòng SOLD, hoặc HELD còn hạn của đơn khác, vẫn trả SEAT_TAKEN. 053 P8 (`053:100-103`, `:191-193`) phủ đúng ca biên này. plan 36 |
| F4, F7, F10 | follow-up | Không đổi. F10 đã được ghi follow-up cho layer-5-task-05 trong task file |

## Đánh giá fix 40P01 (KEY SHARE seats) cho zero/POS

- `hold_seats` khoá ghế bằng **`FOR UPDATE`** (`20261112100000:249-252`), không phải `FOR NO KEY UPDATE`. `FOR KEY SHARE` xung đột với `FOR UPDATE`, nên việc khoá sớm có tác dụng.
  - A lấy KEY SHARE trên seats trước khi chạm vào seat_states. Nếu C đang giữ seats, A chờ ngay ở seats và lúc đó chưa giữ dòng seat_state nào.
  - Ngược lại, nếu A giữ trước, C chờ ở §3.9 và chưa khoá seat_state nào.
  - Hai trường hợp đều không tạo được chu trình.
- Khoá được đặt ở `migration:132-136` và `:346-350`, tức là sau orders/payments/vouchers và trước `sell_order_seats`. Thứ tự này khớp thứ tự toàn cục seats(3) → seat_states(4) ở `20261112100000:12-17`.
  - `hold_seats` khoá orders (§3.8b) trước seats, nên không có chu trình orders↔seats.
  - Khi admin sửa `seat_type`, PG chỉ lấy `FOR NO KEY UPDATE`, không xung đột với KEY SHARE.
  - Xoá ghế thì đã bị chặn bởi RESTRICT.
- Kết luận: fix **đúng và đủ cho hai hàm của task này**. Nó còn đóng luôn residual (b) cho zero/POS, tức ca đơn nhiều ghế khi insert seat_state lấy KEY SHARE muộn. Chỗ chưa ổn là fix chỉ vá ở hai caller, trong khi `sell_order_seats` có 3 caller (xem F11).

## Findings

### F11: MAJOR, chặn commit. Regression do chính task này: FK `tickets.seat_id` gây deadlock 40P01 cho `confirm_paid` (đường tiền PayOS)

- **Vị trí:**
  - FK được thêm ở `20261112120000:56-57`.
  - `confirm_paid` gọi `sell_order_seats` ở `20261112110000:268`, rồi `INSERT tickets` ở `:309-313`. Không có bước khoá KEY SHARE seats nào ở giữa.
  - Builder đã tự ghi nhận vấn đề này nhưng hạ xuống "follow-up ngoài phạm vi" (task file, mục Fix round 3 và Residual risk gạch 2).
- **Cơ chế:**
  - Sau khi có FK, INSERT tickets chạy RI check `SELECT 1 FROM ONLY seats x WHERE id = $1 FOR KEY SHARE OF x`. Lúc đó `sell_order_seats` đã khoá dòng seat_state rồi.
  - `hold_seats` khoá theo thứ tự ngược lại: seats FOR UPDATE trước, sau đó mới tới seat_state.
  - Trước task-03, tickets không có FK tới seats. Nhánh ON CONFLICT DO UPDATE của `sell_order_seats` cũng không đổi cột khoá, nên không chạy RI check. Vì vậy sau `sell_order_seats`, `confirm_paid` không đụng tới seats và không có chu trình.
- **Đã tái hiện và chứng minh trực tiếp.** Kịch bản thực tế như sau. Đơn A (WEB) đã bị job chuyển `expired` và dòng ghế đã bị xoá, rồi tiền về muộn. Ghế S đang có một dòng HELD **đã hết hạn nhưng chưa bị dọn** của đơn D. Cùng lúc, khách C gọi `hold_seats(S)`. Diễn biến:
  1. A chạy `sell_order_seats`, khoá dòng của D và chuyển nó thành SOLD cho A.
  2. C qua §3.8b khoá đơn D (A không giữ đơn D), qua §3.9 khoá seats(S) FOR UPDATE, rồi tới §3.14 DELETE dòng HELD hết hạn của D. C phải chờ A.
  3. A tới INSERT tickets, RI cần KEY SHARE trên seats(S) nên A phải chờ C. Deadlock.

  Kết quả từ repro (lỗi PG trả về cho phiên A):
  ```
  40P01 deadlock detected
  DETAIL: Process 19083 waits for ShareLock on transaction 30408; blocked by process 19086.
          Process 19086 waits for ShareLock on transaction 30406; blocked by process 19083.
  CONTEXT: while locking tuple (0,2) in relation "seats"
           SQL statement "SELECT 1 FROM ONLY "public"."seats" x WHERE "id" OPERATOR(pg_catalog.=) $1 FOR KEY SHARE OF x"
           SQL statement "insert into public.tickets (...)"
           PL/pgSQL function public.confirm_paid(uuid,integer,text,bigint) line 268 at SQL statement
  ```
  Chu trình chỉ gồm hai tiến trình, A (19083) và C (19086). Phiên B là công cụ ép interleaving: B giữ `order_seats(A) FOR UPDATE` trong 1.5s, làm A dừng ở RI `tickets_order_seat_id_fkey` sau khi đã khoá seat_state. **B không nằm trong chu trình.** B đã nhả khoá (`b = ok`) trước khi deadlock xảy ra, nó chỉ nới rộng cửa sổ thời gian vốn có giữa `sell_order_seats` và INSERT tickets. Sau sự cố: A vẫn `expired`, 0 vé, C thắng. Dữ liệu repro đã được dọn sạch (assert 3 PASS).
- **So với trước đây:** residual (b)/F7 (`20261112100000:24-25`) vốn đã là một đường 40P01 của `confirm_paid` từ trước task-03, nhưng chỉ cho đơn **nhiều ghế** có lẫn ghế đã có dòng và ghế chưa có dòng. Task-03 mở rộng lớp deadlock này sang ca **một ghế**, là ca phổ biến. Chỉ cần một dòng HELD của đơn khác đã hết hạn mà chưa bị dọn, cộng với một lần `hold_seats` đồng thời.
- **Hệ quả:** webhook PayOS nhận lỗi 500 thay vì một kết quả xác định. Lần retry thường rơi vào nhánh `SEATS_UNAVAILABLE`/needs_manual_review nên không mất tiền. Tuy vậy, đây là một kiểu lỗi trên đường tiền do task này gây ra. Nếu commit task-03 mà chưa sửa `confirm_paid` thì trạng thái đã commit chứa regression, nên **không an toàn**.
- **Khuyến nghị: sửa trong CÙNG migration 20261112120000, không tách task riêng.**
  - Phương án ưu tiên: `CREATE OR REPLACE public.sell_order_seats`, thêm `perform 1 from public.seats where id in (select seat_id from public.order_seats where order_id = p_order_id) order by id for key share;` ở đầu hàm.
    - Phải đặt **trước** khối `perform … showtime_seat_states … for update` hiện có.
    - Phải đặt **ngoài** subtransaction `begin … exception`. Khối đó bắt lỗi rồi trả false, trong khi khoá cần được giữ ở mức transaction ngoài.
    - Cả 3 caller (`confirm_paid`, `confirm_zero_amount`, `confirm_pos_sale`) chỉ gọi tới `sell_order_seats` sau khi đã khoá orders/payments/vouchers, nên thứ tự toàn cục vẫn là seats → seat_states.
    - Cách này sửa một chỗ mà phủ cả 3 caller, và đóng luôn residual (b) cho `confirm_paid`.
    - Giữ `security definer`, `search_path=''` và ACL (`revoke … from public, anon, authenticated, service_role`, như `20261112060000:134`).
    - Hai khối `perform … for key share` trong zero/POS khi đó sẽ thừa nhưng vô hại. Có thể bỏ để diff gọn.
  - Phương án thay thế là CREATE OR REPLACE `confirm_paid` (khoảng 370 dòng) để chèn khối KEY SHARE trước `:268`. Cách này dễ làm định nghĩa trôi khỏi 20261112110000.
  - Kèm theo test race dblink `confirm_paid` × `hold_seats`, phải đỏ trước khi sửa và xanh sau khi sửa. Có thể dùng repro của reviewer làm khung, đổi assert thành: không 40P01; A ra `paid` hoặc `needs_manual_review`; tối đa 1 vé và 1 dòng ghế.
  - Cập nhật header migration (thứ tự khoá, danh sách caller của `sell_order_seats`) và mục Residual/Evidence của task file.

## Đã kiểm, đạt (round 3)
- 054 không còn xanh giả: assert `p_taken >= 1` và `p_dead = 0` có ý nghĩa thật. Dữ liệu được dọn trước, sau, và cả trong nhánh exception.
- 053 P8 đi đúng nhánh mới. Hai thông điệp SEAT_TAKEN và CINEMA_NOT_OPEN được giữ nguyên.
- Chữ ký, SECURITY DEFINER, `search_path=''` và ACL đã kiểm trực tiếp trên DB (7/7). 048 xanh trong full suite.
- ERD: dòng tickets đúng. API_SPEC không đổi vì chưa có caller TS.

## Doc impact
ERD đã đúng. Sau khi sửa F11, cần cập nhật header migration (thứ tự khoá, caller của `sell_order_seats`) và mục Residual/Evidence của task file, đồng thời bỏ dòng "follow-up ngoài phạm vi confirm_paid".

## Verdict

**FAIL**

- F8 và F9 đã đóng. Fix KEY SHARE cho zero/POS đúng và đủ trong phạm vi hai hàm đó.
- **F11 (MAJOR, chặn commit):** FK `tickets.seat_id` do task này thêm vào gây deadlock 40P01 cho `confirm_paid`. Đã chứng minh bằng repro dblink, với context lỗi chỉ đúng vào RI KEY SHARE seats trong INSERT tickets của `confirm_paid`. Phải sửa trong cùng migration 20261112120000. Khuyến nghị `CREATE OR REPLACE sell_order_seats` với `seats FOR KEY SHARE` ở đầu hàm (ngoài subtransaction), kèm test race `confirm_paid` × `hold_seats` đỏ trước, xanh sau. Phạm vi sửa hẹp: migration task-03, test mới (hoặc mở rộng 054), và task file.
