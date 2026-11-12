Agent: reviewer

# Review — bug-layer34-review · phase-2 · task-01 · round 2 (final round)

- Task: `tasks/bug-layer34-review/phase-2-task-01.md` (M1a/b + M2: pending_payment order lifecycle)
- Diff (not yet committed): `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql`, `supabase/tests/050_order_lifecycle.test.sql`, `supabase/tests/051_order_lifecycle_concurrency.test.sql` (new), task file.
- Review level: **STRICT**
- Reason: schema/migration (unique index on existing data, ACCESS EXCLUSIVE lock), replaces the shared RPC `hold_seats` and the cron job `expire_overdue_holds`, touches the payment/voucher flow, and changes the global lock order (concurrency risk).
- Blast radius: `hold_seats` (every Web/POS hold), `expire_overdue_holds` (pg_cron, every minute), the `orders` index, indirectly `payments` / `voucher_redemptions`, and every RPC that locks `orders` + `showtime_seat_states`: `confirm_paid`/`sell_order_seats`, `confirm_zero_amount`, `confirm_pos_sale`, `mark_payment_cancelled`, `release_seats`, `cancel_showtimes`.

## Verify commands + result

| Command | Result |
|---|---|
| `pnpm db:test` (local stack, no reset/seed) | PASS — Files=20, Tests=690; 050 ok, 051 ok (log: A/B always `ok`, C `ok` or `23514` SEAT_TAKEN), 048 allowlist ok |
| `pnpm test` | PASS — shared 14, api 210, web 93, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| aislop / oxlint / ocr | skip — diff is SQL only, no TS/JS touched; ocr not installed |

Note: I could not confirm that the function body on the local DB matches the file byte for byte. The builder re-applied it with psql; schema_migrations already has 20261112100000, so `migration up` will not apply it again. Staging/prod have not applied it yet, so there is no impact there.

## Round 1 findings — status

### F1 (lock order) — fixed for job / hold_seats / confirm_paid, but OPENS new inversions (see R2-F1)
- Header `:12-18` declares the order orders(id ascending) → payments → seats → showtime_seat_states((showtime_id, seat_id) ascending).
- `hold_seats`:
  - §3.8b `:230-236` locks orders `order by id for update` before seats §3.9 `:239-242`.
  - §3.13 `:291-316` does UPDATE orders → DELETE seat_states (subquery `order by showtime_id, seat_id for update`) → payments. Payments come after seat_states, which differs from the header. It is harmless, because payments are reached only after the order lock and confirm_paid locks payments while already holding that order.
  - §3.14 `:324-347` does orders → payments → seat_states. OK.
- `expire_overdue_holds` `:576-606`: orders `order by id for update` → UPDATE → payments → DELETE seat_states (sorted). OK.
- `confirm_paid` (`20261112060000_prevent_double_sell.sql:163`, `:97-120`) does orders FOR UPDATE → seat_states (sell_order_seats) → payments. It does not deadlock with hold_seats or the job, because all three lock the order first.
- `confirm_zero_amount` (`20261111040100_rpc_payment.sql:795`, `:832`), `confirm_pos_sale` (`:949`, `:1024`) and `mark_payment_cancelled` (`:728`, `:751`) all lock the order first. They are consistent.
- §3.8b picks the right set: the customer's holding/pending_payment orders (WEB) plus the overdue orders of this showtime. That is exactly the set §3.13/§3.14 will UPDATE. `now()` is fixed within the transaction, so §3.14 cannot see a new overdue order outside the locked set. Over-locking is acceptable: concurrent holds on the same showtime briefly serialize on the overdue orders until one of them expires them (READ COMMITTED re-check drops them). §3.13 re-locks the same orders, which is redundant but harmless.
- Edge case: two concurrent hold_seats calls by the same user. The order created by the first call is not in the second call's §3.8b snapshot, so §3.13 locks it after seats. That breaks the order in a very narrow case (no concrete deadlock path found). Recorded only.
- The rest of hold_seats is unchanged from round 1: §3.1–3.12, §3.15–3.24, signature, SECURITY DEFINER, `search_path=''`, REVOKE/GRANT.

