# DESIGN — kiến trúc hiện tại (as-built)

> Mô tả **current-state** của hệ thống theo code. Ý định/yêu cầu nằm ở `SPECIFICATIONS.md`, `docs/specs/2026-11-10-filmbooking-mvp-design.md`; UI/tokens ở `.context/design-spec.md` và `skills/react-nodejs/design-tokens.md`. Lệch giữa code và intent ghi ở `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`, không sửa ở đây cho khớp.

## 1. Kiến trúc tổng thể

```
Trình duyệt ──► apps/web (Next.js, SSR/RSC + client)
   │  ├─ Supabase JS (anon key + JWT user): Auth, Realtime `seat_status_public`, Storage upload (signed URL)
   │  └─ /api/proxy/[...path] (Route Handler) ──► apps/api (NestJS, REST)
   │                                              ├─ SupabaseService.forUser(jwt)  -> RLS theo user
   │                                              └─ SupabaseService.admin()       -> service_role (RPC nghiệp vụ, job)
   ▼
Supabase: Postgres (RLS + RPC SECURITY DEFINER) · Auth (GoTrue + hook) · Storage · Realtime · pg_cron + pg_net + Vault
   ▲                                   ▲
PayOS ── webhook POST /payos/webhook ──┘      pg_cron ── call_nest_job() ──► POST /jobs/{send-emails,reconcile}
SMTP (nodemailer) ◄── worker /jobs/send-emails đọc `email_outbox`
```

- **Monorepo pnpm**: `apps/web`, `apps/api`, `packages/shared` (zod schema, `ERROR_CODES`, DTO dùng chung), `supabase/` (migrations, `tests/` pgTAP, `seed.sql`).
- **Nguyên tắc**: quy tắc nhất quán/chống bán trùng nằm ở **Postgres** (constraint + RPC trong transaction); Nest là lớp xác thực, phân quyền, validate (zod), tích hợp PayOS/SMTP/Turnstile và điều phối RPC. Web không giữ secret.
- **API (`apps/api/src`)**: `AppModule` đăng ký guard global theo thứ tự `AuthGuard -> RolesGuard -> CinemaScopeGuard -> ThrottlerGuard`; `AllExceptionsFilter` chuẩn hoá lỗi `{error:{code,message,details?}}`; `helmet` + CORS theo `WEB_ORIGIN`; env kiểm bằng zod (`config/env.ts`). Module: `auth-ext`, `me`, `profile`, `identity`, `catalog`, `cinema-ops`, `pricing`, `booking`, `payment`, `checkin`, `orders`, `cancellation`, `report`, `admin`, `mail`, `jobs`, `health` (route: `docs/API_SPEC.md`).
- **Phân quyền**: Admin toàn chuỗi (`user_roles`), Staff/Manager theo rạp (`staff_assignments`). Kiểm ở API (`@Roles`, `@CinemaScope`) **và** ở DB (RLS, `has_cinema_scope`, `has_cinema_manager_scope`, thân RPC tự kiểm quyền). Quyền EXECUTE hàm bị siết mặc định (`20261112080000`), allowlist trong `supabase/tests/048_function_privileges.test.sql`.
- **Web (`apps/web/src/app`)**: nhóm `(public)` (trang chủ, phim, rạp, lịch chiếu, đặt vé, vé của tôi, tài khoản, pháp lý), `(auth)`, `staff/*` (chọn rạp, soát vé), `admin/*` (quản trị), `api/proxy`. Realtime ghế qua hook `lib/realtime/use-showtime-seats.ts` (kênh `postgres_changes` trên `seat_status_public`).
- **Danh tính**: đăng ký/đăng nhập email-mật khẩu đi qua Nest (`/auth/*`: Turnstile, chặn disposable, khoá 5 lần sai); user tạo bằng Admin API với `created_via='nest'` (hook `before_user_created`). OAuth Google/Facebook qua GoTrue; liên kết MXH thủ công cần `link-intent` (chặn auto-merge). Chấp nhận rủi ro demo: client vẫn gọi thẳng GoTrue bằng anon key được (xem `docs/dev-setup.md`).
- **POS đã gỡ** (spec 2.0.0): không còn kênh/API POS; tàn dư enum `POS` trong DB là nợ có chủ đích (`docs/ERD.md`).

