# Independent Review — Layer 5 / Nhóm A — task-01 API booking

- Agent: reviewer (độc lập, chỉ đọc)
- Commit: `d22a25c` (range layer 5 `7583bc1..7574049`, branch `staging`)
- Task: `tasks/build-filmbooking/layer-5-task-01.md`
- Files: `apps/api/src/modules/booking/{booking.controller,booking.service,booking.helper,seatmap.service,booking.module}.ts`, `packages/shared/src/schemas/booking.ts`, `apps/api/test/booking.e2e-spec.ts`
- Đối chiếu: `supabase/migrations/20261111030100_booking_tables.sql`, `20261111040200_rpc_voucher.sql`, `20261112070000_voucher_rate_limit_fix.sql`, `20261112080000_function_privileges_hardening.sql`, `20261112100000_order_lifecycle_pending_payment.sql` (release_seats), `20261112140000_hold_seats_hardening.sql` (hold_seats bản mới nhất), `20261111020000_catalog.sql`, `20261111030020_catalog_fixes.sql`, `packages/shared/src/errors.ts`, `SPECIFICATIONS.md` (R-33, R-59, R-64..R-71, R-94, R-95, R-131, R-133).
- Không dựa vào report cũ `build-filmbooking-layer-5-task-*-review.md`.

## Review level
**STRICT**

## Reason
Có auth/RBAC (chặn Staff/Manager/Admin khi giữ ghế), BOLA trên endpoint theo `:id` đơn, ghi bằng admin client (service_role bỏ qua RLS), endpoint public đọc bằng admin client, ánh xạ mã lỗi RPC, rate limit voucher, bằng chứng đồng ý pháp lý (R-71/R-133), DTO dùng chung cho web.

