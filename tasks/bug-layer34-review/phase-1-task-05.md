# Bug layer34-review · phase-1-task-05 — K4 bán trùng ghế

- Classification / Risk: BUG · severity=blocker · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Yêu cầu: unique index ghế×suất cho vé còn hiệu lực + confirm_paid kiểm tra ghế + test đồng thời 2 phiên bằng dblink.
- Quy tắc: test-first; migration chỉ additive MỚI; không đụng phạm vi task khác.
- Status: builder PASS round 2 (chờ reviewer) · **HIGH_RISK_MIGRATION** (xem mục dưới) — không promote production trước khi verify staging

## Root cause
`confirm_paid` (`20261111040100_rpc_payment.sql`) kiểm tra ghế trống bằng SELECT không khoá rồi chốt bán bằng
`INSERT .. ON CONFLICT (showtime_id, seat_id) DO UPDATE SET state='SOLD', order_id=<đơn này>` vô điều kiện (nhánh
holding/pending_payment dòng 404-407, nhánh tiền về muộn 551-554). Hai đơn `expired` cùng giữ 1 ghế, tiền về đồng thời:
cả hai qua bước kiểm tra (chưa thấy dòng của nhau vì chưa commit); phiên sau chờ unique index, khi phiên trước commit
thì ON CONFLICT DO UPDATE GHI ĐÈ dòng SOLD => cả hai `paid` + 2 vé cùng ghế. `tickets` không có ràng buộc ghế×suất
nên không có lớp chặn cuối.

## Fix (migration `supabase/migrations/20261112060000_prevent_double_sell.sql`)
1. `tickets.seat_id` (backfill từ `order_seats`, NOT NULL, trigger `tickets_fill_seat` điền khi insert nên code insert cũ
   không đổi) + `UNIQUE INDEX tickets_one_ticket_per_showtime_seat (showtime_id, seat_id)`. `tickets` không có cột trạng thái
   và vé không bị xoá nên mọi vé đều "còn hiệu lực". Migration kiểm trùng trước khi tạo index và FAIL rõ ràng nếu có
   (không xoá dữ liệu). Backfill tắt tạm trigger `tickets_audit` để không sinh audit nhiễu.
2. `sell_order_seats(order_id) -> boolean` (nội bộ, revoke mọi role): `FOR UPDATE` các dòng seat_state theo `seat_id`,
   insert theo `seat_id` (thứ tự cố định => không deadlock chéo), `ON CONFLICT DO UPDATE ... WHERE order_id = đơn này
   OR (HELD đã hết hạn)`; thiếu ghế nào => subtransaction rollback + `false` (bắt `P0001` và `23514` ghế bị khoá).
3. `confirm_paid` (CREATE OR REPLACE; giữ chữ ký, SECURITY DEFINER, `search_path=''`, grant service_role) gọi
   `sell_order_seats` thay cho upsert ở cả hai nhánh.


## HIGH_RISK_MIGRATION — 20261112060000_prevent_double_sell.sql
- Thao tác rủi ro: backfill `tickets.seat_id` trên dữ liệu cũ, `SET NOT NULL`, `CREATE UNIQUE INDEX` (showtime_id, seat_id) trên dữ liệu cũ, `ALTER TABLE tickets DISABLE/ENABLE TRIGGER tickets_audit`.
- Khoá: ALTER TABLE/CREATE UNIQUE INDEX (không CONCURRENTLY, vì chạy trong transaction migration) giữ khoá mạnh trên `tickets` suốt migration => webhook confirm_paid, check-in, đọc vé bị chặn trong lúc chạy; chạy ở khung giờ thấp tải. Trigger audit chỉ tắt trong cùng transaction nên lỗi thì rollback, không bị tắt vĩnh viễn.
- Không phá dữ liệu: không DROP/DELETE; nếu có >1 vé cùng (showtime_id, seat_id) migration RAISE (23505) và rollback toàn bộ.
- Kiểm tra TRƯỚC trên staging: `select t.showtime_id, os.seat_id from tickets t join order_seats os on os.id = t.order_seat_id group by 1,2 having count(*) > 1;` phải rỗng; xác nhận số dòng tickets và thời gian backfill.
- Verify sau khi áp trên staging: `select count(*) from tickets where seat_id is null` = 0; index tồn tại; `has_function_privilege('authenticated','public.confirm_paid(uuid,integer,text,bigint)','execute')` = false; chạy pgTAP 047; thử 1 luồng đặt vé + thanh toán.
- Rollback: `drop index tickets_one_ticket_per_showtime_seat; drop trigger tickets_fill_seat on tickets; drop function tickets_fill_seat(); alter table tickets drop column seat_id; drop function sell_order_seats(uuid);` và CREATE OR REPLACE lại confirm_paid từ migration 20261111040100 (rồi revoke from public, anon, authenticated để giữ ACL an toàn).

## Quyết định nghiệp vụ: đơn tiền về muộn nhưng ghế đã thuộc đơn khác
Không thêm enum. Dùng trạng thái sẵn có `needs_manual_review` (= cần hoàn tiền thủ công, AC-11): đơn KHÔNG paid, không
vé, `payments.status='PAID'` ghi nhận tiền đã về, email `LATE_PAYMENT_MANUAL_REVIEW` (reason `SEATS_UNAVAILABLE`) cho
khách, trả `{success:false,status:'NEEDS_MANUAL_REVIEW'}`. Giao dịch commit bình thường (không raise) nên webhook
nhận kết quả xác định, PayOS không retry vô hạn. Nhánh holding/pending_payment dùng đường manual review sẵn có của
Defect 1 khi `sell_order_seats` trả false.

