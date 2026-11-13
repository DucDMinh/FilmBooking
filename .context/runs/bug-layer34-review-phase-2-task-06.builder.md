# builder phase-2-task-06

- **Làm:**
  1. Test mới `supabase/tests/057_cancel_showtimes_idempotent.test.sql` (15 assert: preview tính cả checked_in, cancel lần 1 xử lý checked_in + paid và enqueue email + cập nhật email_sent, cancel lần 2 idempotent không enqueue email trùng).
  2. Migration additive `supabase/migrations/20261112150000_cancel_showtimes_hardening.sql`:
     - `orders_guard_transition`: cho phép transition `checked_in` -> `affected`.
     - `preview_cancel_showtimes`: tính cả đơn `checked_in` vào `paid_orders_count`, `web_paid_orders_count`, `pos_paid_orders_count`, `total_refund_amount`.
     - `cancel_showtimes`: xử lý cả đơn `status in ('paid', 'checked_in')`, global locking order giữ nguyên, enqueue email idempotent (lọc `email_sent = false` và `not exists outbox`, cập nhật `email_sent = true` qua CTE `mark_sent`).
- **Evidence đỏ -> xanh:**
  - Trước migration: test 057 FAIL 11/15 subtests (assert 1-3 preview, 6-11 cancel lần 1, 13 cancel lần 2, 15 email_sent).
  - Sau migration: `pnpm db:test` 26 files / 762 tests PASS 100% (bao gồm 048 allowlist xanh, 043 xanh, 057 xanh 15/15).
  - `pnpm typecheck`: packages/shared, apps/api, apps/web PASS.
  - `pnpm test`: packages/shared (14 tests), apps/api (210 tests), apps/web (93 tests), scripts (16 tests) PASS.
- **Trạng thái:** Builder PASS, chưa commit code, chờ reviewer (attempt 0).