### F2 — code CLOSED, task file NOT updated (R2-F2)
- No more begin/commit. The DO block covers precheck + create + drop in a single statement, so it is atomic. LOCK inside the DO is valid.
- ACCESS EXCLUSIVE vs SHARE: a non-concurrent `DROP INDEX` needs ACCESS EXCLUSIVE on the table anyway. Taking SHARE first would only add a lock upgrade, which can deadlock with a concurrent holder. Taking ACCESS EXCLUSIVE from the start is the **right** call. The trade-off is that it blocks SELECTs on `orders` while the index builds (partial index, small table, so short).

### F3 — CLOSED
`:480` now says `orders_one_active_hold_per_user_key`.

### F4 — CLOSED
050 has exactly 17 asserts:
- (b): lives_ok, O2 expired/EXPIRED/RELEASED, O1 expired, O1 payment+voucher `EXPIRED/RELEASED`, and a negative case where O4 still has time `pending_payment/PENDING/HELD`.
- (a): `is(expire_overdue_holds(), 1)` with an exact count, a negative case where the paid order O6 stays `paid/1` with its SOLD seat, and O5 expired/EXPIRED/RELEASED with its seat freed.
- (c): lives_ok, O4 cancelled, `CANCELLED/RELEASED`.
- (d): 23505.
- The values match the fixture.

## Findings round 2

### R2-F1 — MAJOR (blocks PASS): the new lock order inverts against `release_seats` and `cancel_showtimes`, creating new deadlocks
Before this task, the old job, old §3.13/§3.14 (`20261111040000_rpc_hold.sql:323-350`, `:742-751`), `release_seats` and `cancel_showtimes` all took **seat_states before orders**. This task flipped the job and hold_seats to orders first and left the other two RPCs unchanged:

- **`release_seats`** (`20261111040000_rpc_hold.sql:583-639`, not redefined later): reads the order **without a lock** (`:583`), then `DELETE showtime_seat_states` (`:632`), then `UPDATE orders` (`:637`).
  - vs job `20261112100000_...sql:576-606`: the order O is overdue but still `holding`. The job locks O and waits on O's seat rows, while release_seats has deleted those rows and waits on O. Result: 40P01.
  - vs hold_seats §3.8b/§3.13 `:230-309` (same user): §3.8b locks the old order O and §3.13 then waits on O's seat rows, while release_seats has deleted them and waits on O. Result: 40P01.
- **`cancel_showtimes`** (latest definition `20261112080000_function_privileges_hardening.sql:336-365`): showtimes FOR UPDATE → `DELETE showtime_seat_states ... state='HELD'` (`:348`) → `perform ... orders for update` (`:354-357`).
  - vs the new job: one overdue order in a showtime being cancelled. The job holds O and waits on the seat row; cancel holds the seat row and waits on O. Result: 40P01.
- **Pre-existing or new:** the old code could only deadlock between these pairs through **multiple rows** scanned in different orders by unordered DELETEs. The new path needs just **1 order, 1 seat**, so it is a regression introduced by this task. That also makes the header `:12` claim ("every related RPC must follow the exact order") false on disk.
- **Severity:** same defect class as round-1 F1. There is no data corruption (one transaction is aborted and rolls back), but cancelling a showtime (Manager/Admin) or releasing seats (customer) can fail at random. `apps/` has no callers yet, but both functions are GRANTed to `authenticated` (an API contract), which only reduces reach.
- **Suggested fix** (small and mechanical, CREATE OR REPLACE in this migration, keep signature/ACL, re-check the 048 allowlist):
  - `release_seats`: `select ... from orders where id = p_order_id for update` at the top, then DELETE seat_states, then UPDATE orders.
  - `cancel_showtimes`: move `perform 1 from orders ... order by id for update` (holding/pending_payment and paid) to **before** the DELETE seat_states, and sort the DELETE by `(showtime_id, seat_id)` (subquery `for update`) like the job does.
  - Add a lock-order test for these pairs.

