# Review — feature cinema-status-notice · phase-1-task-01 · round 1

Agent: reviewer
Review level: **STRICT**
Reason: migration mới (thêm cột, đổi quyền cột `cinemas`, DROP FUNCTION), refactor hàm huỷ suất dùng chung (`cancel_showtimes` → `cancel_showtimes_core`), job pg_cron tự huỷ suất/đơn hàng loạt, RBAC Admin, PII (email toàn bộ tài khoản).
Blast radius: `public.cinemas` (mọi client đọc/ghi rạp: API `cinemas.service.ts` `create/update` dùng JWT user, `showtimes.service.ts:280`), luồng huỷ suất (`cancel_showtimes` của Manager/Admin), luồng bán vé đồng thời (`hold_seats`, `confirm_paid`, `confirm_zero_amount`) qua khoá dòng `cinemas`, `email_outbox` (job gửi mail), pg_cron.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` (allowlist) | 066 **ok** (52/52); 000, 021, 045–049, 051–062 (trừ 050), 064, 065 **ok** — gồm 047/051/054/056 (concurrency), 057/061 (cancel_showtimes idempotent / skip cancelled), 065 (cancel race), 048 (allowlist hàm). FAIL: 010, 020, 030, 031, 033, 040–044, 050, 063, 090 abort ngay ở INSERT fixture (`provinces_name_key` "Hà Nội", `price_rules_chain_key`) do data demo; 032 #18 (purge đếm dòng demo). Không do task này. |
| 010 / 043 (assertion đã sửa) | **Chưa kiểm chứng được bởi reviewer**: cả hai abort ở fixture (010:38, 043:28) trước mọi assertion. Builder báo PASS bằng truncate-trong-transaction; reviewer không chạy được lệnh đó (ngoài allowlist) → residual risk, không tự chặn. |
| `docker exec … psql …` | **Blocked** bởi agent-guard (ngoài allowlist). Không kiểm được trực tiếp `has_function_privilege` ngoài pgTAP, rác demo (`scheduled_*`, outbox `CINEMA_STATUS_NOTICE`). |
| aislop / oxlint / ocr | skip — diff chỉ SQL/doc/type gen; oxlint không áp dụng SQL; ocr not installed. |
| AI-friendly web | N/A (task DB). |

## Đối chiếu refactor `cancel_showtimes` (diff thật)

So `20261114000000_cancel_showtimes_skip_cancelled.sql:9-246` với migration mới:
- Wrapper `cancel_showtimes` (mới :260-316) giữ nguyên: kiểm lý do (P0001), mảng rỗng, chống giả mạo actor (42501), nhận diện admin/service_role/owner, scope Manager (42501), chữ ký + `default auth.uid()`, ACL (`revoke public, anon` / `grant authenticated, service_role`).
- Core (mới :56-254) = cũ :66-241 nguyên văn, chỉ khác: `cancelled_by = p_actor_id` (wrapper truyền `v_actor_id` đã resolve — tương đương), và khối 5.6 + enqueue email bọc trong `if p_send_emails`. Thứ tự khoá showtimes → orders → seat_states giữ nguyên.
- `cancel_showtimes_core` revoke cả `service_role` (chỉ hàm definer cùng owner gọi) — đúng; 048 xác nhận không lộ cho `authenticated`.
→ Refactor đúng, hành vi công khai không đổi (057/061/065 xanh).

## Hợp đồng (checklist 1)

- 7 ngày: `now() + interval '7 days'` (:382) ✔; test #4 so khớp tuyệt đối.
- Hẹn lại thay lịch ✔ (:385-388); hẹn = trạng thái hiện tại + có lịch → huỷ lịch + email `schedule_cancelled: true`, `target_status` = lịch bị huỷ ✔ (:370-379, :418); không lịch → 22023 ✔.
- Quyền: Admin / service_role / owner; Manager/Staff/khách 42501 ✔ (anon bị revoke execute).
- Người nhận: `email_confirmed_at is not null`, email không rỗng, `deleted_at is null`, `banned_until` hết hạn, dedupe `lower(btrim(email))` ✔ (:392-403).
- Payload đủ khoá `cinema_name, cinema_code, cinema_address, hotline, target_status, current_status, effective_at, customer_name` (+ `schedule_cancelled` khi huỷ) ✔.
- Job: chỉ `scheduled_effective_at <= now()`; đích ≠ OPEN gọi core với `p_send_emails=false`; đích OPEN không huỷ gì ✔. Lỗi một rạp: sub-block exception rollback cả update status lẫn huỷ suất của rạp đó → lịch giữ để thử lại ✔. Idempotent: lần chạy 2 không còn lịch tới hạn ✔.
- pg_cron: guard `pg_extension`, unschedule-trước-schedule ✔; chạy dưới `postgres` (owner) nên execute được dù chỉ grant `service_role` ✔.
- `HIGH_RISK_MIGRATION` ghi destructive op + rollback ✔; không sửa migration cũ ✔.
- `database.types.ts` có `scheduled_*`, `schedule_cinema_status`, `apply_due_cinema_status_changes`, `cancel_showtimes_core`, đã bỏ `set_cinema_status` ✔. `docs/ERD.md` cập nhật cột/RPC/cron ✔. Docs API_SPEC/DESIGN còn `set_cinema_status` → task-03 (ghi nhận, không tính lỗi).
- Grant UPDATE cột: danh sách (:46-49) = toàn bộ cột bảng gốc (`core_identity_chain.sql:85-104`) trừ `id, status, created_at, updated_at`; không migration nào sau đó `alter table public.cinemas add column` → không cột nào bị bỏ sót. Trigger `cinemas_guard_manager_columns` vẫn chặn Manager đổi `code`. `showtimes.service.ts:280` (cleaning/cutoff) còn quyền ✔.

## Findings

### F1 — HIGH — Deadlock giữa job `apply_due_cinema_status_changes` và `hold_seats` / `confirm_paid` / `confirm_zero_amount` (khoá `cinemas FOR UPDATE` trước `showtimes`)
- Vị trí: `supabase/migrations/20261118100000_cinema_status_schedule.sql:461-466` (`select … from public.cinemas … for update skip locked`), rồi `:490` gọi `cancel_showtimes_core` → `:76-82` `showtimes … for update`.
- Cơ chế (theo ma trận khoá dòng Postgres: `FOR UPDATE` xung đột với `FOR KEY SHARE`; `FOR NO KEY UPDATE` thì không):
  1. Job khoá dòng rạp C `FOR UPDATE` (vòng lặp cursor).
  2. Đồng thời `hold_seats` (`20261112140000_hold_seats_hardening.sql:100-104`, `for share of st`) đã khoá suất S, sau đó `insert into public.orders` (`:443`) — FK `orders.cinema_id → cinemas` (`20261111030100_booking_tables.sql:68`) lấy `FOR KEY SHARE` trên dòng C → **chờ job**.
  3. Job vào core, `showtimes S FOR UPDATE` → **chờ hold_seats** (FOR SHARE). ⇒ chu trình chờ → `40P01 deadlock_detected`, Postgres huỷ một bên.
  - Tương tự `confirm_paid` (`20261113160000_confirm_paid_order_code_lookup.sql:48` `for share of s`, sau đó insert `payments`/`tickets`/`email_outbox`/`audit_logs` có FK `cinema_id`) — nạn nhân có thể là xác nhận thanh toán PayOS (webhook) của khách.
- Brief/kiểm tra bắt buộc mục 3 yêu cầu "không deadlock, thứ tự khoá showtimes→orders→seat_states như cancel_showtimes cũ"; job thêm một khoá mạnh trên `cinemas` ĐẶT TRƯỚC `showtimes`, trái thứ tự toàn cục mà mọi luồng bán vé dựa vào. `skip locked` không cứu vì job đã khoá rạp trước. Không có test concurrency nào cho job (047/056/065 chỉ phủ `cancel_showtimes`).
- Ngoài ra `schedule_cinema_status` (:343-346, `for update`) giữ khoá mạnh trên dòng rạp suốt lúc enqueue email cho toàn bộ tài khoản (:392-424) → mọi `hold_seats`/`confirm_paid` của rạp đó bị treo trong thời gian này (không deadlock vì RPC không khoá showtimes, nhưng chặn bán vé không cần thiết).
- Đề xuất: đổi cả hai chỗ sang `for no key update` (job: `for no key update skip locked`). Chỉ cần tuần tự hoá giữa schedule ↔ job ↔ schedule (NO KEY UPDATE tự loại trừ nhau), không cần chặn FK KEY SHARE. Bổ sung test dblink (mẫu 056/065): một phiên giữ `hold_seats` (FOR SHARE suất) chưa commit, phiên kia chạy job trên rạp đó → không 40P01, kết quả cuối nhất quán (đơn holding bị huỷ hoặc job bỏ qua và thử lại).
- Đánh giá: HIGH — lỗi đồng thời thật trên luồng thanh toán/giữ ghế, vi phạm yêu cầu rõ trong AC kỹ thuật; sửa 2 dòng.

### F2 — MEDIUM — Test 066 có phần mirror / thiếu fixture phủ bộ lọc người nhận và biên thời gian
- `supabase/tests/066_cinema_status_schedule.test.sql:84-88`: `t66_expected` tính lại đúng predicate của implementation (:398-401) → test #7-#9, #19, #25-#26 chỉ chứng minh "hàm = chính nó". Fixture không có user `deleted_at` hoặc `banned_until > now()` → bỏ hai điều kiện đó ở `:400-401` test vẫn xanh. Dedupe (:393) không có fixture trùng email khác hoa/thường → chưa thực sự được kiểm.
- Không có suất đã bắt đầu/đã qua (`starts_at <= now()`) có đơn paid ở rạp bị đóng → bỏ `st.starts_at > now()` (:481) test vẫn xanh (#44 chỉ đếm suất ≠ CANCELLED, mà fixture toàn suất tương lai).
- Không test cô lập lỗi (rạp A lỗi, rạp B vẫn áp; lịch A còn nguyên) và không kiểm `has_function_privilege` của `cancel_showtimes_core` cho `anon`/`service_role` (#52 chỉ `authenticated`; 048 phủ một phần).
- Mutation phân tích (không chạy được vì không có quyền psql/không được sửa file): 7→6 ngày → #4 đỏ ✔; bỏ `email_confirmed_at` → #10 đỏ ✔; bỏ gate `p_send_emails` → #49 đỏ ✔ (d51 có `contact_email`); bỏ `deleted_at`/`banned_until`/`starts_at > now()` → **không test nào đỏ** ✘.
- Đề xuất: fixture cố định (tài khoản banned, tài khoản deleted, email trùng khác hoa/thường) và assert đích danh từng địa chỉ không/được nhận; thêm suất `starts_at = now() - 30 min` có đơn paid ở C1 → giữ nguyên `paid`; thêm case lỗi cô lập (vd. đặt một rạp có dữ liệu làm core ném lỗi bằng trigger tạm trong transaction).

### F3 — MEDIUM — INSERT table-level vẫn cho Admin ghi `scheduled_*` (và `status`) trực tiếp, lách quy tắc báo trước 7 ngày
- `20261111010000_core_identity_chain.sql:408` grant `insert` cả bảng; migration mới chỉ đổi UPDATE (:45-49). Admin (PostgREST/`cinemas.service.ts:201-209` dùng JWT user) có thể tạo rạp với `scheduled_status='CLOSED', scheduled_effective_at = now() + 1 day` mà không có email nào; nếu trong khoảng đó có suất được tạo và bán, job sẽ tự huỷ + đẩy đơn sang `affected` không báo trước — trái R-136. Thiệt hại thực tế nhỏ (rạp mới) nên MEDIUM.
- Đề xuất: `revoke insert … ; grant insert (<các cột hiện có, gồm status để tạo rạp COMING_SOON>) on public.cinemas to authenticated` — loại `scheduled_status, scheduled_effective_at`; thêm assert 42501 trong 066.

### F4 — LOW — `schedule_cinema_status` kiểm quyền SAU khi khoá dòng và sau nhánh P0002
- `:343-361`: khách thường gọi được `FOR UPDATE` dòng rạp (khoá ngắn) và phân biệt id tồn tại/không (P0002 vs 42501). Kế thừa mẫu `set_cinema_status` cũ; rạp vốn công khai nên chỉ LOW. Đề xuất: kiểm admin trước khi select-for-update.

### F5 — LOW — Job nuốt lỗi chỉ bằng `raise warning`
- `:499-500`: rạp lỗi vĩnh viễn sẽ thử lại mỗi phút vô hạn, không có tín hiệu nào ngoài log Postgres. Chấp nhận cho demo; gợi ý ghi `audit_logs`/bảng ops hoặc đếm lỗi trong giá trị trả về.

### F6 — LOW (ghi nhận, không phải lỗi task) — đơn `checked_in` của suất sắp chiếu bị đẩy sang `affected`
- Core giữ hành vi cũ (`:136-151`): suất bắt đầu sau `now()` nhưng đã mở soát vé (khách đã check-in) khi rạp tới hạn đóng → đơn `affected`, suất huỷ. Hiếm (lịch tới hạn trùng giờ chiếu), kế thừa `cancel_showtimes`.

### F7 — INFO (cross-task)
- `cinemas.service.ts:222-228` (`update`) dùng JWT user: nếu payload chứa `status` (kể cả giá trị không đổi) PostgREST sẽ trả 42501 ngay sau migration này cho tới khi task-03 chặn/loại `status`. `create` (:201-209) vẫn ghi `status` được (INSERT chưa đổi).
- Kind `CINEMA_STATUS_NOTICE` (chữ hoa, khác `showtime_cancelled`) phụ thuộc task-02 render; nếu migration lên trước task-02, job gửi mail phải xử lý kind lạ — cần xác nhận ở task-02.
- Người nhận gồm cả tài khoản Admin/Manager/Staff (đúng hợp đồng "mọi tài khoản có email đã xác nhận").

## Residual risk
- 010/043 assertion đã sửa chưa được reviewer chạy độc lập (fixture va data demo).
- Không xác minh được DB demo sạch rác (`scheduled_*`, outbox `CINEMA_STATUS_NOTICE`) vì psql bị chặn.
- F1 kết luận từ ngữ nghĩa khoá Postgres + đọc code (không dựng repro đồng thời vì sẽ commit dữ liệu vào DB demo).

## Verdict: **FAIL**
Lý do chặn: F1 (HIGH — deadlock job ↔ hold_seats/confirm_paid, vi phạm yêu cầu "không deadlock" của kiểm tra bắt buộc mục 3). Cần sửa kèm: F2 (test bắt được bộ lọc người nhận/biên thời gian), F3 (column-level INSERT). F4–F7 khuyến nghị.
