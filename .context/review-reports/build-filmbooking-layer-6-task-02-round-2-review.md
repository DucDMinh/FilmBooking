# Review — build-filmbooking layer-6 task-02 — round 2

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đối soát thanh toán (tiền thật, nhả ghế), cron/pg_net, migration SECURITY DEFINER (thêm RPC mới), secret qua Vault.
- **Blast radius:**
  - `POST /jobs/reconcile`.
  - RPC mới `public.cancel_stale_payment(uuid,text)`. Hàm này gọi lại `mark_payment_cancelled`.
  - `public.call_nest_job(text)`.
  - 2 lịch pg_cron.
  - JobsModule import thêm PaymentModule.
- **Scope diff:** worktree `E:/FilmBooking/.worktrees/layer-6__task-02`, chưa commit, base aff1df1.
  - Sửa (M): `jobs.controller.ts`, `jobs.module.ts`.
  - Mới (??): `reconcile.service.ts`, `test/reconcile.e2e-spec.ts`, `migrations/20261113180000_cron_http_jobs.sql`, `tests/059_cron_http_jobs.test.sql`, `tests/060_cancel_stale_payment.test.sql`.
  - Không có file ngoài scope.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | **PASS**: api 23 files / 428 tests, web 12 / 188, shared 14, scripts 16. Các dòng log ERROR đều do các case lỗi được dựng có chủ đích. |
| `pnpm db:test` | 28/29 file PASS. **059 PASS (9 assert), 060 PASS (14 assert).** 048 FAIL test 2 vì có thêm `has_role(text)` và `resolve_manual_review(...)`. Lỗi này có từ trước, từ migration 20261113170000, nằm ngoài scope. Danh sách thừa **không** có `call_nest_job` hay `cancel_stale_payment`. |
| `pnpm db:migrate` | không chạy. Lệnh không có trong allowlist; builder báo đã reset DB local theo migration mới, và 060 chạy được chứng tỏ RPC mới đã có trong DB. |
| aislop / oxlint / ocr | skip: chưa cấu hình hoặc không có trong allowlist |

## Kiểm lại các finding round 1

### MAJOR-1: ĐÃ ĐÓNG
- `reconcile.service.ts:157-168` giờ gọi `cancel_stale_payment({ p_payment_id })`, không còn huỷ theo đơn.
- RPC (`20261113180000_cron_http_jobs.sql:56-95`) làm theo thứ tự:
  1. Khoá đơn `FOR UPDATE`, rồi khoá payment `FOR UPDATE`. Thứ tự khoá orders → payments khớp với `confirm_paid` và `mark_payment_cancelled`, không tạo vòng deadlock mới.
  2. Kiểm lại dưới khoá rồi trả `SKIPPED` nếu payment không còn PENDING, đơn không ở `pending_payment`, hoặc đã có payment mới hơn theo `(created_at, id)`.
  3. Chỉ khi qua hết các điều kiện trên mới gọi `mark_payment_cancelled`.
- Đơn đã paid giờ trả SKIPPED, không còn raise 23514.
- ACL: chỉ service_role, `search_path=''`.
- Test trên DB thật: pgTAP 060 phủ các case A cũ + B mới → SKIPPED (B, đơn, ghế giữ nguyên); B mới nhất → huỷ và nhả ghế; A sau khi huỷ → PAYMENT_NOT_PENDING; EXPIRED → expired; đơn paid → SKIPPED; payment lạ; ACL anon/authenticated/service_role. Có thêm e2e `MAJOR-1`.

### MAJOR-2: ĐÃ ĐÓNG
- `reconcile.service.ts:100-101` tách 2 query:
  - PENDING: lookback 24h, limit 50, query trước.
  - EXPIRED: chỉ trong cửa sổ 1h, limit 20.
- EXPIRED không còn lấn chỗ của PENDING. Dòng EXPIRED chỉ được hỏi PayOS tối đa khoảng 12 lần. Cửa sổ 1h hợp lý vì link PayOS có `expiredAt = hold_expires_at`.
- e2e có 60 EXPIRED + 1 PENDING → PENDING vẫn được chốt (checked = 21), và 70 PENDING → 50.

