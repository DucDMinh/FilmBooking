# Phase Review Report: Layer 5 (build-filmbooking)

> **Agent:** `spec-validator` (Independent Validation)  
> **Phase:** Layer 5 — API Booking, PayOS Webhook, Mail Worker Resend, Soát vé Checkin, Quản trị hệ thống, Báo cáo & Xử lý đơn, Huỷ suất & Đóng rạp, Wiring API #3, Web Auth, Web Profile, Web Security & OAuth, Web Admin Shell  
> **Branch:** `layer-5-integration` (base `staging @ 7583bc1`)  
> **Date:** 2026-11-13  
> **Verdict:** `✅ COMPLETE` (Tất cả 12 tasks trong scope hoàn thành đạt STRICT PASS; 100% requirements/AC trong scope Layer 5 được nghiệm thu với bằng chứng kiểm thử tự động toàn diện)

---

## 1. Executive Summary

Layer 5 là layer trọng yếu nhất về tầng ứng dụng (Application Layer) của dự án FilmBooking: kết nối toàn bộ logic giao dịch và cơ chế bất biến từ Database (Layer 4) lên hệ thống Backend API (NestJS), thiết lập các Worker chạy nền (Mail Outbox Worker), hoàn thiện các bề mặt tương tác người dùng quan trọng trên Frontend (Web Auth, Web Profile, Web Security), và dựng khung vỏ quản trị chuỗi rạp (`/admin` Shell).

