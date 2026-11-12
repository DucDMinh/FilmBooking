# Review: feature-remove-pos · phase-2-task-01 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** Có migration destructive (DROP 3 bảng, DROP 2 hàm, DROP+CREATE `purge_expired_ops_data`), CREATE OR REPLACE `hold_seats` (đường giữ ghế web, thứ tự khoá toàn cục) và `confirm_zero_amount` (đường bán vé). Builder đã gõ lại thân `confirm_zero_amount` từ trí nhớ nên phải đối chiếu từng nhánh.
- **Blast radius:** `hold_seats(uuid,uuid[],text,uuid,text)`, `confirm_zero_amount(uuid)`, `purge_expired_ops_data()` và cron `purge-expired-ops-data`; các bảng `pos_api_keys`, `pos_api_logs`, `pos_requests`; ACL hàm (test 048); `packages/shared` (`ORDER_CHANNELS`, `ERROR_CODES`, `database.types.ts`); `apps/web` (`proxy.ts`, `robots.ts`, `error-messages.ts`); `docs/ERD.md`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (toàn bộ) | PASS: 24 file, 739 assert. Có 051 (race, không 40P01), 053, 054 (`affected=6 cancelled=6`), 055 |
| `pnpm db:test .context/review-reports/repro-remove-pos-r1-defs.test.sql` (test của reviewer) | PASS 12/12. Lần chạy đầu fail 1 assert do regex `~* 'seats'` trong test của tôi khớp nhầm FK `order_seat_id -> order_seats`; tôi đã sửa sang so `confrelid = 'public.seats'::regclass`. Định nghĩa trên DB local khớp file: zero có `for share of s`, không có `key share`, gọi `sell_order_seats`, không còn nhánh `current_setting('role')`, có `CINEMA_NOT_OPEN`, SECURITY DEFINER + `search_path=""`. Không còn `tickets_seat_id_fkey`, không còn FK nào từ tickets tới seats. `hold_seats` có `is distinct from 'WEB'` và không còn `pos_requests`. `schema_migrations`: 20261112120000=`zero_amount_sell_hardening`, 20261112130000=`remove_pos` |
| `pnpm typecheck` | PASS (shared/api/web) |
| `pnpm lint` | PASS |
| `pnpm test` | PASS: shared 14, web 93, api 210, root 16 |
| aislop / oxlint / ocr | skip: phần lớn diff là SQL, diff TS chỉ xoá hằng hoặc comment. oxlint chưa cấu hình, ocr chưa cài |

## Kiểm tra theo ưu tiên

### 1. hold_seats: so `20261112130000:56-564` với `20261112100000:56-591`
Tôi đọc đối chiếu từng dòng. Diff đúng như builder khai:
- **Thêm** §3.0 (`130000:84-87`): `p_channel is distinct from 'WEB'` thì raise INVALID_CHANNEL (22023), trước mọi khoá.
- **Bỏ** kiểm `('WEB','POS')` cũ (`100000:92-94`), §3.4 (`100000:122-141`, idempotent qua `pos_requests`), §3.23 (`100000:571-576`) và biến `v_existing_order_id`.

Phần còn lại giống từng chữ:
- §3.8b khoá orders theo id; §3.9 khoá seats `FOR UPDATE` theo id.
- §3.13/§3.14: cancel/expire đơn `holding`+`pending_payment`; payments chuyển CANCELLED/EXPIRED; xoá seat_states theo `(showtime_id, seat_id)`.
- ORPHAN_SEAT.
- Khối `unique_violation` chỉ đổi thành SEAT_TAKEN cho constraint `showtime_seat_states_showtime_seat_key`.
- Chữ ký, SECURITY DEFINER, `search_path ''`, revoke/grant.

Thứ tự khoá orders → payments → seats → seat_states giữ nguyên. Không file nào trong `apps/` gọi `hold_seats`, `p_request_id` hay `p_channel` (grep rỗng), nên không có caller web nào bị vỡ.

