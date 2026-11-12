# Review — bug/layer34-review · phase-2-task-02 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đổi hành vi và khoá của đường tiền (`confirm_paid`, service_role, webhook PayOS); voucher limit (R-93); concurrency với `cancel_showtimes`/`hold_seats`/job expire; DB migration (CREATE OR REPLACE).
- **Blast radius:** mọi webhook PayOS + job reconcile (`confirm_paid`); `voucher_redemptions`/`vouchers` (đếm lượt R-93); `showtime_seat_states`, `tickets`, `payments`, `email_outbox`, `audit_logs`; lock interplay với `cancel_showtimes`, `hold_seats`, `expire_overdue_holds`, `release_seats`, `apply_voucher_core`, `confirm_pos_sale`.
- **Scope đã review:** `supabase/migrations/20261112110000_confirm_paid_hardening.sql` (mới), `supabase/tests/052_confirm_paid_hardening.test.sql` (mới), `tasks/bug-layer34-review/phase-2-task-02.md`. Đối chiếu: `20261112060000_prevent_double_sell.sql` (confirm_paid + sell_order_seats trước đó), `20261112100000_order_lifecycle_pending_payment.sql` (thứ tự khoá, hold_seats/expire/release/cancel), `20261111040200_rpc_voucher.sql` (remove_voucher, trigger orders_voucher_status_sync), `20261112070000_voucher_rate_limit_fix.sql` (apply_voucher_core), `20261111030100_booking_tables.sql` (schema, orders_guard_transition, showtime_seat_states_fill), `SPECIFICATIONS.md` R-67/R-78/#9-10-17, review gốc M1c/M3/M4/M5/M9/M10a.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — 21 file, 718 assert (gồm 048 allowlist, 050, 051, 052) |
| `pnpm db:test .context/review-reports/bug-layer34-review-phase-2-task-02-round-1-repro.test.sql` (repro của reviewer) | **FAIL 3/4** — xem F1 |
| `aislop scan --changes --json` | skip, aislop not installed (command not found) |
| `npx oxlint` | skip, diff chỉ có SQL (không TS/JS) |
| `ocr` | skip, ocr not installed |
| Kịch bản đồng thời bằng psql/docker exec | skip, `docker exec` không nằm trong allowlist của reviewer; lock order kiểm bằng phân tích mã nguồn (F4) |

Ghi chú: `.context/review-reports/bug-layer34-review-phase-2-task-02-round-1-repro.test.sql` là artifact repro của reviewer (BEGIN … ROLLBACK, không đổi dữ liệu). File nằm ngoài `supabase/tests/` nên `pnpm db:test` không chạy nó. Builder nên chép các ca trong file vào 052 làm ca đỏ.

## Findings

### F1 — BLOCKER — Hồi sinh lượt voucher khách đã GỠ, vượt `total_uses_limit` (regression ở case A đúng hạn) và chặn oan đơn tiền về muộn
- **Vị trí:** `supabase/migrations/20261112110000_confirm_paid_hardening.sql:295-297`. Lệnh `update voucher_redemptions set status='CONSUMED' where order_id = … and status in ('HELD','RELEASED')` chạy ở **mọi** nhánh chốt bán, kể cả khi đơn đúng hạn. Cùng lỗi ở `:236-238`: nhánh muộn lấy bất kỳ redemption RELEASED nào để kiểm trần, không phân biệt lượt hết hạn với lượt đã gỡ.
- **Bằng chứng regression:** bản trước, case A ở `20261112060000_prevent_double_sell.sql:418-420`, chỉ chuyển `status = 'HELD'`.
- **Vì sao sai:**
  - `remove_voucher` (`20261111040200_rpc_voucher.sql:252-264`) đặt redemption = RELEASED, `orders.voucher_id = null`, `total_amount = subtotal_amount`.
  - Trigger `orders_voucher_status_sync` (`:292-297`) chỉ nhả lượt (RELEASED) khi đơn `expired`/`cancelled`, và **giữ** `orders.voucher_id`.
  - Mỗi đơn chỉ có 1 redemption (`voucher_redemptions.order_id unique`, `booking_tables.sql:210`).
  - Hệ quả: ở đơn đúng hạn (holding/pending_payment), dòng RELEASED **chỉ có thể** là voucher khách đã gỡ. Hồi sinh nó luôn sai.
