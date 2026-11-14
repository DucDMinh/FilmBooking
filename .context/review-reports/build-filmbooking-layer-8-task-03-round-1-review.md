# Review — build-filmbooking layer-8 task-03 (round 1)

Agent: reviewer
Task: `tasks/build-filmbooking/layer-8-task-03.md`: test webhook PayOS (AC-09, AC-10, AC-11 + đối soát)
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-03` (branch `wt/layer-8__task-03`, chưa commit)

## Review level
**STRICT**

## Reason
Thuộc nhóm risk đỏ: payment, webhook công khai, chữ ký HMAC, cron/job đối soát. Test chạy trên Supabase local mà 3 builder khác đang dùng chung.

## Blast radius
- Diff gồm 1 file test mới `apps/api/test/integration/payos-webhook.int-spec.ts` (317 dòng, 6 test) và phần đánh dấu AC `[x]` trong task file. Không đụng source, migration hay helper dùng chung. Phạm vi khớp đúng "Files to Create/Modify".
- Tác động lúc chạy lên DB dùng chung:
  - Test gọi RPC `expire_overdue_holds()` trên toàn DB.
  - Test gọi `/jobs/reconcile`, job này quét PENDING/EXPIRED của toàn DB. Lookup đã bị override nên mọi payment ngoài scope của test đều bị `skipped`.
  - Sau cleanup còn sót các dòng `email_outbox`, `payment_events`, `audit_logs`, vì FK là `set null` và `cleanupScope` không xoá các bảng này.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` (worktree) | PASS (shared/api/web) |
| `pnpm typecheck` (worktree) | PASS (shared/api/web) |
| `pnpm --filter @filmbooking/api test:int payos-webhook` (×2) | **Blocked**: agent-guard chặn vì lệnh không có trong allowlist `check_commands` của `.context/project-config.md`. Tôi không thử biến thể khác. Hiện chỉ có evidence của builder (journal: 6/6 ×3). **Dispatcher bắt buộc chạy `pnpm --filter @filmbooking/api test:int` ở bước verify sau merge**, như kế hoạch trong journal đã ghi. |
| aislop / oxlint / ocr | skip: diff chỉ có test, oxlint chưa cấu hình, ocr chưa cài |

## Đối chiếu chéo với source/DB thật (tóm tắt)
- **HMAC** (`payos-webhook.int-spec.ts:21-27`) được viết lại độc lập, không gọi `PayosClient.computeSignature`. Cách ký khớp `payos.client.ts:51-58` và khớp scheme flat của PayOS: sort key, ghép `k=v&`, null thành rỗng, HMAC-SHA256 hex. Có 2 ca sai:
  - Ký bằng key sai.
  - Ký đúng rồi sửa `amount`. Ca này chứng minh chữ ký phủ cả payload.

  Assert `message: "Invalid signature"` khẳng định request đi đúng nhánh verify (`webhook.controller.ts:48-51`), không rơi vào nhánh envelope invalid. Test cũng assert log warn có orderCode qua spy `Logger.prototype.warn`, khớp với `webhook.controller.ts:50`.
- **AC-09:** test kiểm order vẫn `pending_payment`, payment `PENDING`, 0 vé, 0 `payment_events`, 0 outbox. Đủ.
- **AC-10:** `Promise.all` gửi 3 request HTTP thật vào cùng app, nên đồng thời thật ở tầng HTTP. Việc tuần tự hoá nằm ở `confirm_paid`: khoá `showtimes FOR SHARE` rồi `orders FOR UPDATE`, sau đó nhánh idempotent `ALREADY_PAID` (`20261113160000_confirm_paid_order_code_lookup.sql:39-65`). `record_payment_event` có `on conflict (transaction_ref) do nothing` (`20261111040100_rpc_payment.sql:136`). Test kiểm đủ: 1 payment PAID, 1 vé, outbox đúng `["TICKET_ISSUED"]`, 1 `payment_event`, đơn paid có booking_code, và gửi thêm 1 webhook muộn để chắc không sinh thêm gì.
- **Tiền về muộn, ghế còn trống:** đơn đi qua job expire thật, suất cách 48h nên không dính cutoff. Đơn được paid, có 2 vé, 1 email vé, payment PAID. Khớp nhánh `v_is_late` + `sell_order_seats` của RPC.
- **AC-11:** test cho người khác mua đúng ghế đó và paid, rồi webhook muộn tới. Kết quả kiểm: `needs_manual_review`, 0 vé, outbox `["LATE_PAYMENT_MANUAL_REVIEW"]` gửi tới email khách, vé của người mua sau không bị ảnh hưởng, webhook lặp không sinh email (nhánh 2b của RPC). Về hiển thị: Admin thấy, Manager của rạp thấy, Manager rạp khác bị 403 (`orders.service.ts:212-216`). Đủ AC.
- **Lệch tiền:** kiểm `needs_manual_review`, 0 vé, outbox `["AMOUNT_MISMATCH_MANUAL_REVIEW"]`.
- **Đối soát:** không có secret thì 401 (`job-secret.guard.ts`). Có secret thì đơn về paid với 1 vé và 1 email. Gọi lại lần 2 và gửi webhook muộn cùng reference thì không nhân đôi vé, email hay payment. Override `PayosPaymentLookup` là đúng biên HTTP, vì đây là provider tách riêng để mock (`reconcile.service.ts:37-68`), nên không che logic thật nào.