### 2. confirm_zero_amount: `20261112120000:31-186` so với bản gốc `20261111040100:782-926` và các finding round 1–3
**Thay đổi có chủ đích:**
- (a) Khoá `showtimes FOR SHARE OF s` (join `cinemas`) trước `orders FOR UPDATE`.
- (b) Bỏ nhánh `elsif`. Nhánh này vốn là dead code vì trong SECURITY DEFINER `current_user` luôn là owner; anon đã bị chặn ở mức EXECUTE.
- (c) Thêm kiểm `ON_SALE` + `OPEN` sau các kiểm hết hạn (`SHOWTIME_NOT_OPEN` / `CINEMA_NOT_OPEN`, 23514).
- (d) Thay upsert seat_state vô điều kiện bằng `sell_order_seats`. Hàm này trả false thì raise SEAT_TAKEN với 2 thông điệp.

**Mọi bước còn lại giống từng chữ bản gốc:** quyền, ALREADY_PAID, `total_amount<>0`, kiểm status, kiểm hết hạn, booking_code, `orders→paid`, payment 0đ lấy từ `internal_payment_order_code_seq`, voucher `HELD→CONSUMED`, vé `not exists`, email `TICKET_ISSUED`, ACL. Không sót bước nào.

**Finding cũ đụng tới zero:** cả 6 vẫn đóng, không có regression do gõ lại.
- **F3** (SEAT_TAKEN thay cho manual review, user đã duyệt): `:96-110`.
- **F5** (lỗ phủ test): 053 có Z1–Z8, 18 assert.
- **F6** (2 thông điệp): `:107`/`:109`, assert ở Z2/Z6/Z7.
- **F11** (FK + KEY SHARE gây deadlock): không còn trên file và DB.
- **F4** (TOCTOU trạng thái rạp) và **F7** (residual (b)): đã là residual từ trước.
- **F1/F2/F9** chỉ thuộc POS, nay đã gỡ.

**Thứ tự khoá thực tế của zero:** showtimes(SHARE) → orders(UPDATE) → seat_states (`sell_order_seats`, theo seat_id) → các dòng riêng của chính đơn (insert payments, update `voucher_redemptions` theo order_id, insert tickets).
- Zero **không** khoá `vouchers`: không có trigger nào trên `voucher_redemptions` khoá `vouchers`, chỉ có `set_updated_at`.
- `confirm_paid` (`20261112110000:61-74, 268, 290, 304`) cũng gọi `sell_order_seats` rồi mới insert payments / update `voucher_redemptions`. Hai hàm cùng pattern và giống bản `040100` đã commit, không tạo chu trình mới.
- 054 (race với `cancel_showtimes`) PASS.

