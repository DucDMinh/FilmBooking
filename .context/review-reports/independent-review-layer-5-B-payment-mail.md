# Review độc lập Layer 5 — Nhóm B: task-02 (PayOS payment) + task-03 (Mail/outbox/jobs)

Agent: reviewer
Ngày: 2026-11-13 · Branch `staging` · Commit review: `7ca4fe9` (payment), `e6ce746` (mail/jobs)

## Review level
**STRICT**

## Reason
Thanh toán/tiền thật (payment, webhook public, idempotency), DB RPC cross-boundary (`confirm_paid`, `mark_payment_cancelled`, `confirm_zero_amount`, `record_payment_event`), job endpoint có secret, background worker email, API contract mới dùng bởi web.

## Blast radius
- `POST /bookings/:id/payment`, `GET /bookings/:id/payment-status`, `POST /bookings/:id/payment/cancel`, `POST /payos/webhook`, `POST /jobs/send-emails`.
- Bảng `orders`, `payments`, `payment_events`, `email_outbox`, `tickets`, `showtime_seat_states`, `voucher_redemptions` (qua RPC).
- Mọi email giao dịch (vé, tiền về muộn, huỷ suất, khoá đăng nhập, MXH, các kind của IdentityModule).
- Lưu ý: `PaymentModule`/`JobsModule` CHƯA được import vào `apps/api/src/app.module.ts` (theo plan, wiring ở layer-6-task-01) → endpoint chưa sống ở runtime; không tính là lỗi của task này, nhưng mọi lỗi dưới đây sẽ lộ ngay khi wiring.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @filmbooking/api exec vitest run test/webhook.e2e-spec.ts test/outbox-job.e2e-spec.ts` | **Blocked** — hook `agent-guard` chặn (không nằm trong allowlist). Không thử biến thể khác. |
| `git -C E:/FilmBooking show --stat 7ca4fe9 e6ce746` | OK (dùng để xác định phạm vi file) |
| typecheck / lint / test toàn repo | Không chạy (session chính tự chạy theo brief) |
| aislop / oxlint / ocr | skip — không nằm trong allowlist reviewer / không cấu hình |

Không có kết quả test nào được tôi tự chạy; mọi kết luận dưới đây dựa trên đọc code + đối chiếu migration thật.

---

## Findings — task-02 (Payment / PayOS)

### C1 — CRITICAL — Thanh toán lại cùng đơn → webhook của link mới có thể không bao giờ chốt được, nhưng vẫn trả `success:true` (nghi ngờ mạnh; logic SQL đã xác minh bằng đọc, chưa repro trên DB thật)
- `apps/api/src/modules/payment/payment.service.ts:164-178` + `:198-208`: khi đơn đã `pending_payment` mà khách bấm thanh toán lại, service đánh dấu payment cũ `CANCELLED` rồi **insert thêm một dòng `payments` mới** cho cùng `order_id` (bảng cho phép nhiều dòng/đơn — `supabase/migrations/20261111030100_booking_tables.sql:172-185`, chỉ `order_code` UNIQUE).
- `supabase/migrations/20261112110000_confirm_paid_hardening.sql:117`: `select * into v_payment from public.payments where order_id = v_order.id for update;` — không lọc theo `p_order_code`, không ORDER BY → lấy một dòng bất kỳ (thực tế theo index `payments_order_id_idx` thường là dòng cũ, tức dòng `CANCELLED`).
- Sau đó `:283-288` (và `:123-127` ở nhánh lệch tiền, `:346-351` nhánh manual review): `update payments set ..., order_code = coalesce(p_order_code, order_code) where id = v_payment.id` → gán `order_code` của link mới vào dòng cũ trong khi dòng mới đang giữ đúng mã đó → **23505 unique `payments.order_code`** → toàn bộ `confirm_paid` rollback.
- `payment.service.ts:378-383` trả `{ success:false }` nhưng `webhook.controller.ts:53-54` bỏ qua kết quả và trả `200 { success: true }` → PayOS ngừng retry. Hậu quả: khách đã trả tiền, đơn không `paid`, không vé, không manual review; đơn hết hạn bởi job. Job đối soát layer-6 cũng gọi lại `confirm_paid` → lỗi y hệt.
- Tái hiện (DB thật): giữ ghế → `POST /bookings/:id/payment` hai lần → bắn webhook hợp lệ cho `orderCode` của lần 2 → quan sát lỗi 23505 trong log, đơn vẫn `pending_payment`, response webhook 200 `success:true`.
- Đề xuất: (a) API: không tạo dòng payment thứ hai cho cùng đơn — tái dùng link/payment `PENDING` còn hạn (hoặc cập nhật in-place dòng hiện có); (b) DB (migration mới): `confirm_paid` chọn payment theo `order_code = p_order_code` trước, fallback theo `order_id`; (c) webhook: lỗi RPC thật phải trả non-2xx (để PayOS retry) hoặc tối thiểu log ERROR + đưa vào hàng đối soát — không được trả `success:true`.

### M1 — MAJOR — Webhook nuốt lỗi thật thành "thành công" (đã xác minh)
- `webhook.controller.ts:53-54`: `await this.paymentService.handleWebhook(verifiedData); return { success: true };` — bỏ qua `success:false` từ `handleWebhook`.
- `payment.service.ts:356-365`: kết quả `record_payment_event` không kiểm `error` (ví dụ DB timeout → mất bản ghi `payment_events`, vẫn đi tiếp).
- `payment.service.ts:346-351`: lỗi đọc `payments` không kiểm → `payment = null` → bỏ qua `confirm_paid`, trả `success:true` cho một giao dịch PAID hợp lệ.
- Đề xuất: phân biệt kết quả nghiệp vụ xác định (`ALREADY_PAID`, `NEEDS_MANUAL_REVIEW`, `AMOUNT_MISMATCH` → 2xx) với lỗi hạ tầng/RPC error (→ 5xx để PayOS retry, hoặc 2xx + ghi `payment_events` trạng thái lỗi + log ERROR). Thêm test e2e cho nhánh `confirmErr`.

### M2 — MAJOR — SPEC #10 "tạo đơn mới khi đơn cũ pending → huỷ link cũ" không có tác dụng; test dựng trạng thái DB không thể tồn tại (đã xác minh)
- `supabase/migrations/20261112100000_order_lifecycle_pending_payment.sql:49-50`: unique index `orders_one_active_hold_per_user_key` — mỗi user chỉ có MỘT đơn `holding`/`pending_payment`.
- `supabase/migrations/20261112140000_hold_seats_hardening.sql:250-265`: `hold_seats` §3.13 đã tự huỷ đơn `pending_payment` cũ (payment → `CANCELLED`) khi khách giữ ghế mới — **không gọi PayOS huỷ link**.
- `payment.service.ts:137-161` truy vấn "đơn khác của user đang `pending_payment`" → luôn rỗng ở DB thật → link PayOS của đơn cũ vẫn sống, khách vẫn trả được → tiền về muộn trên đơn đã huỷ (có thể "recovered" bán lại ghế cũ, hoặc manual review) song song với đơn mới.
- `apps/api/test/webhook.e2e-spec.ts:59-72` + `:115-128`: fixture cho cùng `USER_CUSTOMER` vừa `holding` vừa `pending_payment` — vi phạm unique index → test "huỷ đơn cũ pending (#10)" (`:475-506`) là **false-confidence**.
- Đề xuất: khi `createPayment` (hoặc ở luồng giữ ghế của orders API), tìm các `payments` của user có `status='CANCELLED'`/`PENDING` thuộc đơn vừa bị `hold_seats` huỷ mà link chưa được huỷ trên PayOS và gọi `cancelPaymentLink`; cần cột/cờ đánh dấu đã huỷ link. Sửa fixture test theo đúng ràng buộc DB.

### M3 — MAJOR — PayOS fail-open ở production (đã xác minh)
- `apps/api/src/modules/payment/payos.client.ts:64-84`: thiếu credential ở BẤT KỲ `NODE_ENV` nào (kể cả `production`) → trả checkout URL giả `https://pay.payos.vn/web/<orderCode>` chỉ với log WARN; service vẫn ghi `payments` + chuyển đơn `pending_payment`.
- `apps/api/src/config/env.ts:20-23,39-41`: `PAYOS_*` vẫn optional; comment ghi "task sở hữu module đó siết thành required" nhưng task-02 không siết.
- Đề xuất: `superRefine` bắt buộc `PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY` khi `NODE_ENV=production`; `createPaymentLink` ném lỗi khi chưa cấu hình ngoài `test` (dev có thể bật mock bằng cờ rõ ràng).