## Findings
Không có CRITICAL hay MAJOR.

**MINOR**
1. **Cleanup sót dữ liệu** (`payos-webhook.int-spec.ts:79-83`): `cleanupScope` không xoá `email_outbox` (các dòng PENDING `TICKET_ISSUED` / `*_MANUAL_REVIEW`), `payment_events` (`IT-TX-<runId>-*`, `IT-RECON-*`) và `audit_logs`. Tôi đã kiểm các spec song song: task-01 và task-02 không đếm các bảng này. Task-04 thì lọc outbox theo `to_email`/`id` của scope riêng, có `drainOutbox` lặp tới 20×100 (`layer-8__task-04/.../helpers/app-harness.ts:64-72`) và tự xoá outbox của nó. Vì vậy dữ liệu sót **không làm hỏng test khác**, chỉ để lại rác. Gợi ý cho builder: trong `afterAll`, xoá `email_outbox` theo `to_email like '${scope.prefix}%'` (task-04 đang làm vậy) và `payment_events` theo `transaction_ref like 'IT-%-${scope.runId}-%'`. Không bắt buộc.
2. **AC-11 chưa chốt lý do** (`:241-245`): test không assert `payload->>reason = 'SEATS_UNAVAILABLE'` và cũng không assert payment của đơn muộn đã thành `PAID`. Nhánh được xác định gián tiếp: suất cách 48h, đang ON_SALE, ghế đã có người paid, nên chỉ có thể là ghế bị chiếm. Assert thêm sẽ chặt hơn.
3. **Lệch tiền** (`:269-280`): test không assert trạng thái/amount của payment. Có một ghi chú về source (ngoài scope task này, có thể đưa vào gap register): nhánh mismatch của `confirm_paid` (`20261113160000_...sql:115-120`) để payment ở `PENDING` với amount bị ghi đè, nên reconcile sẽ hỏi lại PayOS trong 24h. Việc này vô hại nhờ nhánh 2b không ghi thêm gì.
4. **Không có bằng chứng các request AC-10 thật sự chồng lấn ở DB** (`:188`). `Promise.all` qua HTTP in-process là cách tiêu chuẩn và chấp nhận được.
5. **`vi.spyOn(Logger.prototype, "warn")` đặt ở thân `describe`** (`:46`): spy vẫn được tạo khi suite bị `skipIf`, và khi đó `mockRestore` không chạy. Vitest cô lập theo file nên vô hại.

**Đánh giá 2 residual builder nêu**
- **`expire_overdue_holds` toàn DB** (`:154`): RPC này chỉ đụng đơn và ghế HELD đã quá hạn, đúng như pg_cron `expire-overdue-holds` vẫn chạy mỗi phút (`20261111040000_rpc_hold.sql:770`). Grep các spec song song không thấy spec nào cố ý giữ đơn quá hạn ở trạng thái pending. **Không chặn.**
- **Reconcile chỉ lấy 50 PENDING cũ nhất** (`reconcile.service.ts:32,100`): test lùi `created_at` về now−23h, nên payment của test nằm trong nhóm cũ nhất của cửa sổ 24h. Chỉ fragile khi có hơn 50 payment PENDING sót lại trong khoảng [now−24h, now−23h]. Payment ngoài `payosLedger` trả `null` và bị `skipped`, không bị sửa (`reconcile.service.ts:141-144`). Ngoài ra assert `first.body.paid >= 1` được bù bằng việc kiểm trực tiếp trạng thái đơn. **MINOR, chấp nhận.**

## AI-readable gate
Tên hàm helper rõ ràng (`bookPendingOrder`, `expireOrder`, `webhookBody`, `outboxKinds`). Không hàm nào quá 50 dòng, không có magic number lạ (`SEAT_PRICE`, `23 * 3_600_000` có comment giải thích). Comment viết theo kiểu WHY. 0 indicator.

## Verdict
**STRICT PASS**, kèm điều kiện vận hành: dispatcher phải chạy `pnpm --filter @filmbooking/api test:int` ở bước verify tổng sau merge, vì reviewer bị chặn không tự chạy được int-test.