### MINOR round 1
- m1: **đã xử lý phần lớn.** Fake DB giờ mô phỏng mức đơn/payment, 23514, SUCCESS/ALREADY_PAID/AMOUNT_MISMATCH, và idempotent theo `transaction_ref`. Logic khoá thật được chứng minh bằng pgTAP 060.
- m2: **đã xử lý.** Fallback giờ là `PAYOS_<orderCode>`, trùng với webhook (`:183`), và có test.
- m3: **đã xử lý.** Đếm tách `paid` / `alreadyPaid` / `needsReview` (`:189-192`).
- m6: **đã xử lý.** 059 có thêm assert `anon` và `/evil`.
- m4, m5: còn tồn, xem bên dưới.

## Findings round 2 (chỉ MINOR)

- **r1. Race hẹp còn lại (builder đã tự nêu).**
  - Trình tự: `createPayment` gọi `cancelPaymentLink(A)` trên PayOS **trước** khi set A=CANCELLED trong DB (`apps/api/src/modules/payment/payment.service.ts:207-219`). Sau đó nó update đơn về `pending_payment` mà không kiểm trạng thái (`:256-259`).
  - Lỗi chỉ xảy ra khi reconcile đọc PayOS thấy CANCELLED **và** khoá đơn trong đúng khoảng của 1 round-trip DB, tức giữa lúc PayOS huỷ xong và lúc lệnh update A chạy. Nếu xảy ra, đơn bị huỷ rồi bị `createPayment` hồi về `pending_payment` mà không còn ghế. Hệ quả này giới hạn ở đúng lượt thanh toán đó: khách trả tiền vào B thì `confirm_paid` gặp `sell_order_seats`. Đây là cùng lớp race có sẵn của `createPayment` với job expire và user-cancel.
  - Xác suất rất thấp (job 5 phút, cửa sổ vài ms), nên tôi xếp MINOR.
  - Đề xuất follow-up (ngoài scope, sửa `payment.service.ts`): set A=CANCELLED trong DB trước khi huỷ trên PayOS, và update đơn có điều kiện `.in("status", ["holding","pending_payment"])`.
- **r2. Đếm sai khi đơn không tồn tại.**
  - Ở `cancel_stale_payment:73-81`, nếu đơn không tồn tại thì `v_order.status` là null, nên `null <> 'pending_payment'` không cho nhánh SKIPPED chạy. Hàm rơi xuống `mark_payment_cancelled`, hàm này trả `ORDER_NOT_FOUND` / `success:false`.
  - Service (`reconcile.service.ts:164-167`) khi đó đếm `cancelled++`. Chỉ sai metric, không làm hỏng dữ liệu. Đề xuất dùng `is distinct from`.
- **r3. Mock chưa có nhánh tiền về muộn chốt được vé.**
  - Fake `confirm_paid` với đơn expired luôn trả `needs_manual_review`. DB thật có thể trả `SUCCESS` + `recovered:true` khi tiền về muộn mà vẫn đủ điều kiện, và service đếm đúng là `paid`. Nhánh này chưa có e2e. Nên thêm.
- **r4. Dòng AMOUNT_MISMATCH vẫn bị hỏi lại.**
  - Payment `AMOUNT_MISMATCH` giữ status PENDING (`confirm_paid` 3.1), nên vẫn bị hỏi lại mỗi 5 phút trong 24h và chiếm 1 trong 50 slot PENDING. Hiếm gặp, không gây starvation thực tế.
- **r5. Tồn từ round 1.**
  - m4: instance `PayOS` riêng nằm song song với `PayosClient`; file list không cho sửa `payos.client.ts`.
  - m5: payment đã CANCELLED trong DB nhưng huỷ link PayOS thất bại thì không được đối soát.
- **Doc impact (cho close-out):**
  - `docs/API_SPEC.md`: thêm `POST /jobs/reconcile` (shape `ReconcileJobResult`).
  - Tài liệu RPC/ERD: thêm `cancel_stale_payment` và `call_nest_job`, cùng ghi chú setup Vault (`api_base_url`, `job_secret`).

## Verdict

**STRICT PASS.** Cả 2 MAJOR của round 1 đã đóng, có bằng chứng trên DB thật (pgTAP 060) và e2e. Không có regression: toàn bộ test api/web/shared xanh, db:test chỉ fail 048 có sẵn ngoài scope. Còn 5 MINOR (r1–r5); r1 nên mở follow-up cho `createPayment`.