### M4 — MAJOR — Có thể tồn tại nhiều link PayOS sống cho cùng một đơn → thu tiền hai lần mà không ai biết (đã xác minh luồng code; chưa chạy)
- `payment.service.ts:171-178`: kết quả `cancelPaymentLink` (trả `false` khi PayOS lỗi — `payos.client.ts:92-98`) bị bỏ qua, DB vẫn đánh `CANCELLED`. Hai request `createPayment` đồng thời cũng đều tạo link mới (không khoá/không điều kiện).
- Khách trả cả hai link → webhook thứ hai vào `confirm_paid` nhánh `ALREADY_PAID` (`confirm_paid_hardening.sql:80-87`) → không manual review, không email, chỉ có dòng `payment_events`.
- Đề xuất: trong `handleWebhook`, nếu payment theo `orderCode` đang `CANCELLED`/khác payment đã PAID của đơn mà đơn đã `paid` → ghi sự kiện "DUPLICATE_PAYMENT" + đưa vào hàng đối soát/manual; huỷ link thất bại thì không tạo link mới (trả lỗi) hoặc retry; tuần tự hoá `createPayment` theo đơn (ví dụ update có điều kiện trên `orders`).

### MINOR (task-02)
- `payos.client.ts:115` so sánh chữ ký bằng `!==` (không hằng thời gian); thuật toán tự viết (`:51-58`) lệch SDK ở chuỗi `"null"`/`"undefined"` và giá trị mảng/object. Dùng `payOS.webhooks.verify` hoặc `timingSafeEqual` trên buffer hex.
- `packages/shared/src/schemas/payment.ts:18-23` + `payment.service.ts:184-186`: `returnUrl`/`cancelUrl` client gửi được chấp nhận bất kỳ URL → open redirect qua trang PayOS. Giới hạn theo `WEB_ORIGIN`.
- `payment.service.ts:269-271`: `affected`/`refunded_manual`/`exchanged` rơi vào `default → AWAITING_PAYMENT` → màn polling quay mãi.
- `payment.service.ts:214-218`: cập nhật `orders.status='pending_payment'` không điều kiện và không kiểm `error` (guard trigger chặn `expired → pending_payment` thì im lặng trả link sống cho đơn đã hết hạn). `:198-212`: insert payment SAU khi tạo link PayOS; lỗi (vd 23505) ném PostgrestError thô → 500 và link mồ côi.
- `payment.service.ts:301-327`: huỷ đơn `needs_manual_review` → `mark_payment_cancelled` đụng guard `orders_guard_transition` (`20261112150000_cancel_showtimes_hardening.sql:29-37`) → 23514 → `throw cancelErr` thô → `AllExceptionsFilter` trả 500. Nên trả 409 rõ ràng; `expired` hiện trả `CANCELLED` sai trạng thái.
- `payment.service.ts:338`: fallback `reference = PAYOS_${orderCode}_${Date.now()}` không tất định → mất idempotency `payment_events` nếu PayOS không gửi `reference`. Dùng khoá tất định (orderCode + paymentLinkId) hoặc từ chối.
- `payment.service.ts:385-387`: log "confirm_paid success" cả với `NEEDS_MANUAL_REVIEW`/`AMOUNT_MISMATCH` — nên WARN theo `status`.
- `payos.client.ts:36-40`: không đặt timeout cho SDK PayOS; lỗi mạng ở `createPaymentLink` ném thẳng → 500 chung.
- `payment.service.ts:21-30`: `ConsentRequiredException` hack `Object.defineProperty(this,"status")` — nên dùng cơ chế map status chuẩn của `AppException`.
- `docs/API_SPEC.md`: chưa bổ sung nhóm endpoint Payment/Webhook/Jobs (doc impact chưa reconcile).
- Test `webhook.e2e-spec.ts`: mock `confirm_paid` bỏ qua `p_amount` (không có test lệch tiền), nhánh AC-11 bị hard-code theo id đơn (`:218`) thay vì logic ghế; idempotent trả `SUCCESS` thay vì `ALREADY_PAID` như DB thật; không test thiếu `PAYOS_CHECKSUM_KEY`, không test `confirmErr`; test chữ ký hợp lệ dùng chính `computeSignature` (vòng tròn — không có test vector PayOS thật). Nhánh "chữ ký sai" và "không phải chủ đơn → 403" thì có chạy thật qua controller.