## 2. Luồng giữ ghế

1. Web `GET /showtimes/:id/seatmap` (public) lấy sơ đồ + trạng thái; Realtime cập nhật `seat_status_public` (không chứa `user_id`/`order_id`).
2. Khách đã đăng nhập `POST /bookings/holds` -> Nest gọi RPC `hold_seats` **bằng JWT của khách** (`forUser(jwt)`, không phải service_role; Admin/nhân sự bị chặn ở API, chỉ khách CUSTOMER đã xác nhận email). RPC chạy trong một transaction: kiểm suất `ON_SALE`, rạp `OPEN`, phim `PUBLISHED`, cutoff bán online (`default_online_cutoff_minutes` hoặc override rạp), giới hạn ghế, ghế lẻ (`ORPHAN_SEAT`), khoá ghế của Manager; huỷ đơn `holding`/`pending_payment` cũ của khách; khoá theo thứ tự `showtimes FOR SHARE -> orders -> payments -> seats -> showtime_seat_states`.
3. Ghế được ghi vào `showtime_seat_states` (`HELD`, `expires_at` = now + `seat_hold_minutes_web`, mặc định 10'); **UNIQUE(showtime_id, seat_id)** chặn giữ/bán trùng (lỗi unique -> `SEAT_TAKEN`). Trigger đồng bộ `seat_status_public`.
4. Khách xác nhận tuổi (`age-confirm`), đồng ý điều khoản không huỷ/hoàn (`consent`, ghi `consents`), tuỳ chọn voucher (`apply_voucher` có rate limit 10/phút/khách).
5. Hết hạn giữ: ghế `HELD` có `expires_at`; ghế quá hạn **được coi là trống ngay khi đọc/giữ** (điều kiện `state = 'SOLD' or (state = 'HELD' and expires_at > now())` trong `hold_seats`), không phụ thuộc job dọn. Việc dọn dữ liệu do job pg_cron `expire-overdue-holds` chạy **mỗi phút** gọi `expire_overdue_holds()` (chỉ `service_role`; API không gọi hàm này): chuyển đơn `holding`/`pending_payment` quá `hold_expires_at` sang `expired` (toàn hệ thống), payment `PENDING` của các đơn đó sang `EXPIRED`, xoá ghế HELD quá hạn; voucher `HELD` được thả qua trigger `orders_voucher_status_sync`. `hold_seats` làm việc tương tự cho riêng suất đang giữ (`20261112140000:282-309`). Khách nhả chủ động bằng `DELETE /bookings/:id/hold` (RPC `release_seats` bằng JWT khách). `apply_voucher`/`remove_voucher` cũng gọi bằng JWT khách.

## 3. Luồng thanh toán

1. `POST /bookings/:id/payment` (cần consent): đơn 0đ -> RPC `confirm_zero_amount` (bán thẳng, sinh vé). Ngược lại tạo link PayOS (`order_code` riêng, `payments` PENDING), đơn sang `pending_payment`; payment cũ được chốt CANCELLED trong DB rồi mới huỷ link PayOS. Web chuyển hướng sang PayOS checkout (không có màn VietQR riêng — GAP-006).
2. PayOS gọi `POST /payos/webhook`: Nest xác thực checksum HMAC; sai -> trả 200 `{success:false}`, đơn không đổi. Hợp lệ -> `record_payment_event` (idempotent theo `provider_event_id`) rồi `confirm_paid`; cả hai gọi bằng **service_role** (`admin()`), cũng như `confirm_zero_amount`, `mark_payment_cancelled`, `cancel_stale_payment`. `confirm_paid` trả jsonb `status`: `SUCCESS` (chiếm ghế `SOLD` qua `sell_order_seats`, sinh `tickets` QR 128-bit, đơn `paid`, xếp email xác nhận); `AMOUNT_MISMATCH` khi lệch tiền (KHÔNG ném lỗi: cập nhật `amount` của payment hoặc ghi payment PENDING, ghi `payment_events` với trạng thái `AMOUNT_MISMATCH`, đơn -> `needs_manual_review`, enqueue email `AMOUNT_MISMATCH_MANUAL_REVIEW`); và nhánh tiền về muộn / ghế đã bị đơn khác chiếm (đơn đã `expired`/`cancelled` hoặc quá cutoff, trả status `NEEDS_MANUAL_REVIEW` với lý do `SEATS_UNAVAILABLE`/`SEATS_TAKEN` trong payload email): payment ghi `PAID`, không sinh vé, nhả ghế `HELD` của đơn, đơn -> `needs_manual_review`, email `LATE_PAYMENT_MANUAL_REVIEW`. `PAYMENT_AMOUNT_MISMATCH` chỉ là mã lỗi trong catalog, không phải kết quả của nhánh này. `tickets` UNIQUE(showtime_id, seat_id) là lớp chặn cuối chống bán trùng.
3. **Đối soát**: pg_cron mỗi 5' gọi `POST /jobs/reconcile` (qua `call_nest_job`): hỏi PayOS với payment PENDING 2'–24h và EXPIRED <= 1h; PAID đi lại đường webhook; CANCELLED/EXPIRED -> `cancel_stale_payment`. Đơn lệch/không đối soát được vào danh sách `needs-manual-review`; Manager xử lý bằng `resolve_manual_review` (chỉ đánh dấu đã xử lý).
4. Khách có thể `POST /bookings/:id/payment/cancel`; trạng thái xem qua `GET /bookings/:id/payment-status`.
5. **Email**: mọi email giao dịch qua `email_outbox` (PENDING/SENT/FAILED); cron mỗi phút gọi `POST /jobs/send-emails` -> SMTP (nodemailer, cấu hình `SMTP_*`), retry khi lỗi.
6. **Soát vé**: `POST /checkin/scan` -> RPC `checkin_ticket` (kiểm rạp, cửa sổ thời gian, đã dùng/chưa thanh toán, đơn `affected`), ghi `checkin_logs`, đơn `checked_in`. Không có bước xác nhận 2 giai đoạn và chưa hiển thị nhãn tuổi (GAP-001/002).

## 4. Luồng huỷ suất / đóng rạp

1. Manager (trong phạm vi rạp) `POST .../showtimes/cancel/preview` xem trước số suất, đơn `paid`/`checked_in` bị ảnh hưởng, tổng tiền cần hoàn (`preview_cancel_showtimes`).
2. `POST .../showtimes/cancel` -> RPC `cancel_showtimes` (một transaction): suất -> `CANCELLED` (ghi `cancel_reason`, `cancelled_by`, `cancelled_at`; suất đã huỷ được bỏ qua, không đếm lại), đơn `paid`/`checked_in` -> `affected`, tạo `affected_order_cases`, xếp email thông báo (idempotent). Các RPC huỷ suất/`preview_cancel_showtimes` gọi bằng service_role nếu người gọi là Admin, ngược lại bằng JWT của Manager (RLS/thân RPC tự kiểm quyền); `schedule_cinema_status` gọi bằng service_role; `checkin_ticket` và `resolve_manual_review` gọi bằng JWT nhân sự.
3. **Không có đổi suất** (spec 3.0.0): khách liên hệ CSKH. Nhân sự (Staff/Manager rạp đó) xem `GET /affected-orders`, xuất CSV, ghi hoàn tiền thủ công (`POST .../refund`, cần số tiền + mã giao dịch; đơn -> `refunded_manual`, ghi `affected_order_actions`), gửi lại email. GAP-009: chưa có trường phương thức hoàn tiền.
4. Đổi trạng thái rạp (đóng/tạm đóng/mở lại/sắp khai trương): chỉ Admin, **hẹn lịch hiệu lực sau 7 ngày** (`PATCH|POST .../status` -> RPC `schedule_cinema_status`; API gọi RPC bằng service_role nên rào chắn thật là `RolesGuard` / `@Roles("ADMIN")` trên cả 4 route; RPC tự kiểm quyền Admin chỉ chặn thêm khi gọi trực tiếp bằng JWT user (Manager bị 42501), và `PATCH /cinemas/:id` không đổi được `status`). Rạp giữ nguyên trạng thái, có `scheduled_status` + `scheduled_effective_at`, email `CINEMA_STATUS_NOTICE` xếp cho mọi tài khoản đã xác nhận. pg_cron `apply_due_cinema_status_changes()` mỗi phút: tới hạn -> đổi `status`, xoá lịch; đích khác `OPEN` -> tự huỷ suất tương lai còn lại (đơn `paid` -> `affected`, không email từng đơn). Không còn chặn đóng rạp theo suất đã bán. `GET /cinemas/:code` trả 200 cho rạp không hoạt động (R-137).
5. Báo cáo suất huỷ: `GET /reports/cancelled-showtimes` (view `v_report_cancelled_showtimes`).

## 5. Giá, voucher, báo cáo

- Giá 2 cấp (`price_rules`: `CHAIN` / `CINEMA` / `SHOWTIME`) + ngày lễ (`holidays`) > cuối tuần > ngày thường, trước/sau 17h giờ VN; RPC `price_quote` (anon được gọi) cho báo giá; `GET /showtimes/:id/prices`.
- Voucher `PERCENT`/`FIXED`, phạm vi chuỗi hoặc rạp, giới hạn lượt/ngân sách; `voucher_redemptions` theo đơn (`HELD`/`CONSUMED`/`RELEASED`, đồng bộ bởi trigger theo trạng thái đơn).
- Báo cáo: 4 view `security_invoker` + RPC `report_*`, giới hạn Manager/Admin theo `has_cinema_manager_scope`.

## 6. Cấu hình, vận hành, kiểm thử

- Cấu hình chuỗi ở `app_settings` (`seat_hold_minutes_web`, `default_cleaning_minutes`, `default_online_cutoff_minutes`, `no_refund_warning`, `terms_version`); override theo rạp ở `cinema_settings` / cột `cinemas`.
- Cron/Vault: `delete-unconfirmed-users` (giờ), `expire-overdue-holds` (phút), `purge-expired-ops-data`, `job-send-emails` (phút), `job-reconcile-payos` (5'); Vault `api_base_url` + `job_secret` phải tạo tay trên từng môi trường; thiếu secret -> `call_nest_job` cảnh báo và không gọi.
- Kiểm thử: unit (`vitest`) ở api/web/shared; pgTAP `supabase/tests/*.test.sql` (`pnpm db:test`); integration API <-> Supabase local (`pnpm test:int`); e2e Playwright `pnpm e2e`. CI: `.github/workflows/ci.yml` (verify + db-test).
- Quan sát: Sentry qua DSN env (tắt khi thiếu). Có DSN thì gắn tag `cinema_id` và scrub PII (`apps/web/src/lib/monitoring/`, phía api tương ứng). Hiệu năng: `lighthouserc.json` (Lighthouse CI) đặt budget LCP ≤ 2,5s cho `/`, `/phim`, `/rap`; mới đo được `/rap` (xem GAP-031). E2E `pnpm e2e` (Playwright, cổng 3100/3101) là job tuỳ chọn `.github/workflows/e2e.yml` (thủ công + hằng đêm, không chặn PR)
- Không dùng `db push`/`db reset` ngoài local; migration versioned, không sửa migration đã apply (`docs/dev-setup.md`).
