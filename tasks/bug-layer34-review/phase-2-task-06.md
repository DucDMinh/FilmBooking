# Bug layer34-review · phase-2-task-06 — cancel_showtimes: email idempotent, không email đơn POS, xử lý đơn checked_in

- Classification / Risk: BUG · severity=medium · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-db.md (M10c, MINOR #8)
- Yêu cầu: gọi lại cancel_showtimes không enqueue lại email cho đơn đã affected trước đó (lọc theo lần gọi/email_sent); đơn POS không gửi email (quyết định #8); đơn checked_in một phần xử lý theo spec (đọc spec, ghi rõ).
- Quy tắc: test-first (pgTAP/e2e đỏ trước, xanh sau); migration MỚI additive, không sửa migration đã apply; CREATE OR REPLACE giữ chữ ký/ACL/search_path; giữ allowlist 048 xanh; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: done (reviewer PASS round 1, report: .context/review-reports/bug-layer34-review-phase-2-task-06-round-1-review.md)

## Scope change (CR remove-pos, 2026-11-12)
Bỏ POS khỏi dự án (spec 2.0.0, `spec/changes/2026-11-12-remove-pos.md`; quyết định #8 đã REMOVED).
- **Bỏ:** phần "không email đơn POS" (không còn đơn kênh POS mới; không viết lại nhánh POS nội bộ của `cancel_showtimes` — chỉ ghi residual).
- **Giữ:** email idempotent khi gọi lại `cancel_showtimes` (không enqueue lại cho đơn đã `affected`); xử lý đơn `checked_in` một phần theo spec.
- Tiêu đề / dòng "Yêu cầu" phía trên giữ chữ gốc để truy vết; phần POS trong đó không còn hiệu lực.

## Kết quả (builder, 2026-11-12)
- **Root cause:**
  1. `cancel_showtimes` (trong `20261111040300_rpc_cancel.sql` và `20261112100000_order_lifecycle_pending_payment.sql`) chỉ khoá và chuyển trạng thái các đơn `status = 'paid'` sang `affected`. Đơn `checked_in` (khách đã check-in nhưng suất bị huỷ do sự cố) bị bỏ sót, không được chuyển `affected`, không vào `affected_order_cases`, và không được enqueue email.
  2. `preview_cancel_showtimes` chỉ đếm `o.status = 'paid'`, bỏ sót đơn `checked_in` khỏi `paid_orders_count`, `web_paid_orders_count`, và `total_refund_amount`.
  3. Trigger `orders_guard_transition()` trước đó không cho phép chuyển trạng thái `checked_in` -> `affected` (chỉ cho phép `paid` -> `affected` và `paid` -> `checked_in`).
  4. Mỗi lần gọi lại `cancel_showtimes`, mệnh đề CTE `inserted_emails` chèn bản ghi mới vào `email_outbox` cho tất cả đơn `affected` có email mà không kiểm tra đơn đã được gửi email trước đó hay chưa, đồng thời không cập nhật cờ `email_sent = true` trên `affected_order_cases`.
- **Fix:** Migration additive `supabase/migrations/20261112150000_cancel_showtimes_hardening.sql`:
  1. `orders_guard_transition()`: thêm nhánh hợp lệ `(old.status = 'checked_in' and new.status = 'affected')`.
  2. `preview_cancel_showtimes(uuid[])`: cập nhật các biểu thức đếm và tính tổng tiền áp dụng cho `o.status in ('paid', 'checked_in')`.
  3. `cancel_showtimes(uuid[], text, uuid)`:
     - Global Locking Order: giữ nguyên thứ tự khoá toàn cục `showtimes` (FOR UPDATE) -> `orders` (FOR UPDATE theo ID tăng dần bao gồm `holding`, `pending_payment`, `paid`, `checked_in`) -> `showtime_seat_states`.
     - Chuyển trạng thái đơn `status in ('paid', 'checked_in')` sang `affected`.
     - Tạo / cập nhật `affected_order_cases` cho toàn bộ đơn `affected`.
     - Idempotency email: kiểm tra `aoc.email_sent = false` và `not exists (select 1 from email_outbox ...)`. Đồng bộ cờ `email_sent = true` khi outbox đã có sẵn email.
     - Sau khi enqueue email vào `email_outbox`, lập tức cập nhật `affected_order_cases.email_sent = true` qua CTE `mark_sent`.
     - Giữ nguyên chữ ký hàm, `SECURITY DEFINER`, `SET search_path TO ''`, kiểm tra chống spoofing `p_actor_id` (P0-08), và phân quyền `revoke ... from public, anon; grant execute ... to authenticated, service_role`.
- **Test:** Tạo test mới `supabase/tests/057_cancel_showtimes_idempotent.test.sql` (15 assert):
  - Fixture: 1 rạp OPEN, phòng, 2 ghế, suất ON_SALE, 1 đơn `paid` (100k), 1 đơn `checked_in` (120k).
  - Assert 1-3: `preview_cancel_showtimes` trả `paid_orders_count = 2`, `web_paid_orders_count = 2`, `total_refund_amount = 220,000`.
  - Assert 4-7: `cancel_showtimes` lần 1 thành công (`success = true`, `cancelled_showtimes_count = 1`, `affected_orders_count = 2`, `emails_enqueued_count = 2`).
  - Assert 8-11: Cả 2 đơn đều chuyển sang `status = 'affected'`, bảng `affected_order_cases` có 2 bản ghi đều có `email_sent = true`, và `email_outbox` có đúng 2 email PENDING.
  - Assert 12-15: Gọi lại `cancel_showtimes` lần 2 (idempotent): `success = true`, `emails_enqueued_count = 0`, `email_outbox` giữ nguyên 2 bản ghi không tăng, `affected_order_cases` giữ nguyên `email_sent = true`.
- **Evidence đỏ -> xanh:**
  - Trước migration: chạy `pnpm db:test` với test 057 bị **FAIL 11/15 subtests** (Failed tests: 1-3, 6-11, 13, 15: preview thiếu đơn checked_in, cancel lần 1 không chuyển checked_in và email_sent=false, cancel lần 2 enqueue trùng lặp).
  - Sau migration: chạy `pnpm db:test` toàn bộ **26 files, 762 tests PASS 100%** (bao gồm `048_function_privileges.test.sql` allowlist xanh, `043_cancel.test.sql` xanh, `057_cancel_showtimes_idempotent.test.sql` 15/15 xanh).
  - `pnpm typecheck`: packages/shared, apps/api, apps/web PASS 100%.
  - `pnpm test`: packages/shared (14 tests), apps/api (210 tests), apps/web (93 tests), scripts (16 tests) PASS 100%.
- **Residual:**
  - Nhánh POS trong `cancel_showtimes` và `preview_cancel_showtimes` được giữ nguyên làm dead code vô hại theo CR remove-pos (không còn kênh POS tạo đơn mới).
  - Khi huỷ suất, nếu khách đã check-in nhưng chưa quét vé hết (ví dụ đơn có nhiều vé và mới quét 1 vé), toàn bộ đơn vẫn chuyển sang `affected` và khách sẽ được xử lý đền bù/đổi vé/hoàn tiền qua `affected_order_actions`.
- **Doc impact:** no doc impact (không đổi schema public API hay model; tuân thủ đúng R-108/R-109/R-110 và quyết định #8 đã sửa).
