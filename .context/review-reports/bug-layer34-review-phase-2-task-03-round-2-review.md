# Review — bug-layer34-review · phase-2-task-03 · round 2

Agent: reviewer

- **Review level:** STRICT
- **Reason:** migration DB (FK mới trên bảng có dữ liệu, CREATE OR REPLACE hai hàm bán vé), thứ tự khoá đường payment/POS, máy trạng thái đơn/ghế, test đa phiên ghi dữ liệu commit thật lên DB local.
- **Blast radius:** `public.confirm_zero_amount(uuid)` (authenticated + service_role), `public.confirm_pos_sale(uuid,text)` (service_role), FK `tickets.seat_id`, tương tác `cancel_showtimes`, `set_cinema_status`, `hold_seats`, `sell_order_seats`, `expire_overdue_holds`. Chưa có caller TS trong `apps/`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (toàn bộ) | PASS — 23 file, 765 test. 054 diag: `zero: affected=6 cancelled=6; pos: sold=12 seat_taken=0` |
| `pnpm db:test .context/review-reports/repro-p2t03-pos-closed-cinema.test.sql` (repro F1 round 1) | FAIL như kỳ vọng — `CINEMA_NOT_OPEN` raise tại bước `confirm_pos_sale` (dòng 31 của repro). Defect F1 không còn tái hiện |
| `pnpm db:test .context/review-reports/repro-p2t03-round2-checks.test.sql` (reviewer round 2) | PASS 9/9 — định nghĩa hàm trên DB local khớp migration (CINEMA_NOT_OPEN, precheck `v_has_expired`, thông điệp F6), SECURITY DEFINER, `search_path=""`, ACL (POS chỉ service_role; zero authenticated, không anon); chứng minh `now()` đứng yên sau `pg_sleep` (xem F8) |
| lint / typecheck / aislop / oxlint | skip — diff chỉ SQL + markdown |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A |

## Đã kiểm, đạt

- **Thứ tự khoá:** cả hai hàm đọc `orders.showtime_id` không khoá → `showtimes FOR SHARE` (join cinemas, `for share of s`) → `orders FOR UPDATE` → `sell_order_seats` (seat_states) → payments / voucher_redemptions / tickets. Khớp `confirm_paid`, `cancel_showtimes`. 054 phần 1 (race thật, 6/6 mỗi bên thắng) không có 40P01.
- **Chữ ký / SECURITY DEFINER / search_path='' / ACL:** giữ nguyên, kiểm trên DB (9/9). 048 allowlist xanh.
- **F1:** `confirm_pos_sale` raise `CINEMA_NOT_OPEN` (23514) sau CANCELLED / ON_SALE (`migration:291-294`). 053 P2 dùng `throws_ok` + assert `holding/0/HELD:POS`. Repro round 1 giờ dừng ở CINEMA_NOT_OPEN.
- **Precheck POS mới (`migration:302-330`):** schema `showtime_seat_states.order_id NOT NULL`, `CHECK ((state='HELD') = (expires_at is not null))`, UNIQUE(showtime_id, seat_id) (`20261111030100_booking_tables.sql:119-135`). Các nhánh: không có dòng → HOLD_EXPIRED; dòng của chính đơn hết hạn → HOLD_EXPIRED; dòng SOLD / HELD còn hạn của đơn khác → SEAT_TAKEN. Đúng. Một ca biên chẩn đoán lệch, xem F9 (MINOR).
- **F6:** hai thông điệp SEAT_TAKEN, cùng 23514; Z6 / P7 khẳng định thông điệp khoá; Z2 / Z7 khẳng định "đơn khác chiếm" (zero).
- **053:** không dính snapshot (`t53_call` tách câu, `t53_state` STABLE gọi câu sau). P4/P5 assert ghế đơn khác không bị ghi đè và đơn POS giữ holding/0 vé. P6 HOLD_EXPIRED, P7 đi qua `sell_order_seats=false`. Z4 có assert trạng thái, Z5–Z8 bổ sung đúng hướng.
- **054 phần 1 (M4):** race thật — `now()` của A không ảnh hưởng (hold 10 phút), hai thứ tự thắng đều xảy ra (affected=6, cancelled=6), assert không còn đơn paid trên suất CANCELLED. Dọn dữ liệu trước/sau + nhánh exception; assert orders=0 sau dọn.
- **Doc:** ERD dòng tickets đúng. API_SPEC không đổi (chưa có endpoint).

## Findings