## Blast radius
- 8 endpoint mới (`/showtimes/:id/seatmap` public, `/bookings/*`) — luồng mua vé chính của khách.
- DTO chung `packages/shared/src/schemas/booking.ts` (web sẽ tiêu thụ).
- Bảng `orders` (`age_confirmed`, `consent_at`) và `consents` ghi bằng service role.
- Lưu ý: `BookingModule` CHƯA được đăng ký trong `apps/api/src/app.module.ts` (theo plan, wiring ở `layer-6-task-01`) → ở commit này các endpoint chưa reachable trong app thật; chỉ chạy qua TestingModule.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `git -C E:/FilmBooking show --stat d22a25c` | chạy được — 7 file, +2169 |
| `pnpm --filter @filmbooking/api exec vitest run test/booking.e2e-spec.ts` | **Blocked** — agent-guard: lệnh không nằm trong allowlist. Không thử biến thể khác. |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` (root) | Không chạy (session chính tự chạy theo brief) |
| `aislop scan --changes --json` | skip — không nằm trong allowlist của reviewer, không chạy |
| `npx oxlint` | skip — không chạy |
| `ocr` | skip — không chạy |

Không có kết quả test nào do tôi chạy được; mọi kết luận dưới đây dựa trên đọc code + đối chiếu SQL.

## Findings

### MAJOR-1 — Bộ mock tạo false confidence; nhánh từ chối quyền thật không được test (đã xác minh)
- `apps/api/test/booking.e2e-spec.ts:655-657`: `forUser: () => new FakeClient(fakeDb, false)` bỏ qua JWT → không mô phỏng RLS `orders_select` (`booking_tables.sql:603-608`).
- `:313`: mock `hold_seats` luôn gán `user_id: ALICE` bất kể ai gọi.
- `:368-384` (`release_seats`), `:386-468` (`apply_voucher`), `:470-492` (`remove_voucher`): không có nhánh kiểm chủ đơn. DB thật: `release_seats` ném `PERMISSION_DENIED` 42501 (`order_lifecycle_pending_payment.sql:696`), `apply_voucher_core`/`remove_voucher` ném `FORBIDDEN` 42501 (`function_privileges_hardening.sql:93,247`). Mock `remove_voucher` còn xoá redemption thay vì set `RELEASED` và không kiểm `ORDER_NOT_HOLDING`.
- `:390`: rate-limit mock đếm theo `orderId`, DB đếm theo `auth.uid()` (`voucher_rate_limit_fix.sql:218`).
- `:1231-1254`: khối "Postgres Security & RLS Enforcement" chỉ test chính cái mock (tautology), không test code sản phẩm.
- Hệ quả:
  - Không có test non-owner cho `DELETE /bookings/:id/hold`, `POST /bookings/:id/voucher`, `DELETE /bookings/:id/voucher`; nếu viết thì mock sẽ trả 200/201.
  - Test "Bob xem đơn của Alice → 403" (`:932`) chạy nhánh `booking.service.ts:105` (row thấy được trong mock); DB thật RLS ẩn row → đi nhánh `ensureOrderAccessOrThrow` (`:101`, `:325-336`) — nhánh này chưa có test nào.
  - Test AC-06 (`:840`) tên "song song" nhưng chạy tuần tự với ghế seed sẵn HELD → chỉ chứng minh ánh xạ lỗi, không chứng minh AC-06; race thật chỉ được chứng minh ở `supabase/tests/047_double_sell.test.sql`, `056_hold_seats_hardening.test.sql`.
- Tái hiện: đọc mock; thêm test Bob `POST /bookings/<alice-order>/voucher` → mock trả 201.
- Đề xuất: FakeClient forUser nhận user id (từ JWT) và lọc `orders`/`order_seats` theo chủ đơn hoặc vai trò; mock RPC trả `{code:'42501', message:'FORBIDDEN'}` / `PERMISSION_DENIED: ...` khi không phải chủ; hold gán `user_id` theo người gọi; rate-limit theo user; thêm test 403 cho release/voucher/remove-voucher, test nhánh RLS-ẩn của getBooking/age-confirm/consent; đổi tên test AC-06 hoặc ghi rõ dựa vào DB test 047/056; xoá khối test-the-mock `:1231-1254`.

### MAJOR-2 — Bằng chứng đồng ý (R-71/R-133, AC-08) không nguyên tử và client tự khai (đã xác minh)
- `apps/api/src/modules/booking/booking.service.ts:160-171`: `orders.update({consent_at})` và `consents.insert` chạy song song bằng `Promise.all`, hai lệnh độc lập. Nếu insert `consents` lỗi (vd metadata/constraint/network) sau khi update thành công → đơn có `consent_at` nhưng KHÔNG có bản ghi bằng chứng; `payment.service.ts:94` chỉ kiểm `order.consent_at` → cho thanh toán mà không có bằng chứng.
- `:158`: `consentAt` lấy theo đồng hồ Node, còn `consents.accepted_at` = DB `now()` → hai mốc thời gian khác nhau cho cùng một hành vi đồng ý.
- `:155` + `packages/shared/src/schemas/booking.ts:77-79`: `version` lấy từ body client, không giới hạn độ dài, không đối chiếu phiên bản hiện hành phía server (khác `auth-ext.service.ts:258-276` đọc `app_settings.terms_version`). Khách gửi `{version:"0.0.1"}` hay chuỗi bất kỳ đều được lưu làm "phiên bản nội dung" đã đồng ý → bằng chứng giả mạo được.
- `booking.controller.ts:82`: `ip || "127.0.0.1"` bịa IP khi không có — ghi dữ liệu giả vào bằng chứng.
- Đề xuất: ghi cả hai trong 1 transaction (RPC SECURITY DEFINER `record_booking_consent(order_id)` kiểm chủ đơn + insert consents + update `orders.consent_at = accepted_at`), hoặc tối thiểu insert consents trước rồi mới set `consent_at` theo `accepted_at` trả về; phiên bản lấy từ server (thêm key `app_settings` cho nội dung no-refund, hoặc dùng hằng số server) và chỉ chấp nhận client version nếu khớp; IP thiếu → lưu `null`, không bịa.

### MAJOR-3 — Staff/Manager/Admin nhả ghế và áp/gỡ voucher trên đơn của khách (đã xác minh qua SQL)
- `booking.service.ts:64-84` (`releaseHold`), `:180-227` (`applyVoucher`), `:232-266` (`removeVoucher`) không kiểm quyền ở tầng API, giao hết cho RPC.
- RPC cho phép thêm Admin và Staff/Manager của rạp: `release_seats` (`order_lifecycle_pending_payment.sql:683-697`), `apply_voucher_core`/`remove_voucher` (`function_privileges_hardening.sql:89-94`, `243-248`). Các nhánh này là di sản POS (đã bỏ, spec 2.0.0).
- Hệ quả: một STAFF của rạp gọi `DELETE /bookings/<đơn khách>/hold` → huỷ đơn đang giữ của khách (status `cancelled`); `POST /bookings/<đơn khách>/voucher` → đốt lượt voucher/đổi tổng tiền đơn của khách. Không thống nhất với `ageConfirm`/`saveConsent` (`verifyOrderActionEligibility` `:310` chỉ cho chủ đơn) và với chính sách "chỉ CUSTOMER đặt online" của `hold`.
- Đề xuất: các endpoint khách (`releaseHold`, `applyVoucher`, `removeVoucher`) dùng chung bước kiểm chủ đơn như `verifyOrderActionEligibility` trước khi gọi RPC (403 nếu `order.user_id !== user.id`); thêm test.

### MAJOR-4 — Seatmap public đọc bằng admin client, bỏ qua lọc hiển thị catalog (R-33) (đã xác minh)
- `apps/api/src/modules/booking/seatmap.service.ts:16`, `:62-73`: dùng `supabase.admin()` (service_role) và chỉ chặn `status === 'CANCELLED'`. Không kiểm `cinemas.status = 'OPEN'`, `movies.status = 'PUBLISHED'`, mà RLS `showtimes_select_public` (`20261111030020_catalog_fixes.sql:119-123`) + `movies_select_public` (`20261111020000_catalog.sql:285-286`) bắt buộc với anon/khách.
- Tái hiện: suất của phim `DRAFT`/`ARCHIVED` hoặc rạp `TEMP_CLOSED`/`COMING_SOON` → `GET /showtimes/<id>/seatmap` không cần token vẫn trả 200 kèm `movieId`, giờ chiếu, phòng, trạng thái ghế, giá.
- Đề xuất: đọc showtime bằng client anon/forUser (để RLS lọc), hoặc join kiểm `cinemas.status='OPEN'` và `movies.status='PUBLISHED'` → 404 khi không thoả; thêm test.

### MAJOR-5 — AC-08 lệch HTTP status: AC yêu cầu 409 `CONSENT_REQUIRED`, catalog trả 422 (đã xác minh, liên nhóm payment)
- `packages/shared/src/errors.ts:81` `CONSENT_REQUIRED: 422`; task AC-08 ghi "409 `CONSENT_REQUIRED`"; `apps/api/src/modules/payment/payment.service.ts:19-23,93` ghi chú "409" nhưng dùng catalog → thực tế trả 422. `docs/API_SPEC.md` không định nghĩa mã này.
- Endpoint tạo payment thuộc nhóm payment, nhưng AC-08 nằm trong bảng AC của task-01 → AC này chưa đạt như được viết.
- Đề xuất: chốt một giá trị (AC hay catalog). Nếu đổi catalog sang 409 cần kiểm tác động `auth-ext.service.ts:260,271` (đăng ký) và web map lỗi; nếu giữ 422 thì sửa AC qua change request (không tự hạ AC).

### MINOR
- m1 `booking.helper.ts` nằm ngoài danh sách "Files to Create/Modify" của task (task note yêu cầu báo Blocked nếu cần file ngoài danh sách).
- m2 `booking.service.ts` 337 dòng > giới hạn 300.
- m3 Oracle tồn tại đơn: `ensureOrderAccessOrThrow` (`booking.service.ts:325-336`) trả 403 cho đơn có thật của người khác, 404 cho id không tồn tại (UUID khó đoán nên rủi ro thấp; có thể trả 404 thống nhất).
- m4 `handleHoldError` (`booking.helper.ts:9-39`) không ánh xạ `INVALID_CHANNEL`, `AUTH_REQUIRED` → 500; `DOB_REQUIRED` gộp vào `VALIDATION_ERROR` 400 nên web không phân biệt được để dẫn khách đi cập nhật ngày sinh.
- m5 `booking.service.ts:49-58`: `data` rỗng/null từ `hold_seats` → `row` undefined → TypeError 500 không rõ ràng.
- m6 `seatmap.service.ts:98-106`: lỗi `price_quote` bị nuốt → giá 0 hiển thị cho khách. Ghế `AISLE` trả `state: "FREE"`, `price: 0` (`:124-153`) — web phải tự lọc theo `type`.
- m7 `removeVoucher` (`booking.service.ts:245-247`) và `handleVoucherBusinessError` (`booking.helper.ts:67-69`): `ORDER_NOT_HOLDING` (vd đơn đã `paid`) → 410 `HOLD_EXPIRED` "đã hết hạn" — sai ngữ nghĩa, nên 409 `CONFLICT`.
- m8 `applyVoucher`/`removeVoucher`: lỗi DB không nhận diện → `VALIDATION_ERROR` 400 kèm raw message DB (`booking.service.ts:201`), che lỗi server và lộ message nội bộ.
- m9 `getBooking` (`booking.service.ts:112-116`) đọc `showtimes`+`movies` bằng forUser → khi rạp không còn OPEN hoặc phim ARCHIVED thì `format` rơi về "2D" giả, `ageRating`/`posterUrl` null (snapshot đơn R-85 không bù).
- m10 `ageConfirm` không kiểm phim có nhãn T13+; `HoldSeatsResponse.seatCount` thực chất là capacity (SWEETBOX = 2).
- m11 Test "→ 200" cho POST (`:966`, `:1064`) nhưng assert 201 — tên test lệch.
- m12 Doc impact: `docs/API_SPEC.md` không có endpoint booking nào (có thể dồn sang task wiring L6-T01, nhưng cần ghi rõ).
- m13 (nghi ngờ, chuyển nhóm payment) RPC `apply_voucher`/`remove_voucher` cho phép đổi `total_amount` khi đơn đã `pending_payment` (đã có payment link với số tiền cũ) → cần nhóm payment xác nhận luồng tạo lại link/đối soát số tiền.

### N/A / thông tin
- Idempotency `p_request_id`: có trong chữ ký `hold_seats` nhưng thân hàm không dùng, API không truyền → không có đường lộ `booking_code` người khác.
- Tham số RPC khớp chữ ký hiện tại: `hold_seats(p_showtime_id, p_seat_ids, p_channel='WEB')` (`p_user_id` để default `auth.uid()`), `release_seats(p_order_id)`, `apply_voucher(p_order_id, p_code)`, `remove_voucher(p_order_id)`; gọi bằng `forUser(jwt)`; EXECUTE cấp cho `authenticated`. `user_id` luôn lấy từ JWT, không nhận từ body.
- `apply_voucher` trả `{ok,error_code}`; `RATE_LIMITED` → 429 (`booking.helper.ts:46-51`); `FORBIDDEN` (42501 raise ngoài wrapper) → 403 (`booking.service.ts:188`). Mã nghiệp vụ R-94 ánh xạ phân biệt đúng.
- Seatmap không trả `user_id`/`order_id`; HELD hết hạn → FREE (`seatmap.service.ts:134-139`).
- Không còn tàn dư POS/đổi suất trong module booking; hold gửi cứng `p_channel: "WEB"`.
- `BookingModule` chưa wired vào `app.module.ts` — đúng plan (L6-T01).

## Acceptance criteria
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-01: chưa xác nhận email → 403 `EMAIL_NOT_CONFIRMED` | Đạt (code) | `booking.service.ts:29-32` dùng `auth.users.email_confirmed_at` qua admin API; DB cũng chặn. Test chạy với mock (không chạy được để xác nhận). |
| AC-06 (API): 2 request song song cùng E5 → 1 thành công, 1 409 `SEAT_TAKEN` details.seats=['E5'] | Đạt một phần | Ánh xạ lỗi + `details.seats` đúng (regex khớp message SQL). Tính "song song" chỉ được chứng minh ở DB test 047/056; test API là tuần tự (MAJOR-1). |
| AC-08 (API): tạo payment khi chưa consent → 409 `CONSENT_REQUIRED`; consent lưu consent_at + phiên bản | **Thiếu** | Thực tế 422 (MAJOR-5); lưu consent không nguyên tử, phiên bản do client khai (MAJOR-2). |
| Seatmap không trả user_id/order_id; HELD hết hạn → FREE | Đạt | Nhưng seatmap lộ suất ẩn (MAJOR-4). |
| Voucher sai > ngưỡng → 429 (R-95) | Đạt (code) | DB đếm theo user; mock đếm theo đơn (MAJOR-1). |
| Không có endpoint huỷ đơn cho khách (R-131) | Đạt | Chỉ có nhả ghế cho đơn `holding`. |
| Staff/Manager/Admin 403 khi hold | Đạt cho hold | Nhưng release/voucher vẫn cho Staff/Manager/Admin thao tác đơn khách (MAJOR-3). |

## Verdict
**FAIL** — 5 MAJOR (false-confidence mock, bằng chứng consent không nguyên tử/giả mạo được, staff thao tác đơn khách, seatmap bỏ qua lọc hiển thị, AC-08 lệch mã HTTP). Không có test do tôi chạy được (vitest bị agent-guard chặn).
