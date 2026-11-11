# Independent Review — Layer 3 + 4, vùng DATABASE lõi đặt vé

Agent: reviewer
Nhánh: `staging`, HEAD `cece676`. Phạm vi: `git diff 218679a..HEAD -- supabase/`
Ngày: 2026-11-11

## Review level
**STRICT**. Phạm vi gồm schema/migration, RLS/SECURITY DEFINER, auth/identity, thanh toán và chống bán trùng; mọi risk đỏ đều có mặt.

## Phạm vi đã đọc (tự đọc toàn văn, không dựa báo cáo cũ)
- `supabase/migrations/20261111030000_pricing.sql`
- `supabase/migrations/20261111030010_security_ops_hardening.sql`
- `supabase/migrations/20261111030020_catalog_fixes.sql`
- `supabase/migrations/20261111030100_booking_tables.sql`
- `supabase/migrations/20261111040000_rpc_hold.sql`
- `supabase/migrations/20261111040100_rpc_payment.sql`
- `supabase/migrations/20261111040200_rpc_voucher.sql`
- `supabase/migrations/20261111040300_rpc_cancel.sql`
- `supabase/migrations/20261111040400_rpc_checkin_reports.sql`
- `supabase/migrations/20261111040500_identity_hooks.sql`
- Tests: đọc trọng điểm `040_hold`, `041_payment_rpc`, `042_voucher` (§13 rate limit), `045_identity_hooks` (setup + quyền gọi).
- Đối chiếu: `SPECIFICATIONS.md` (R-32/33, R-61..68, R-72..78, R-93/95, R-101/102, R-110, R-112/113, R-122..128; ma trận quyền §5.3 dòng 455-467; quyết định #6, #8, #9/10/17, #11, #18, #19), các hàm nền `is_admin`/`has_cinema_role`/`hit_rate_limit`/`app_settings` ở Layer 1-2.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | **skip** — lỗi seed đã biết (`seed.sql` trùng tỉnh "Hà Nội"), dispatcher đã xác nhận; không tính là phát hiện. Kết luận dưới đây dựa trên đọc code + ngữ nghĩa PostgreSQL. |
| `pnpm lint/typecheck/test/build` | không chạy — ngoài vùng DB của review này. |
| aislop / oxlint / ocr | N/A (diff là SQL). |
| Test đồng thời | **KHÔNG có** test hai phiên đồng thời nào trong `supabase/tests/03*`, `04*` (không có `dblink`/2 kết nối). AC-06/AC-21 trong `040_hold` chỉ chạy tuần tự trong 1 transaction. NFR-02/NFR-17 bắt buộc test đồng thời → chưa đạt. |

## Findings

### CRITICAL

**C1. RPC identity gọi được bởi `anon` và kiểm quyền fail-open → chiếm tài khoản.**
`supabase/migrations/20261111040500_identity_hooks.sql:346, 393, 441, 477`. Các dòng này chỉ có `grant execute ... to authenticated` và không có `revoke ... from public, anon`. PostgreSQL mặc định cấp EXECUTE cho PUBLIC, và Supabase còn có default privileges cho `anon`. Trong khi đó, kiểm quyền ở `:301, :361, :410, :453` là `if auth.uid() is not null and auth.uid() <> p_user_id ...`: với anon thì `auth.uid()` = NULL nên bỏ qua hoàn toàn.
- Khai thác: kẻ tấn công chỉ cần anon key công khai, gọi `POST /rest/v1/rpc/link_user_identity` với `{p_user_id: <uuid nạn nhân>, p_provider:'google', p_provider_id:<sub Google của kẻ tấn công>}`. Hàm tự `set_config('app.allow_identity_link','true')` (`:431`) nên vượt trigger guard. Sau đó kẻ tấn công đăng nhập Google và GoTrue khớp identity, tức là **vào tài khoản nạn nhân**. Anon cũng gọi được `unlink_user_identity` (khoá ngoài nạn nhân), `get_user_identities` (lộ email/provider_id) và `mark_password_set` (tạo identity `email` giả để vượt luật "phương thức cuối", AC-05).
- Kể cả với `authenticated`, `link_user_identity` vẫn nhận `p_provider_id` do client tự khai, không có bằng chứng sở hữu OAuth. User A có thể "chiếm chỗ" Google ID của B (R-23 sau đó chặn B).
- `check_oauth_collision` được `grant ... to anon` (`:284`) và trả `CONFLICT_EMAIL` khi email đã tồn tại → **dò email (account enumeration)**, trái quyết định #18 "không lộ email tồn tại".
- Test `045_identity_hooks.test.sql` chạy bằng owner (không `tap_as`/anon), nên **không có test phân quyền nào**.
- Sửa:
  - `revoke all on function ... from public, anon;`
  - Chỉ `grant` cho `service_role` (API đã xác thực gọi thay). Nếu vẫn để `authenticated` gọi thì bỏ tham số `p_user_id`, dùng `auth.uid()` và bắt buộc `auth.uid() is not null`.
  - `link_user_identity` chỉ được gọi từ server sau khi đã xác minh OAuth.
  - `check_oauth_collision` chỉ cho `service_role`.
  - `search_path` đặt `''` (hiện là `public, auth, pg_temp`).
  - Thêm pgTAP: `has_function_privilege('anon', 'public.link_user_identity(uuid,text,text,jsonb)', 'execute')` phải là false.

**C2. Upsert `ON CONFLICT ... DO UPDATE` không điều kiện, vô hiệu hoá UNIQUE ghế×suất → bán trùng ghế.**
Vị trí: `20261111040100_rpc_payment.sql:404-407` (confirm_paid case A), `:551-554` (case B tiền về muộn), `:847-850` (confirm_zero_amount). Câu lệnh là `on conflict (showtime_id, seat_id) do update set state='SOLD', expires_at=null, order_id = v_order.id`, không có `WHERE`. Các hàm confirm chỉ `FOR UPDATE` dòng đơn của chính mình, **không khoá ghế** (khác `hold_seats:266-269`). Chúng kiểm tra trống (`:311-319` / `:510-530`) rồi mới upsert, dưới READ COMMITTED.
- Kịch bản: E1 và E2 là hai đơn đã `expired` từng giữ cùng ghế E5 (giữ nối tiếp nhau). Webhook tiền về muộn của cả hai đến đồng thời.
  - Cả hai thấy E5 trống.
  - E1 insert SOLD.
  - E2 chờ ở unique index, sau khi E1 commit thì DO UPDATE ghi đè `order_id = E2`.
  - Kết quả: **cả hai đơn `paid`, mỗi đơn có vé cho E5**.
  - Bảng `tickets` không có ràng buộc ghế×suất nên DB không có lớp chặn cuối.
- Biến thể: case B kiểm tra xong, ngay sau đó một khách khác giữ ghế và commit. Upsert sẽ "cướp" ghế đang giữ hợp lệ của khách đó, rồi khách đó trả tiền trong hạn vẫn bị đẩy sang manual review.
- Sửa:
  - Khoá ghế theo cùng giao thức với `hold_seats` (`select ... from seats where id = any(...) order by id for update`) trước khi kiểm tra.
  - Đổi upsert thành `... do update set ... where showtime_seat_states.order_id = v_order.id or (showtime_seat_states.state='HELD' and showtime_seat_states.expires_at <= now())`, rồi kiểm `row_count = số ghế`. Nếu thiếu thì chuyển `needs_manual_review`.
  - Cân nhắc thêm `unique (showtime_id, seat_id)` cho vé còn hiệu lực (ví dụ unique trên `order_seats` join, hoặc cột `seat_id` trong `tickets` + partial unique) làm lớp chặn cuối.
- Test tái hiện bằng dblink:
  - conn1 chạy `begin; select confirm_paid(E1,...)` và chưa commit.
  - conn2 chạy `dblink_send_query(... confirm_paid(E2,...))`.
  - commit conn1, sau đó `dblink_get_result`.
  - Assert: chỉ 1 đơn `paid`.

**C3. Rate limit voucher không bao giờ đếm lượt thất bại → dò mã không bị chặn (R-95).**
`20261111040200_rpc_voucher.sql:85-87` gọi `hit_rate_limit` (ghi tăng bộ đếm), nhưng mọi nhánh lỗi sau đó đều `raise exception` (`:97, :107, :113, :122, :128, :139, :152`). Exception làm rollback toàn bộ lời gọi RPC, kể cả lần tăng bucket. Như vậy chỉ lần áp **thành công** mới bị đếm; dò mã sai là vô hạn.
- Test `042_voucher.test.sql:449-463` tự bơm 5 hit bằng cách gọi trực tiếp `hit_rate_limit` dưới quyền owner, nên **không chứng minh** rằng lượt sai được đếm (false-confidence).
- Ngưỡng cũng lệch spec: R-95 là **10 lần/phút/khách**, code là 5 lần/10 phút.
- Sửa: tách phần đếm ra khỏi transaction bị rollback. Ví dụ:
  - Hàm trả mã lỗi qua `jsonb` (không raise) sau khi đã ghi bucket.
  - Hoặc API gọi `hit_rate_limit` thành một RPC riêng trước.
  - Hoặc ghi bucket trong khối `BEGIN ... EXCEPTION` bao ngoài các kiểm tra và trả lỗi có cấu trúc.
- Test bắt buộc: gọi 5 lần `throws_ok ... VOUCHER_INVALID` bằng `tap_as(cust)`, rồi lần 6 phải `RATE_LIMITED`.

### MAJOR

**M1. Đơn `pending_payment` không bao giờ hết hạn; voucher bị giữ vĩnh viễn; tiền về muộn bỏ qua quyết định #9/#10/#17.**
`20261111040000_rpc_hold.sql:736-751` (`expire_overdue_holds`) và `:345-350` (`hold_seats` §3.14) chỉ chuyển đơn `status='holding'`, nhưng lại xoá **mọi** dòng HELD hết hạn, kể cả của đơn `pending_payment`. Hệ quả:
- (a) Đơn `pending_payment` treo vĩnh viễn, trái R-63/R-77 và §8.5 `pending_payment → expired`.
- (b) `orders_voucher_status_sync` không chạy, nên `voucher_redemptions` ở trạng thái HELD mãi và ăn vào `total_uses_limit`/`per_user_limit` (R-93).
- (c) Webhook đến muộn rơi vào **case A** của `confirm_paid` (`rpc_payment.sql:309-488`). Case A không kiểm `hold_expires_at`, trạng thái suất (CLOSED/đã chiếu), mốc đóng bán hay khoá ghế, nên **tự chốt bán sau khi suất đã đóng bán/đã chiếu**, trái #17 ("chỉ khi suất chưa huỷ/đóng bán, chưa qua mốc đóng bán").

Sửa:
- Job và `hold_seats` chuyển cả `pending_payment` quá hạn sang `expired` (kèm hủy payment).
- `confirm_paid` case A: nếu `hold_expires_at <= now()` thì đi nhánh late-payment (case B).

**M2. R-64 / quyết định #9: đơn cũ `pending_payment` không bị huỷ khi tạo đơn mới.**
`rpc_hold.sql:316-331` chỉ huỷ đơn `holding`, và unique index `booking_tables.sql:100-101` cũng chỉ áp cho `holding`. Khách có thể: giữ ghế → tạo link (pending_payment) → giữ tiếp đơn khác → lặp lại. Như vậy khách giữ nhiều bộ ghế cùng lúc trên toàn chuỗi. Họ cũng không giữ lại được chính ghế mình đang chờ thanh toán (nhận SEAT_TAKEN). Spec dòng 554 ghi rõ: "Tạo đơn mới khi đơn cũ `pending_payment` → đơn cũ `cancelled` + huỷ payment link".

**M3. Late-payment case B "hồi sinh" lượt voucher đã hoàn → vượt giới hạn lượt.**
`rpc_payment.sql:589-591` chạy `update voucher_redemptions set status='CONSUMED' where order_id = ...` mà không lọc trạng thái và không kiểm `total_uses_limit` hay `per_user_limit`, cũng không khoá dòng voucher. Lượt đã RELEASED (khi đơn hết hạn) và đã được người khác dùng sẽ thành CONSUMED, trái R-93 "không vượt tổng lượt". Sửa: khoá voucher `FOR UPDATE`, kiểm lại lượt. Nếu hết lượt thì chuyển `needs_manual_review`, hoặc chốt giá không giảm theo quy tắc nghiệp vụ được duyệt.

**M4. Race `cancel_showtimes` ↔ `hold_seats`/`confirm_*` → bán vé trên suất đã huỷ, đơn không thành `affected`, không có email.**
- `hold_seats` đọc trạng thái suất ở `rpc_hold.sql:171-199` mà không có `FOR SHARE`. Nếu `cancel_showtimes` (`rpc_cancel.sql:195-225`) commit trong lúc đó, nó không thấy đơn và dòng HELD chưa commit. Hold commit sau, và để lại đơn `holding` trên suất CANCELLED.
- Sau đó `confirm_paid` case A (`rpc_payment.sql:309`) và `confirm_zero_amount` (`:782-922`) **không kiểm lại trạng thái suất**, nên đơn thành `paid` và có vé trên suất đã huỷ. Đơn này không `affected`, không có email, và check-in sẽ báo CANCELLED.
- Chỉ `confirm_pos_sale` có làm đúng (`:973` `for share` + kiểm `ON_SALE`).
- Sửa: `select ... from showtimes where id = p_showtime_id for share` trong `hold_seats`, và kiểm lại trạng thái suất (`for share`) trong mọi hàm confirm.

**M5. Ghế bị Manager khoá sau khi hold hết hạn → webhook tiền về bị lỗi lặp vô hạn.**
- Trong case A, upsert kích hoạt trigger BEFORE INSERT `showtime_seat_states_fill` (`booking_tables.sql:405-408`), và trigger này `raise 23514 'Ghế đang bị khoá'` (BEFORE INSERT chạy trước khi phát hiện conflict).
- Case A không kiểm `showtime_seat_locks` (case B có, `:524-528`). Vì vậy cả transaction rollback: tiền đã về nhưng đơn không đổi, không ghi manual review, và PayOS retry lặp lại.
- Đây cũng là hệ quả của M1. Sửa: đưa kiểm khoá ghế vào case A và chuyển sang `needs_manual_review`.

**M6. `hold_seats` không kiểm trạng thái rạp, nên vẫn đặt vé được ở rạp TEMP_CLOSED/CLOSED (R-33).**
`set_cinema_status` (`rpc_cancel.sql:362-388`) chỉ chặn khi còn suất đã bán. Các suất `ON_SALE` chưa bán vẫn ở trạng thái mở bán. `hold_seats` chạy dưới SECURITY DEFINER (bỏ qua RLS `showtimes_select_public`) và chỉ kiểm `st.status`, nên khách biết `showtime_id` vẫn giữ và thanh toán được. Sửa: kiểm `c.status = 'OPEN'` (và trạng thái phim) trong `hold_seats` cũng như nhánh late-payment. Hoặc `set_cinema_status` tự đóng bán các suất tương lai.

**M7. RBAC lệch ma trận quyền §5.3 (SPECIFICATIONS:462, :467).**
- `set_cinema_status` cho **Manager** đổi trạng thái rạp (`rpc_cancel.sql:355-359`), trong khi §5.3 ghi Manager "chỉ sửa thông tin rạp mình", còn đóng/mở rạp là quyền Admin (R-32, AC-26).
- `has_cinema_scope` (`rpc_checkin_reports.sql:18-23`) gồm cả **STAFF** và được dùng cho `report_revenue`, `report_by_movie_showtime`, `report_payos_reconciliation`, `report_cancelled_showtimes`. Như vậy Staff xem được doanh thu và đối soát, trong khi §5.3 ghi báo cáo chỉ dành cho Manager (rạp mình) và Admin.
- Các view `v_report_*` được `grant select to authenticated` (security_invoker), nên Staff cũng đọc trực tiếp được qua RLS của orders/payments.
- Sửa: tách `has_cinema_scope` cho check-in (STAFF+MANAGER) và cho báo cáo (MANAGER); `set_cinema_status` chỉ cho Admin.

**M8. Idempotency theo `request_id` của POS chạy trước kiểm quyền và không gắn với rạp; kết hợp IDOR voucher trên đơn POS.**
- `rpc_hold.sql:150-168`: bất kỳ `authenticated` nào (kể cả khách kênh WEB) truyền `p_request_id` trùng đều nhận `order_id`/`booking_code`/số tiền của đơn POS bất kỳ, trước cả kiểm quyền POS (`:202-222`).
- `request_id` cũng không được kiểm có khớp suất/ghế không.
- Đi kèm: `apply_voucher` và `remove_voucher` (`rpc_voucher.sql:67-73, :239-245`) bỏ qua kiểm quyền khi `v_order.user_id is null`, mà mọi đơn POS đều có `user_id` null. Vì vậy khách bất kỳ có `order_id` đơn POS sẽ áp/gỡ voucher được cho đơn đó.
- Sửa: kiểm quyền trước khi tra idempotency, và khoá idempotency theo cặp `(cinema_id, request_id)`. Với voucher thì từ chối khi `user_id is null` trừ khi caller là nhân sự rạp, Admin hoặc service_role.

**M9. `confirm_paid` đọc sai mốc đóng bán mặc định.**
`rpc_payment.sql:502` dùng `(value->>0)::integer`, nhưng `app_settings.value` là jsonb scalar (`'15'::jsonb`, core_identity_chain.sql:346). Với scalar, `->>0` trả NULL, nên luôn rơi về hằng số 15. Trong khi đó `hold_seats` dùng `#>> '{}'` (đúng). Khi Admin đổi cutoff mặc định, hai luồng sẽ dùng hai mốc khác nhau, nên điều kiện tự chốt của #17 bị sai.

**M10. Thiếu idempotent, gây email trùng (AC-10 "chỉ 1 email").**
- Nhánh lệch tiền `rpc_payment.sql:203-306` không có chốt chặn khi đơn đã ở `needs_manual_review`. Mỗi lần webhook retry đều chèn lại `audit_logs` và email `AMOUNT_MISMATCH_MANUAL_REVIEW`.
- `record_payment_event` không trả cho caller biết sự kiện là mới hay trùng.
- `cancel_showtimes` gọi lại (`rpc_cancel.sql:267-298`) sẽ enqueue lại email cho **mọi** đơn đã `affected`, vì không lọc `affected_order_cases.email_sent` hay đơn mới chuyển trạng thái trong lần gọi này.

### MINOR
- `cancel_showtimes` cho Manager tự khai `p_actor_id`, nên `cancelled_by` giả được (`rpc_cancel.sql:176`). Nên ép dùng `auth.uid()`.
- Quyết định #8: đơn POS khi bị huỷ suất thì "không gửi email". Code vẫn gửi cho đơn POS có `contact_email` (`rpc_cancel.sql:291-295`).
- Huỷ suất khi đơn đã `checked_in` một phần: đơn không chuyển `affected` và không có email (`rpc_cancel.sql:228-240`).
- R-110 / AC-25: `affected_order_actions` thiếu cột ngày và phương thức hoàn tiền; `refunded_amount` không bị chặn trên theo `total_amount` (`booking_tables.sql:224-237`).
- R-125: không lưu nhân viên POS bán vé, và không đối chiếu "tổng tiền POS báo" (`rpc_payment.sql:931-1097`). `confirm_pos_sale` chỉ `service_role` gọi được, nên mọi kiểm quyền rạp dồn hết vào API.
- `apply_voucher`/`remove_voucher` cho phép đổi tiền khi đơn đã `pending_payment` (`rpc_voucher.sql:76, :247`), nên số tiền trên link PayOS lệch tổng đơn và rơi vào nhánh mismatch.
- `extend_pos_hold` không giới hạn số lần/tổng thời gian gia hạn và không khoá dòng đơn (`rpc_hold.sql:662-714`), nên có thể race với cron.
- Race giữa khoá ghế (Manager) và `hold_seats`: trigger `showtime_seat_locks_guard_taken` không khoá dòng ghế, nên có thể vừa khoá vừa giữ cùng một ghế (`booking_tables.sql:419-436`). Tương tự, quy tắc ghế lẻ R-66 có thể bị vi phạm khi hai khách cùng giữ ghế liền kề đồng thời.
- Hai lời gọi `hold_seats` đồng thời của cùng một khách làm lộ lỗi `23505` thô từ `orders_one_holding_per_user_key` thay vì mã lỗi nghiệp vụ.
- `internal_payment_order_code_seq` được grant `usage` cho `authenticated` (`rpc_payment.sql:14`), nên client có thể đốt sequence.
- `20261111030010_security_ops_hardening.sql:100` gọi `cron.schedule` vô điều kiện, không kiểm `pg_extension` như 040000.
- Báo cáo doanh thu nhóm theo `orders.created_at` (lúc giữ ghế), không theo `paid_at`.
- Đổi `movies.duration_minutes` khi có suất tương lai đã bán sẽ nổ `23514` từ `showtimes_protect_sold` qua `recompute_future_showtime_ends` (chỉ bắt `exclusion_violation`) và trả thông báo khó hiểu cho Admin.
- `on_identity_change` gửi email `identity_linked` cho cả lần đăng ký OAuth đầu tiên (không phân biệt link với signup).

### Điểm đã kiểm và thấy ĐÚNG
- `hold_seats`:
  - Khoá ghế `FOR UPDATE` theo thứ tự `id` → chống giữ trùng web↔web↔POS cho cùng ghế.
  - Có UNIQUE `(showtime_id, seat_id)` làm backstop.
  - Hold hết hạn được xoá trước khi kiểm.
  - Giới hạn 8 ghế, Sweetbox tính 2.
  - Cutoff web; age check; chống mạo danh `p_user_id`.
- Giá: `price_quote` đúng thứ tự ưu tiên suất › rạp › chuỗi, lễ › cuối tuần, 17:00 thuộc AFTER_17, Sweetbox theo cặp. Giá được chốt vào `order_seats`. Snapshot suất do trigger điền.
- `qr_token` 128-bit từ `gen_random_bytes`.
- Máy trạng thái đơn chặn ở trigger. `record_payment_event`, `confirm_paid` và `mark_payment_cancelled` chỉ `service_role` gọi được.
- `checkin_ticket`:
  - Kiểm sai rạp trước, chỉ trả tên và địa chỉ rạp.
  - Cửa sổ từ 30' trước giờ chiếu tới giờ bắt đầu + thời lượng phim (không tính dọn phòng).
  - Dùng `FOR UPDATE` nên quét đồng thời không check-in 2 lần.
  - Ghi log mọi lượt quét.
- RLS các bảng booking: khách chỉ đọc đơn của mình; Staff/Manager chỉ đọc đơn của rạp mình.

## Chất lượng test
- Không có test đồng thời thật nào, nên R-62/R-123/NFR-17 chưa được chứng minh. Đánh giá rủi ro:
  - Cơ chế hold tuần tự là đúng.
  - Lỗ hổng thật nằm ở các đường confirm (C2) và race huỷ suất (M4); chính loại test này sẽ bắt được chúng.
- Đề xuất bổ sung bằng `dblink` (extension có sẵn trong Supabase), dùng 2 kết nối thật qua `dblink_connect('host=localhost dbname=postgres user=postgres ...')`:
  - (1) Hai `hold_seats` cùng ghế, một qua `dblink_send_query` và một qua phiên chính → đúng 1 thành công, phiên kia nhận SEAT_TAKEN.
  - (2) Web ↔ POS cùng ghế.
  - (3) Hai `confirm_paid` late-payment cùng ghế (C2).
  - (4) `cancel_showtimes` đồng thời với `hold_seats` (M4).
  - Lưu ý: các test này phải tự dọn dữ liệu, vì dữ liệu do dblink tạo đã commit, không nằm trong `begin/rollback` của pgTAP.
- False-confidence:
  - `042` §13 (C3).
  - `045` chạy toàn bằng owner, nên không test phân quyền (C1).
  - `041` không có case pending_payment quá hạn + suất CLOSED (M1).

## Migration safety
- Toàn bộ là additive (CREATE, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE), không DROP cột/bảng, không đổi kiểu, không backfill, nên **không phải HIGH_RISK_MIGRATION**. Thứ tự timestamp hợp lệ.
- Rủi ro vận hành cần ghi nhận khi promote:
  - `040500` tạo trigger trên bảng `auth.identities`, có thể làm vỡ luồng OAuth và `linkIdentity` gốc của GoTrue. Cần verify trên staging với GoTrue thật.
  - `030010:100` giả định có `pg_cron`.
- C1 phải được sửa bằng một migration mới (không sửa migration đã apply).

## Đối chiếu với báo cáo cũ (đọc SAU khi tự kết luận)
- `build-filmbooking-layer-4-task-06-round-2-review.md:116` khẳng định các RPC identity "đều có kiểm tra phân quyền chặt chẽ". **Sai**: báo cáo bỏ sót việc thiếu `revoke from public/anon` và điều kiện fail-open khi `auth.uid()` NULL (C1). Nó cũng không nêu việc `check_oauth_collision` cho anon dò email.
- `build-filmbooking-layer-4-phase-review.md:89` đánh R-95 `COVERED` (ghi "5 lần / 10 phút"). **Sai**: số liệu lệch spec (10/phút) và rate limit không đếm lượt thất bại (C3).
- `build-filmbooking-layer-4-task-02-round-2-review.md:16` tuyên bố "100% các defect đã được khắc phục". Báo cáo này không phát hiện upsert `DO UPDATE` không điều kiện (C2), case A bỏ qua hết hạn/trạng thái suất (M1), lỗi `->>0` (M9) và email trùng ở nhánh mismatch (M10).
- Báo cáo phase Layer 4 có kết luận "385 tests đã kiểm chứng" nhưng không chỉ ra rằng không có test đồng thời nào, dù NFR-17 bắt buộc.

## Verdict
**FAIL** (STRICT). Ba lỗi C1 (chiếm tài khoản qua anon), C2 (bán trùng ghế qua upsert) và C3 (rate limit voucher vô hiệu) đều là lỗi chặn độc lập. M1–M10 phải được sửa hoặc có quyết định nghiệp vụ trước khi promote.
