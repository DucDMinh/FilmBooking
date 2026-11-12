Agent: reviewer

# Review — bug-layer34-review · phase-1 · task-05 (K4 bán trùng ghế) · round 1

- **Worktree:** `E:\FilmBooking\.worktrees\bug-layer34-review__phase-1__task-05` (branch `wt/bug-layer34-review__phase-1__task-05`, chưa commit)
- **Diff:** mới `supabase/migrations/20261112060000_prevent_double_sell.sql`, `supabase/tests/047_double_sell.test.sql`; sửa `packages/shared/src/database.types.ts`, `docs/ERD.md`, `tasks/bug-layer34-review/phase-1-task-05.md`
- **Review level:** STRICT
- **Reason:** schema/migration (backfill + SET NOT NULL + UNIQUE trên dữ liệu cũ), payment RPC `confirm_paid` (tiền), hàm SECURITY DEFINER mới, concurrency.
- **Blast radius:** bảng `tickets` (mọi đường phát vé: `confirm_paid`, `confirm_zero_amount`, `confirm_pos_sale`), `showtime_seat_states`, webhook PayOS (chưa có caller app — layer 5), email outbox.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — 16 file / 605 test (047 ok) |
| `pnpm test` | PASS — shared 14, api 211, web 89, scripts 16 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| psql `docker exec ... psql` (kiểm `proacl`, `tgenabled`) | **Blocked** bởi agent-guard (ngoài allowlist) |
| `npx supabase test db <probe>` (probe quyền EXECUTE) | **Blocked** bởi agent-guard. File probe còn ở `.context/review-reports/probe-bug-layer34-review-phase-1-task-05-acl.test.sql` (read-only, rollback). Dispatcher có thể chạy hoặc xoá nó |
| aislop / oxlint / ocr | skip — chỉ SQL, không nằm trong allowlist / chưa cấu hình |

## Đã kiểm và thấy ĐÚNG
- Backfill 1:1: `tickets.order_seat_id` NOT NULL + UNIQUE + FK, nên mỗi vé ứng với đúng 1 order_seat → 1 seat. Không có vé nào ứng với nhiều ghế. Kiểm trùng trước khi tạo index, nếu trùng thì fail rõ (không xoá dữ liệu).
- `disable/enable trigger tickets_audit` nằm trong transaction của migration: lỗi thì rollback cả hai, nên trigger không bị tắt vĩnh viễn.
- `tickets_fill_seat` là BEFORE INSERT và áp cho mọi đường insert vé (confirm_paid ×2 nhánh, confirm_zero_amount, confirm_pos_sale). Hàm là SECURITY DEFINER, có `search_path=''`.
- `sell_order_seats`: `ON CONFLICT DO UPDATE ... WHERE order_id = đơn này OR (HELD and expires_at <= now())`. Dưới READ COMMITTED, phiên chờ ở unique index sẽ đánh giá WHERE trên dòng đã commit, nên không còn ghi đè SOLD hay HELD còn hạn của đơn khác. Thiếu ghế thì `P0001` → subtransaction rollback → `false`. Revoke đủ cả `public, anon, authenticated, service_role`.
- Spec R-78 / AC-11 / quyết định #9/#10/#17: ghế đã bán → `needs_manual_review`, payments PAID, email `LATE_PAYMENT_MANUAL_REVIEW`. Khớp spec (phần "báo Admin + Manager" thuộc R-104, ngoài scope). Các chuyển trạng thái đều nằm trong `orders_guard_transition`.
- Idempotent: webhook gọi lại cho đơn `needs_manual_review` → `INVALID_STATE`, không sinh email hay vé trùng. Đơn đã `paid` → `ALREADY_PAID`.
- Test 047 đỏ trước / xanh sau là hợp lý. Phiên A giữ txn 2s, phiên B chạy lúc 0.7s nên chồng lên nhau thật: B đi vào nhánh chờ unique index. Test tự dọn trước/sau và cả khi exception.
- `confirm_pos_sale` chỉ UPDATE dòng của chính nó. `confirm_zero_amount` vẫn upsert vô điều kiện, nhưng unique index của vé chặn vé thứ 2 (rollback). Không còn đường nào phát 2 vé cho cùng ghế×suất.

## Findings

### MAJOR-1 (blocking) — `confirm_paid` có thể bị `authenticated` gọi trực tiếp: chưa được chứng minh là không, và migration không đóng lỗ
- `supabase/migrations/20261112060000_prevent_double_sell.sql:668` chỉ có `revoke all ... from public, anon`. Lệnh này copy nguyên từ `20261111040100_rpc_payment.sql:708`. `CREATE OR REPLACE` giữ ACL cũ.
- Convention của chính repo cho hàm chỉ dành service_role là `from public, anon, authenticated`: xem `20261111020100_security_ops.sql:253-255` và `20261112050000_identity_rpc_hardening.sql:217-221`. Stack Supabase có default privileges cấp EXECUTE cho `anon`, `authenticated`, `service_role` trên function mới ở schema public.
- `confirm_paid` **không có kiểm caller** (khác `confirm_zero_amount:800-812`). Nếu `authenticated` có EXECUTE, một khách đã đăng nhập chỉ cần gọi `rpc('confirm_paid', {p_order_id: <đơn mình>, p_amount: total_amount})` là đơn thành `paid` và có vé mà không trả tiền. Đây là mức CRITICAL nếu được xác nhận.
- Tôi không xác minh được ACL thật vì psql và probe pgTAP đều bị hook chặn. Không có pgTAP nào assert `has_function_privilege(..., 'confirm_paid', ...)`: 041 không có, 047 cũng không có, kể cả cho `sell_order_seats`.
- Yêu cầu:
  - Thêm `authenticated` vào revoke ở `:668`.
  - Thêm pgTAP: `not has_function_privilege('authenticated'|'anon', 'public.confirm_paid(uuid,integer,text,bigint)', 'execute')`, `has_function_privilege('service_role', ...)`, và `not has_function_privilege(anon/authenticated/service_role, 'public.sell_order_seats(uuid)', 'execute')`.
  - Hoặc: chạy probe ở trên và đính kèm bằng chứng rằng `authenticated` không có quyền.