### R2-F2 — MINOR (must fix in the task file): HIGH_RISK_MIGRATION does not match the code
- `tasks/bug-layer34-review/phase-2-task-01.md:27` still says "`LOCK TABLE orders IN SHARE MODE` ... chặn ghi `orders`" (blocks writes to `orders`). The code is ACCESS EXCLUSIVE (`migration :26`), which **blocks reads too**. This also contradicts `:17` of the same file. The HIGH_RISK section must state the real lock level and its impact.
- Recommendation (prod risk): if the ACCESS EXCLUSIVE request queues behind a long transaction, every new SELECT on `orders` stalls behind it. Add `perform set_config('lock_timeout', '5s', true);` before the `lock table` inside the DO block, so it fails fast instead of freezing reads.

### R2-F3 — MINOR (non-blocking): 051 has little power to detect deadlocks
- Each `pg_sleep` runs **before** the RPC. Each transaction lasts a few ms, so the three sessions run almost serially.
- The only real overlap is A's trailing `pg_sleep(0.05)` (`:126`). By then confirm_paid already holds all its locks, so B and C just wait; a cross-wait is impossible.
- The interleaving "each side holds one resource the other needs" (the cause of round-1 F1 and R2-F1) is never exercised. This test would very likely PASS on round-1 code too. The log is consistent with that: A and B always `ok`.
- The builder admits there is no red-first evidence. That is acceptable **only** because the round-1 static analysis exists. Treat 051 as a smoke test for final-state consistency, not as proof of no deadlock.
- Suggestion: step deterministically (explicit `BEGIN` over dblink, send each statement separately, or use an advisory-lock barrier) so one session stops after locking its first resource.
- Other points are fine:
  - Cleanup happens before and after, and in the exception handler. The 5th assert checks the fixture is gone.
  - `create extension dblink` sits inside begin…rollback, so no extension is left behind.
  - The helper functions are rolled back.
  - CI (`.github/workflows/ci.yml:36-57`) runs `pnpm db:test` on the local stack; host `inet_server_addr()`:5432 with postgres/postgres is valid inside the container.
  - It depends on time (sleeps), but only on interleaving, not on the result, so it is not flaky by the current assert design.

### Residual (record, not FAIL — pre-existing / out of scope)
1. **Builder residual: hold_seats §3.9 `seats FOR UPDATE` vs confirm_paid inserting seat_state.**
   - This is real: `showtime_seat_states` has FK `(seat_id, room_id) → seats` (`20261111030100_booking_tables.sql:134`), so the insert in `sell_order_seats` takes KEY SHARE on seats, which conflicts with FOR UPDATE.
   - It needs a multi-seat late-paid order: one seat already has a row (locked by sell_order_seats) that hold_seats wants to delete in §3.14, and another seat has no row and needs KEY SHARE on a seat that hold_seats holds.
   - It is pre-existing (K4 + the old §3.9), not caused by this task.
   - Suggested follow-up: change §3.9 to `for no key update`. It does not conflict with KEY SHARE and still serializes concurrent hold_seats calls.
2. `showtimes` is missing from the declared lock order. `cancel_showtimes` (FOR UPDATE) and `confirm_pos_sale` (FOR SHARE) lock showtimes rows, while hold_seats / sell_order_seats take FK KEY SHARE on showtimes after orders. This is pre-existing. Even after fixing R2-F1, the header must say showtimes is not covered.
3. `mark_payment_cancelled` (`20261111040100_rpc_payment.sql:728-761`) runs orders → seat_states → payments → orders. It is safe because it locks the order first.
4. M1c/M3 (confirm_paid case A/B) and cancelling the PayOS link on the provider side → task-02 / API, as in round 1.

## Conclusion
- F3 and F4 are closed. F2 is correct in code, but the task file's HIGH_RISK section is stale.
- F1 is fixed for job / hold_seats / confirm_paid, but the reorder **creates new deadlocks** with `release_seats` and `cancel_showtimes` (R2-F1, same class as round-1 F1, a regression from this task). That breaks the global lock-order invariant the migration itself declares.
- This is the final round (round 2). Per the workflow, a FAIL here needs the orchestrator to decide: escalate (`architecture_review_needed`) or allow one more targeted round. The R2-F1 fix is small (2 CREATE OR REPLACE, moving the orders lock up), and R2-F2 is a one-line task-file edit.

## Verdict: **FAIL**