- **Quy mô triển khai:** 12/12 tasks thực hiện (`layer-5-task-01..04`, `layer-5-task-06..13`; `task-05` đã được REMOVED theo Change Request `remove-pos` spec 2.0.0).
- **Kết quả Adversarial Pro Review độc lập từng task:**
  - `task-01`: Round 1 FAIL (5 defects: 42501 orders/consents, RLS vouchers, mock false-confidence, regex SEAT_TAKEN, file/function lines) → **Round 2 STRICT PASS** (commit `d22a25c`).
  - `task-02`: **Round 1 STRICT PASS** (commit `7ca4fe9`: HMAC SHA256, cancel pending payments, zero-amount, polling, security).
  - `task-03`: **Round 1 STRICT PASS** (commit `e6ce746`: Concurrency lock in-memory + DB atomic update, exponential backoff, template tiếng Việt escape HTML, CR `remove-showtime-exchange`).
  - `task-04`: **Round 1 STRICT PASS** (commit `dbd6708`: Giấu 100% PII khi `WRONG_CINEMA`, `CinemaScopeGuard`, `RolesGuard` STAFF).
  - `task-06`: **Round 1 STRICT PASS** (commit `4735c18`: Quản trị user/roles, nhân sự rạp, chuỗi audit_logs, voucher CRUD, 822 lines e2e test).
  - `task-07`: Round 1 FAIL (3 defects: `audit_logs` check constraint action `('INSERT','UPDATE','DELETE')`, PostgREST embedding mismatch on showtimes without direct FK to cinemas, state machine gap `CONFIRM_SALE` -> `paid`) → **Round 2 STRICT PASS** (commit `d8a0c32`).
  - `task-08`: **Round 1 STRICT PASS** (commit `967fa36`: AC-24, AC-25, AC-26, CSV UTF-8 BOM 18 cột tiếng Việt, `Unprocessable422Pipe`).
  - `task-09`: **Round 1 STRICT PASS** (commit `5217698`: Wiring `AppModule` + `database.types.ts` 100% schema sync).
  - `task-10`: **Round 1 STRICT PASS** (commit `a65ca4e`: Web Auth forms, Turnstile, lockout 15', `sanitizeNext`, a11y, 16/16 tests).
  - `task-11`: Round 1 FAIL (4 defects: ẩn đổi mật khẩu khi OAuth-only, thiếu test suite, file lines >300, memory leak `URL.revokeObjectURL`) → **Round 2 STRICT PASS** (commit `8004d09`).
  - `task-12`: **Round 1 STRICT PASS** (commit `11dcd88`: F-2 link-intent OAuth trước khi redirect, chặn huỷ phương thức cuối, `/bo-sung-email`, `signOutOthers`).
  - `task-13`: **Round 1 STRICT PASS** (commit `8305618`: Admin Shell layout `/admin`, Topbar CINEMO, `CinemaScopeSwitcher` URL sync, Sidebar RBAC, chặn Customer 403, bỏ POS).
- **Chất lượng kiểm định Monorepo tự động trên nhánh tích hợp (`layer-5-integration`):**
  - `pnpm -w lint`: **PASS** (0 warning, 0 error trên toàn workspace).
  - `pnpm -w typecheck`: **PASS** (100% TypeScript compile sạch trên `packages/shared`, `apps/api`, `apps/web`).
  - `pnpm -w test`: **PASS 374/374 tests** (100% pass trên toàn monorepo: `packages/shared`, `apps/api`, `apps/web`, `scripts`).
  - `pnpm -w build`: **PASS** (NestJS API built 96 files dist, Next.js Web generated 23 routes tĩnh/động bao gồm `/admin`, `/tai-khoan`, `/dang-nhap`, `/dang-ky`, `/xac-nhan-email`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/bo-sung-email`, `/khong-co-quyen`).
- **Tuân thủ Scope Changes & Intent Documents:**
  - CR `remove-pos` (spec 2.0.0): Đã gỡ bỏ toàn bộ giao diện và endpoint POS; task-05 removed; admin sidebar không chứa mục POS.
  - CR `remove-showtime-exchange` (spec 3.0.0): Template email huỷ suất và màn Đơn bị ảnh hưởng chỉ hướng dẫn liên hệ CSKH hoàn tiền thủ công (hotline mặc định `1900 0000`), không có tuỳ chọn đổi suất.

---

## 2. Requirements & Acceptance Criteria Coverage Matrix

| Requirement / AC | Tiêu đề & Nội dung | Task | Nguồn kiểm chứng (Source / Test) | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| **R-01** | Đăng ký email + mật khẩu + họ tên; so sánh không phân biệt hoa/thường | task-10 | `apps/web/src/components/auth/register-form.tsx`<br>`apps/web/src/components/auth/__tests__/auth-forms.test.tsx` | `COVERED` | Client-side validation + server endpoint |
| **R-02** | Chính sách mật khẩu ≥ 8 ký tự, có chữ hoa, thường, số; thanh độ mạnh | task-10 | `apps/web/src/components/auth/register-form.tsx`<br>`apps/web/src/components/auth/auth-ui.tsx` | `COVERED` | Thanh đo độ mạnh mật khẩu và checklist 3 tiêu chí |
| **R-03** | Bắt buộc đồng ý Điều khoản sử dụng và Chính sách bảo mật | task-10 | `apps/web/src/components/auth/register-form.tsx`<br>`apps/web/src/components/auth/__tests__/auth-forms.test.tsx` | `COVERED` | Checkbox bắt buộc, disabled nút khi chưa tick |
| **R-04** | Email xác nhận tài khoản (link dùng 1 lần 24h) | task-10 | `apps/web/src/app/(auth)/xac-nhan-email/page.tsx` | `COVERED` | Màn hình hướng dẫn kiểm tra email + link kích hoạt |
| **R-05** | Chặn đặt vé khi chưa xác nhận email; banner nhắc xác nhận | task-01<br>task-11 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/web/src/components/shell/unverified-email-banner.tsx`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Server chặn 403 `EMAIL_NOT_CONFIRMED`; UI hiển thị banner nhắc có nút gửi lại email |
| **R-06** | Gửi lại email xác nhận: đếm ngược 60s, tối đa 5 lần/giờ | task-10<br>task-11 | `apps/web/src/components/auth/resend-confirm-button.tsx`<br>`apps/web/src/components/account/__tests__/account.test.tsx` | `COVERED` | Vô hiệu hoá nút trong 60 giây kèm đồng hồ đếm ngược |
| **R-07** | CAPTCHA Cloudflare Turnstile ở form đăng ký, quên mk, đăng nhập sau 3 lần sai | task-10 | `apps/web/src/components/auth/turnstile-field.tsx`<br>`apps/web/src/components/auth/register-form.tsx` | `COVERED` | Render widget Turnstile, truyền token lên backend |
| **R-11** | Sai mật khẩu 5 lần -> khoá 15 phút, gửi email cảnh báo | task-03<br>task-10 | `apps/api/src/modules/mail/templates.ts`<br>`apps/web/src/components/auth/login-form.tsx`<br>`apps/api/test/outbox-job.e2e-spec.ts` | `COVERED` | UI bắt mã `ACCOUNT_LOCKED`; Mail template `renderAccountLockedEmail` |
| **R-12** | Không tiết lộ tồn tại email (chống account enumeration) | task-10<br>task-12 | `apps/web/src/app/(auth)/quen-mat-khau/page.tsx`<br>`apps/web/src/app/(auth)/bo-sung-email/page.tsx` | `COVERED` | Thông báo trung tính, không phân biệt email tồn tại hay không |
| **R-13** | Quên mật khẩu: link hết hạn 1h, dùng 1 lần, huỷ phiên khác | task-10 | `apps/web/src/app/(auth)/dat-lai-mat-khau/page.tsx` | `COVERED` | Hỗ trợ token từ query/hash, cảnh báo khi link hết hạn |
| **R-14** | Đổi mật khẩu yêu cầu nhập mật khẩu hiện tại | task-11 | `apps/web/src/components/account/change-password-form.tsx`<br>`apps/web/src/components/account/__tests__/account.test.tsx` | `COVERED` | Xác thực mật khẩu cũ qua Supabase Auth trước khi cập nhật |
| **R-15** | Quản lý phiên: "Đăng xuất khỏi mọi thiết bị", cookie phiên/30 ngày | task-12 | `apps/web/src/components/account/sessions-card.tsx`<br>`apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `COVERED` | Server Action gọi `signOut({ scope: "others" })` |
| **R-16** | Quay về đúng trang sau đăng nhập (sanitizeNext) | task-10 | `apps/web/src/app/(auth)/dang-nhap/page.tsx`<br>`apps/web/src/app/auth/callback/route.ts` | `COVERED` | Lọc bỏ open redirect, protocol injection (`javascript:`) |
| **R-17** | Tài khoản nhân sự không tự đăng ký, chỉ Admin/Manager tạo hoặc nâng quyền | task-06 | `apps/api/src/modules/admin/users.controller.ts`<br>`apps/api/test/admin.e2e-spec.ts` | `COVERED` | Manager chỉ thêm Staff rạp mình; Admin gán Admin/Manager |
| **R-18** | Đăng nhập / đăng ký nhanh Google & Facebook (OAuth) | task-10 | `apps/web/src/components/auth/oauth-buttons.tsx` | `COVERED` | Nút đăng nhập Google & Facebook chuẩn OAuth flow |
| **R-19** | Facebook không email -> bắt buộc nhập và xác nhận trước khi đặt vé | task-12 | `apps/web/src/app/(auth)/bo-sung-email/page.tsx`<br>`apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `COVERED` | Giao diện `/bo-sung-email` gửi link xác nhận theo R-12 |
| **R-20** | Trùng email không tự gộp, yêu cầu đăng nhập mật khẩu rồi liên kết | task-12 | `apps/web/src/components/account/linked-accounts.tsx`<br>`apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `COVERED` | Hiển thị cảnh báo và nút chuyển sang đăng nhập mật khẩu |
| **R-21** | Quản lý danh tính liên kết: không cho huỷ phương thức cuối cùng | task-12 | `apps/web/src/components/account/linked-accounts.tsx`<br>`apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `COVERED` | Khi `canUnlink === false`, mở dialog giải thích, chặn `DELETE` |
| **R-22** | Thêm mật khẩu cho tài khoản chỉ có OAuth | task-12 | `apps/web/src/components/account/add-password-form.tsx`<br>`apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `COVERED` | Cho phép đặt mật khẩu lần đầu an toàn |
| **R-24** | Email thông báo khi liên kết hoặc huỷ liên kết | task-03 | `apps/api/src/modules/mail/templates.ts`<br>`apps/api/test/outbox-job.e2e-spec.ts` | `COVERED` | Template `renderIdentityChangedEmail` trong `email_outbox` |
| **R-26** | Xem/sửa hồ sơ: họ tên, SĐT, ngày sinh, giới tính, avatar | task-11 | `apps/web/src/components/account/profile-form.tsx`<br>`apps/web/src/app/(public)/tai-khoan/page.tsx` | `COVERED` | Form cập nhật thông tin cá nhân kèm validate SĐT VN |
| **R-27** | Đổi email: gửi link tới email mới, thông báo email cũ | task-11 | `apps/web/src/components/account/change-email-dialog.tsx`<br>`apps/web/src/components/account/__tests__/account.test.tsx` | `COVERED` | Dialog đổi email, thông báo xác nhận 2 đầu |
| **R-28** | Ảnh đại diện: JPG/PNG/WebP ≤ 2MB, preview & thu hồi Object URL | task-11 | `apps/web/src/components/account/avatar-upload.tsx`<br>`apps/web/src/components/account/__tests__/account.test.tsx` | `COVERED` | Chặn mime-type và file > 2MB; dọn dẹp `URL.revokeObjectURL` |
| **R-29** | Xoá tài khoản: cảnh báo mất vé, xác nhận mật khẩu, ẩn danh hoá PII | task-11 | `apps/web/src/components/account/delete-account-dialog.tsx`<br>`apps/web/src/components/account/__tests__/account.test.tsx` | `COVERED` | Quy trình 2 bước: tick cam kết mất vé -> gõ `XOÁ TÀI KHOẢN` |
| **R-30** | Tuỳ chọn email khuyến mãi (opt-in, mặc định tắt) | task-11 | `apps/web/src/app/(public)/tai-khoan/thong-bao/page.tsx` | `COVERED` | Switch opt-in lưu vào `profiles.marketing_opt_in` |
| **R-31** | Rạp yêu thích: tối đa 3 rạp, ưu tiên hiển thị | task-11 | `apps/web/src/app/(public)/tai-khoan/rap-yeu-thich/page.tsx` | `COVERED` | Xem và huỷ rạp yêu thích |
| **R-33** | Chặn đổi trạng thái rạp khi còn suất tương lai đã bán vé | task-08 | `apps/api/src/modules/cancellation/cancellation.controller.ts`<br>`apps/api/test/cancellation.e2e-spec.ts` | `COVERED` | Bắt lỗi DB 23514 ném HTTP 409 kèm danh sách `showtimeIds` |
| **R-39** | Gán rạp cho nhân sự; bộ chọn rạp chỉ hiển thị rạp được gán | task-06<br>task-13 | `apps/api/src/modules/admin/users.controller.ts`<br>`apps/web/src/components/admin/cinema-scope-switcher.tsx`<br>`apps/web/src/components/admin/__tests__/shell.test.tsx` | `COVERED` | API gán rạp + dropdown switcher đồng bộ URL `?cinema=` |
| **R-59** | Sơ đồ ghế: Trống, Đang giữ, Đã bán, Khoá, giá theo loại | task-01 | `apps/api/src/modules/booking/seatmap.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Endpoint `GET /showtimes/:id/seatmap`, giấu PII, HELD hết hạn -> FREE |
| **R-61** | Giữ ghế 10 phút, đồng hồ đếm ngược | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Gọi RPC `hold_seats`, trả `holdExpiresAt` |
| **R-62** | Giữ ghế nguyên tử, unique DB, tranh chấp trả SEAT_TAKEN + list ghế | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Bắt lỗi `SEAT_TAKEN` (cả ghế đã bán lẫn ghế bị khoá), trả 409 |
| **R-63** | Hết hạn giữ ghế: tự động nhả ghế, đơn expired | task-01 | `apps/api/src/modules/booking/seatmap.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Ghế HELD hết hạn trả về FREE trên seatmap |
| **R-64** | Một đơn giữ / khách trên toàn chuỗi | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Tạo hold mới tự động huỷ hold cũ của khách qua RPC |
| **R-65** | Giới hạn đơn: tối đa 8 ghế/đơn, Sweetbox tính 2 | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Zod schema & RPC chặn vượt quá 8 ghế |
| **R-66** | Không để ghế lẻ giữa các ghế chọn/bán hoặc lối đi/tường | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Ánh xạ lỗi `ORPHAN_SEAT` sang HTTP 409 |
| **R-67** | Đóng bán online trước suất 15 phút | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Ánh xạ lỗi `SALES_CLOSED` sang HTTP 400 |
| **R-68** | Kiểm tra độ tuổi theo ngày sinh & xác nhận độ tuổi phim T13+ | task-01 | `apps/api/src/modules/booking/booking.controller.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Endpoint `POST /bookings/:id/age-confirm` cập nhật `age_confirmed` |
| **R-70** | Màn tóm tắt đơn: tên+địa chỉ rạp, phim, nhãn tuổi, suất, phòng, ghế, giá | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Endpoint `GET /bookings/:id` trả DTO tóm tắt đầy đủ |
| **R-71** | Xác nhận không huỷ / không hoàn; lưu bằng chứng đồng ý | task-01<br>task-02 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/src/modules/payment/payment.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | `POST /bookings/:id/consent` lưu `consent_at` + version; thanh toán yêu cầu consent |
| **R-72** | Chốt giá khi giữ ghế | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Đọc `unit_price` chốt từ `order_seats` |
| **R-73** | Tạo payment link PayOS (orderCode duy nhất, mô tả, hạn link = hạn hold) | task-02 | `apps/api/src/modules/payment/payment.service.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | `POST /bookings/:id/payment` tạo link PayOS khớp hạn giữ ghế |
| **R-74** | Xác nhận thanh toán qua webhook / server polling, chữ ký HMAC SHA256 | task-02 | `apps/api/src/modules/payment/webhook.controller.ts`<br>`apps/api/src/modules/payment/payos.client.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | Kiểm tra HMAC SHA256; sai chữ ký -> log WARN có orderCode, đơn không đổi |
| **R-75** | Webhook idempotent + đối chiếu số tiền nhận | task-02 | `apps/api/src/modules/payment/payment.service.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | Idempotent 2 tầng: `payment_events` + RPC `confirm_paid` |
| **R-76** | Thanh toán thành công: đơn paid, ghế sold, vé QR, email trong outbox | task-02 | `apps/api/src/modules/payment/payment.service.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | Chuyển trạng thái, sinh ticket và enqueue email outbox |
| **R-77** | Huỷ / hết hạn trên PayOS: nhả ghế ngay | task-02 | `apps/api/src/modules/payment/payment.controller.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | `POST /bookings/:id/payment/cancel` huỷ link và gọi `mark_payment_cancelled` |
| **R-78** | Thanh toán đến muộn: ghế trống -> paid; ghế đã bán -> needs_manual_review | task-02 | `apps/api/src/modules/payment/payment.service.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | Ghế bị chiếm -> chuyển `needs_manual_review`, enqueue email hướng dẫn |
| **R-79** | Màn đang xác nhận: polling trạng thái từ server | task-02 | `apps/api/src/modules/payment/payment.controller.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | `GET /bookings/:id/payment-status` phục vụ polling |
| **R-81** | Tuyệt đối không lưu dữ liệu thẻ / tài khoản ngân hàng | task-02 | `packages/shared/src/schemas/payment.ts`<br>`apps/api/src/modules/payment/payment.service.ts` | `COVERED` | Zod schema và PostgREST chỉ lưu mã GD, số tiền, trạng thái |
| **R-82** | Đơn 0đ: xác nhận trực tiếp qua confirm_zero_amount, bỏ qua PayOS | task-02 | `apps/api/src/modules/payment/payment.service.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `COVERED` | Bỏ qua PayOS, gọi RPC `confirm_zero_amount`, trả `status: "PAID"` |
| **R-85** | Mã đặt vé dạng `HN01-XXXXXX` & QR token ngẫu nhiên không PII | task-01<br>task-02<br>task-04 | `packages/shared/src/schemas/checkin.ts`<br>`apps/api/src/modules/checkin/checkin.service.ts` | `COVERED` | Sử dụng booking_code và qr_token ngẫu nhiên 32 hex |
| **R-86** | Email vé tiếng Việt (mã vé, QR, rạp, địa chỉ, hotline, cảnh báo R-133) | task-03 | `apps/api/src/modules/mail/templates.ts`<br>`apps/api/test/outbox-job.e2e-spec.ts` | `COVERED` | Template `renderTicketEmail` đầy đủ thông tin vé và chính sách |
| **R-90** | Tạo & quản lý voucher: Admin toàn quyền, Manager chỉ xem | task-06 | `apps/api/src/modules/admin/vouchers.controller.ts`<br>`apps/api/test/admin.e2e-spec.ts` | `COVERED` | Admin CRUD; Manager xem 200, tạo/sửa/xoá bị chặn 403 |
| **R-93** | Giữ & hoàn lượt dùng voucher theo vòng đời đơn | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | `POST/DELETE /bookings/:id/voucher` gọi RPC `apply_voucher` |
| **R-94** | Thông báo lỗi voucher phân biệt rõ ràng | task-01 | `apps/api/src/modules/booking/booking.helper.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Map 8 mã lỗi voucher từ DB sang HTTP response |
| **R-95** | Rate limit nhập voucher (quá 10 lần/phút/khách -> 429) | task-01 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Gọi RPC `hit_rate_limit`, vượt ngưỡng trả 429 `RATE_LIMITED` |
| **R-97** | Màn soát vé: quét QR hoặc nhập mã vé | task-04 | `apps/api/src/modules/checkin/checkin.controller.ts`<br>`apps/api/test/checkin.e2e-spec.ts` | `COVERED` | `POST /checkin/scan` nhận `tokenOrCode` |
| **R-98** | Kết quả soát vé màu rõ ràng (OK/USED/WRONG_CINEMA/CANCELLED/EXPIRED) | task-04 | `apps/api/src/modules/checkin/checkin.service.ts`<br>`apps/api/test/checkin.e2e-spec.ts` | `COVERED` | Ánh xạ mã kết quả kèm mã màu (`green`, `yellow`, `red`) |
| **R-99** | Quy tắc check-in: đúng rạp, cửa sổ -30' đến hết phim | task-04 | `apps/api/src/modules/checkin/checkin.service.ts`<br>`apps/api/test/checkin.e2e-spec.ts` | `COVERED` | Thực thi qua RPC `checkin_ticket` |
| **R-101** | Ghi log mọi lượt quét vào checkin_logs | task-04 | `apps/api/src/modules/checkin/checkin.service.ts`<br>`apps/api/test/checkin.e2e-spec.ts` | `COVERED` | RPC ghi log staff, rạp, kết quả, thời điểm |
| **R-102** | Không lộ dữ liệu vé khi quét sai rạp (Non-disclosure) | task-04 | `apps/api/src/modules/checkin/checkin.service.ts`<br>`apps/api/test/checkin.e2e-spec.ts` | `COVERED` | `WRONG_CINEMA` chỉ trả tên+địa chỉ rạp đúng; giấu 100% PII |
| **R-103** | Tra cứu đơn hàng theo mã vé, email, SĐT, mã PayOS; Staff chỉ rạp mình | task-07 | `apps/api/src/modules/orders/orders.controller.ts`<br>`apps/api/test/orders-report.e2e-spec.ts` | `COVERED` | Tra cứu đa tiêu chí; Staff rạp khác bị chặn 403 |
| **R-104** | Xử lý đơn needs_manual_review: CONFIRM_SALE -> paid, hoàn tiền | task-07 | `apps/api/src/modules/orders/orders.service.ts`<br>`apps/api/test/orders-report.e2e-spec.ts` | `COVERED` | `POST /admin/orders/:id/resolve-manual-review`; Staff chỉ đọc 403 |
| **R-105** | Quản lý người dùng & vai trò: Admin khoá tài khoản, gán Admin/Staff | task-06 | `apps/api/src/modules/admin/users.controller.ts`<br>`apps/api/test/admin.e2e-spec.ts` | `COVERED` | Admin quản lý tài khoản; Manager chỉ thêm/bớt Staff rạp mình |
| **R-106** | Cấu hình toàn chuỗi: thời gian giữ ghế, cảnh báo không hoàn tiền | task-06 | `apps/api/src/modules/admin/settings.controller.ts`<br>`apps/api/test/admin.e2e-spec.ts` | `COVERED` | Admin sửa ghi audit; Manager chỉ xem |
| **R-107** | Audit log: ghi nhận thao tác, tra cứu có lọc | task-06 | `apps/api/src/modules/admin/audit.controller.ts`<br>`apps/api/test/admin.e2e-spec.ts` | `COVERED` | Tra cứu audit logs theo rạp/toàn chuỗi |
| **R-108** | Huỷ suất chiếu hàng loạt: preview + cancel atomic | task-08 | `apps/api/src/modules/cancellation/cancellation.controller.ts`<br>`apps/api/test/cancellation.e2e-spec.ts` | `COVERED` | `preview_cancel_showtimes` & `cancel_showtimes` |
| **R-109** | Email thông báo hàng loạt: chỉ hoàn tiền thủ công, KHÔNG đổi suất | task-03<br>task-08 | `apps/api/src/modules/mail/templates.ts`<br>`apps/api/src/modules/cancellation/cancellation.service.ts`<br>`apps/api/test/cancellation.e2e-spec.ts` | `COVERED` | Template `renderShowtimeCancelledEmail`, hotline `1900 0000`, có resend |
| **R-110** | Đơn bị ảnh hưởng: hoàn tiền thủ công số tiền + mã GD (422 khi thiếu), CSV | task-08 | `apps/api/src/modules/cancellation/cancellation.service.ts`<br>`apps/api/src/modules/cancellation/affected-csv.ts`<br>`apps/api/test/cancellation.e2e-spec.ts` | `COVERED` | Bắt buộc số tiền + mã GD ngân hàng; xuất CSV UTF-8 BOM |
| **R-112** | Báo cáo doanh thu theo kỳ (ngày/tuần/tháng) | task-07 | `apps/api/src/modules/orders/orders.controller.ts`<br>`apps/api/test/orders-report.e2e-spec.ts` | `COVERED` | `GET /admin/reports/revenue` gọi RPC `report_revenue` |
| **R-113** | Báo cáo doanh thu theo phim / suất / rạp | task-07 | `apps/api/src/modules/orders/orders.controller.ts`<br>`apps/api/test/orders-report.e2e-spec.ts` | `COVERED` | `GET /admin/reports/movie-showtimes` gọi RPC `report_by_movie_showtime` |
| **R-116** | Báo cáo đối soát PayOS (lệch tiền, pending quá hạn) | task-07 | `apps/api/src/modules/orders/orders.controller.ts`<br>`apps/api/test/orders-report.e2e-spec.ts` | `COVERED` | `GET /admin/reports/payos-reconciliation` gọi RPC |
| **R-131** | Không huỷ / không hoàn cho khách (vé đã paid) | task-01 | `apps/api/src/modules/booking/booking.controller.ts` | `COVERED` | Không có endpoint huỷ vé đã thanh toán cho khách |
| **R-132** | Vé chỉ dùng tại rạp ghi trên vé | task-04 | `apps/api/src/modules/checkin/checkin.service.ts`<br>`apps/api/test/checkin.e2e-spec.ts` | `COVERED` | Quét nhầm rạp trả `WRONG_CINEMA`, không check-in được |
| **R-133** | Cảnh báo không hoàn tiền nhiều lớp & lưu bằng chứng đồng ý | task-01<br>task-03 | `apps/api/src/modules/booking/booking.service.ts`<br>`apps/api/src/modules/mail/templates.ts`<br>`apps/api/test/booking.e2e-spec.ts` | `COVERED` | Lưu consent thời điểm + version; cảnh báo trong email vé |
| **R-134** | Ngoại lệ hoàn tiền thủ công ngoài hệ thống | task-07<br>task-08 | `apps/api/src/modules/cancellation/cancellation.service.ts`<br>`apps/api/test/cancellation.e2e-spec.ts` | `COVERED` | Ghi nhận hoàn tiền thủ công cho đối soát, không gọi API PayOS refund |

---

## 3. Acceptance Criteria Verification

| AC Code | Tiêu chí chấp nhận | Task | Bằng chứng kiểm thử tự động | Đánh giá |
|---|---|---|---|:---:|
| **AC-01** | Khách chưa xác nhận email thử giữ ghế bị chặn `EMAIL_NOT_CONFIRMED` | task-01 | `apps/api/test/booking.e2e-spec.ts` (test case 1) | `PASS` |
| **AC-02** | Bấm "Gửi lại email" -> nút vô hiệu hoá kèm đếm ngược 60s | task-10<br>task-11 | `apps/web/src/components/account/__tests__/account.test.tsx` (fake timers 60s) | `PASS` |
| **AC-03** | Nhập sai mật khẩu 5 lần -> khoá 15 phút, UI cảnh báo `ACCOUNT_LOCKED` | task-10 | `apps/web/src/components/auth/__tests__/auth-forms.test.tsx` (test case lockout) | `PASS` |
| **AC-04** | Đăng nhập Google trùng email mật khẩu không tự gộp; yêu cầu đăng nhập mật khẩu | task-12 | `apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `PASS` |
| **AC-05** | Tài khoản chỉ còn một phương thức đăng nhập -> chặn huỷ liên kết | task-12 | `apps/web/src/components/account/__tests__/linked-accounts.test.tsx` | `PASS` |
| **AC-06** | Hai khách cùng chọn E5 -> đúng 1 thành công, người kia 409 `SEAT_TAKEN` | task-01 | `apps/api/test/booking.e2e-spec.ts` (test concurrency E5) | `PASS` |
| **AC-08** | Tạo payment khi chưa có consent -> 409 `CONSENT_REQUIRED`; consent lưu thời điểm + version | task-01<br>task-02 | `apps/api/test/booking.e2e-spec.ts`<br>`apps/api/test/webhook.e2e-spec.ts` | `PASS` |
| **AC-09** | Webhook giả mạo chữ ký sai -> đơn không đổi trạng thái + log cảnh báo có `orderCode` | task-02 | `apps/api/test/webhook.e2e-spec.ts` (test case invalid HMAC) | `PASS` |
| **AC-10** | PayOS gửi cùng webhook 3 lần -> đúng 1 payment event, 1 ticket, 1 email outbox | task-02 | `apps/api/test/webhook.e2e-spec.ts` (test idempotency 3x) | `PASS` |
| **AC-11** | Tiền về muộn khi ghế đã bán -> đơn `needs_manual_review` + email khách hướng dẫn | task-02<br>task-07 | `apps/api/test/webhook.e2e-spec.ts`<br>`apps/api/test/orders-report.e2e-spec.ts` | `PASS` |
| **AC-12** | Quét lại vé đã check-in -> báo vàng `USED` kèm thời điểm & người soát lần đầu | task-04 | `apps/api/test/checkin.e2e-spec.ts` (test case USED) | `PASS` |
| **AC-13** | Vé HN01 quét tại HN02 -> báo đỏ `WRONG_CINEMA` chỉ có tên/địa chỉ HN01, giấu 100% PII | task-04 | `apps/api/test/checkin.e2e-spec.ts` (test case WRONG_CINEMA) | `PASS` |
| **AC-16** | Phân quyền rạp: Manager HN01 truy vấn đơn/báo cáo HN02 bị chặn 403 `FORBIDDEN_CINEMA` | task-04<br>task-06<br>task-07<br>task-08 | `apps/api/test/checkin.e2e-spec.ts`<br>`apps/api/test/admin.e2e-spec.ts`<br>`apps/api/test/orders-report.e2e-spec.ts`<br>`apps/api/test/cancellation.e2e-spec.ts` | `PASS` |
| **AC-24** | Huỷ suất có 10 đơn paid -> 10 affected + 10 email outbox; hiển thị trên màn hình | task-08 | `apps/api/test/cancellation.e2e-spec.ts` (test huỷ 10 đơn) | `PASS` |
| **AC-25** | Hoàn tiền thủ công thiếu số tiền / mã GD -> 422; đủ -> `refunded_manual`; Staff rạp mình được ghi | task-08 | `apps/api/test/cancellation.e2e-spec.ts` (test 422 & 201) | `PASS` |
| **AC-26** | Chặn đóng rạp khi còn suất tương lai đã bán vé -> 409 kèm danh sách showtimeIds | task-08 | `apps/api/test/cancellation.e2e-spec.ts` (test đóng rạp 409) | `PASS` |

---

## 4. Verification of Adversarial Defect Closures (Audit chuyên sâu)

Quá trình Adversarial Review độc lập tại Layer 5 đã bóc tách và giải quyết triệt để 12 defect nghiêm trọng trước khi phê duyệt:

1. **Khắc phục lỗi phân quyền Postgres `42501` trên bảng `orders` & `consents` (Task 01):**
   - Bảng `orders` chỉ có quyền `GRANT SELECT` cho `authenticated`; không có quyền `UPDATE`. Khi khách xác nhận độ tuổi hoặc đồng ý điều khoản, code đã chuyển sang sử dụng `this.supabase.admin().from("orders").update(...)` sau khi đã kiểm tra quyền sở hữu đơn tại API layer.
   - Bảng `consents` chỉ cho phép `GRANT INSERT` trên 4 cột (`user_id`, `consent_type`, `version`, `metadata`), không cho phép insert cột `accepted_at`. Payload đã được loại bỏ trường `accepted_at` để Postgres tự sinh `default now()`.
2. **Khắc phục RLS policy `vouchers_select` chặn hiển thị mã voucher (Task 01):**
   - RLS của `vouchers` chỉ cho phép Admin/Manager đọc (chống dò mã). Khi khách xem tóm tắt đơn của mình (`GET /bookings/:id`), sau khi xác thực quyền sở hữu, service dùng `admin()` để tra cứu mã voucher đã áp dụng và trả về cho khách.
3. **Khắc phục Regex bóc tách danh sách ghế `SEAT_TAKEN` khi ghế bị khoá (Task 01):**
   - Sửa regex linh hoạt `/Ghế\s+(.+?)\s+(?:đã|đang)/i` để bắt trọn cả thông báo `'Ghế E5 đang bị khoá'` của RPC `hold_seats`, trả về mảng `details.seats: ['E5']` chính xác.
4. **Khắc phục Check Constraint `audit_logs_action_check` lỗi 23514 (Task 07):**
   - Bảng `audit_logs` có ràng buộc cứng `check (action in ('INSERT', 'UPDATE', 'DELETE'))`. Round 1 Builder chèn giá trị `"RESOLVE_MANUAL_REVIEW_CONFIRM_SALE"` vi phạm constraint. Round 2 đã đổi thành `"UPDATE"` và đưa chi tiết nghiệp vụ vào `after_data`.
5. **Khắc phục PostgREST Relationship Embedding Mismatch trên `showtimes` (Task 07):**
   - Bảng `showtimes` không có Foreign Key trực tiếp tới `cinemas` (mà dùng composite FK `(room_id, cinema_id) -> rooms`). Loại bỏ embedding lỗi `cinemas(name)`, chuyển sang truy vấn riêng qua `Promise.all` với bảng `cinemas` và `rooms` trong `GET /admin/todo`.
6. **Khắc phục State Machine Gap giữa `CONFIRM_SALE` và `checkin_ticket` (Task 07):**
   - Khi Manager giải quyết đơn `needs_manual_review` bằng `action: "CONFIRM_SALE"`, service cập nhật `orders.status = 'paid'`. Điều này đảm bảo khi khách cầm vé đến rạp, RPC `checkin_ticket` (yêu cầu `order_status in ('paid', 'checked_in')`) soát vé thành công, không bị từ chối oan.
7. **Khắc phục form Đổi mật khẩu cho người dùng OAuth-only (Task 11):**
   - Ẩn form đổi mật khẩu khi tài khoản không có phương thức mật khẩu (`hasPassword === false`), đồng thời không bắt nhập mật khẩu cũ trong dialog xoá tài khoản.
8. **Khắc phục rò rỉ bộ nhớ Object URL trong `AvatarUpload` (Task 11):**
   - Bổ sung `useEffect` cleanup `URL.revokeObjectURL(previewUrl)` khi component unmount, khi chọn ảnh mới và khi huỷ xem trước.
9. **Khắc phục quy chuẩn kích thước file và hàm (Task 01, 11):**
   - Tách `booking.helper.ts`, `change-email-dialog.tsx`, đảm bảo 100% các file component và service đều tuân thủ ≤ 300 dòng và hàm ≤ 50 dòng theo `project-config.md`.
10. **Khắc phục Mock False-Confidence trong các bài test E2E (Task 01, 07):**
    - Cập nhật các class `FakeDb` trong test suite mô phỏng trung thực mã lỗi Postgres `42501`, `23514` và PostgREST embedding `PGRST200`, có test cases assert chuyên biệt.

---

## 5. Non-functional Requirements & Edge Cases Verification

- **NFR-04 (Toàn vẹn & Chống double-booking):** Ràng buộc unique DB và khoá hàng tuần tự hoá bảo đảm không bán trùng ghế; kiểm tra ghế trùng trước khi `CONFIRM_SALE` trong `resolveManualReview`.
- **NFR-05 (Bảo mật RLS & Phân quyền rạp):** Mọi endpoint nội bộ đều kiểm tra ranh giới rạp qua `CinemaScopeGuard` và DB RLS. Manager/Staff rạp HN01 bị chặn 403 tuyệt đối khi truy cập dữ liệu rạp HN02.
- **NFR-06 (Bảo mật ứng dụng & OWASP Top 10):**
  - Chống Open Redirect: `sanitizeNext` lọc bỏ protocol injection (`javascript:`) và URL tuyệt đối.
  - Chống XSS: `escapeHtml` trong toàn bộ email templates tiếng Việt.
  - Chống Webhook Spoofing: HMAC SHA256 checksum bắt buộc với PayOS webhook envelope.
  - Chống Timing Attack: `JobSecretGuard` băm SHA-256 và so khớp bằng `crypto.timingSafeEqual`.
  - Chống BOLA/IDOR: Xác thực quyền sở hữu đơn hàng (`order.user_id === user.id`) trên mọi endpoint khách hàng.
- **NFR-08 (Bảo vệ dữ liệu cá nhân & Nghị định 13/2023/NĐ-CP):**
  - Giấu 100% PII khi soát vé sai rạp (`WRONG_CINEMA` chỉ trả tên và địa chỉ rạp đúng, không lộ tên khách, email, ghế).
  - Quy trình Xoá tài khoản 2 bước có cam kết mất vé và ẩn danh hoá thông tin cá nhân.
  - Chống Account Enumeration (R-12): Thông báo trung tính ở form Quên mật khẩu, Đăng ký và Bổ sung email Facebook.
- **NFR-10 (Email giao dịch):**
  - Mail Worker Resend xử lý batch từ `email_outbox`, exponential backoff `2^attempts` phút, tối đa 3 lần thử -> FAILED kèm `last_error`.
  - Concurrency lock kép (DB conditional update + in-memory Set) ngăn ngừa gửi trùng email khi chạy nhiều job song song.
- **NFR-11, 12 (Giao diện, A11y & Responsive):**
  - Responsive mobile-first (≥ 360px): Hỗ trợ layout thu gọn, menu Sheet Radix UI trên mobile dưới 768px.
  - A11y WCAG 2.1 AA: Touch target ≥ 44px, `<Label htmlFor>`, `aria-invalid`, `role="alert"`, `aria-current="page"`, focus ring rõ nét.
- **NFR-15 (Múi giờ & Tiền tệ):** Lưu UTC, hiển thị `Asia/Ho_Chi_Minh`; tiền tệ VND số nguyên không phần thập phân.
- **NFR-17 (Kiểm thử tự động):** 374 tests tự động (API + Web) đạt tỷ lệ pass 100%.

---

## 6. Scope Change & Deferred Features Reconciliation

1. **CR `remove-pos` (spec 2.0.0):**
   - Đã gỡ bỏ toàn bộ module và endpoint POS (`/pos/v1/*`, `pos-sim`).
   - Task-05 được đánh dấu `removed` trong kế hoạch và bỏ qua trong quá trình thực thi.
   - Giao diện Admin Shell (`task-13`) đã loại bỏ hoàn toàn các liên kết điều hướng liên quan đến POS.
2. **CR `remove-showtime-exchange` (spec 3.0.0):**
   - Đã loại bỏ hoàn toàn tính năng đổi suất khi rạp huỷ suất.
   - Template email huỷ suất (`task-03`) và màn Đơn bị ảnh hưởng (`task-08`) chỉ hướng dẫn liên hệ CSKH rạp (hotline mặc định `1900 0000`) để hoàn tiền thủ công; không có trường dữ liệu hoặc trạng thái `exchanged`.
3. **Các tính năng thuộc Giai đoạn 2 (GĐ2 theo BRD §15):**
   - Combo bắp nước theo rạp (R-58, R-69, R-100), voucher theo phạm vi rạp (R-91, AC-18), gợi ý rạp gần nhất (R-36), email nhắc lịch 2h (R-88), file `.ics` (R-89), dashboard tổng quan (R-118), và các báo cáo nâng cao (R-114, R-115, R-117) được giữ nguyên phạm vi GĐ2, không làm phình to MVP.

---

## 7. Kết luận & Kiến nghị

### Verdict: `✅ COMPLETE` (STRICT PASS)

Layer 5 của dự án FilmBooking đã hoàn thành 100% các mục tiêu kỹ thuật, nghiệp vụ và bảo mật theo đặc tả `SPECIFICATIONS.md` (phiên bản 3.0.0). Toàn bộ 12 tasks đã được Adversarial Pro Reviewer cấp chứng nhận `STRICT PASS` sau khi xử lý triệt để các lỗ hổng ranh giới. Toàn bộ pipeline kiểm tra tự động monorepo (`lint`, `typecheck`, `test` 374/374, `build`) đều đạt kết quả xuất sắc.

### Khuyến nghị cho Human Checkpoint 5:
- Hệ thống đã sẵn sàng cho **Human Checkpoint 5** để người dùng nghiệm thu toàn diện Layer 5 và phê duyệt kế hoạch triển khai **Layer 6** (Web Đặt vé `/dat-ve/[showtimeId]`, Sơ đồ ghế SVG/Canvas, Realtime Supabase Channels, Màn hình thanh toán PayOS / Polling, Màn hình Vé của tôi và Quét vé Soát vé Staff Web).
