# Review — feature cinema-status-notice · phase-1-task-01 · round 2

Agent: reviewer
Review level: **STRICT**
Reason: migration mới đổi khoá dòng (`cinemas`) trên luồng job huỷ suất hàng loạt + RPC Admin, đổi quyền INSERT cột `cinemas` của `authenticated`, ảnh hưởng đồng thời với luồng bán vé/thanh toán (`hold_seats`, `confirm_paid`, `confirm_zero_amount`).
Blast radius: `public.cinemas` (INSERT/UPDATE của Admin qua API `cinemas.service.ts` JWT user), `schedule_cinema_status`, `apply_due_cinema_status_changes` (pg_cron mỗi phút) → `cancel_showtimes_core` → showtimes/orders/seat_states/affected_order_cases; tương tác khoá với `hold_seats`, `confirm_paid`, `confirm_zero_amount`, `checkin_ticket`, `expire_overdue_holds`, `cancel_showtimes`.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm db:test` | **066 ok** (60/60, có WARNING `T66_BOOM` đúng như thiết kế test cô lập lỗi), **067 ok** (8/8, dblink đa phiên), **048 ok**, 000/021/032/045–047/049/051–062/064/065 ok (gồm 047/051/054/056 concurrency, 057/061/065 cancel_showtimes). FAIL ở fixture vì data demo (`provinces_name_key` "Hà Nội" / `price_rules_chain_key`): 010, 020, 030, 031, 033, 040–044, 050, 063, 090 — giống round 1, không do task này. |
| `pnpm exec supabase test db <file>` | **Blocked** bởi agent-guard (không trong allowlist) — dùng `pnpm db:test` thay thế, không đổi biến thể lách. |
| `docker exec … psql` | Không thử lại (round 1 đã Blocked; brief yêu cầu không lách). |
| `pnpm typecheck` | PASS (shared, web, api) — `database.types.ts` khớp. |
| `pnpm test` / `pnpm lint` | skip — diff task chỉ gồm SQL migration/pgTAP, doc, type gen; typecheck đã phủ `database.types.ts`. |
| aislop / oxlint / ocr | skip — diff chỉ SQL/doc/type gen; oxlint không áp dụng SQL; ocr not installed. |
| AI-friendly web | N/A (task DB). |

## Xác minh độc lập

### 1. F1 (deadlock) — ĐÃ SỬA
- `20261118110000_cinema_status_schedule_fixes.sql:70-73` (`schedule_cinema_status`) và `:174-179` (job) dùng `for no key update` (job thêm `skip locked`); không còn `for update` trên `cinemas` trong hai hàm.
- `UPDATE public.cinemas` trong job (`:182-186`) chỉ đổi `status, scheduled_status, scheduled_effective_at` (+ `updated_at` qua trigger). Cột unique trên `cinemas` chỉ có `id` (PK) và `code` (`20261111010000_core_identity_chain.sql:86-87`); grep migrations không thấy unique index/constraint nào khác trên `cinemas` (index task là partial non-unique `cinemas_scheduled_due_idx`) → UPDATE của job chỉ lấy NO KEY UPDATE, không tự nâng lên FOR UPDATE.
- Đối chiếu các luồng bán vé (bản mới nhất): `hold_seats` (`20261112140000:100-104` `for share of st` — join `cinemas` KHÔNG khoá), `confirm_paid` (`20261113160000:43-48` `for share of s`), `confirm_zero_amount` (`20261112120000:56`), `checkin_ticket` (`20261117130000:159`). Các luồng này chỉ chạm dòng rạp qua FK `cinema_id` (FOR KEY SHARE) — tương thích với NO KEY UPDATE → không còn cạnh chờ "luồng bán vé → job" trên `cinemas`, chu trình bị cắt.
- `cancel_showtimes_core` (`20261118100000:76-174`) không khoá lại `cinemas`; chỉ insert `affected_order_cases` (FK KEY SHARE, tương thích). Thứ tự job: cinemas (NKU) → showtimes (FOR UPDATE, theo id) → orders → seat_states, khớp thứ tự toàn cục showtimes→orders→seat_states của mọi luồng khác.
- Các kịch bản khác đã soát:
  - Job ↔ `confirm_paid` cùng suất: confirm_paid giữ showtime FOR SHARE → job chờ; confirm_paid commit (đơn `paid`) → job huỷ suất → đơn `affected`. Không chu trình. Ngược lại job khoá suất trước → confirm_paid chờ rồi thấy suất CANCELLED (nhánh có sẵn). OK.
  - Job ↔ `expire_overdue_holds` (`20261112100000:605-635`): orders → seat_states, không đụng showtimes/cinemas; job cũng orders → seat_states theo id tăng dần → không chu trình (như `cancel_showtimes` trước đây).
  - Hai lần job chồng nhau (cron + gọi tay service_role): NKU tự loại trừ + `skip locked` → mỗi rạp chỉ một phiên xử lý; lần sau thấy lịch đã xoá → idempotent.
  - schedule ↔ job: cùng NKU → tuần tự; schedule chờ job xong sẽ đọc lại bản dòng mới (READ COMMITTED re-check) nên tính `v_cancelling` theo status mới. OK.
  - Admin `update cinemas set cleaning_minutes` (trigger `cinemas_recompute_showtimes`, `20261111030020:85`, cập nhật showtimes): thứ tự cinemas → showtimes, cùng chiều với job → không chu trình.
  - Sub-block `exception when others` của job bắt cả 40P01/55P03 nếu có → rạp đó giữ lịch, thử lại phút sau.
- Test 067 phần 1 dựng đúng trình tự gây chu trình trên bản cũ (A giữ `showtimes FOR SHARE` → job khoá rạp rồi chờ suất → A insert order lấy KEY SHARE rạp). Theo ngữ nghĩa khoá Postgres, bản `FOR UPDATE` cũ sẽ ra 40P01 ở bước này → khẳng định của builder (đỏ 40P01 → xanh) nhất quán. Reviewer không tự chạy lại mutation (cần sửa hàm trên DB — ngoài quyền). Xem N1 về độ tin cậy thời gian.

### 2. F3 (INSERT theo cột) — ĐÃ SỬA
- `fixes.sql:25-29`: revoke INSERT table-level, grant INSERT 16 cột = toàn bộ cột bảng gốc (`20261111010000:85-104`) trừ `created_at, updated_at` (có default) và `scheduled_*`. Không migration nào khác `alter table cinemas add column` ngoài migration task.
- API `cinemas.service.ts:91-109,207` ghi `code, name, district, address, latitude, longitude, hotline, email, opening_hours, image_url, amenities, status, cleaning_minutes, online_cutoff_minutes` + `province_id` — đều nằm trong grant; `.select(CINEMA_COLUMNS)` sau insert dùng SELECT table-level còn nguyên. Không cột bị bỏ sót gây vỡ tạo rạp.
- Test 066 #33a (INSERT kèm `scheduled_*` → 42501) và #33b (tạo rạp COMING_SOON → sống) chạy trên DB thật qua pgTAP → tương đương kiểm `has_column_privilege` thực tế cho hai nhánh quan trọng.
- Soát các test đang không chạy được (020/031/033/090): mọi `insert into public.cinemas` ở đó chạy ở fixture owner, chỉ dùng cột trong grant; 033 `update cinemas set status` (`:134,:150,:155`) đều sau `tap_owner()`; `update … cleaning_minutes` (`:100,:109,:112`) — cột vẫn trong grant UPDATE. Không thấy assertion nào sẽ bị đảo bởi grant INSERT/UPDATE theo cột mới (nhưng chưa chạy được — xem Residual risk).

### 3. F4 — ĐÃ SỬA
- `fixes.sql:52-62`: kiểm Admin/service_role/owner là lệnh đầu tiên, trước kiểm tham số và trước `select … for no key update`. Test 066 #29a: khách gọi với id không tồn tại nhận 42501 (không P0002).

### 4. F2 — ĐÃ SỬA
- 066 bỏ `t66_expected` mirror: kỳ vọng hằng số 6 từ fixture (`:108-111`), vô hiệu hoá demo user trong transaction (`:63`, rollback cuối file). Có fixture: chưa xác nhận, `deleted_at`, `banned_until` còn hiệu lực/đã hết hạn, email trùng khác hoa/thường (#16a–#16c); suất đã bắt đầu có đơn paid (#44a); cô lập lỗi bằng trigger tạm (#41/#41a); `has_function_privilege` của core cho anon/authenticated/service_role (#52).
- Mutation tự đánh giá: bỏ `deleted_at` → #16a + #7 đỏ; bỏ `banned_until` → #16a đỏ; bỏ `lower()` dedupe → #16c/#9 đỏ; bỏ `starts_at > now()` → #44a đỏ; bỏ `exception` sub-block → #41 lỗi cả hàm; quay lại `FOR UPDATE` → 067 #1/#2 đỏ (với điều kiện thời gian, xem N1); kiểm quyền sau khoá → #29a đỏ (P0002). Đạt.

### 5. Hồi quy
- 048 xanh (allowlist có `schedule_cinema_status`, chặn `apply_due…`/`cancel_showtimes_core`). 010/043 vẫn không chạy được do fixture va data demo (như round 1).
- Hợp đồng giữ nguyên trong bản `create or replace` mới (so với `20261118100000`): 7 ngày (`:98`), huỷ lịch + email `schedule_cancelled` (`:86-95,134`), payload đủ khoá (`:125-133`), job `p_send_emails=false` (`:203-208`), chỉ suất `starts_at > now()` và ≠ CANCELLED, idempotent. ACL hai hàm giữ nguyên (`:154-155,222-223`). `database.types.ts` khớp (typecheck PASS; Insert type vẫn có `scheduled_*` vì codegen không phản ánh column grant — bình thường).

### 6. DB demo nguyên vẹn — **Blocked**
- Không có lệnh allowlist nào đọc trực tiếp DB demo (psql bị chặn, `supabase test db <file>` bị chặn). Bằng chứng gián tiếp: 066 chạy trong `begin … rollback`; 067 #8 chỉ khẳng định **đơn + outbox `CINEMA_STATUS_NOTICE`** của rạp T67 đã dọn — KHÔNG kiểm `cinemas`/`provinces`/`auth.users`.
- **Hand-off cho session chính (có quyền psql) cần kiểm:** `select count(*) from cinemas where scheduled_status is not null` = 0; `select count(*) from email_outbox where kind='CINEMA_STATUS_NOTICE'` = 0; `status` của DN01/HCM01/HN01/HN03 = OPEN, HN02 = CLOSED; không còn dòng `cinemas.code like 'CS66%' or like 'T67%'`, `provinces.code in ('T66','T67')`, `auth.users.email like '%66@example.com' or like 'u67%@example.com'`.

## F5 — đánh giá lý do bỏ qua
- **Đúng một phần**: `audit_logs.action` có `check (action in ('INSERT','UPDATE','DELETE'))` (`20261111010000:171`) nên quả thật không ghi được bản ghi kiểu "APPLY_FAILED" vào audit mà không đổi schema. Nhưng CHECK đó chỉ loại phương án audit; các phương án khác round 1 đã gợi ý (trả số rạp lỗi trong giá trị trả về / bảng ops) không bị chặn bởi CHECK này. Lần áp dụng THÀNH CÔNG vẫn được audit tự động qua trigger `cinemas_audit` (UPDATE). Rủi ro còn lại: rạp lỗi vĩnh viễn thử lại mỗi phút, chỉ có WARNING trong log Postgres, `cron.job_run_details` vẫn báo `succeeded`. Chấp nhận cho dự án demo — **LOW, không chặn**.

## Findings (round 2)

### N1 — LOW — 067 phần 1 dựa vào `pg_sleep(0.5)`, không khẳng định job đã thật sự chờ trước khi A insert
- `supabase/tests/067_cinema_status_apply_concurrency.test.sql:116-117`: không có `dblink_is_busy('t67_b') = 1` trước bước A gọi `hold_seats` (phần 2 có làm ở `:147`). Trên máy chậm, nếu job chưa kịp khoá rạp/chờ suất khi A insert, test vẫn xanh kể cả với bản `FOR UPDATE` cũ → mutation guard có thể mất tác dụng âm thầm. Đề xuất: assert busy=1 sau `pg_sleep` (hoặc chờ tới khi `pg_stat_activity.wait_event_type='Lock'`). Không chặn.

### N2 — LOW — 067 commit thật dữ liệu dùng chung với cron thật trong vài trăm ms
- Phần 2 (`:144-151`) `schedule_cinema_status` commit outbox `CINEMA_STATUS_NOTICE` cho MỌI tài khoản đã xác nhận trong DB local (kể cả tài khoản demo) cho tới khi cleanup chạy (~0.5 s+). Nếu Vault secret cho `job-send-emails` đã đặt (theo hướng dẫn dev-setup), cron có thể gửi thư "Rạp T67-2 đóng cửa" cho tài khoản demo. Phần 1 có cửa sổ tương tự với cron `apply-cinema-status-changes` thật (có thể gây flaky `b1='ok:0'`, không hỏng dữ liệu). Đề xuất: ghi chú rủi ro trong header test, hoặc thu hẹp cửa sổ (cleanup outbox ngay sau khi lấy kết quả B). Chỉ ảnh hưởng local, không chặn.

### N3 — INFO — suất tạo đồng thời với job không bị huỷ
- Job lấy `v_showtime_ids` bằng snapshot (`fixes.sql:191-195`); Manager tạo suất mới (FK KEY SHARE, không chờ NKU) trong lúc job chạy sẽ còn `ON_SALE` ở rạp vừa CLOSED. Không bán được (`hold_seats` chặn `CINEMA_NOT_OPEN`, `20261112140000:119`); hành vi tương đương bản `FOR UPDATE` cũ (insert chỉ chờ rồi vẫn thành công). Ghi nhận cho task API (chặn tạo suất ở rạp có lịch đóng).

### Ghi nhận từ round 1 vẫn còn (không chặn): F5 (LOW, chấp nhận), F6 (LOW kế thừa), F7 (cross-task 02/03).

## Residual risk
- 010, 020, 031, 033, 043, 090 (cùng 030, 040–042, 044, 050, 063) abort ở fixture do data demo → bề mặt hồi quy của quyền cột `cinemas` (INSERT/UPDATE) và assertion đã sửa ở 010/043 chưa ai chạy được. Đọc tĩnh không thấy assertion bị đảo.
- DB demo sạch chưa kiểm trực tiếp (Blocked) — session chính cần chạy checklist ở mục 6.
- Mutation `FOR UPDATE → 40P01` chỉ suy luận từ ngữ nghĩa khoá + trình tự test, reviewer không tự chạy.

## Verdict: **STRICT PASS**
F1 (HIGH), F2, F3, F4 đã được sửa đúng gốc và có test chạy trên DB thật; không phát hiện deadlock/chờ chéo mới với `hold_seats`/`confirm_paid`/`confirm_zero_amount`/`checkin_ticket`/`expire_overdue_holds`/`cancel_showtimes`/job chồng nhau. Còn N1/N2 (LOW, độ tin cậy test 067) và N3 (INFO) — khuyến nghị, không chặn. Mục 6 (DB demo) để session chính xác minh.