### Điểm đạt (task-02)
- Chữ ký kiểm TRƯỚC mọi truy cập DB; thiếu checksum key → từ chối (fail-closed).
- Số tiền đối chiếu do DB (`confirm_paid` so `p_amount` với `orders.total_amount`), `order_id` lấy từ server theo `orderCode`; không tin trạng thái từ returnUrl/client.
- BOLA: cả 3 endpoint kiểm `order.user_id === user.id`. Đơn có tiền không đi được `confirm_zero_amount` (service chỉ gọi khi `total_amount === 0`, DB raise 23514 nếu >0).
- Tham số RPC khớp chữ ký hiện tại (`confirm_paid(uuid,int,text,bigint)`, `record_payment_event(...8 args)`, `mark_payment_cancelled(uuid,text)`, `confirm_zero_amount(uuid)`).
- Không lưu/log dữ liệu thẻ; `payment_events` không lưu raw payload.

---

## Findings — task-03 (Mail / outbox / jobs)

### M5 — MAJOR — Email vé thật KHÔNG có QR, địa chỉ rạp, danh sách ghế (đã xác minh)
- Payload `TICKET_ISSUED` do DB enqueue: `supabase/migrations/20261112110000_confirm_paid_hardening.sql:321-330` và `20261112120000_zero_amount_sell_hardening.sql:162-171` chỉ có `order_id, booking_code, cinema_id, cinema_name, movie_title, room_name, showtime_starts_at, total_amount` — không có `qr_token`, `cinema_address`, `seats`.
- Worker chuyển nguyên payload vào template (`apps/api/src/modules/jobs/jobs.controller.ts:105-109`); template chỉ render khối QR khi có `qr_token` (`apps/api/src/modules/mail/templates.ts:98,124-128`) và địa chỉ khi có `cinema_address` (`:100,132`).
- Test đưa sẵn `qr_token`/`seats` vào fixture (`apps/api/test/outbox-job.e2e-spec.ts:236-245`) → false-confidence. AC "QR là qr_token" và mô tả "vé (mã đặt vé + QR + rạp/địa chỉ …)" không đạt trên dữ liệu thật.
- Đề xuất: với `TICKET_ISSUED`, worker nạp bổ sung bằng service role theo `payload.order_id`: `tickets.qr_token` + nhãn ghế (`order_seats`/`seats`) + `cinemas.address`/hotline; hoặc migration mới bổ sung payload. Sửa test để dùng payload đúng như DB enqueue.

