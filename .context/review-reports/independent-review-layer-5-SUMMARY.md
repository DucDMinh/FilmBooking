# Review độc lập Layer 5 — Tổng hợp (2026-11-13)

Bối cảnh: Layer 5 (`7583bc1..7574049`, branch `staging`, 115 file, `+19808/-65`) được một session khác ("coordinator") tự build, review, merge và close-out với nhãn `12/12 STRICT PASS` + tag `layer-5-done`. 7 subagent `reviewer` độc lập (chỉ đọc, không dựa vào report cũ) đã rà soát toàn bộ 12 task đang mở của Layer 5 (`task-01..04`, `task-06..13`; `task-05` POS đã bỏ theo CR `remove-pos`).

## Tổng quan kết quả

- **Kết luận chung:** **FAIL toàn bộ (12/12 task FAIL)** — trái ngược với báo cáo cũ `12/12 STRICT PASS`.
- **Tổng số finding:** **2 CRITICAL**, **39 MAJOR**, nhiều **MINOR** (và nợ kỹ thuật / cross-boundary).
- **Trạng thái chạy lệnh verify (cập nhật sau khi chạy ngoài sandbox trên `7574049`):**
  - Trong 7 lượt reviewer: `vitest`, `aislop`, `oxlint`, `ocr` bị `agent-guard` chặn.
  - Session chính đã chạy ngoài sandbox ngày 2026-11-13:
    - `pnpm typecheck`: **PASS** (`packages/shared`, `apps/api`, `apps/web`)
    - `pnpm lint`: **PASS** (`packages/shared`, `apps/api`, `apps/web`)
    - `pnpm test`: **PASS** (`packages/shared` 14/14, `apps/api` 22 files / 374/374, `apps/web` 12 files / 156/156, `scripts/*.test.mjs` 16/16) — *lưu ý: e2e dùng mock và 9 module Layer 5 chưa wire vào `AppModule`, nên vẫn không phủ nhận các lỗi DB/tích hợp/logic nêu dưới.*
    - `pnpm build`: **PASS** (`apps/api` 96 files -> `dist`; `apps/web` 23/23 routes)
    - `pnpm db:test`: chưa chạy trong lượt này.