### MAJOR-2 (blocking) — Logic cốt lõi mới của `sell_order_seats` không có test
Test 047 chỉ dùng đơn 1 ghế, và ghế chưa có dòng seat_state. Thiếu test cho các nhánh mới viết:
- (a) Đơn 2 ghế, 1 ghế đã thuộc đơn khác → subtransaction rollback, **không còn dòng SOLD dở dang** cho ghế còn lại (`20261112060000_prevent_double_sell.sql:104-130`). Đây là rủi ro lớn nhất: nếu rollback sai thì ghế bị "chiếm ma".
- (b) HELD còn hạn của đơn khác không bị ghi đè; đơn trả tiền vào `needs_manual_review` (biến thể C2 trong báo cáo gốc).
- (c) HELD **đã hết hạn** của đơn khác thì được chiếm hợp lệ (`:120`).
- (d) Ghế đang bị khoá (`showtime_seat_locks`, 23514 từ `showtime_seat_states_fill`) → `false` → manual review, không rollback webhook (`:128`). Đây là hành vi mới mà task tự nhận là "có chủ đích" nhưng chưa test.
- (e) Nhánh holding/pending_payment khi `sell_order_seats` trả false (`:309-311`).

STRICT: logic tiền/ghế quan trọng mà thiếu test → FAIL.

### MAJOR-3 (blocking, gate quy trình) — Thiếu nhãn `HIGH_RISK_MIGRATION`
- Migration có backfill trên dữ liệu cũ (`:31-34`), `SET NOT NULL` (`:51`) và `UNIQUE` trên dữ liệu cũ (`:74`). Đây đúng là nhóm "destructive/high-risk ops" mà AGENTS.md § Non-negotiables bắt gắn `HIGH_RISK_MIGRATION`, ghi rollback, verify staging và không promote production.
- Task file (`tasks/bug-layer34-review/phase-1-task-05.md`) không có các mục này.
- Cần ghi thêm:
  - `ALTER TABLE ... DISABLE TRIGGER` và `CREATE UNIQUE INDEX` (không `CONCURRENTLY`) lấy khoá mạnh trên `tickets` trong suốt migration, nên webhook/check-in bị chặn trong lúc đó.
  - Rollback: `drop index`, `drop trigger`, `drop column`, khôi phục `confirm_paid` cũ.
  - Truy vấn kiểm trùng phải chạy trên staging trước.

### MINOR
- **m1.** `sell_order_seats` bắt mọi `23514` (`:128`), gồm cả "Ghế không thuộc phòng chiếu hoặc không bán được" (ghế đổi sang AISLE/BROKEN) và "Đơn không thuộc suất này". Hệ quả là email khách ghi reason `SEATS_UNAVAILABLE`/`SEATS_TAKEN`, có thể sai bản chất. Nên phân biệt bằng `MESSAGE_TEXT` hoặc errcode riêng. Nên dùng errcode riêng (ví dụ `P0K04`) thay vì `P0001` mặc định, để không nuốt các `raise exception` không mã trong tương lai.
- **m2.** `tickets.seat_id` không có FK tới `seats` và không có guard khi UPDATE `order_seat_id`/`showtime_id`, nên `seat_id` có thể lệch (hiện không có code nào UPDATE các cột này). ERD ghi "belongs to seats" nhưng DB không có FK.
- **m3.** `database.types.ts`: `tickets.Insert.seat_id` bắt buộc (`string`), trong khi trigger đã tự điền. Client TS insert vé (nếu có sau này) sẽ bị ép truyền giá trị thừa. Cân nhắc `default` hoặc ghi chú.
- **m4.** Test 047 không assert hai phiên thực sự chồng nhau (ví dụ B bị chặn ≥ ~1s, hoặc kiểm `pg_locks`). Trên máy chậm, nếu B bắt đầu sau khi A commit thì test vẫn xanh nhưng chỉ chạy tuần tự. Test còn phụ thuộc `inet_server_addr()` khác NULL và mật khẩu `postgres` mặc định: CI (`.github/workflows/ci.yml:36-57`, `supabase start`) dùng mặc định nên hiện chạy được.
- **m5.** Precheck ở nhánh holding (`:297-305`) coi HELD **đã hết hạn** của đơn khác là xung đột, nhưng `sell_order_seats` thì cho chiếm. Hai nhánh không nhất quán (hành vi cũ, không hồi quy).
- **m6.** Dòng trống kép ở `:312-313` và `:510-511`.
- **m7.** Residual đã ghi đúng: `confirm_zero_amount` (`20261111040100_rpc_payment.sql:847-850`) vẫn ghi đè seat_state của đơn khác. Vé được chặn bằng unique index, nhưng lỗi 23505 thô có thể trả về client (MAJOR khác, task riêng).

## Verdict: **FAIL**
Các mục cần sửa trước round 2:
1. MAJOR-1: revoke `authenticated` trên `confirm_paid` + pgTAP quyền cho `confirm_paid` và `sell_order_seats`.
2. MAJOR-2: thêm test (a)–(e) cho `sell_order_seats` / `confirm_paid`.
3. MAJOR-3: gắn `HIGH_RISK_MIGRATION` + rollback/lock/staging note vào task file.
