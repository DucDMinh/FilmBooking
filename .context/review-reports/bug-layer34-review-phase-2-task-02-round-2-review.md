# Review — bug/layer34-review · phase-2-task-02 · round 2

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đổi hành vi và khoá của đường tiền (`confirm_paid`, service_role, webhook PayOS); voucher limit (R-93); concurrency với `cancel_showtimes`/`hold_seats`/job expire; DB migration (CREATE OR REPLACE).
- **Blast radius:** mọi webhook PayOS + job reconcile (`confirm_paid`); `voucher_redemptions`/`vouchers`; `showtime_seat_states`, `tickets`, `payments`, `email_outbox`, `audit_logs`; lock interplay với `cancel_showtimes`, `hold_seats`, `expire_overdue_holds`, `release_seats`, `apply_voucher_core`, `confirm_pos_sale`.
- **Scope:** `supabase/migrations/20261112110000_confirm_paid_hardening.sql`, `supabase/tests/052_confirm_paid_hardening.test.sql`, `tasks/bug-layer34-review/phase-2-task-02.md`. Đối chiếu:
  - `20261111040200_rpc_voucher.sql`: remove_voucher `:252-264`, trigger `orders_voucher_status_sync` `:283-315`;
  - `20261112080000_function_privileges_hardening.sql`: apply_voucher_core `:96-200`, upsert `on conflict (order_id)`;
  - `20261111040100_rpc_payment.sql:742-766` (mark_payment_cancelled);
  - `SPECIFICATIONS.md:554` (#9/10/17);
  - report round 1.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | PASS — 21 file, 722 assert (gồm 048 allowlist, 050, 051 đồng thời, 052 29/29) |
| `pnpm db:test .context/review-reports/bug-layer34-review-phase-2-task-02-round-1-repro.test.sql` | PASS 4/4 (round 1: FAIL 3/4) |
| `pnpm db:test .context/review-reports/bug-layer34-review-phase-2-task-02-round-2-repro.test.sql` (repro mới của reviewer, BEGIN…ROLLBACK) | PASS 9/9: so định nghĩa hàm, ACL, các edge E1–E3 |
| `pnpm db:test .context/review-reports/bug-layer34-review-phase-2-task-02-round-2-repro-late-cutoff.test.sql` | PASS 4/4: hold quá hạn chưa quét + qua cutoff ra NMR; chưa qua cutoff ra SUCCESS với `recovered = true` |
| `aislop scan --changes --json` | skip, aislop not installed |
| `npx oxlint` | skip, diff chỉ có SQL |
| `ocr` | skip, ocr not installed |
| So sánh định nghĩa hàm trên DB local | PASS (assert 1 của repro round 2). `pg_proc.prosrc` của `confirm_paid(uuid,integer,text,bigint)` khớp thân hàm trong file migration sau khi bỏ comment `--` và gộp khoảng trắng. `docker exec`/`node -e` không nằm trong allowlist của reviewer nên tôi so bằng pgTAP |

Tôi không tự xác minh được con số "đỏ 5/29 trên code round 1" vì bản round 1 không có trong git để áp lại. Theo phân tích mã, các assert sau phải đỏ trên round 1, khớp con số builder ghi:
- O7: round 1 trả NMR vì cutoff.
- O17: round 1 chuyển RELEASED → CONSUMED.
- O18: round 1 trả VOUCHER_EXHAUSTED.
- Assert đếm lượt V1.
- O13 với fixture mới.

## Trạng thái finding round 1

| ID | Mức | Trạng thái | Bằng chứng |
|---|---|---|---|
| F1 | BLOCKER | **Đã sửa** | `:242-264` chỉ hồi sinh khi `v_is_late and v_order.voucher_id is not null` và redemption `RELEASED` cùng `voucher_id`. `:304-307`: đơn đúng hạn chỉ `HELD→CONSUMED`. Repro round 1 4/4; 052 (f2) O17/O18 + assert V1 = 1 |
| F2 | MAJOR | **Đã sửa** | `052:23-32`: fixture có `voucher_id`, discount 10000, total 90000; webhook 90000 (`:163-165`). Ca dương O13 nay đi đúng nhánh hồi sinh với voucher thật. Đã thêm (f2), (c2) |
| F3 | MAJOR | **Đã sửa theo quyết định user (b)** | `:230-236`: ON_SALE + rạp OPEN ở mọi nhánh; cutoff chỉ khi `v_is_late`. Khớp `SPECIFICATIONS.md:554`, không cần spec delta. 052: (c) O7 SUCCESS/1, (c2) O19 NMR, (d) O8/O9 dùng đơn expired nên vẫn bắt được M9 |
| F4 | — | Vẫn đúng | Thứ tự khoá không đổi: showtimes FOR SHARE → orders → payments → vouchers (chỉ khi hồi sinh) → seat_states |
| F5 | MINOR | Residual (chấp nhận) | Chưa có test dblink confirm_paid ↔ cancel_showtimes; đã ghi trong task file |
| F6 | MINOR | Residual (chấp nhận) | `cinemas.status` không được khoá |
| F7 | MINOR | Residual (chấp nhận) | Khoản tiền lần 2 ở đơn đã NMR không cập nhật `payments` |

## Kiểm chứng thêm (edge giữa các nhánh mới)

1. **Đơn late, `voucher_id` khớp, redemption vẫn HELD** (pending_payment quá hạn, job chưa quét).
   - 4b không tìm thấy dòng RELEASED nên `v_revive_voucher = false`.
   - Khi chốt bán, `HELD→CONSUMED` (UPDATE ở `:304-307` và trigger). Lượt HELD vốn đã nằm trong trần nên không vượt trần.
   - Repro E1: voucher trần 1, lượt HELD của chính đơn → SUCCESS, CONSUMED, đếm = 1.
   - Nếu đi NMR: `pending_payment→expired` kích trigger `HELD→RELEASED`. Đúng.
2. **Đơn cancelled có còn `voucher_id` không?**
   - Chỉ `remove_voucher` đặt `voucher_id = null` (đã grep toàn bộ migrations). Trigger, `mark_payment_cancelled` (`rpc_payment.sql:759-766`) và `cancel_showtimes` chỉ đổi status của redemption.
   - Đơn bị cancel_showtimes: suất CANCELLED nên bị chặn ở `SHOWTIME_NOT_ON_SALE` trước 4b.
   - Đơn cancelled do khách tạo đơn mới (#9/10/17): còn `voucher_id`, nên được kiểm trần trước khi hồi sinh. Đúng.
3. **`per_user_limit` khi `user_id` null:** `:255` bỏ qua kiểm tra. `apply_voucher_core` (`080000:153`) cũng bỏ qua khi `v_order.user_id` null. Nhất quán với luật lúc áp voucher, không mở lỗ mới.
4. **Gỡ rồi áp lại voucher:** upsert `on conflict (order_id)` đặt lại HELD và `voucher_id` mới, đồng bộ với `orders.voucher_id`.
5. **Late + hồi sinh nhưng mất ghế:** nhánh NMR không đụng redemption nên lượt giữ RELEASED. Repro E3: NMR, RELEASED, 0 vé, ghế SOLD của đơn khác không bị ghi đè.
6. **Late + voucher không giới hạn:** repro E2 ra SUCCESS/CONSUMED.
7. **Hai confirm_paid late cùng hồi sinh một voucher trần 1:** hai lời gọi tuần tự hoá qua `vouchers FOR UPDATE`, khoá giữ tới commit. Trong READ COMMITTED, câu đếm sau khi lấy được khoá dùng snapshot mới, nên thấy CONSUMED của giao dịch trước. Không vượt trần.
8. **M1c + F3, hold quá hạn chưa quét được coi là "muộn":** repro late-cutoff L1 (suất sau 10 phút, cutoff 15) ra NMR, 0 vé; L2 ra SUCCESS, `recovered = true`. Code đúng. Xem N3 về lỗ hổng test.
9. **Regression M5/M9/M10a:**
   - M5: (e) `lives_ok` + NMR;
   - M9: (d) đổi app_settings thành 60 làm đổi hành vi trên đơn expired;
   - M10a: (g) retry không ghi thêm audit/email.

   Tất cả xanh.
10. **Chữ ký / ACL / search_path:** repro round 2 kiểm `prosecdef = true`, `proconfig = search_path=""`, anon/authenticated không có EXECUTE, service_role có. 048 xanh.

## Findings round 2

### N3 — MAJOR (test gap, BẮT BUỘC sửa trước commit) — 052 không chứng minh luật M1c "hold quá hạn chưa quét = tiền về muộn"
- **Vị trí:** `supabase/tests/052_confirm_paid_hardening.test.sql:83-86, 170-181` (ca a/a2), `:98-99` (e).
- **Vấn đề:** xoá mệnh đề `or (v_order.hold_expires_at is not null and v_order.hold_expires_at <= now())` (migration `:219-220`) thì 052 vẫn xanh:
  - O1 SUCCESS dù đơn có được coi là muộn hay không, và test không assert `recovered`;
  - O2/O10 ra NMR ở cả hai nhánh, chỉ khác reason nội bộ mà không assert.
- **Vì sao quan trọng:** sau quyết định F3, cờ `v_is_late` quyết định việc áp cutoff. Nó là nhánh có hậu quả lớn nhất của hàm. Comment (a) ghi "đi nhánh tiền-về-muộn" nhưng không có assert nào kiểm điều đó. Repro của reviewer nằm ngoài `supabase/tests/`, nên không bảo vệ được regression.
- **Yêu cầu, thêm vào 052:**
  1. Đơn `pending_payment` có `hold_expires_at = now() - 1 minute`, dòng HELD còn, trên suất bắt đầu sau 10 phút (cutoff 15) → `NEEDS_MANUAL_REVIEW`, 0 vé. Có thể chép L1 trong `round-2-repro-late-cutoff.test.sql`.
  2. Assert `(select r->>'recovered' from t52_res where k = 'o1') = 'true'`.
  3. Cập nhật `plan(...)`, chạy `pnpm db:test` xanh.

### N1 — MINOR (sửa khi close-out) — Task file còn dòng "Fix:" của round 1 ghi "mọi nhánh kiểm … + cutoff"
- **Vị trí:** `tasks/bug-layer34-review/phase-2-task-02.md`, dòng `- Fix:` (round 1).
- **Vấn đề:** dòng này mô tả hành vi round 1. Section "Fix round 2" bên dưới đã đúng, nhưng người đọc lướt dễ hiểu sai.
- **Yêu cầu:** sửa dòng đó, hoặc ghi chú "(đã thay bởi round 2)".

### N2 — INFO
- Hồi sinh voucher không kiểm lại `active`/`valid_to`. Builder đã ghi ở residual (a). Tiền đã về theo giá đã giảm, nên chấp nhận.
- Khi đếm trần ở 4b, lượt HELD "chết" của đơn khác (quá hạn, chưa bị quét) vẫn được tính. Cách đếm này giống `apply_voucher_core`, và sai lệch nghiêng về manual review chứ không bán vượt trần. Chấp nhận.

Không có mock TS. Test chạy pgTAP trên DB thật với trigger/constraint thật. Fixture voucher nay khớp dạng dữ liệu do `apply_voucher_core` + expire tạo ra.

## Verdict

**STRICT PASS (có điều kiện close-out)**

Mã migration đúng. F1/F2/F3 đã đóng, không có defect hành vi mới.

**Điều kiện trước commit:**
- **N3:** thêm 2 assert vào 052, chạy lại `pnpm db:test` toàn bộ xanh.
- **N1:** sửa task file.

N3 chỉ thêm test, không đổi migration. Orchestrator xác nhận bằng `pnpm db:test` (052 tăng plan, toàn bộ PASS), không cần review round 3. Nếu builder đổi migration khi làm N3 thì bắt buộc review lại.

F5/F6/F7 giữ là residual đã ghi.