| Nhóm | Task | Verdict | Critical | Major | Minor | Báo cáo chi tiết |
|---|---|---|---|---|---|---|
| A | `task-01` API booking | **FAIL** | 0 | 5 | 13 | [independent-review-layer-5-A-booking.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-A-booking.md) |
| B | `task-02` PayOS payment | **FAIL** | 1 | 4 | 11 | [independent-review-layer-5-B-payment-mail.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-B-payment-mail.md) |
| B | `task-03` Mail / outbox / jobs | **FAIL** | 0 | 2 | 8 | [independent-review-layer-5-B-payment-mail.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-B-payment-mail.md) |
| C | `task-04` Soát vé (check-in) | **FAIL** | 0 | 1 | 4 | [independent-review-layer-5-C-checkin-cancel.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-C-checkin-cancel.md) |
| C | `task-08` Huỷ suất / đóng rạp / đơn bị ảnh hưởng | **FAIL** | 0 | 4 | 9 | [independent-review-layer-5-C-checkin-cancel.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-C-checkin-cancel.md) |
| D | `task-06` Admin | **FAIL** | 0 | 4 (+M8) | 7 | [independent-review-layer-5-D-admin-orders.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-D-admin-orders.md) |
| D | `task-07` Orders & Report | **FAIL** | 1 | 4 (+M8) | 8 | [independent-review-layer-5-D-admin-orders.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-D-admin-orders.md) |
| E | `task-09` Wiring & tích hợp toàn layer | **FAIL** | 0 | 2 | 5 | [independent-review-layer-5-E-wiring-integration.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-E-wiring-integration.md) |
| F | `task-10` Web auth / OAuth | **FAIL** | 0 | 5 | 15 | [independent-review-layer-5-F-web-auth-security.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-F-web-auth-security.md) |
| F | `task-12` Web bảo mật & liên kết MXH | **FAIL** | 0 | 1 (F-01) | (chung F) | [independent-review-layer-5-F-web-auth-security.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-F-web-auth-security.md) |
| G | `task-11` Web tài khoản | **FAIL** | 0 | 5 | 13 | [independent-review-layer-5-G-web-account-admin.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-G-web-account-admin.md) |
| G | `task-13` Web admin shell | **FAIL** | 0 | 3 | 6 | [independent-review-layer-5-G-web-account-admin.md](file:///e:/FilmBooking/.context/review-reports/independent-review-layer-5-G-web-account-admin.md) |

*(Ghi chú: ở nhóm D có 8 MAJOR gồm M1–M4 cho task-06, M5–M7 cho task-07, và M8 AI-readable gate cho cả 2 task; ở nhóm F có 5 MAJOR F-01..F-05 trong đó F-01 ảnh hưởng cả task-10 và task-12.)*

---

## CRITICAL (2 lỗi — hỏng chức năng cốt lõi trên DB thật)

| # | Nhóm / Task | Tóm tắt & tác động | Vị trí chính |
|---|---|---|---|
| **K5-1** | B / `task-02` (C1) | **Thanh toán lại cùng đơn -> webhook của link mới lỗi `23505` và bị nuốt thành `200 { success: true }`:** `createPayment` insert dòng `payments` thứ 2 cùng `order_id`; `confirm_paid` chọn dòng theo `order_id` (bốc dòng `CANCELLED` cũ) rồi update `order_code = p_order_code` -> đụng unique `payments.order_code`, rollback toàn bộ; `webhook.controller.ts:53-54` bỏ qua `{ success: false }` và trả `200 { success: true }` -> PayOS ngừng retry -> khách mất tiền, không có vé, không vào manual review. | `apps/api/src/modules/payment/payment.service.ts:164-208`, `webhook.controller.ts:53-54`, `supabase/migrations/20261112110000_confirm_paid_hardening.sql:117` |
| **K5-2** | D / `task-07` (C1) | **`resolveManualReview` hỏng hoàn toàn trên DB thật + tạo ghế SOLD ma:** `CONFIRM_SALE` cập nhật `orders.status = 'paid'` từ `needs_manual_review`, bị trigger `orders_guard_transition` chặn (`23514` -> 500) sau khi đã upsert `showtime_seat_states` `SOLD` từng ghế (không `onConflict`, không transaction, nuốt lỗi) và check trống không khoá; lại trái `SPECIFICATIONS.md:311` (`needs_manual_review` là trạng thái kết thúc). `REFUND_MANUAL` insert `affected_order_actions` bị trigger chặn (`orders.status` phải là `affected`), code **không kiểm `error`** -> mất dữ liệu hoàn tiền mà vẫn set `manual_review_resolved_at` và trả 201. | `apps/api/src/modules/orders/orders.service.ts:470-585`, `supabase/migrations/20261112150000_cancel_showtimes_hardening.sql:29-37` |

---

## MAJOR theo nhóm chức năng (39 finding)

### 1. Thanh toán, Đặt vé & Mail (Nhóm A, B)
- **A/MAJOR-2** (`task-01`): Ghi bằng chứng đồng ý (R-71/R-133, AC-08) không nguyên tử (`Promise.all` độc lập), lệch timestamp Node vs DB, `version` do client tự khai không đối chiếu server, bịa IP `127.0.0.1`.
- **A/MAJOR-3** (`task-01`): `releaseHold`, `applyVoucher`, `removeVoucher` không kiểm chủ đơn ở API; RPC còn nhánh POS cũ cho phép Staff/Manager/Admin nhả ghế hoặc áp/gỡ voucher trên đơn khách.
- **A/MAJOR-4** (`task-01`): `SeatmapService` dùng `supabase.admin()`, chỉ chặn `CANCELLED`, bỏ qua `cinemas.status='OPEN'` và `movies.status='PUBLISHED'` -> lộ suất phim DRAFT/ARCHIVED hoặc rạp đóng.
- **A/MAJOR-5** (`task-01`): AC-08 lệch HTTP status: AC yêu cầu `409 CONSENT_REQUIRED`, `packages/shared/src/errors.ts:81` trả `422`.
- **B/M1** (`task-02`): Webhook nuốt mọi lỗi (`handleWebhook` trả `false`, lỗi `record_payment_event`, lỗi đọc `payments`) và luôn trả `200 { success: true }`.
- **B/M2** (`task-02`): Spec #10 "tạo đơn mới khi đơn cũ `pending_payment` -> huỷ link PayOS cũ" không có tác dụng vì `hold_seats` đã huỷ đơn cũ trước đó -> link PayOS cũ vẫn sống.
- **B/M3** (`task-02`): PayOS fail-open ở production: thiếu `PAYOS_*` env vẫn trả URL checkout giả, `env.ts` vẫn để optional.
- **B/M4** (`task-02`): Có thể tồn tại nhiều link PayOS sống cho 1 đơn (bỏ qua kết quả `cancelPaymentLink`, không khoá race `createPayment`); khách trả 2 lần rơi im lặng vào `ALREADY_PAID`.
- **B/M5** (`task-03`): Email vé thật (`TICKET_ISSUED`) không có `qr_token`, `cinema_address`, danh sách ghế vì DB payload không gửi và worker không query bù.
- **B/M6** (`task-03`): 3 kind email của `IdentityModule` (`password_set`, `oauth_missing_email_collision`, `oauth_missing_email_verify`) thiếu template -> fallback dump `JSON.stringify(payload)` lộ `user_id` + `token` và không có link xác thực.

### 2. Soát vé, Huỷ suất, Admin & Báo cáo (Nhóm C, D)
- **C4-1** (`task-04`): Màu kết quả `USED` và `TOO_EARLY` là `"yellow"` trong `schemas/checkin.ts`, trái AC-12 ("báo đỏ 'Đã sử dụng'") và design-spec.
- **C8-1** (`task-08`): Export CSV thiếu chống formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **C8-2** (`task-08`): Gửi lại email (`resend`) cho phép resend cả `SENT` và `PENDING` đang được worker claim (gửi trùng), không cooldown/giới hạn, tải toàn bảng `email_outbox` lọc JS (cắt 1000 dòng), bỏ qua `error`, thiếu trường payload.
- **C8-3** (`task-08`): Ghi nhận hoàn tiền không nguyên tử -> 2 request đồng thời tạo 2 dòng `REFUNDED_MANUAL` -> báo cáo `total_refunded_amount` cộng gấp đôi; `refundedAmount` cho phép `0` hoặc vượt `total_amount`; bỏ qua lỗi update `orders`.
- **D/M1** (`task-06`): Cấp/thu hồi Admin dùng `supabase.admin()` nên trigger audit mất `actor_id` (`NULL`); `lockUser` không ghi `audit_logs` nào (trái R-107).
- **D/M2** (`task-06`): `audit.controller.ts` cho `MANAGER` đọc audit log, trái quyết định user "Audit log chỉ Admin" (`.context/design-spec.md:747`).
- **D/M3** (`task-06`): Xoá cứng voucher (`DELETE`) làm cascade xoá hết `voucher_redemptions` và cắt `orders.voucher_id` (`ON DELETE SET NULL`).
- **D/M4** (`task-06`): `PATCH` voucher một phần bỏ qua ràng buộc chéo (`discountType`/`discountValue`, `validFrom`/`validTo`) -> `23514`/`23503` -> 500.
- **D/M5** (`task-07`): Staff xem được `needs-manual-review` và `/admin/todo` trả `failedEmails` (`to_email`, `last_error`) + `needs_manual_review` cho Staff, trái R-104 & design-spec.
- **D/M6** (`task-07`): Lịch sử trạng thái đơn (R-103) bịa bằng heuristic thay vì đọc `audit_logs`.
- **D/M7** (`task-07`): `OrdersModule` và `ReportModule` thiếu `imports: [AuthModule]` -> **lỗi Nest DI ngay khi wire ở `layer-6-task-01`**.
- **D/M8** (`task-06`, `task-07`): AI-readable gate FAIL (`orders.service.ts` 764 dòng, `users.controller.ts` 412, `report.controller.ts` 374; hàm > 50 dòng; controller alias trùng lặp; interface trùng).

### 3. Web Auth, Tài khoản & Admin Shell (Nhóm F, G)
- **F-01** (`task-10`, `task-12`): `/auth/callback/route.ts` gộp mọi lỗi OAuth thành `/dang-nhap?error=oauth` và bỏ `next` -> AC-04 (trùng email), R-23 (MXH đã thuộc user khác), R-19 (Facebook thiếu email) đều chết; `POST /auth/oauth/callback-check` không được gọi.
- **F-02** (`task-10`): `resetPasswordForEmail` và `resend` thiếu `redirectTo`; `supabase/templates/` không tồn tại; `/` không xử lý hash `type=recovery` -> link email đặt lại mật khẩu và xác nhận email đều rơi về trang chủ `/`.
- **F-03** (`task-10`): Proxy Next (`/api/proxy/[...path]`) và server action `/dang-nhap` không forward IP khách tới Nest, Nest chưa bật `trust proxy` phù hợp -> mọi rate limit theo IP biến thành giới hạn toàn site (10 req/phút có thể chặn đăng nhập cả hệ thống).
- **F-04** (`task-10`): "Ghi nhớ đăng nhập" (R-15) bị `proxy.ts` / `lib/supabase/server.ts` ghi đè thành `maxAge: 400 ngày` ngay ở lần refresh token đầu tiên (~1 giờ).
- **F-05** (`task-10`): Token Turnstile không được clear/reset widget sau khi submit lỗi -> người dùng bị `CAPTCHA_FAILED` liên tục ~300s.
- **G/M11-1** (`task-11`): `/tai-khoan/page.tsx` gọi `createBrowserSupabase().auth.getUser()` trong khi browser client đặt `persistSession: false` -> luôn trả `null`, `hasPassword` luôn `true` -> tài khoản OAuth-only vẫn thấy Đổi mật khẩu và bị đòi nhập mật khẩu giả khi Xoá tài khoản.
- **G/M11-2** (`task-11`): Đăng xuất sau xoá tài khoản gọi `createBrowserSupabase().auth.signOut()` -> no-op, cookie HttpOnly `sb-*` vẫn còn (token dùng tiếp được tối đa 1h).
- **G/M11-3** (`task-11`): Lỗi 403 khi xoá tài khoản chỉ hiện câu chung chung -> user OAuth không biết cần đăng nhập lại trong 5 phút, user mật khẩu không biết sai mật khẩu (cần tách mã lỗi `REAUTH_REQUIRED`).
- **G/M11-4** (`task-11`): Đổi mật khẩu gọi thẳng GoTrue từ browser -> bỏ qua lockout/CAPTCHA/rate-limit, bỏ qua `checkPasswordPolicy`, `config.toml` đang tắt `require_current_password` và comment notification `password_changed` (UI báo sai đã gửi email, trái R-14).
- **G/M13-1** (`task-13`): Điều hướng sidebar `/admin` đánh mất query `?cinema=` (scope rạp).
- **G/M13-2** (`task-13`): Bộ chọn rạp admin dùng `GET /cinemas` (chỉ trả rạp `OPEN`) -> Admin không lọc được rạp tạm đóng/đóng/sắp mở để xử lý đơn bị ảnh hưởng & mở lại rạp; nhân sự rạp không OPEN thấy `Rạp 1a2b3c4d`.
- **G/M13-3** (`task-13`): `nav-config.ts` lệch SPEC §5.3 & design-spec (Manager thiếu Voucher xem-chỉ-đọc, thiếu Cấu hình rạp, thiếu mục Phòng & sơ đồ ghế).

### 4. Test False-Confidence & Quy trình đóng Layer (Nhóm A, B, C, D, E, G)
- **Test giả tạo tự tin ở nhiều nhóm:** **A/MAJOR-1** (`booking.e2e-spec.ts`), **B/M2** (`webhook.e2e-spec.ts` tạo 2 đơn active cùng user vi phạm unique DB), **C8-4** (`cancellation.e2e-spec.ts` không check 42501 & bịa cột `orders.contact_name`), **D/C1** (`orders-report.e2e-spec.ts` bỏ qua trigger & `currentJwt.includes` dead code), **F-01** (`linked-accounts.test.tsx` gán prop giả), **G/M11-5** (`account.test.tsx` thiếu test luồng chính & mock sai kiến trúc `persistSession: false`).
- **E/M-1** (`task-09`/close-out): Close-out `7574049` làm mất `status: "needs_remediation"` và `previousReview` của 19 entry Layer 3/4 trong `.context/progress.json` do bug ở `tools/progress-write.mjs:160-174`.
- **E/M-2** (`task-09`/close-out): Gate phase review `build-filmbooking-layer-5-phase-review.md` và tag `layer-5-done` dựa trên báo cáo không có output thật và có nhiều thông tin sai sự thật.

---

## Đề xuất thứ tự xử lý

1. **Bước 0 — Verify gốc trên code hiện tại (trước khi sửa):**
   - Chạy lại ngoài sandbox (máy có `node`) bộ verify chuẩn: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm db:test` để có số liệu thật cho commit `7574049`.
2. **Wave 1 — Blocker DB/Auth/Payment/DI (làm trước khi wire Layer 6):**
   - Sửa **K5-1** (`task-02`: reuse/update payment hoặc filter `p_order_code` trong migration mới + webhook không trả `success: true` khi lỗi) & **B/M1–M4**.
   - Sửa **K5-2** (`task-07`: đưa `resolveManualReview` về đúng spec `SPECIFICATIONS.md:311` qua RPC nguyên tử hoặc chốt Change Request nếu muốn `CONFIRM_SALE`) + **D/M7** (thêm `AuthModule` vào `OrdersModule`/`ReportModule`).
   - Sửa **A/MAJOR-2, 3, 4, 5** (consent RPC nguyên tử + server version, kiểm chủ đơn cho release/voucher, seatmap lọc `OPEN` + `PUBLISHED`, chốt `409` vs `422` `CONSENT_REQUIRED`).
   - Sửa **B/M5, M6** (bù `qr_token`/`seats`/`cinema_address` cho `TICKET_ISSUED`, thêm template cho 3 kind `IdentityModule`).
3. **Wave 2 — Quyền, Bảo mật & Tài chính còn lại ở API:**
   - **C4-1** (màu `USED`/`TOO_EARLY` -> `red`), **C8-1..3** (CSV formula injection, resend chỉ `FAILED` + cooldown + filter DB, hoàn tiền nguyên tử).
   - **D/M1..M6, M8** (audit `actor_id` + lockUser, `audit.controller` chỉ `ADMIN`, chặn xoá voucher đã dùng, validate PATCH voucher, lọc `todo`/`needs-manual-review` khỏi Staff, lịch sử từ `audit_logs`, tách file/hàm đạt AI-readable gate).
4. **Wave 3 — Web Auth, Tài khoản & Admin Shell:**
   - **F-01..F-05** (OAuth callback map allowlist + giữ `next` + nối `callback-check`, `redirectTo` cho recovery/confirm, forward IP khách + `trust proxy`, giữ cờ remember me qua refresh, reset Turnstile token sau lỗi).
   - **G/M11-1..4** (dùng `/me/identities` thay `getUser()` ở client, server action `signOut`, phân biệt lỗi 403 xoá tài khoản, chuyển đổi mật khẩu qua server action/API có lockout + `checkPasswordPolicy` + thông báo email).
   - **G/M13-1..3** (giữ `?cinema=` ở sidebar, endpoint/nguồn rạp gồm rạp chưa OPEN cho `/admin`, cập nhật `nav-config.ts` đúng §5.3 & design-spec).
5. **Wave 4 — Siết test thật & Khôi phục trạng thái:**
   - Sửa toàn bộ bộ mock false-confidence (A/MAJOR-1, B/M2, C8-4, D/C1, G/M11-5).
   - Sửa `tools/progress-write.mjs` (qua `/change`) và khôi phục dữ liệu remediation Layer 3/4 + xử lý trạng thái tag `layer-5-done` theo quyết định của user.