- **Failure scenario (đã chạy, repro FAIL 3/4):**
  1. Voucher V có `total_uses_limit = 1`. Đơn khác đã dùng 1 lượt (CONSUMED). Khách B áp V rồi gỡ: RELEASED, B trả đủ giá. Webhook đúng hạn → `confirm_paid` → SUCCESS, nhưng lượt của B thành CONSUMED. V có 2 lượt CONSUMED, vượt trần 1 (repro assert 2, 3: `have CONSUMED/2`). Vi phạm R-93, đúng loại lỗi M3 định sửa.
  2. Đơn expired của khách đã gỡ voucher, trả đủ giá, ghế trống. Bước 4b kiểm trần của voucher không còn áp dụng → `VOUCHER_EXHAUSTED` → needs_manual_review + hoàn tiền thủ công oan (repro assert 4: `have NEEDS_MANUAL_REVIEW`). Trái R-78 (ghế trống thì tự chốt).
- **Hướng sửa:**
  - Nhánh đúng hạn: chỉ chuyển `HELD → CONSUMED` (để trigger làm).
  - Nhánh muộn: chỉ kiểm trần và hồi sinh khi `v_order.voucher_id is not null and v_order.voucher_id = v_redemption.voucher_id`. Ngược lại bỏ qua dòng RELEASED (giữ nguyên).

### F2 — MAJOR — Test 052 ca (f) dùng fixture sai hình dạng dữ liệu thật → xanh giả, khẳng định đúng hành vi lỗi F1
- **Vị trí:**
  - `supabase/tests/052_confirm_paid_hardening.test.sql:21-34`: `t52_order` tạo đơn với `voucher_id` null, `discount_amount` 0, `total = subtotal = 100000`.
  - `:106-111`: chèn redemption `discount_amount 10000`, gắn vào các đơn đó.
  - `:147-149`: gọi `confirm_paid` với 100000.
- **Vấn đề:** dạng dữ liệu này chính là "voucher đã gỡ". Đơn expired có voucher thật (do `apply_voucher_core` + trigger expire tạo ra) phải có `orders.voucher_id = V`, `discount_amount = 10000`, `total_amount = 90000`, webhook trả 90000. Vì vậy:
  - ca dương O13 (`:196-199`, "SUCCESS/CONSUMED") đang khẳng định đúng hành vi lỗi của F1, và sẽ đổi kết quả khi F1 được sửa;
  - O11/O14 không chứng minh logic trần chạy với đơn có voucher thật.
- **Yêu cầu:**
  - dựng fixture ca (f) đúng như `apply_voucher` + expire tạo ra (voucher_id, discount, total khớp, số tiền webhook khớp);
  - thêm các ca đỏ từ repro: gỡ voucher + đúng hạn → lượt vẫn RELEASED, không vượt trần; gỡ voucher + muộn → SUCCESS.

### F3 — MAJOR (cần user/orchestrator quyết định) — Áp mốc đóng bán online cho đơn còn hold hợp lệ: mở rộng luật khi chưa có spec delta
- **Vị trí:** `20261112110000_confirm_paid_hardening.sql:226-232`. Cutoff được kiểm cho mọi nhánh, kể cả `v_is_late = false`. Test khẳng định hành vi này ở `052:85-86, 177-178` (O7: hold còn hạn, suất bắt đầu sau 10 phút → NMR).
- **Spec:**
  - Quyết định #9/#10/#17 (`SPECIFICATIONS.md:554`) giới hạn điều kiện "chưa qua mốc đóng bán online" cho tiền về của đơn `expired` hoặc `cancelled`.
  - R-67 (`:176`) là luật ở **thời điểm giữ ghế** ("không giữ ghế được trên web").
  - M1c (review gốc, dòng 85-89) yêu cầu case A kiểm hết hạn và trạng thái suất. Hướng sửa ghi "hold_expires_at <= now() thì đi case B", không yêu cầu áp cutoff cho hold còn hạn.
  - Task file dòng 4 viết mơ hồ.