### F8 — MAJOR (blocking, false-confidence test): 054 phần 2 không bao giờ tạo được race; Residual risk của task ghi sai nguyên nhân
- **Vị trí:** `supabase/tests/054_zero_amount_pos_concurrency.test.sql:7-11` (header khẳng định race), `:89-90` + `:100` (hold hết hạn `clock_timestamp() + 0.25s`), `:128-129` + `:181-185` (`pg_sleep` nằm CÙNG câu lệnh với `confirm_pos_sale` / `hold_seats`). `tasks/bug-layer34-review/phase-2-task-03.md` mục Residual risk gạch đầu dòng 1 và mục Fix round 2 / F2 ("…nhất quán đơn/vé/ghế").
- **Nguyên nhân thật:** mỗi phiên dblink chạy một câu lệnh autocommit, `now()` cố định ở đầu transaction, TRƯỚC `pg_sleep`. `hold_seats` chỉ dùng `now()` (`20261112100000_order_lifecycle_pending_payment.sql:351-366`): xoá HELD khi `expires_at <= now()`, báo SEAT_TAKEN khi `expires_at > now()`. Vì `now()` của C luôn sớm hơn mốc hết hạn (setup + 0.25s), C luôn thấy hold POS còn hạn → SEAT_TAKEN và không bao giờ chiếm ghế. Kết quả `sold=12 seat_taken=0` là tất yếu do cách dựng test, không phải do "A giữ khoá showtimes/orders từ đầu nên hold_seats của C chờ phía sau" như task file ghi. Đã chứng minh bằng `repro-p2t03-round2-checks.test.sql` (2 assert cuối: sau `pg_sleep(0.3)` hold +0.25s vẫn `> now()` nhưng `< clock_timestamp()`).
- **Hệ quả:**
  1. 12 vòng phần 2 xanh mà không kiểm gì về tranh chấp. Nhánh `sell_order_seats = false` + thông điệp "Ghế đã bị đơn khác chiếm" của POS (`migration:345`) không có test nào chạm tới. P7 chỉ phủ thông điệp khoá; P4/P5 dừng ở precheck.
  2. Task file (source of truth cho residual risk) kết luận "không tái hiện được bằng race thật" dựa trên giải thích sai. Race này có thể xảy ra ở production: A bắt đầu khi hold còn hạn, C bắt đầu sau mốc hết hạn và chiếm dòng seat_state trước khi `sell_order_seats` của A khoá dòng.
- **Fix đề xuất:** đưa độ trễ của C ra khỏi câu lệnh của C: trong `tap54_run`, `perform pg_sleep(...)` giữa hai `dblink_send_query` (hoặc gửi C sau khi qua mốc hết hạn) để `now()` của C nằm sau mốc. Có thể cần A ngủ trong cùng câu (now() sớm, qua precheck) còn C bắt đầu muộn. Giữ các assert hiện có (đã cho phép cả hai kết quả), ghi diag. Nếu không đạt được nhánh false thì phải sửa header 054 và Residual risk cho đúng nguyên nhân, không ghi "nhất quán" như evidence của race. Không cần ép tỉ lệ.

### F9 — MINOR (không chặn): precheck POS báo SEAT_TAKEN thay vì HOLD_EXPIRED trong một ca biên
- **Vị trí:** `migration:315-323`.
- **Scenario:** hold POS hết hạn → khách khác `hold_seats` xoá dòng hết hạn và giữ ghế → hold của khách đó cũng hết hạn nhưng chưa được dọn → quầy gọi `confirm_pos_sale`. Dòng ghế thuộc đơn khác (đã hết hạn), nên `v_has_expired = false` → SEAT_TAKEN (409) thay vì HOLD_EXPIRED (410). Từ chối là đúng, chỉ chẩn đoán lệch. P6 không phủ. Có thể gộp vào điều kiện: `sss.id is null or sss.expires_at <= now()` (dòng HELD hết hạn của bất kỳ đơn nào).

### F10 — INFO (follow-up task POS/API): `packages/shared/src/errors.ts` chưa có `CINEMA_NOT_OPEN` / `SHOWTIME_NOT_OPEN`
`confirm_paid` đã raise CINEMA_NOT_OPEN từ trước task này (`20261111040100_rpc_payment.sql`, `20261112110000`). Chưa có caller TS. Không phải defect của task này. Ghi follow-up: khi build POS/API thêm mã + HTTP status (đề xuất 409, nhất quán SALES_CLOSED / SHOWTIME_CANCELLED).

## Trạng thái findings round 1

| ID | Round 1 | Round 2 |
|---|---|---|
| F1 | MAJOR — POS bán vé khi rạp không OPEN | **Đóng.** CINEMA_NOT_OPEN, 053 P2, repro round 1 không còn tái hiện |
| F2 | MAJOR — thiếu test tranh chấp ghế POS | **Đóng phần tối thiểu** (053 P4–P7, 054 phần 1 race thật). Phần 2 của 054 là test giả → F8 mới |
| F3 | INFO — SEAT_TAKEN thay needs_manual_review | **Đóng** theo quyết định user; ghi trong migration + task file |
| F4 | MINOR — TOCTOU cinemas vs `set_cinema_status` | Residual, không đổi (nay áp cả POS) |
| F5 | MINOR — lỗ hổng phủ 053 | **Đóng** (Z4 assert, Z5–Z8) |
| F6 | MINOR — thông điệp SEAT_TAKEN sai nguyên nhân | **Đóng** (Z6, P7) |
| F7 | INFO — residual (b) hold_seats vs sell_order_seats | Residual, không đổi |

## Doc impact
ERD đúng. Task file cần sửa Residual risk / evidence 054 theo F8.

## Verdict

**FAIL**

- **F8 (MAJOR):** 054 phần 2 là false-green (`now()` đứng yên trước `pg_sleep`, C không bao giờ thấy hold hết hạn), và task file ghi sai nguyên nhân vào Residual risk. Sửa harness để race có thật, hoặc sửa header 054 + Residual risk cho đúng sự thật. Phạm vi sửa chỉ gồm 054 phần 2 + task file. Migration và 053 không cần đổi để PASS.
- F9 (MINOR) nên sửa cùng lúc nếu tiện. F10, F4, F7 ghi follow-up.