### 3. Migration 130000: an toàn và chạy được từ đầu
- **Precheck** (`130000:35-53`): đếm 3 bảng, `orders.channel='POS'` và `seat_states.source='POS'`. Có dữ liệu thì raise, không tự xoá.
- **Thứ tự:** `hold_seats` → `purge` (drop/create) → drop 2 hàm → `pos_api_logs` (bảng giữ FK `key_id`) → `pos_api_keys` → `pos_requests`. Không dùng CASCADE.
- **Cron:** `purge-expired-ops-data` gọi hàm theo tên nên vẫn chạy (055 #11).
- **ACL `purge_expired_ops_data`:** bản gốc (`030010:98`) chỉ revoke `public, anon, authenticated`; service_role có EXECUTE nhờ default privileges. Bản mới revoke tương tự và grant service_role tường minh, nên quyền hiệu lực tương đương.
- **Không hàm nào còn tham chiếu bảng POS:** 055 #9 quét `pg_get_functiondef` toàn schema public. Grep migrations cho thấy mọi định nghĩa cũ còn tham chiếu đã bị thay hoặc drop.
- **Không sửa migration đã commit:** `git status` chỉ có 2 file migration mới (untracked).

### 4. Test có bị làm yếu phần web không
- **040:** chỉ bỏ hoặc đổi các ca POS. Ca expire chuyển sang `_web_temp_order`; các ca web giữ nguyên.
- **041:** bỏ các ca `confirm_pos_sale`. Fixture Defect 1 giữ nguyên. Ca kiểm `order_code >= 900000000000000` cho đơn 0đ vẫn còn (`041:380-385`).
- **048:** allowlist bỏ `extend_pos_hold`. Đơn mồ côi đổi sang WEB nhưng vẫn `user_id null`, nên ca "A không chốt đơn 0đ không chủ" vẫn có răng.
- **021/032:** bỏ bảng POS khỏi kiểm RLS và purge.
- **055:** có răng. Builder ghi đỏ 6/14 trước migration; tôi đã kiểm nội dung test.

### 5. TypeScript
- `database.types.ts`: bảng `pos_*`, `confirm_pos_sale`, `extend_pos_hold` đã mất; `purge_expired_ops_data` trả 2 cột. Khớp DB.
- `ORDER_CHANNELS=["WEB"]`. `ERROR_CODES` bỏ `POS_KEY_INVALID`, khớp với `ERROR_HTTP_STATUS`/`ERROR_MESSAGES`.
- `proxy.ts`/`robots.ts` bỏ `/pos`, và `apps/` không còn route hay tham chiếu POS (grep rỗng).
- Typecheck PASS.

## Findings

Không có finding CRITICAL hoặc MAJOR. Hai MINOR dưới đây không chặn commit (chỉ là comment/doc). Nên sửa trước khi commit vì file đều chưa commit:

- **MINOR-1** (`20261112120000:25-26`): header ghi thứ tự khoá `showtimes FOR SHARE -> orders FOR UPDATE -> (payments) -> vouchers -> seat_states (sell_order_seats)`. Code thực tế: zero không khoá `vouchers`, còn payments/`voucher_redemptions` chỉ được ghi **sau** `sell_order_seats` (`:97` trước `:124`, `:136`). Hành vi đúng (xem mục 2), chỉ comment sai. Nên sửa thành `showtimes FOR SHARE -> orders FOR UPDATE -> seat_states (sell_order_seats) -> dòng riêng của đơn (payments insert, voucher_redemptions, tickets)`.
- **MINOR-2** (`docs/ERD.md:75`): as-built còn ghi seed có "5 POS API keys", trong khi `seed.sql` đã bỏ bảng này. Cần bỏ cụm đó.

INFO (không cần sửa):
- **INFO-1** (`20261112130000:44-52`): DB dev đã nạp `seed.sql` bản cũ có 5 dòng `pos_api_keys`. Trên DB đó, `pnpm db:migrate` tăng dần sẽ dừng ở precheck. Đây là đúng thiết kế (task yêu cầu raise). Đường `db reset` và staging (không seed) không bị ảnh hưởng.
- **INFO-2** (`20261112130000:84-87`): kiểm kênh nay chạy trước SEAT_REQUIRED/DUPLICATE_SEATS, nên khi input sai cả hai thì thứ tự lỗi khác trước (cùng mã 22023). Web không bị ảnh hưởng.
- **INFO-3** (`20261112130000:43`): `lock_timeout` đặt theo transaction, chỉ phủ các lệnh DROP nếu CLI chạy cả file migration trong một transaction.

## Residual (đồng ý với builder, không chặn)
- Enum `order_channel` và `showtime_seat_states.source` vẫn có `POS`. Vì vậy type DB sinh ra (`Database["public"]["Enums"]["order_channel"]`) vẫn chứa `"POS"`, trong khi `ORDER_CHANNELS` của shared chỉ còn `WEB`. Đây là nợ kỹ thuật task cho phép; precheck bảo đảm hiện không có dòng `POS`.
- Các nhánh `v_channel='POS'` ở `hold_seats`, `cancel_showtimes`/`preview_cancel_showtimes`, expire, check-in và báo cáo là dead code vô hại. Fixture POS trong 031/043/044 vẫn còn.
- Residual (b) round 1 F7: bỏ khoá KEY SHARE trên seats làm `confirm_zero_amount` có cùng mức rủi ro 40P01 với `confirm_paid` (FK của seat_state lấy KEY SHARE muộn khi đơn có nhiều ghế). Không phải regression so với baseline đã commit. FK `tickets.seat_id` đã chuyển backlog CR-002.
- `p_request_id` vẫn còn trong chữ ký nhưng bị bỏ qua.
- Intent docs (`docs/BRD.md`, `docs/specs/*`) và asset design (`docs/design/cinemo/*` có màn POS) vẫn nhắc POS. Phần này thuộc CR spec phase 1 / intent, ngoài scope task.

## Verdict

**STRICT PASS** (MINOR-1, MINOR-2 nên sửa comment/doc trước khi commit; không cần review lại)
