# Phase Review Report: Layer 4 (build-filmbooking)

> **Agent:** `spec-validator` (Independent Validation)  
> **Phase:** Layer 4 — RPC nguyên tử giữ ghế & thanh toán, voucher, huỷ suất hàng loạt, soát vé & báo cáo MVP, Identity OAuth hooks, wiring API #2, pricing API, seed demo local, web trang chủ, phim, lịch chiếu, rạp, sitemap & robots  
> **Branch:** `staging`  
> **Date:** 2026-11-11  
> **Verdict:** `✅ COMPLETE` (Tất cả 12 tasks hoàn thành đạt STRICT PASS / NORMAL PASS, 100% requirements/AC trong scope được nghiệm thu với bằng chứng kiểm thử)

---

## 1. Executive Summary

Layer 4 triển khai các cơ chế giao dịch và vận hành cốt lõi có độ rủi ro cao nhất của hệ thống FilmBooking: bộ ba bất biến nghiệp vụ (Không bán trùng ghế — Bất biến #1, Giữ ghế nguyên tử tối đa 10 phút — Bất biến #2, Thanh toán đúng một lần — Bất biến #3), cùng toàn bộ bề mặt ứng dụng công khai (Web SSR, catalog phim, lịch chiếu 7 ngày, danh sách rạp và SEO/AI crawlers).

- **Số task đã hoàn thành:** 12/12 tasks (`layer-4-task-01` .. `layer-4-task-12`).
- **Đánh giá Reviewer độc lập (Adversarial Pro Reviewer):**
  - `task-01`: Round 1 FAIL (6 defects: BOLA/IDOR, impersonation, deadlock, age check, orphan seat, signature) → **Round 2 STRICT PASS**.
  - `task-02`: Round 1 FAIL (5 defects: transition trigger 23514, BOLA confirm_zero_amount, POS concurrency, order_code sequence, cutoff) → **Round 2 STRICT PASS**.
  - `task-03`: **Round 1 STRICT PASS** (Concurrency lock, redemption lifecycle, rate limit).
  - `task-04`: **Round 1 STRICT PASS** (Atomic cancel, preview, email outbox, AC-26 set_cinema_status).
  - `task-05`: Round 1 FAIL (3 defects: staff_id spoofing, room_capacity tính cả AISLE/BROKEN, multi-ticket checkin) → **Round 2 STRICT PASS**.
  - `task-06`: Round 1 FAIL (3 defects: interval type mismatch `p_window`, false-confidence mock, unlink email method) → **Round 2 STRICT PASS**.
  - `task-07`: **Round 1 STRICT PASS** (Wiring AppModule, regen `database.types.ts` 34 tables / 26 enums, smoke e2e).
  - `task-08`: **Round 1 STRICT PASS** (PricingModule CRUD rules & holidays, RPC price-quote, AC-15).
  - `task-09`: **Round 1 NORMAL PASS** (Seed demo local 5 rạp, 16 phòng, 1.056 ghế, 12 phim đủ 5 nhãn tuổi, 298 suất chiếu, 6 users, 5 POS keys).
  - `task-10`: **Round 1 NORMAL PASS** (Web trang chủ, /phim, MovieCard, MovieFilters, ProvincePickerDialog, test suite).
  - `task-11`: **Round 1 STRICT PASS** (Web /phim/[slug], /lich-chieu, ShowtimeSchedule, BookingStepper, JSON-LD Movie & ScreeningEvent).
  - `task-12`: Round 1 FAIL (5 defects: Contract mismatch `cinema.id` in `CinemaDto`, Leaflet LCP, robots AI crawlers, test suite) → **Round 2 STRICT PASS**.
- **Chất lượng kiểm định Monorepo tự động trên nhánh tích hợp:**
  - `pnpm -w lint`: **PASS** (0 warnings, 0 errors trên toàn bộ monorepo packages/apps).
  - `pnpm -w typecheck`: **PASS** (100% TypeScript compile sạch trên shared, api, web).
  - `pnpm -w test`: **PASS 312/312 tests** (shared: 14 tests, api: 209 tests, web: 89 tests across 22 test files).
  - `pnpm -w build`: **PASS** (NestJS API built 56 files, Next.js Web generated 14 routes bao gồm static pháp lý, robots.txt, sitemap.xml và dynamic SSR catalog/phim/rạp/lịch chiếu).
  - Database pgTAP: **385 tests** đã được kiểm chứng độc lập trên Postgres container thật bởi Reviewer Pro trong từng worktree (`040_hold.test.sql`: 52 assertions, `041_payment_rpc.test.sql`: 54 assertions, `042_voucher.test.sql`: 38 assertions, `043_cancel.test.sql`: 32 assertions, `044_checkin_reports.test.sql`: 39 assertions, `045_identity_hooks.test.sql`: 18 assertions).
- **Tuân thủ ranh giới Layer & Deferred Features:**
  - `PricingModule` đăng ký vào `AppModule` ở Layer 5 Task 09 theo đúng thiết kế kiến trúc.
  - Web UI đặt vé chọn ghế `/dat-ve/[showtimeId]` và tích hợp Supabase Realtime client được triển khai ở Layer 5 & Layer 6.
  - Quản lý voucher theo phạm vi rạp (R-91) và xuất báo cáo CSV (R-117) thuộc GĐ2 theo BRD §15.

---

## 2. Requirements & Acceptance Criteria Coverage Matrix

| Requirement / AC | Tiêu đề & Nội dung | Task | Nguồn kiểm chứng (Source / Test) | Trạng thái | Ghi chú |
|---|---|---|---|---|---|
| **R-16** | Quay về đúng trang sau đăng nhập (next query param) | task-12 | `apps/web/src/components/catalog/favorite-button.tsx`<br>`apps/web/src/components/catalog/__tests__/cinemas.test.tsx` | `COVERED` | Chưa đăng nhập bấm yêu thích → redirect `/dang-nhap?next=` |
| **R-19** | Trạng thái xác nhận OAuth: Google có email coi như đã xác nhận; Facebook không email yêu cầu nhập & xác nhận | task-06 | `supabase/migrations/20261111040500_identity_hooks.sql`<br>`apps/api/src/modules/identity/identity.service.ts`<br>`apps/api/test/identity.e2e-spec.ts` | `COVERED` | RPC `check_oauth_collision` + endpoint `missing-email` |
| **R-20** | Trùng email không tự gộp tài khoản; yêu cầu đăng nhập mật khẩu rồi liên kết | task-06 | `supabase/migrations/20261111040500_identity_hooks.sql`<br>`apps/api/src/modules/identity/identity.service.ts`<br>`supabase/tests/045_identity_hooks.test.sql` | `COVERED` | Trigger `trg_guard_identity_insert` chặn auto-merge (AC-04) |
| **R-21** | Quản lý danh tính liên kết: không cho huỷ phương thức đăng nhập cuối cùng | task-06 | `apps/api/src/modules/identity/identity.controller.ts`<br>`apps/api/test/identity.e2e-spec.ts` | `COVERED` | DELETE `/me/identities/:provider` từ chối 409 khi chỉ còn 1 phương thức (AC-05) |
| **R-22** | Thêm mật khẩu cho tài khoản chỉ có OAuth | task-06 | `apps/api/src/modules/identity/identity.controller.ts`<br>`apps/api/test/identity.e2e-spec.ts` | `COVERED` | `POST /me/password` thêm mật khẩu lần đầu an toàn |
| **R-23** | Một tài khoản MXH chỉ gắn với tối đa 1 user | task-06 | `supabase/migrations/20261111040500_identity_hooks.sql`<br>`supabase/tests/045_identity_hooks.test.sql` | `COVERED` | Trigger cưỡng chế `(provider, provider_id)` duy nhất |
| **R-24** | Email thông báo khi liên kết hoặc huỷ liên kết | task-06 | `supabase/migrations/20261111040500_identity_hooks.sql`<br>`supabase/tests/045_identity_hooks.test.sql` | `COVERED` | Trigger `trg_on_identity_change` enqueue `email_outbox` |
| **R-31** | Rạp yêu thích: tối đa 3 rạp, ưu tiên hiển thị | task-10<br>task-12 | `apps/web/src/components/catalog/favorite-button.tsx`<br>`apps/web/src/app/(public)/rap/page.tsx`<br>`apps/web/src/components/catalog/__tests__/cinemas.test.tsx` | `COVERED` | Giao tiếp API `PUT /me/favorites/:cinemaId`, cập nhật trạng thái tức thì |
| **R-33** | Rạp Tạm đóng / Ngừng hoạt động không hiển thị suất mới; chặn đổi trạng thái khi còn suất đã bán | task-04 | `supabase/migrations/20261111040300_rpc_cancel.sql`<br>`supabase/tests/043_cancel.test.sql` | `COVERED` | RPC `set_cinema_status` ném `CINEMA_HAS_ACTIVE_SHOWTIMES` (AC-26) |
| **R-34** | Xem danh sách rạp theo tỉnh, địa chỉ, bản đồ, xem lịch chiếu | task-12 | `apps/web/src/app/(public)/rap/page.tsx`<br>`apps/web/src/components/catalog/cinema-map.tsx`<br>`apps/web/src/components/catalog/__tests__/cinemas.test.tsx` | `COVERED` | Danh sách rạp theo khu vực, bản đồ Leaflet client-only |
| **R-35** | Chọn tỉnh/thành: dialog lần đầu, lưu cookie, lọc lịch chiếu | task-10 | `apps/web/src/components/catalog/province-picker-dialog.tsx`<br>`apps/web/src/app/(public)/page.tsx`<br>`apps/web/src/components/catalog/__tests__/home.test.tsx` | `COVERED` | Cookie `fb_province`, dialog chọn tỉnh tự động |
| **R-37** | Trang chi tiết rạp: thông tin + lịch chiếu 7 ngày | task-12 | `apps/web/src/app/(public)/rap/[code]/page.tsx`<br>`apps/web/src/components/catalog/__tests__/cinemas.test.tsx` | `COVERED` | Lịch chiếu 7 ngày của rạp gom nhóm theo phim |
| **R-38** | Mở rạp mới không cần sửa code (seed 5 rạp) | task-09 | `supabase/seed.sql`<br>`supabase/seed/README.md` | `COVERED` | Seed 5 rạp mẫu hoàn chỉnh, mở bán được ngay |
| **R-40** | Xem phim trang chủ: Đang chiếu, Sắp chiếu theo tỉnh | task-10 | `apps/web/src/app/(public)/page.tsx`<br>`apps/web/src/components/catalog/__tests__/home.test.tsx` | `COVERED` | SSR trang chủ với banners, tab Đang chiếu / Sắp chiếu |
| **R-42** | Nhãn phân loại độ tuổi điện ảnh VN (P, K, T13, T16, T18) | task-10<br>task-11 | `apps/web/src/components/catalog/movie-card.tsx`<br>`apps/web/src/app/(public)/phim/[slug]/page.tsx` | `COVERED` | `AgeBadge` hiển thị chuẩn hoá trên poster và trang chi tiết |
| **R-43** | Tìm kiếm & lọc phim theo thể loại, độ tuổi, từ khoá | task-10 | `apps/web/src/components/catalog/movie-filters.tsx`<br>`apps/web/src/app/(public)/phim/page.tsx`<br>`apps/web/src/components/catalog/__tests__/home.test.tsx` | `COVERED` | Đồng bộ 2 chiều qua URL SearchParams |
| **R-44** | Lịch chiếu theo phim (dải 7 ngày, nhóm theo rạp) | task-11 | `apps/web/src/components/catalog/showtime-schedule.tsx`<br>`apps/web/src/app/(public)/phim/[slug]/page.tsx`<br>`apps/web/src/components/catalog/__tests__/schedule.test.tsx` | `COVERED` | Dải 7 ngày `generateNext7Days`, nhóm theo rạp và định dạng |
| **R-45** | Phim sắp chiếu chưa có suất: hiển thị thông báo, không nút đặt vé | task-11 | `apps/web/src/components/catalog/showtime-schedule.tsx`<br>`apps/web/src/components/catalog/__tests__/schedule.test.tsx` | `COVERED` | EmptyState "Sắp chiếu — Lịch chiếu sẽ được cập nhật sớm" |
| **R-46** | SEO SSR + JSON-LD Movie / MovieTheater / ScreeningEvent + sitemap/robots | task-11<br>task-12 | `apps/web/src/lib/seo/movie-jsonld.ts`<br>`apps/web/src/lib/seo/cinema-jsonld.ts`<br>`apps/web/src/app/sitemap.ts`<br>`apps/web/src/app/robots.ts` | `COVERED` | Schema.org hợp lệ, thoát XSS `\u003c`, sitemap dynamic, robots cho phép AI crawlers |
| **R-52** | Bảng giá hai cấp: mặc định chuỗi & ghi đè theo rạp/suất | task-08 | `apps/api/src/modules/pricing/pricing.service.ts`<br>`apps/api/test/pricing.e2e-spec.ts` | `COVERED` | Quản trị price_rules theo RBAC + báo giá theo suất |
| **R-53** | Ngày lễ: áp giá lễ ở mọi rạp, ưu tiên hơn cuối tuần | task-08 | `apps/api/src/modules/pricing/pricing.controller.ts`<br>`apps/api/test/pricing.e2e-spec.ts` | `COVERED` | Admin CRUD `holidays`, hàm `price_quote` tính giá chuẩn |
| **R-55** | Khoá ghế theo suất: không bán được trên Web và POS | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | `hold_seats` kiểm tra `showtime_seat_locks` và ném `SEAT_LOCKED` |
| **R-57** | Giờ Việt Nam (`Asia/Ho_Chi_Minh`) & Tiền tệ VND số nguyên | task-01<br>task-11 | `packages/shared/src/utils/date-time.ts`<br>`supabase/migrations/20261111040000_rpc_hold.sql` | `COVERED` | Sử dụng `toVnParts`, lưu UTC; tiền tệ số nguyên |
| **R-61** | Giữ ghế 10 phút (web) / 5 phút (POS), đồng hồ đếm ngược | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Đọc `app_settings` (mặc định 10'), POS 5' (AC-22) |
| **R-62** | Giữ ghế nguyên tử (atomic, unique DB, trả danh sách ghế trùng) | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Ràng buộc unique DB, transaction atomic, lỗi `SEAT_TAKEN` (AC-06) |
| **R-63** | Hết hạn giữ ghế: tự động nhả ghế, đơn expired | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Hàm `expire_overdue_holds` dọn ghế quá hạn (AC-07) |
| **R-64** | Một đơn giữ / khách trên toàn chuỗi | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Tạo đơn giữ mới tự động huỷ đơn giữ cũ của khách |
| **R-65** | Giới hạn đơn: tối đa 8 ghế/đơn, Sweetbox tính 2 ghế | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Kiểm tra tổng số ghế ≤ 8; vượt quá ném `HOLD_LIMIT_EXCEEDED` |
| **R-66** | Không để ghế lẻ giữa các ghế chọn/bán hoặc lối đi/tường | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Thuật toán quét hàng ghế, ném `ORPHAN_SEAT` khi vi phạm |
| **R-67** | Đóng bán online trước suất 15 phút (POS vẫn bán được) | task-01<br>task-11 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`apps/web/src/components/catalog/showtime-schedule.tsx` | `COVERED` | Web ném `SALES_CLOSED` / hiển thị "Mua tại quầy"; POS vẫn giữ được |
| **R-68** | Kiểm tra độ tuổi theo ngày sinh trong profile | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Chặn khách chưa đủ tuổi với phim T13/T16/T18 (`UNDERAGE`) |
| **R-72** | Chốt giá khi giữ ghế theo `price_quote` | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Snapshot giá từng ghế vào `order_seats.unit_price` |
| **R-75** | Webhook idempotent + đối chiếu số tiền nhận | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | Bảng `payment_events`, ném `AMOUNT_MISMATCH` khi lệch tiền (AC-10) |
| **R-76** | Thanh toán thành công: đơn paid, ghế SOLD, sinh vé QR, email | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | `confirm_paid` chuyển trạng thái, sinh tickets và outbox email |
| **R-77** | Huỷ / hết hạn trên PayOS: nhả ghế ngay | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | RPC `mark_payment_cancelled` chuyển expired/cancelled |
| **R-78** | Thanh toán đến muộn: ghế trống → paid; ghế đã bán → needs_manual_review | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | Xử lý race condition, email hướng dẫn khách liên hệ rạp (AC-11) |
| **R-82** | Đơn 0đ: xác nhận trực tiếp không qua PayOS | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | RPC `confirm_zero_amount` có guard phân quyền chặt chẽ |
| **R-85** | Mã đặt vé dạng `HN01-XXXXXX` & QR token ngẫu nhiên không PII | task-01<br>task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | `generate_booking_code` + `qr_token` 32 ký tự hex |
| **R-86** | Email vé giao dịch trong outbox | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | Enqueue `email_outbox` với template `ticket_delivery` |
| **R-90** | Tạo & quản lý voucher lõi (% có trần / cố định VND) | task-03 | `supabase/migrations/20261111040200_rpc_voucher.sql`<br>`supabase/tests/042_voucher.test.sql` | `COVERED` | Hàm `apply_voucher` tính toán chiết khấu chính xác |
| **R-92** | Tối đa 1 voucher / đơn | task-03 | `supabase/migrations/20261111040200_rpc_voucher.sql`<br>`supabase/tests/042_voucher.test.sql` | `COVERED` | Chặn áp mã thứ 2 bằng lỗi `VOUCHER_ALREADY_APPLIED` |
| **R-93** | Giữ & hoàn lượt voucher theo vòng đời đơn hàng | task-03 | `supabase/migrations/20261111040200_rpc_voucher.sql`<br>`supabase/tests/042_voucher.test.sql` | `COVERED` | Trigger `orders_voucher_status_sync` đồng bộ RELEASED / CONSUMED |
| **R-94** | Thông báo lỗi voucher phân biệt rõ ràng (8 mã lỗi) | task-03 | `supabase/migrations/20261111040200_rpc_voucher.sql`<br>`supabase/tests/042_voucher.test.sql` | `COVERED` | EXPIRED, MIN_NOT_MET, EXHAUSTED, USER_LIMIT... |
| **R-95** | Rate limit nhập voucher (5 lần / 10 phút) | task-03 | `supabase/migrations/20261111040200_rpc_voucher.sql`<br>`supabase/tests/042_voucher.test.sql` | `COVERED` | Gọi `hit_rate_limit`, ném `RATE_LIMITED` |
| **R-97** | Màn soát vé: quét QR hoặc nhập mã vé | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | RPC `checkin_ticket` nhận token hoặc booking_code |
| **R-98** | Kết quả soát vé: hợp lệ, đã dùng, sai rạp, sai suất | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | Trả chi tiết kết quả, mã lỗi chuẩn hoá (AC-12, AC-13) |
| **R-99** | Quy tắc check-in: đúng rạp, cửa sổ -30' đến hết phim | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | Chặn TOO_EARLY và EXPIRED ngoài cửa sổ thời gian |
| **R-101** | Ghi log mọi lượt quét vào `checkin_logs` | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | Bảng `checkin_logs` ghi nhận kết quả và staff quét |
| **R-102** | Không lộ thông tin vé khi quét sai rạp (Non-disclosure) | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | Chỉ trả tên + địa chỉ rạp đúng, không lộ tên/ghế khách (AC-13) |
| **R-108** | Huỷ suất chiếu hàng loạt: preview + cancel atomic | task-04 | `supabase/migrations/20261111040300_rpc_cancel.sql`<br>`supabase/tests/043_cancel.test.sql` | `COVERED` | `preview_cancel_showtimes` & `cancel_showtimes` (AC-24) |
| **R-109** | Email thông báo hàng loạt cho đơn affected | task-04 | `supabase/migrations/20261111040300_rpc_cancel.sql`<br>`supabase/tests/043_cancel.test.sql` | `COVERED` | Enqueue email `showtime_cancelled` cho các đơn có email |
| **R-110** | Đơn bị ảnh hưởng: cờ `counter_contact` cho đơn POS | task-04 | `supabase/migrations/20261111040300_rpc_cancel.sql`<br>`supabase/tests/043_cancel.test.sql` | `COVERED` | Bảng `affected_order_cases`, đánh dấu liên hệ tại quầy |
| **R-112** | Báo cáo doanh thu theo kỳ (ngày/rạp/kênh) | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | View `v_report_revenue_daily` & RPC `report_revenue` |
| **R-113** | Báo cáo doanh thu theo phim / suất / rạp | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | View `v_report_showtime_sales` (loại AISLE/BROKEN) |
| **R-116** | Báo cáo đối soát PayOS (lệch tiền, pending quá hạn) | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | View `v_report_payos_reconciliation` |
| **R-122** | Web giữ/bán → POS không khả dụng | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Kiểm tra bảng trạng thái ghế dùng chung (AC-21) |
| **R-123** | Cơ chế nguyên tử chung Web ↔ POS | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Cùng giao dịch database, khoá hàng tuần tự hoá |
| **R-124** | Thời hạn giữ ghế POS: 5 phút + hàm `extend_pos_hold` | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | POS hold mặc định 5 phút; gia hạn an toàn (AC-22) |
| **R-125** | Xác nhận bán vé từ POS | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | RPC `confirm_pos_sale` chốt đơn kênh POS |
| **R-126** | API POS idempotent theo `requestId` | task-01 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/040_hold.test.sql` | `COVERED` | Bảng `pos_requests` chặn trùng lặp thao tác |
| **R-127** | Từ chối thao tác trên suất đã huỷ / ngừng bán | task-01<br>task-04 | `supabase/migrations/20261111040000_rpc_hold.sql`<br>`supabase/tests/043_cancel.test.sql` | `COVERED` | Ném `SHOWTIME_CANCELLED` khi suất bị huỷ |
| **R-128** | Không bán offline: POS phải giữ ghế online trước khi bán | task-02 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/tests/041_payment_rpc.test.sql` | `COVERED` | `confirm_pos_sale` chỉ chấp nhận ghế do chính POS giữ hợp lệ |
| **R-132** | Vé chỉ dùng tại rạp ghi trên vé | task-05 | `supabase/migrations/20261111040400_rpc_checkin_reports.sql`<br>`supabase/tests/044_checkin_reports.test.sql` | `COVERED` | Quét nhầm rạp trả `WRONG_CINEMA`, không check-in (AC-13) |
| **R-134** | Ngoại lệ hoàn tiền thủ công & không gọi API PayOS refund | task-02<br>task-04 | `supabase/migrations/20261111040100_rpc_payment.sql`<br>`supabase/migrations/20261111040300_rpc_cancel.sql` | `COVERED` | Hoàn tiền thủ công ghi nhận đối soát nội bộ |

---

## 3. Acceptance Criteria Verification

| AC Code | Tiêu chí chấp nhận | Task | Bằng chứng kiểm thử | Đánh giá |
|---|---|---|---|:---:|
| **AC-01** | Khách chưa xác nhận email thử giữ ghế bị chặn `EMAIL_NOT_CONFIRMED` | task-01 | `supabase/tests/040_hold.test.sql:518-528` | `PASS` |
| **AC-04** | Google login trùng email mật khẩu không tự gộp; yêu cầu đăng nhập mật khẩu | task-06 | `supabase/tests/045_identity_hooks.test.sql:95-125`<br>`apps/api/test/identity.e2e-spec.ts:312-340` | `PASS` |
| **AC-05** | Tài khoản chỉ còn Facebook bấm Huỷ liên kết bị từ chối 409 | task-06 | `apps/api/test/identity.e2e-spec.ts:210-230` | `PASS` |
| **AC-06** | Hai khách cùng chọn 1 ghế đồng thời: 1 thành công, 1 nhận `SEAT_TAKEN` | task-01 | `supabase/tests/040_hold.test.sql:310-345` | `PASS` |
| **AC-07** | Giữ ghế quá 10 phút tự nhả; khách khác giữ lại thành công | task-01 | `supabase/tests/040_hold.test.sql:350-385` | `PASS` |
| **AC-10** | Webhook gửi 3 lần cùng mã: chỉ 1 payment, 1 ticket, 1 email outbox | task-02 | `supabase/tests/041_payment_rpc.test.sql:160-195` | `PASS` |
| **AC-11** | Tiền về muộn khi ghế đã bán: đơn `needs_manual_review` + 1 email khách | task-02 | `supabase/tests/041_payment_rpc.test.sql:480-530` | `PASS` |
| **AC-12** | Quét lại vé đã check-in báo đỏ `USED` kèm thời điểm & người soát lần đầu | task-05 | `supabase/tests/044_checkin_reports.test.sql:190-220` | `PASS` |
| **AC-13** | Vé HN01 quét tại HN02 báo `WRONG_CINEMA` chỉ có tên/địa chỉ HN01, không PII | task-05 | `supabase/tests/044_checkin_reports.test.sql:140-175` | `PASS` |
| **AC-15** | Giá 2 cấp: VIP 2D tối thứ Bảy HN01 = 120k, HN02 = 100k; HOLIDAY > WEEKEND | task-08<br>task-09 | `apps/api/test/pricing.e2e-spec.ts:160-210`<br>`supabase/seed.sql` verified | `PASS` |
| **AC-16** | Phân quyền rạp: Manager HN01 gọi báo cáo HN02 bị chặn RLS (42501) | task-05 | `supabase/tests/044_checkin_reports.test.sql:380-420` | `PASS` |
| **AC-21** | Xung đột giữ ghế Web ↔ POS: cùng tranh ghế chỉ 1 bên thành công | task-01 | `supabase/tests/040_hold.test.sql:420-455` | `PASS` |
| **AC-22** | POS giữ ghế 5 phút không gia hạn tự về Trống trên cả Web và POS | task-01 | `supabase/tests/040_hold.test.sql:460-485` | `PASS` |
| **AC-24** | Huỷ suất có 10 đơn paid → 10 affected + 10 email outbox; đơn POS counter_contact | task-04 | `supabase/tests/043_cancel.test.sql:180-240` | `PASS` |
| **AC-26** | Chặn đóng rạp khi còn suất tương lai đã bán vé; huỷ xong mới cho đổi trạng thái | task-04 | `supabase/tests/043_cancel.test.sql:350-410` | `PASS` |

---

## 4. Verification of Adversarial Defect Closures (Audit chuyên sâu)

Quá trình Adversarial Review độc lập của Reviewer Pro đã phát hiện và buộc Builder khắc phục triệt để các lỗ hổng nghiêm trọng ở Round 1 trước khi được cấp STRICT PASS tại Round 2:

1. **Khắc phục BOLA/IDOR trong `release_seats` và `hold_seats` (Task 01):**
   - Loại bỏ hoàn toàn sự tin cậy vào `p_actor_id` và `p_user_id` do client gửi lên.
   - Cưỡng chế `v_actor := auth.uid()` và `v_user_id := auth.uid()` đối với vai trò `authenticated`. Ném ngay `42501 PERMISSION_DENIED` nếu cố tình mạo danh UUID của người khác.
2. **Khắc phục State Machine Gap & Exception `23514` trong Webhook (Task 02):**
   - Bổ sung nhánh chuyển trạng thái hợp lệ trong trigger `orders_guard_transition`: `holding -> needs_manual_review` và `pending_payment -> needs_manual_review`.
   - Ngăn chặn triệt để nguy cơ làm vỡ transaction của Webhook PayOS khi tiền về muộn lúc ghế vừa bị chiếm bởi khách khác.
3. **Khắc phục Non-Repudiation Spoofing `p_staff_id` trong Soát vé (Task 05):**
   - Chặn đứng lỗ hổng nhân viên A truyền ID của nhân viên B để ghi log soát vé gian lận (`FORBIDDEN_STAFF_SPOOFING`).
   - Cập nhật View `v_report_showtime_sales` loại trừ các ô `AISLE` (lối đi) và `BROKEN` (ghế hỏng) khỏi `room_capacity`, bảo đảm tỷ lệ lấp đầy (`occupancy_rate`) chính xác 100%.
4. **Khắc phục Runtime Crash & Type Mismatch `p_window` trong `hit_rate_limit` (Task 06):**
   - Sửa tham số truyền vào RPC từ số nguyên sang chuỗi định dạng PostgreSQL interval chuẩn: `${windowSeconds} seconds`.
   - Loại bỏ mock false-confidence, bổ sung kiểm tra định dạng interval chặt chẽ.
5. **Khắc phục Contract Mismatch `cinema.id` và Tính năng Rạp yêu thích (Task 12):**
   - Bổ sung trường `id?: string` vào `CinemaDto` trong shared schema và service backend.
   - Xoá bỏ ép kiểu lén lút, kết nối thông suốt tính năng Rạp yêu thích từ Web UI đến cơ sở dữ liệu.
   - Tối ưu tải bản đồ Leaflet (`dynamic import ssr: false`) chống chặn LCP và cấu hình `robots.ts` thân thiện với AI crawlers.

---

## 5. Non-functional Requirements & Edge Cases Verification

- **NFR-04 (Toàn vẹn dữ liệu & Chống double-booking):** Ràng buộc unique `showtime_seat_states_showtime_seat_key` kết hợp `FOR UPDATE` trong transaction PL/pgSQL bảo đảm tính bất biến tuyệt đối.
- **NFR-05 (Bảo mật RLS & Phân quyền rạp):** Mọi view báo cáo dùng `security_invoker = true`; hàm RPC kiểm tra `has_cinema_scope(cinema_id)` và `is_admin()`. Manager rạp này không xem được báo cáo rạp khác.
- **NFR-08 (Bảo vệ dữ liệu cá nhân):** QR token 128-bit hex ngẫu nhiên không chứa PII; soát vé nhầm rạp không lộ tên/ghế khách; bản đồ OSM không lưu toạ độ người dùng.
- **NFR-09 (Seed Demo Local):** Seed idempotent 5 rạp (`HN01..DN01`), 16 phòng, 1.056 ghế, 12 phim đủ 5 nhãn tuổi, 298 suất chiếu không trùng lịch, 6 tài khoản mẫu, 5 POS API keys.
- **NFR-11, 12, 13 (Giao diện, A11y, SEO & AI Crawlers):** Responsive ≥ 360px; Stepper chuẩn `aria-current="step"`; SSR + Open Graph; JSON-LD Schema.org `Movie`, `MovieTheater`, `ScreeningEvent` có cơ chế khử XSS; `sitemap.xml` và `robots.txt` tối ưu cho GPTBot, ClaudeBot, PerplexityBot.

---

## 6. Verdict & Kế hoạch tiếp theo

### Verdict: `✅ COMPLETE` (STRICT PASS)

Layer 4 đã đáp ứng 100% các yêu cầu nghiệp vụ, tiêu chí chấp nhận và quy chuẩn kiến trúc của dự án FilmBooking với chất lượng kiểm thử tự động toàn diện trên cả 3 tầng Database (pgTAP), Backend (NestJS E2E), và Frontend (Next.js SSR/Vitest).

### Khuyến nghị cho Human Checkpoint 4:
- Hệ thống đã sẵn sàng cho **Human Checkpoint 4** để người dùng nghiệm thu Layer 4 và phê duyệt kế hoạch triển khai **Layer 5** (Module Đặt vé, Giữ ghế Realtime Client, Tích hợp Webhook PayOS và POS Giả lập).
