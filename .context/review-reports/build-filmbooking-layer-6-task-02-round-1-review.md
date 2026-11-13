# Review — build-filmbooking layer-6 task-02 — round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đối soát thanh toán (tiền thật, nhả ghế), cron/pg_net, migration SECURITY DEFINER, secret qua Vault.
- **Blast radius:** `POST /jobs/reconcile` (đổi trạng thái order/payment/seat qua `confirm_paid` + `mark_payment_cancelled`), lịch pg_cron gọi `/jobs/send-emails` mỗi phút + `/jobs/reconcile` mỗi 5 phút, hàm `public.call_nest_job(text)`. JobsModule giờ import PaymentModule.
- **Scope diff** (worktree `E:/FilmBooking/.worktrees/layer-6__task-02`, chưa commit, base aff1df1): M `apps/api/src/modules/jobs/jobs.controller.ts`, M `jobs.module.ts`, ?? `reconcile.service.ts`, ?? `apps/api/test/reconcile.e2e-spec.ts`, ?? `supabase/migrations/20261113180000_cron_http_jobs.sql`, ?? `supabase/tests/059_cron_http_jobs.test.sql`. Tất cả nằm trong scope (migration đổi tên theo chỉ đạo; pgTAP 059 là file bổ sung hợp lý).
- **Vị trí report:** agent-guard chặn ghi vào `<worktree>/.context/review-reports/`, nên report được ghi tại `E:/FilmBooking/.context/review-reports/`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm --filter @filmbooking/api test` | **Blocked** bởi agent-guard (không có trong allowlist) |
| `pnpm test` | FAIL do môi trường: 7 suite không liên quan (admin, auth-ext, cancellation, catalog, cinema-ops, identity, profile) bị timeout ở `beforeAll` (10s); import chiếm 79% thời gian do web + api chạy song song. 246 passed / 176 skipped / 0 assertion fail. Suite reconcile có chạy (log `Reconcile failed for orderCode=1008: PayOS timeout` là case cố ý). Không do task gây ra, nhưng chưa có một lượt chạy api xanh hoàn toàn. Đây là residual risk. |
| `pnpm db:migrate` | **Blocked** bởi agent-guard (không có trong allowlist) |
| `pnpm db:test` | 27/28 file PASS; **059 PASS (7/7)**. 048_function_privileges FAIL test 2, record thừa là `has_role(text)` + `resolve_manual_review(...)` (từ migration 20261113170000), **không có call_nest_job**. Lỗi này có sẵn, ngoài scope. |
| aislop / oxlint / ocr | skip (chưa cấu hình hoặc không có trong allowlist) |

**Residual risk:** `db:migrate` bị chặn nên 059 chạy trên migration mà builder đã apply từ trước. Nếu builder sửa file sau khi apply thì DB có thể lệch so với file. Tôi đã đọc file SQL bằng tay và xác nhận ACL, regex, cách xử lý vault, schedule idempotent đều đúng.

## Điểm đúng (đối chiếu DB thật)

- Race webhook với reconcile ở nhánh PAID: cả hai đều đi `handleWebhook` → `record_payment_event` (`on conflict (transaction_ref) do nothing`) → `confirm_paid` (khoá `FOR UPDATE` trên đơn → `ALREADY_PAID`; vé chèn có guard `not exists`; email chỉ enqueue ở nhánh SUCCESS). Kết quả đúng 1 vé.
- Tiền về muộn trên payment EXPIRED: `confirm_paid` xử lý đúng (chốt bán nếu đủ điều kiện, ngược lại chuyển `needs_manual_review` + payment PAID). Có truyền `p_order_code` nên chọn đúng dòng payment (K5-1).
- `call_nest_job`: SECURITY DEFINER, `search_path=''`, regex `^/jobs/[a-z-]+$`, revoke public/anon/authenticated, grant service_role. Thiếu vault thì raise warning và trả null; `exception when others` nên cron không crash. Không có URL/secret literal. `unschedule` + `schedule` idempotent, timeout 60s.
- Có batch limit 50, grace 2 phút, lookback 24h. Lỗi ở 1 payment không làm hỏng cả batch.

## Findings

### MAJOR-1: nhánh CANCELLED/EXPIRED huỷ cả ĐƠN dựa trên snapshot payment đã cũ, nên payment mới của cùng đơn cũng bị huỷ (lỗi cùng lớp với K5-1)
- `reconcile.service.ts:90-98` đọc danh sách payment PENDING một lần. `:120` gọi PayOS tuần tự, tối đa 50 lần. `:145-150` gọi `mark_payment_cancelled({ p_order_id })`.
- `mark_payment_cancelled` (`supabase/migrations/20261111040100_rpc_payment.sql:728-761`) làm việc ở **mức đơn**: xoá mọi seat state, set **mọi** payment PENDING của đơn thành CANCELLED/EXPIRED, set đơn cancelled/expired. Hàm không biết payment nào đã kích hoạt việc huỷ.
- Cách tái hiện:
  1. Payment A PENDING (đã quá 2 phút) nằm trong batch.
  2. Khách bấm thanh toán lại. `createPayment` (`apps/api/src/modules/payment/payment.service.ts:207-220`) gọi `cancelPaymentLink(A)` trên PayOS **trước**, sau đó mới set A=CANCELLED trong DB, insert B PENDING và set đơn `pending_payment` (`:240-259`).
  3. Reconcile hỏi PayOS cho A, nhận `CANCELLED`, gọi `mark_payment_cancelled(order)`.
  4. Kết quả: đơn bị huỷ, ghế bị nhả, B (link khách đang trả) cũng thành CANCELLED. Tuỳ thứ tự xen kẽ, `createPayment` có thể đưa đơn đã huỷ (không còn ghế) về `pending_payment`, hoặc tiền khách trả vào B rơi vào manual review.
- Yêu cầu sửa: phải kiểm lại **dưới khoá** rằng chính payment này vẫn PENDING và là payment mới nhất của đơn. Ví dụ dùng RPC/biến thể nhận `p_payment_id`, khoá dòng payment và bỏ qua nếu payment không còn PENDING hoặc đã có payment mới hơn. Kèm test cho đơn có 2 payment (nên có pgTAP).

### MAJOR-2: batch bị starvation vì payment EXPIRED dùng chung query, sắp xếp cũ trước, limit 50
- `reconcile.service.ts:94-98` dùng `.in("status", ["PENDING","EXPIRED"])` + `.order("created_at", { ascending: true })` + `.limit(50)`.
- Job expire (`20261112140000_hold_seats_hardening.sql:298`, `20261112100000_order_lifecycle_pending_payment.sql:346,623`) set payment EXPIRED cho **mọi đơn bỏ dở**. Các dòng này không bao giờ rời tập ứng viên trong 24h: nhánh `:140-143` chỉ skip, không đánh dấu đã kiểm.
- Hệ quả: khi có ≥50 đơn bỏ dở trong 24h, mỗi lượt chạy chỉ hỏi lại 50 dòng EXPIRED cũ nhất. Payment **PENDING bị lỡ webhook** (mục tiêu chính của R-78/AC-11) không được kiểm tới. Mỗi dòng EXPIRED còn bị gọi PayOS khoảng 288 lần.
- Payment `AMOUNT_MISMATCH` bị cùng vấn đề: `confirm_paid` bước 3.1 (`20261113160000_confirm_paid_order_code_lookup.sql:115-120`) không đổi status payment, nên dòng đó bị đối soát lại mỗi 5 phút trong 24h và lần nào cũng `paid++`.
- Yêu cầu sửa: ưu tiên PENDING (query riêng hoặc sort PENDING lên trước), và/hoặc thêm `reconciled_at`/cursor để không quét lại dòng đã kiểm. Kèm test với số dòng lớn hơn BATCH_LIMIT.

### MINOR
- **m1** False-confidence mock ở `apps/api/test/reconcile.e2e-spec.ts:82-94`:
  - `confirm_paid` giả trả `status:"PAID"`, trong khi DB thật trả `SUCCESS` / `ALREADY_PAID` / `NEEDS_MANUAL_REVIEW` / `AMOUNT_MISMATCH`.
  - `mark_payment_cancelled` giả không raise 23514 khi đơn đã paid và không huỷ mọi payment PENDING của đơn, nên MAJOR-1 không thể lộ ra.
  - Test "chạy lại vẫn 1 vé" chỉ chứng minh mock idempotent.
  - Không có test cho race webhook/reconcile hoặc đơn nhiều payment.
- **m2** `reconcile.service.ts:130` fallback `PAYOS_RECON_<code>` khác fallback của webhook `PAYOS_<code>` (`payment.service.ts:389`). Khi PayOS không trả reference, cùng một giao dịch có thể sinh 2 payment_event.
- **m3** `reconcile.service.ts:134-135`: `success:true` được trả cho cả `NEEDS_MANUAL_REVIEW` / `AMOUNT_MISMATCH` / `ALREADY_PAID`, nên `paid++` đếm sai.
- **m4** `reconcile.service.ts:31-60` tạo thêm một instance `PayOS` song song với `PayosClient` (`payos.client.ts:36`), lặp cấu hình. Chấp nhận được vì file list không cho sửa `payos.client.ts`.
- **m5** Payment CANCELLED trong DB mà huỷ link PayOS thất bại (`payment.service.ts:208-219` vẫn set CANCELLED) thì không bao giờ được đối soát. Nếu khách vẫn trả qua link đó và webhook lỡ, tiền không được phát hiện.
- **m6** pgTAP 059 thiếu assert `anon` không có quyền execute, và thiếu assert path không hợp lệ trả null.

## Verdict

**FAIL** (STRICT), do 2 MAJOR. Builder cần sửa MAJOR-1 và MAJOR-2 kèm test chứng minh, và nên xử lý m1, m2, m3.