## Round 2 (sửa theo review round 1)
- MAJOR-1: migration revoke confirm_paid từ `public, anon, authenticated` (trước đó authenticated có EXECUTE, thừa kế từ default privileges; confirm_paid không kiểm caller => khách đăng nhập tự chốt đơn không trả tiền). sell_order_seats revoke cả public/anon/authenticated/service_role. 047 thêm 6 assert has_function_privilege; đỏ khi cấp lại quyền authenticated (fail test 10), xanh sau revoke. DB local đã áp revoke bằng psql (file migration đã áp trước đó được sửa tại chỗ vì chưa commit/chưa promote).
- MAJOR-2: 047 thêm (a) đơn 2 ghế thiếu 1 ghế => false và không còn dòng dở dang, (b) HELD còn hạn của đơn khác giữ nguyên, (c) HELD hết hạn chiếm được, (d) ghế bị khoá => false, (e) nhánh holding + sell_order_seats=false => NEEDS_MANUAL_REVIEW, không vé, không dòng ghế. 047 = 30 test.
- MAJOR-3: mục HIGH_RISK_MIGRATION ở trên.
- MINOR: dòng trống kép trong migration (312-313, 510-511) chưa bỏ — không ảnh hưởng ngữ nghĩa. `database.types.ts` `tickets.Insert.seat_id` vẫn bắt buộc vì generator suy từ NOT NULL không default (trigger điền); không dùng được default vì cần NOT NULL. Chưa có code TS insert tickets, ghi nhận cho layer 5.

## Repro Verification
- Original repro: 2 đơn `expired` cùng ghế A1, `confirm_paid` đồng thời (phiên A giữ txn ~2s, phiên B bắt đầu sau 0.7s).
- Expected: đúng 1 đơn paid, 1 vé, đơn còn lại `needs_manual_review`.
- Actual before fix (pgTAP `047_double_sell.test.sql`, chạy TRƯỚC khi áp migration): FAIL 5/13 —
  paid=2 (want 1), tickets=2 (want 1), kết quả `SUCCESS,SUCCESS` (want `SUCCESS,NEEDS_MANUAL_REVIEW`), thiếu unique index,
  insert vé thứ 2 cùng ghế không bị chặn.
- Actual after fix: 047 = 13/13 PASS (round 1); round 2 = 30/30 PASS.
- Evidence: `npx supabase test db` toàn bộ 16 file / 622 test PASS (round 2; trước task: 14 file / 566 + 046). `pnpm test`, `pnpm lint`,
  `pnpm typecheck` PASS. Test đồng thời thật dùng dblink (2 phiên, dữ liệu commit thật, tự dọn trước/sau; DB sau test:
  orders=0, cinemas=0, không còn audit rác).
- Status: PASS

## Ghi chú test dblink
`dblink` có sẵn trong image, test tự `create extension if not exists dblink with schema extensions` trong transaction test
(rollback theo). `postgres` ở stack Supabase không phải superuser và pg_hba cho 127.0.0.1 là `trust` (dblink từ chối
non-superuser khi server không đòi mật khẩu), nên test kết nối qua `inet_server_addr()` (IP container, scram) với mật khẩu
mặc định `postgres` của stack local/CI. Nếu CI đổi mật khẩu DB thì phải sửa chuỗi kết nối trong `tap47_run_concurrent`.

## Doc impact
- `docs/ERD.md`: dòng `tickets` thêm `seat_id` + UNIQUE(showtime_id, seat_id) (đã cập nhật).
- `packages/shared/src/database.types.ts`: regen (`tickets.seat_id`, RPC `sell_order_seats`), typecheck PASS.
- `docs/DESIGN.md`: no doc impact (không mô tả luồng tiền về muộn). `docs/API_SPEC.md`: no doc impact (contract webhook/RPC không đổi).

## Residual risk / không làm (MAJOR khác, cùng file)
- `confirm_zero_amount` (dòng 847-850) và `confirm_pos_sale` vẫn dùng đường cũ; nếu có race, unique index vé sẽ làm
  giao dịch fail (không bán trùng nhưng có thể ném lỗi thay vì manual review).
- Cấu hình cutoff đọc sai `value->>0` (`confirm_paid:502`), `pending_payment` không hết hạn, voucher CONSUMED sai ở tiền về
  muộn, race huỷ suất ↔ thanh toán, khoá ghế giữa chừng ở các RPC khác: chưa xử lý.
- `sell_order_seats` bắt cả `23514` (ghế đang khoá) => trả manual review thay vì rollback webhook (hiệu ứng phụ có chủ đích).
- Hàm RPC khác cùng họ còn có thể thừa kế EXECUTE cho authenticated (chỉ revoke anon ở migration cũ): record_payment_event, mark_payment_cancelled, confirm_pos_sale... — xử lý ở task riêng, KHÔNG sửa ở đây.
- m1/m2/m4/m5 của review (errcode riêng thay 23514/P0001, FK seat_id, kiểm chồng chéo hai phiên, nhất quán precheck HELD hết hạn) chưa làm.
- Test đồng thời phụ thuộc thời gian (sleep 0.7s/2s) và mật khẩu DB mặc định.
- Tiền của đơn `needs_manual_review` vẫn cần quy trình hoàn tiền thủ công (chưa có tự động hoàn).