- **Failure scenario (xảy ra thường xuyên sát giờ chiếu):** cutoff 15 phút, hold web 10 phút (`hold_seats` §3.7/§3.18 ở `20261112100000:198-206, 473-481`). Khách giữ ghế lúc T-20 (hợp lệ), link PayOS hết hạn lúc T-10, khách trả lúc T-14 (vẫn trong hold). Kết quả: không được vé, đơn needs_manual_review, rạp phải hoàn tiền thủ công. Trước đây khách nhận vé.
- **Yêu cầu:** orchestrator hỏi user. Hoặc (a) giữ luật mới và ghi spec delta (R-67/#17) qua Change Request, hoặc (b) chỉ áp cutoff khi `v_is_late` (vẫn kiểm ON_SALE và rạp OPEN cho mọi nhánh). Round 2 phải chốt một trong hai. Không tự hạ cấp intent cho khớp code.

### F4 — đã kiểm, ĐÚNG (không phải defect) — Thứ tự khoá showtimes FOR SHARE → orders → payments → vouchers → seat_states
- `showtime_id` đọc không khoá ở `:61` là an toàn: `orders_guard_transition` raise nếu `showtime_id` bị đổi (`booking_tables.sql:359-362`).
- Với `cancel_showtimes` (`20261112100000:772-788`: showtimes FOR UPDATE → orders FOR UPDATE): cùng chiều, không có chu trình. Trong READ COMMITTED, `FOR SHARE` chờ cancel commit rồi đọc lại bản mới (EPQ) → thấy CANCELLED → `SHOWTIME_NOT_ON_SALE` → NMR. Đúng mục tiêu M4.
- `hold_seats`, `sell_order_seats` và INSERT `tickets` chỉ lấy KEY SHARE trên showtimes qua FK, không xung đột với FOR SHARE. Không ai khoá orders rồi UPDATE showtimes: các chỗ UPDATE showtimes là cancel_showtimes và `catalog_fixes.sql:45`, cả hai không khoá orders trước. `confirm_pos_sale` (orders → showtimes FOR SHARE) và confirm_paid đều chỉ lấy share lock trên showtimes, tương thích nhau.
- Vouchers: `apply_voucher_core` khoá orders → vouchers, cùng chiều với confirm_paid.
- Residual có từ trước (seats KEY SHARE vs hold_seats §3.9, residual b của task-01) không đổi.

### F5 — MINOR — Không có test đồng thời thật confirm_paid ↔ cancel_showtimes
Builder đã tự ghi ở residual (c). Lập luận khoá ở F4 đứng vững, nhưng M4 là race condition. Nên có ca dblink như 051. Không chặn PASS nếu F1–F3 được xử lý.

### F6 — MINOR — Trạng thái rạp không được khoá
`for share of s` (`:68`) chỉ khoá `showtimes`, không khoá `cinemas`. `set_cinema_status` chạy đồng thời có thể đổi `cinemas.status` sau khi confirm_paid đã đọc OPEN. Cửa sổ rất hẹp. Ghi residual.

### F7 — MINOR — Retry ở needs_manual_review bỏ qua khoản tiền thứ hai
Khi đơn đã NMR mà nhận một khoản đúng số tiền với `transaction_ref` mới (khách trả lần 2), hàm trả NEEDS_MANUAL_REVIEW, không cập nhật `payments`. Đã có `payment_events` ghi ở tầng webhook (design doc dòng 88) giảm nhẹ rủi ro. Builder đã ghi ở residual (b), chấp nhận.

### Đã kiểm, ĐÚNG
- **M9:** đọc cutoff bằng `#>> '{}'` (`:222`). 052 (d) đổi `app_settings` thành 60 → hành vi đổi theo, nên đỏ được với `->>0` cũ.
- **M5:** ghế bị khoá vận hành → trigger `showtime_seat_states_fill` raise 23514 (BEFORE INSERT chạy cả khi ON CONFLICT, `booking_tables.sql:405-407`) → `sell_order_seats` bắt và trả false → NMR, không raise. Test (e) `lives_ok` bao phủ.
- **M1c:** hold hết hạn → nhánh muộn. Kiểm ON_SALE/OPEN ở mọi nhánh. Các chuyển trạng thái hợp lệ theo `orders_guard_transition`: `holding/pending_payment → expired → needs_manual_review`, `pending_payment → paid`.
- **M10a:**
  - retry ở NMR trả kết quả xác định, không ghi audit/email/payments (`:89-106`);
  - nhánh lệch tiền chỉ ghi một lần;
  - test (g) đỏ được với code cũ, vì code cũ trả INVALID_STATE hoặc ghi trùng.
- **Fix snapshot của 052:** helper `t52_call` tách lời gọi ra câu lệnh riêng. Đúng.
- **Chữ ký, SECURITY DEFINER, `search_path = ''`, ACL:** giữ nguyên, revoke anon/authenticated, grant service_role (`:395-396`). 048 xanh.
- **Chỉ áp cho WEB:** spec dùng `confirm_paid` cho PayOS web; POS đi `confirm_pos_sale`, nên cutoff online không ảnh hưởng POS.
- **AI-readable:** hàm ~360 dòng, nhưng đó là CREATE OR REPLACE kế thừa và đã gọn hơn bản cũ (gộp case A/B). Không thêm AI-chaos indicator mới. Comment giải thích WHY.

## Verdict

**FAIL**

Phải sửa trước round 2:
- **F1 (BLOCKER):** hồi sinh lượt voucher đã gỡ, vượt trần R-93; regression so với `20261112060000:418-420`.
- **F2 (MAJOR):** fixture voucher của 052 sai dạng dữ liệu thật, khẳng định đúng hành vi lỗi.
- **F3 (MAJOR):** cutoff cho hold còn hạn là mở rộng luật chưa có spec delta. Cần user quyết định (a) hoặc (b).

Không commit/push task này cho tới khi round 2 PASS.