### M6 — MAJOR — Kind đang được enqueue nhưng không có template → email dump JSON thô, flow xác thực email không dùng được (đã xác minh)
- `apps/api/src/modules/identity/identity.service.ts:136,194,218` enqueue `password_set`, `oauth_missing_email_collision`, `oauth_missing_email_verify` (có từ trước task-03).
- `templates.ts:362-369` (default): gửi `JSON.stringify(payload)` cho khách — lộ `user_id` nội bộ, `token` xác thực dạng text, KHÔNG có link xác thực → khách Facebook-thiếu-email không hoàn tất được đăng ký.
- Đề xuất: thêm template cho 3 kind (link xác thực dựng từ `WEB_ORIGIN` + token); default KHÔNG dump payload — đánh `FAILED` với `last_error='UNKNOWN_KIND'` để vận hành thấy.

### MINOR (task-03)
- `jobs.controller.ts:44-52`: gọi RPC `claim_email_outbox_batch` KHÔNG tồn tại (không có trong `supabase/migrations/*`, không có trong `database.types.ts`) → mỗi lần chạy thêm 1 round-trip lỗi; comment "SKIP LOCKED" gây hiểu nhầm. Claim thực tế bằng UPDATE có điều kiện (`:86-94`) — đúng ở Postgres (re-check predicate sau khi chờ khoá dòng) nên không gửi trùng; bỏ code chết hoặc viết RPC thật.
- `jobs.controller.ts:112-120,132-140`: không kiểm `error` khi cập nhật `SENT`/`FAILED` → update hỏng thì email gửi lại sau lease 5'. Ít nhất log ERROR.
- `jobs.controller.ts:174-175`: `batchSize` từ query không chặn (âm/rất lớn). Clamp 1..100.
- `templates.ts:247-249`: mọi lý do khác `AMOUNT_MISMATCH` đều ghi "ghế đã được bán cho khách hàng khác" — sai với `SHOWTIME_NOT_ON_SALE`, `CINEMA_NOT_OPEN`, `ONLINE_CUTOFF_PASSED`, `VOUCHER_EXHAUSTED`.
- `templates.ts:206`: thời điểm liên kết/gỡ MXH lấy giờ gửi, không lấy `payload.timestamp` → sai khi retry/backlog.
- `templates.ts:146`: "Vé không huỷ / không hoàn tiền dưới bất kỳ hình thức nào" mâu thuẫn R-109 (hoàn tiền thủ công khi rạp huỷ suất) — nên thêm "trừ khi rạp huỷ suất".
- `mail.service.ts:24`: `from` cố định `onboarding@resend.dev` (sender test của Resend chỉ gửi tới chủ tài khoản) và không có env `MAIL_FROM` → production không gửi được tới khách.
- `jobs.controller.ts:29`: `inFlightIds` chỉ có tác dụng trong 1 process; `JobsService` đặt chung file controller (cấu trúc).

