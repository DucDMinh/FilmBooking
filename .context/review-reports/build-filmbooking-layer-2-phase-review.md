Agent: spec-validator

# Phase review — build-filmbooking, Layer 2 (initial build)

- Chế độ: Phase review (cuối Layer 2), read-only. Không sửa code/spec.
- Nhánh: `layer-2-integration` (đã merge 5 task; working tree E:\FilmBooking).
- Phạm vi đối chiếu: `tasks/build-filmbooking/layer-2-task-0{1..5}.md`, `tasks/build-filmbooking/PLAN.md` (mục "Follow-ups từ review"), `SPECIFICATIONS.md` 1.1.0 (R-xx, AC-xx, "Quyết định brainstorm"), `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `docs/ERD.md`, review reports round 1/2 của 5 task.
- Lưu ý tên file: theo yêu cầu, tên không có `round-<R>` vì đây là lần review phase đầu tiên của Layer 2.
- Không chạy được `pnpm db:test` (không có quyền chạy lệnh shell trong phiên này). Mọi kết luận về pgTAP dựa trên đọc code + báo cáo reviewer/builder. Xem Residual.

## Verdict: ✅ COMPLETE

Không có [MISSING] hay [PARTIAL] mức HIGH. Layer 2 đã đúng và đủ với các R/AC mà các task của nó được giao phủ. Có 6 mục [PARTIAL] MED và 3 mục LOW cần xử lý trước khi mở Layer 3 (xem mục Gaps). Nếu user chốt nâng G1 hoặc G2 lên HIGH thì verdict đổi thành GAPS FOUND.

## Kiểm tra nền (đã đối chiếu code)

| Hạng mục | Kết quả | Nguồn |
|---|---|---|
| Extension cần cho exclusion/cron/citext | Có: btree_gist, pg_cron, pg_net, citext, pgtap | `supabase/migrations/20261111000000_extensions.sql:9-21` |
| Exclusion chống chồng giờ (tính cả dọn phòng, bỏ CANCELLED) | Có | `20261111020000_catalog.sql:125-128`, trigger tính `ends_at` `:184-227` |
| Exclusion ghế chồng ô (Sweetbox 2 ô) | Có | `catalog.sql:98-102`, `col_span` generated `:93` |
| Hook `before_user_created` bật trong config | Có | `supabase/config.toml:306-308`, hàm `security_ops.sql:218-237` |
| Cron xoá chưa xác nhận 7 ngày, trừ Facebook | Có | `security_ops.sql:191-210` (khớp quyết định #14, spec "Quyết định brainstorm") |
| Cookie phiên HttpOnly/SameSite=Lax, Secure khi production | Có | `apps/web/src/lib/supabase/cookie-options.ts:10-12` |
| Proxy `/api/proxy/*`, API_URL server-only | Có | `apps/web/src/app/api/proxy/[...path]/route.ts:23`, `.env.example:8-9` |
| emailConfirmed đọc từ `auth.users.email_confirmed_at` (không tin user_metadata) | Có | `apps/api/src/common/auth/access.service.ts:40-56`, `decorators.ts:7-8` |
| Guard FORBIDDEN_CINEMA, timing-safe JOB secret | Có | `cinema-scope.guard.ts:55`, `job-secret.guard.ts:3,22` |
| Điều khoản (R-133/R-134/R-109) khớp nội dung trang | Có, xem Ma trận | `apps/web/src/app/(public)/dieu-khoan/page.tsx:78,84,101-103` |

## Ma trận coverage (requirement | nguồn | trạng thái | ghi chú)

Ký hiệu: ✅ đủ cho phạm vi Layer 2 · [PARTIAL] còn thiếu · ℹ️ có chủ đích hoãn sang layer sau (đã ghi trong task/PLAN, không tính gap).

| Requirement | Nguồn (spec / task) | Trạng thái | Ghi chú + bằng chứng |
|---|---|---|---|
| R-41 Quản lý phim (đủ trường, Admin ghi) | SPEC §5 R-41; L2-T01 | ✅ | `catalog.sql:37-63`; RLS ghi chỉ Admin `:295-298`. CRUD API/UI thuộc layer 7 |
| R-42 Nhãn P/K/T13/T16/T18 | SPEC §5 R-42; L2-T01 | ✅ | enum `movie_age_rating` `catalog.sql:21` |
| R-45 Sắp chiếu không có suất | SPEC §5 R-45; L2-T01 | ✅ | dữ liệu `release_date` + không có suất; hiển thị ở layer 4 |
| R-47 Phòng thuộc đúng 1 rạp, định dạng, bảo trì | SPEC §6 R-47; L2-T01 | ✅ | `catalog.sql:66-80`, trigger chặn suất vào phòng MAINTENANCE `:203-205` |
| R-48 Sơ đồ ghế NORMAL/VIP/SWEETBOX/AISLE/BROKEN | SPEC §6 R-48; L2-T01 | ✅ | enum `:26`, lưới kiểm `seats_check_in_grid` `:157-180`. Sao chép sơ đồ = layer 7 |
| R-49 Suất + giờ kết thúc = bắt đầu + phim + dọn phòng | SPEC §6 R-49; L2-T01 | ✅ (khi tạo/đổi giờ) | Trigger `showtimes_derive_end` `:184-227`. Xem G1: không tính lại khi đổi thời lượng phim/dọn phòng |
| R-50 Chặn suất chồng giờ cùng phòng | SPEC §6 R-50; L2-T01; AC-14 | ✅ | Exclusion `catalog.sql:125-128`; test AC-14 có trong `020_catalog.test.sql` (builder báo 75 test, reviewer round 2 xác nhận nội dung). Xem G1 |
| R-51 Tạo suất đơn lẻ/hàng loạt | SPEC §6 R-51 | ℹ️ | Data đủ; API → layer 3-task-05 |
| R-54 Bảo vệ suất đã bán (không xoá/đổi giờ-phòng-phim) | SPEC §6 R-54; L2-T01 (có trong danh sách R) | ℹ️ | Task-01 ghi rõ trigger làm ở layer 3-task-02 (cần bảng đơn). Chưa có đơn nên chưa có rủi ro hiện tại |
| R-55 Khoá ghế theo suất, không bán được | SPEC §6 R-55; L2-T01 | ✅ (data + RLS) | `catalog.sql:137-150`, trigger chặn AISLE/BROKEN `:230-253`; chặn bán ở layer 4 |
| R-08 Rate limit đăng ký/đăng nhập | SPEC §1 R-08; L2-T02 | ✅ (hàm) | `hit_rate_limit` `security_ops.sql:87-104`; gọi từ Nest → layer 3-task-06 |
| R-09 Blocklist email dùng 1 lần, cập nhật được | SPEC §1 R-09; L2-T02 | ✅ (data + hàm) | Bảng + seed 50 domain `:109-126`; `is_disposable_email` `:129-139`; enforce ở Nest layer 3-06 |
| R-10 Tự xoá chưa xác nhận sau 7 ngày | SPEC §1 R-10; L2-T02 | ✅ | cron `delete-unconfirmed-users` `:191-210` |
| R-11 Khoá 15' sau 5 lần sai | SPEC §1 R-11; L2-T02; AC-03 (DB) | ✅ (DB) | `register_login_failure` `:18-53`; test 5 lần → khoá. Email cảnh báo + từ chối khi khoá → layer 3-06 |
| R-86 Outbox email giao dịch | SPEC §9 R-86; L2-T02 | ✅ (bảng) | `email_outbox` `:146-159`; sender → layer 5-03 |
| R-109 Theo dõi trạng thái gửi, gửi lại | SPEC §9 R-109; L2-T02 | ✅ (bảng) | `status` PENDING/SENT/FAILED; gửi lại → layer 5/7 |
| R-111 Khoá API POS theo rạp, chỉ lưu hash | SPEC §14 R-111; L2-T02 | ✅ (bảng) | `pos_api_keys` `:165-173` chỉ `key_hash`; UI/API → layer 5-06 / 7-07 |
| R-130 Log POS + rate limit theo khoá | SPEC §14 R-130; L2-T02 | ✅ (bảng + hàm) | `pos_api_logs` `:175-186`; wiring → layer 5-05 |
| R-03 Đồng ý điều khoản (pages + bằng chứng) | SPEC §1 R-03; L2-T05 | ✅ (trang) / ℹ️ (checkbox) | Trang điều khoản có. Checkbox + lưu consent → layer 5-10. Xem G4 về version |
| R-17 Nhân sự không tự đăng ký | SPEC §1 R-17; L2-T02, L2-T03 | ✅ | Hook chặn GoTrue signup trực tiếp `security_ops.sql:227-233`; guard Roles `roles.guard.ts:27-31` |
| R-39 Gán rạp, phân quyền theo rạp ở server + RLS | SPEC §4 R-39, NFR-05; L2-T03, L2-T01 | ✅ | `cinema-scope.guard.ts:45-55`; RLS `has_cinema_role` trong catalog |
| AC-14 Chống chồng giờ, khác rạp được | SPEC §13 AC-14 | ✅ | Exclusion theo `room_id` (phòng thuộc rạp, FK ghép `catalog.sql:123`) + test. Xem G1 |
| AC-03 Khoá đăng nhập 5 lần (phần DB) | SPEC §13 AC-03 | ✅ (DB) | `security_ops.sql:18-53` + test; phần Nest "vẫn từ chối khi đúng" → layer 3-06 |
| AC-16 Manager không truy cập/sửa dữ liệu rạp khác | SPEC §13 AC-16; NFR-05 | ✅ cho ghi và dữ liệu quản trị; ⚠️ lệch chữ cho đọc lịch chiếu | Ghi: RLS `catalog.sql:302-350`; Nest 403: `cinema-scope.guard.ts:55`. Đọc lịch chiếu công khai: xem G3 |
| R-15 Phiên HttpOnly, tự gia hạn | SPEC §1 R-15; L2-T04 | ✅ (cookie + refresh) / ℹ️ ("Ghi nhớ 30 ngày") | `cookie-options.ts:10-12` không có maxAge = session cookie. "Ghi nhớ" và đăng xuất mọi thiết bị → layer 5-10 (ghi trong task-04 Notes) |
| R-16 Quay về đúng trang sau đăng nhập | SPEC §1 R-16; L2-T04 | ✅ (redirect + sanitize) / ℹ️ (flow đăng nhập) | `proxy.ts:34-41`; `safe-next.ts` chặn open redirect (test). Form đăng nhập → layer 5-10 |
| R-25 Trang hướng dẫn xoá dữ liệu Facebook | SPEC §2 R-25; L2-T05 | ✅ (trang) / LOW (placeholder liên hệ) | `huong-dan-xoa-du-lieu/page.tsx:35-40`. Email/hotline và thời hạn còn placeholder. Xem G8 |
| R-42 AgeBadge 5 nhãn | SPEC §6 R-42; L2-T05 | ✅ | `age-badge.tsx` `role="img"` + aria-label (round 2 đóng MAJOR-3) |
| R-133 Điều khoản: lớp cảnh báo 1 | SPEC §15 R-133; L2-T05 | ✅ | `dieu-khoan/page.tsx:78` (không huỷ/đổi/hoàn), `:68-69` (chỉ dùng tại rạp), `:92-93` (T13+ giấy tờ). Các lớp 2-6 → layer 5-6 |
| R-134 + R-109 ngoại lệ rạp huỷ suất/đóng cửa | SPEC §15 R-134, R-109; L2-T05 | ✅ | `dieu-khoan/page.tsx:84,101-103`: ngoại lệ duy nhất, hoàn thủ công ngoài hệ thống, đóng cửa rạp → rạp liên hệ hoàn tiền. Khớp spec |
| R-13 Link reset 1 giờ (liên quan config) | SPEC §1 R-13 | [PARTIAL] (chưa có cơ chế) — layer 3-06 | Xem G5 |
| R-07 CAPTCHA (liên quan config) | SPEC §1 R-07 | [PARTIAL] đã biết — PLAN "RỦI RO AUTH" | `config.toml:226-229` captcha tắt. Đã nằm trong PLAN, chỉ nhắc lại để quyết định ở layer 3 |
| NFR-08 Trang chính sách bảo mật NĐ13 | SPEC NFR-08; L2-T05 | ✅ | `chinh-sach-bao-mat/page.tsx:21` (NĐ13), `:32` (không lưu toạ độ), `:58-61` (quyền xem/sửa/xoá) |
| NFR-12 Tiếp cận (skip link, focus, landmark) | SPEC NFR-12; L2-T05 | ✅ | Round 2 đóng các MINOR a11y |
| R-35 / R-31 chọn tỉnh, yêu thích ở header | SPEC §4/§3 | ℹ️ | Không nằm trong R-xx của L2-T05; thuộc layer 4-10 / 5-11 |

## Gaps

### [PARTIAL] G1 — MED — ends_at không được giữ đúng khi đổi thời lượng phim hoặc cấu hình dọn phòng (R-49, R-50, AC-14)
- Bằng chứng:
  - Trigger `showtimes_derive_end` chỉ chạy trên `showtimes` (`catalog.sql:225-227`). Không có trigger trên `movies` (chỉ `updated_at`, `:62-63`) hay `cinemas`. Vì vậy sửa `movies.duration_minutes` hoặc `cinemas.cleaning_minutes` không tính lại `ends_at` của các suất đã có, và exclusion `:125-128` kiểm trên khoảng cũ.
  - Trigger chỉ đọc `cinemas.cleaning_minutes` rồi `app_settings`, không đọc `cinema_settings` (`:213-218`). Nhưng `cinema_settings` là bảng override chung cho mọi key của `app_settings` (`core_identity_chain.sql:132-139`). Nếu API/Admin ghi override dọn phòng vào `cinema_settings` thì trigger bỏ qua.
- Tác động: AC-14 (R-50) chỉ đúng tại thời điểm tạo suất. Admin sửa thời lượng phim (R-41) là thao tác bình thường, khi đó có thể xảy ra chồng giờ trong cùng phòng mà DB không chặn.
- Đã có trong PLAN ("L2-T01 review MINOR 1", "MINOR 2/5/6/7/8") với đích layer-3-task-02. Đánh giá lại: nâng lên MED vì ảnh hưởng bất biến R-50 chứ không chỉ chất lượng code.
- Đề xuất: thêm trigger `AFTER UPDATE OF duration_minutes ON movies` và `AFTER UPDATE OF cleaning_minutes, ... ON cinemas`, tính lại `ends_at` (có kiểm lại exclusion, và chặn nếu suất đã bán — phần đó thuộc layer 3). Chốt MỘT nguồn override dọn phòng (khuyến nghị `cinemas.cleaning_minutes` + `app_settings`), cấm key `default_cleaning_minutes` trong `cinema_settings` hoặc đưa vào trigger. Làm qua migration mới (không sửa migration đã áp dụng). Nên làm trước khi mở layer 3-task-02/05.

### [PARTIAL] G2 — MED — Lịch chiếu của rạp tạm đóng/ngừng hoạt động vẫn đọc được công khai qua RLS (R-33, R-32)
- Bằng chứng: `showtimes_select` chỉ kiểm phim PUBLISHED, không kiểm trạng thái rạp (`catalog.sql:329-330`). `cinemas_select` cũng công khai (`core_identity_chain.sql:409`). Anon key đọc được PostgREST trực tiếp.
- Spec: R-33 "Rạp Tạm đóng / Ngừng hoạt động không hiển thị suất mới cho khách". Quy tắc này chưa được enforce ở DB, mà chỉ có thể ở API (layer 4-04/5-08/7-01).
- Đánh giá: không phải gap của Layer 2 vì R-33 được giao cho layer khác, nhưng RLS là lớp không thể bỏ qua khi anon key công khai. Mọi API sau này lọc được, PostgREST thì không.
- Đề xuất: chốt sớm (trước layer 3-04) một trong hai hướng: (a) siết `showtimes_select` loại suất của rạp không OPEN/COMING_SOON cho anon/authenticated khách (giữ quyền nhân sự rạp đó); (b) ghi quyết định "lịch công khai qua PostgREST chấp nhận được, chặn ở API" vào ERD. Ghi cho `/change`.

### [PARTIAL] G3 — MED — AC-16 viết "không nhận dữ liệu" của suất rạp khác, nhưng lịch chiếu là dữ liệu công khai (đã biết, cần làm rõ)
- Mâu thuẫn: AC-16 (SPEC §13) yêu cầu Manager HN01 truy vấn suất/đơn/báo cáo HN02 "không nhận dữ liệu". Nhưng R-37 (trang rạp, lịch 7 ngày), R-44 (lịch theo phim) và NFR-13 yêu cầu lịch chiếu công khai cho mọi người, và RLS `showtimes_select` cho phép đọc mọi rạp. Hệ quả là một Manager HN01 đọc được suất HN02 bằng cùng quyền như khách.
- Đánh giá về thiết kế hiện tại: ĐÚNG. Lịch chiếu là intent công khai (R-37/R-44, NFR-13). Layer 2 đã thực thi AC-16 cho phần ghi (phòng, ghế, suất, khoá: test UPDATE/DELETE/INSERT 0 dòng hoặc 42501, `020_catalog.test.sql` theo round 2), và Nest chặn 403 (`cinema-scope.guard.ts:55`). Dữ liệu quản trị (đơn, báo cáo, cấu hình, audit, khoá API POS) sẽ được RLS/guard chặn ở layer 3.
- Đề xuất (ghi cho `/change`, không sửa spec): đề xuất sửa AC-16 thành: "Cinema Manager HN01 không đọc được và không ghi được dữ liệu vận hành của HN02 (đơn, báo cáo, cấu hình rạp, khoá ghế nội bộ, audit log, khoá/nhật ký POS). Lịch chiếu công khai (R-37, R-44) đọc được như khách; mọi thao tác ghi suất/phòng/sơ đồ/khoá ghế của HN02 bị RLS chặn." Ghi thêm: phạm vi "đọc" của AC-16 không bao gồm lịch chiếu công khai. Nếu user muốn chặn đọc chéo lịch chiếu thì cần policy riêng cho nhân sự, và đó là thay đổi yêu cầu (ảnh hưởng R-37/R-44 khi Manager xem rạp khác).

### [PARTIAL] G4 — MED — Phiên bản điều khoản không đồng nhất: trang hiển thị `0.1`, DB `terms_version` = `1.0` (R-03: lưu phiên bản đã đồng ý)
- Bằng chứng: `apps/web/src/lib/legal.ts:2` `LEGAL_VERSION = "0.1"` (hiển thị ở trang pháp lý). `core_identity_chain.sql` đã seed `app_settings.terms_version = "1.0"` (`:346-348`).
- Tác động: khi layer 5-10 ghi consent (R-03) lấy version từ DB ("1.0") nhưng người dùng đọc trang ghi "0.1", bằng chứng đồng ý không khớp nội dung đã đọc.
- Đề xuất: một nguồn duy nhất. Hoặc đổi `terms_version` sang "0.1" (migration mới, không sửa migration cũ), hoặc để `legal.ts` đọc từ `app_settings` ở build/runtime. Chốt trước layer 5-10. (Bản nháp, nên có thể chốt 1.0 khi go-live.)

### [PARTIAL] G5 — MED — R-13 (link reset 1 giờ) và R-04 (link xác nhận 24 giờ) dùng chung `otp_expiry` (cơ chế chưa có)
- Bằng chứng: `supabase/config.toml:249-252` `otp_expiry = 86400` (R-04). Comment ghi "Nest/luồng riêng phải tự kiểm hạn 1h cho link reset", nhưng chưa có cơ chế nào trong code hay PLAN để làm việc đó. GoTrue không cho Nest kiểm hạn của recovery token theo ý muốn.
- Đề xuất: quyết định trước layer 3-task-06 (quên mật khẩu) với user. Lựa chọn: (a) đặt `otp_expiry` 3600 và chấp nhận R-04 vượt 24h (sai spec); (b) giữ 86400 và kiểm `recovery_sent_at` ở server, kèm check trước khi đặt lại; (c) tách luồng reset khỏi GoTrue mặc định. Đây là xung đột spec nội bộ R-04 vs R-13 cần user quyết.

### [PARTIAL] G6 — MED — Chính sách đăng nhập/khôi phục bị bỏ qua qua GoTrue và captcha đang tắt (đã nằm trong PLAN, chỉ xác nhận lại)
- Đã có: PLAN "L2-T02 review (RỦI RO AUTH)" và "L2-T02 review N1" (đúng, không lặp chi tiết).
- Bổ sung: `config.toml:226-229` `[auth.captcha] enabled = false`. Bật captcha GoTrue (Turnstile) là cách hợp lý nhất để R-07 áp lên `signup`, `recover`, `token` (password grant). Quyết định cùng lúc với G5 và hook password_verification_attempt.

### [PARTIAL] G7 — LOW — Tài liệu thiết kế chưa ghi 2 quyết định kiến trúc đã đổi
- `docs/specs/2026-11-10-filmbooking-mvp-design.md` đã có cookie HttpOnly + proxy (dòng 18, 67), nên đạt yêu cầu. Thiếu: (a) hook `before_user_created` (ERD đã có, `docs/ERD.md:43-47`); (b) `emailConfirmed` lấy từ DB qua `AccessService` (không từ JWT) và chỉ HS256 (`auth.guard.ts:56-58`). Cần ghi ở close-out (reconcile as-built, không phải intent). Không có mâu thuẫn cứng với SPECIFICATIONS (§Authentication vẫn đúng).

### [PARTIAL] G8 — LOW — Trang pháp lý còn placeholder liên hệ và thời hạn xử lý (R-25 trước Facebook App Review)
- `huong-dan-xoa-du-lieu/page.tsx:35-40` và `dieu-khoan/page.tsx:114` còn "sẽ được cập nhật khi go-live". Banner bản nháp có ở `legal.ts:5`. Không phải gap của Layer 2 (kế hoạch go-live). Cần điền trước khi nộp Facebook App Review.

### [PARTIAL] G9 — LOW — Staff/Manager đọc được phim nháp (DRAFT) (spec im lặng)
- Bằng chứng: `movies_select_staff` (`catalog.sql:287-294`) cho mọi nhân sự có bất kỳ phân công nào, không giới hạn rạp. Đã ghi trong ERD (`docs/ERD.md:35`).
- Đánh giá: nội dung phim nháp không phải dữ liệu cá nhân; §5.3 không cấm đọc phim. Chỉ cần ghi quyết định vào SPECIFICATIONS "Điểm cần xác nhận" hoặc chấp nhận và ghi ERD. Không cần sửa code.

### ℹ️ Đã có chủ đích hoãn (không tính gap, ghi để theo dõi)
- R-54 bảo vệ suất đã bán: layer 3-task-02.
- R-51 API tạo suất hàng loạt: layer 3-task-05.
- R-08/R-09/R-11 wiring Nest + Turnstile + email cảnh báo: layer 3-task-06.
- R-15 "Ghi nhớ 30 ngày" và đăng xuất mọi thiết bị: layer 5-task-10 / 5-task-11.
- R-16 flow sau đăng nhập: layer 5-task-10.
- R-86/R-109 sender và gửi lại: layer 5-task-03, 7-task-06.
- R-111/R-130 API và UI khoá POS: layer 5-task-05/06, 7-task-07.
- Hook `before_user_created` e2e trên GoTrue thật (signup 403, admin.createUser với `created_via`, OAuth): layer 3 e2e + DevOps (PLAN).

## Conflict giữa các task trong Layer 2 (đã kiểm)

| Cặp | Kết quả |
|---|---|
| L2-T01 `movies_select_staff` vs L2-T01 `showtimes_select` (phim nháp) | Nhất quán: suất của phim DRAFT ẩn với khách (`:329-330`), nhân sự thấy (đã ghi). Xem G9 |
| L2-T02 hook chặn signup trực tiếp vs L2-T03 `AuthUser` không có `emailConfirmed` | Nhất quán: Nest tạo user qua Admin API với `created_via='nest'` (PLAN); email xác nhận đọc qua `AccessService` |
| L2-T03 AuthGuard HS256 vs project khoá bất đối xứng | Residual, xem bên dưới (không phải conflict trong Layer 2) |
| L2-T04 cookie HttpOnly + proxy vs L2-T05 trang public | Không xung đột (trang public không dùng session) |
| L2-T04 `/api/proxy` vs `(public)` layout | Không xung đột |
| L2-T01 RLS đọc công khai `showtime_seat_locks` vs NFR realtime | Nhất quán với R-55 ("hiển thị trạng thái Khoá"). Không lộ `locked_by` (grant cột) |

## Residual risk / Blocked

1. `pnpm db:test` (pgTAP `020_catalog`, `021_security_ops`) chưa được chạy trên bản merge. Round 1/2 của L2-T01 và L2-T02 ghi "dispatcher phải chạy lại trên bản merge". Đây là điều kiện cần trước khi đóng Layer 2.
2. Hook `before_user_created` mới được test bằng payload tự dựng (pgTAP). Payload thật của GoTrue (`user.app_metadata`, `provider`) chưa xác minh. Nếu sai, hook fail-closed, chặn cả Nest (không phải lỗ hổng, nhưng gây lỗi lúc tạo nhân sự).
3. AuthGuard chỉ chấp nhận HS256 (`auth.guard.ts:56`). Nếu project Supabase dùng khoá JWT bất đối xứng (JWKS), mọi request sẽ 401 (fail-closed). Cần xác nhận loại khoá trước layer 3 wiring. Chưa có trong PLAN.
4. Kiểm `issuer` khớp `SUPABASE_URL` (PLAN đã ghi, `auth.guard.ts:34`).
5. Storage: policy DELETE chưa có pgTAP (trigger `protect_delete`); key chứa `..` chưa xác minh qua Storage API (round 2 L2-T01).
6. Bucket `avatars` và `posters` là `public = true`, nghĩa là URL đọc được không qua RLS. Avatars có ID UUID nên rủi ro thấp (LOW). Ghi nhận cho NĐ13.
7. Layer này không chạy được bằng trình duyệt: flag cookie, Origin sau reverse proxy, responsive thực tế (360/768/1280) chỉ đọc code.

## Kết luận và việc cần làm trước Layer 3

1. Chạy `pnpm db:test` trên bản merge của Layer 2 (dispatcher). Không có kết quả này thì không đóng Layer 2.
2. Quyết định G1 (migration mới: trigger tính lại `ends_at`, một nguồn dọn phòng). Khuyến nghị làm như một task nhỏ trước layer 3-task-02.
3. Quyết định với user: G5 (R-04 vs R-13) và G6 (captcha GoTrue), trước layer 3-task-06.
4. Chốt G4 (một nguồn phiên bản điều khoản) trước layer 5-task-10.
5. Gửi `/change` cho G2 (quyết định RLS lịch công khai của rạp tạm đóng), G3 (sửa AC-16), G9 (ghi quyết định phim nháp), G7 (reconcile design doc khi close-out).
6. Chưa cần: G8 (placeholder go-live).

Không có [MISSING] nào. Layer 2 đủ để mở Layer 3 khi các điều kiện trên được chốt (điều kiện 1 là bắt buộc; 2–4 là khuyến nghị có thời hạn rõ).