### Điểm đạt (task-03)
- `JobSecretGuard` (`apps/api/src/common/auth/job-secret.guard.ts:15-25`): so sánh hằng thời gian qua SHA-256 + `timingSafeEqual`, fail-closed khi env thiếu/rỗng (`parseEnv` coi chuỗi rỗng là chưa đặt); `@Public()` đi kèm `@UseGuards(JobSecretGuard)` ở cấp class.
- Retry có giới hạn (`MAX_EMAIL_ATTEMPTS=3`) + backoff 2^n phút + `last_error`; không gửi lại email `SENT` (claim lọc `status='PENDING'`).
- Escape HTML mọi giá trị nội suy từ payload trong body; không còn nội dung POS/đổi suất; email huỷ suất hướng dẫn liên hệ CSKH hotline mặc định `1900 0000`; có template liên kết/gỡ MXH (R-24) khớp kind `identity_linked/identity_unlinked` của trigger DB.
- Resend key từ env; test dùng mock Resend, không gọi mạng. Test 401 secret sai/thiếu chạy thật qua guard.

---

## Acceptance criteria

### task-02
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-09 webhook chữ ký sai → 200/400, đơn không đổi, log có orderCode | Đạt | So sánh không hằng thời gian (MINOR) |
| AC-10 webhook hợp lệ ×3 → 1 paid, 1 email | Đạt ở DB (idempotent `confirm_paid`); test chỉ chứng minh trên mock | C1: thanh toán lại cùng đơn có thể không bao giờ paid |
| AC-11 đơn expired + ghế đã bán → needs_manual_review | Đạt ở DB; test mock hard-code | — |
| returnUrl không đổi trạng thái; chỉ webhook/server xác nhận | Đạt | — |
| Không lưu/log dữ liệu thẻ; PayOS client mock trong test | Đạt | — |
| Mô tả: huỷ link cũ khi tạo đơn mới (#10) | **Không đạt** | M2 |
| Mô tả: khoá PayOS chỉ env server, demo theo env (R-84) | Một phần | M3 fail-open production |
| DoD: Reviewer độc lập PASS | Không đạt | — |

### task-03
| AC | Kết quả | Ghi chú |
|---|---|---|
| Job không có `x-job-secret` đúng → 401 | Đạt | — |
| 3 PENDING → 3 SENT; lỗi → FAILED sau max attempts, có last_error | Đạt (logic + test mock) | update kết quả không kiểm error (MINOR) |
| Gọi job song song không gửi trùng (SKIP LOCKED) | Đạt về hành vi (UPDATE có điều kiện); không phải SKIP LOCKED như mô tả | RPC ma (MINOR) |
| Template vé không chứa dữ liệu nhạy cảm; QR là qr_token | **Không đạt trên dữ liệu thật** | M5 — payload DB không có qr_token |
| Mô tả: template thông báo cho các email hệ thống | Một phần | M6 — 3 kind identity không có template, dump JSON |

## Verdict
- **task-02 (PayOS payment): FAIL** — 1 CRITICAL (C1), 4 MAJOR (M1–M4).
- **task-03 (Mail/outbox/jobs): FAIL** — 2 MAJOR (M5, M6).
