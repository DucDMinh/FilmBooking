# Báo cáo Adversarial Cross-Boundary Review: Layer 4 / Task 01 (Round 2)

- **Dự án**: FilmBooking
- **Work item**: `build/build-filmbooking`
- **Layer / Task**: `layer-4 / task-01`
- **Round**: 2
- **Reviewer**: `Agent: reviewer` (`Model: pro`)
- **Review Level**: `STRICT`
- **Worktree**: `E:\FilmBooking\.worktrees\layer-4__task-01`
- **Files reviewed**:
  - `supabase/migrations/20261111040000_rpc_hold.sql`
  - `supabase/tests/040_hold.test.sql`
  - Đối chiếu chéo:
    - Round 1 review report: `.context/review-reports/build-filmbooking-layer-4-task-01-round-1-review.md`
    - Task 02 migration: `supabase/migrations/20261111040100_rpc_payment.sql`
    - Schema Layer 1–3: `20261111030100_booking_tables.sql`, `20261111020000_catalog_tables.sql`
    - Yêu cầu BRD/Spec: `SPECIFICATIONS.md` (R-55, R-61..R-68, R-72, R-122..R-124, R-126, AC-01, AC-02, AC-06, AC-07, AC-15, AC-16, AC-21, AC-22).

---

## 1. Kết quả tổng quan (Verdict)

**VERDICT: STRICT PASS**

Toàn bộ **6 Defect** đã nêu trong Báo cáo Round 1 (2 lỗi CRITICAL về bảo mật BOLA/IDOR, 2 lỗi HIGH về tính toàn vẹn Concurrency & Kiểm tra độ tuổi, 2 lỗi MEDIUM về logic ghế lẻ và đồng nhất chữ ký hàm) đều đã được Builder khắc phục triệt để và bổ sung các ca kiểm thử pgTAP tương ứng.

Bộ test hồi quy pgTAP gồm 9 suite (385 tests) và bộ test ứng dụng Vitest (225 tests) đều chạy thành công 100% trên môi trường PostgreSQL / Supabase thật. Phân tích tĩnh (`aislop` đạt 100/100, `oxlint` 0 error, `ocr` clean) không ghi nhận rủi ro bảo mật hay nợ kỹ thuật.

---

## 2. Kiểm chứng chi tiết từng Defect từ Round 1

### Defect 1 (CRITICAL — IDOR / BOLA trong `release_seats`): ĐÃ KHẮC PHỤC TRIỆT ĐỂ
- **Kiểm tra code** ([20261111040000_rpc_hold.sql:592-608](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L592-L608)):
  - Hệ thống đã kiểm tra vai trò: nếu caller không phải `service_role`, bất kỳ nỗ lực truyền `p_actor_id` khác với `auth.uid()` đều bị từ chối ngay lập tức với lỗi `PERMISSION_DENIED` (mã lỗi `42501`).
  - Cưỡng chế `v_actor := auth.uid()` cho mọi người dùng xác thực, ngăn chặn hoàn toàn việc User A mạo danh User B để huỷ đơn của User B.
- **Kiểm chứng test** ([040_hold.test.sql:488-503](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/tests/040_hold.test.sql#L488-L503)):
  - `tap_as(Cust2)` gọi `release_seats(order_Cust1, Cust2_uuid)` -> ném `42501` (`throws_ok`).
  - `tap_as(Cust2)` cố tình truyền `p_actor_id = Cust1_uuid` -> ném `42501` (`throws_ok`, test `Cust2 cố giả mạo p_actor_id của Cust1 bị chặn PERMISSION_DENIED`).
  - `tap_as(Cust1)` tự nhả đơn -> thành công (`lives_ok`).

### Defect 2 (CRITICAL — Mạo danh `p_user_id` & Bypass quyền kênh POS trong `hold_seats`): ĐÃ KHẮC PHỤC TRIỆT ĐỂ
- **Kiểm tra code** ([20261111040000_rpc_hold.sql:124-137](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L124-L137), [201-222](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L201-L222), [499](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L499)):
  - **Kênh WEB**: Cưỡng chế `v_user_id := auth.uid()`. Nếu client truyền `p_user_id` khác `auth.uid()`, hàm lập tức ném `PERMISSION_DENIED` (42501).
  - **Kênh POS**: Kiểm tra quyền chặt chẽ. Caller bắt buộc phải là `service_role` HOẶC có quyền `ADMIN` toàn hệ thống HOẶC là `STAFF`/`MANAGER` được gán vào chính rạp của suất chiếu (`staff_assignments.cinema_id = v_st.cinema_id`). Khách hàng thông thường hoặc nhân viên của rạp khác cố gọi `p_channel = 'POS'` đều bị chặn với mã lỗi `42501`.
  - **Bảo toàn Constraint**: Khi tạo đơn POS, `user_id` được gán `NULL` thay vì gán UUID của nhân viên thu ngân, tránh vi phạm ràng buộc `orders_one_holding_per_user_key` khi nhân viên tạo nhiều đơn liên tiếp tại quầy.
- **Kiểm chứng test** ([040_hold.test.sql:531-566](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/tests/040_hold.test.sql#L531-L566)):
  - `Cust2` gọi `hold_seats(..., 'POS')` -> ném `42501` (`Khách thường gọi hold_seats kênh POS bị chặn PERMISSION_DENIED`).
  - `Cust2` gọi `hold_seats(..., 'WEB', Cust1_uuid)` -> ném `42501` (`Khách thường mạo danh p_user_id của người khác bị chặn PERMISSION_DENIED`).
  - `Staff1` của rạp `HN01` gọi `hold_seats(..., 'POS')` -> thành công.

### Defect 3 (HIGH — Nguy cơ Deadlock khi giữ nhiều ghế đồng thời): ĐÃ KHẮC PHỤC TRIỆT ĐỂ
- **Kiểm tra code** ([20261111040000_rpc_hold.sql:265-270](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L265-L270), [524](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L524), [543](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L543)):
  - Trước khi ghi nhận trạng thái giữ, bổ sung câu lệnh khoá deterministic:
    `perform 1 from public.seats s where s.id = any(p_seat_ids) order by s.id for update;`
  - Đảm bảo các giao dịch tranh chấp ghế luôn yêu cầu tài nguyên theo đúng thứ tự tăng dần của `s.id`, triệt tiêu khả năng hình thành chu trình phụ thuộc (wait-for cycle) dẫn đến mã lỗi `40P01 (deadlock detected)`.
  - Đồng thời bổ sung `order by pq.seat_id` vào cả hai lệnh `insert into public.order_seats` và `insert into public.showtime_seat_states`.

### Defect 4 (HIGH — Bỏ qua kiểm tra độ tuổi phim T13/T16/T18 theo R-68 / AC-16): ĐÃ KHẮC PHỤC TRIỆT ĐỂ
- **Kiểm tra code** ([20261111040000_rpc_hold.sql:240-263](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L240-L263)):
  - Khi đặt vé qua `WEB` cho phim có nhãn `T13`, `T16`, `T18`, hàm kiểm tra `profiles.date_of_birth` của `v_user_id`.
  - Nếu `date_of_birth is null` -> ném ngoại lệ `DOB_REQUIRED` (mã lỗi `22023`).
  - Tính chính xác tuổi tại ngày chiếu phim theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`):
    `v_age := extract(year from age((v_st.starts_at at time zone 'Asia/Ho_Chi_Minh')::date, v_dob))::int;`
  - Nếu `v_age < v_min_age` -> ném ngoại lệ `UNDERAGE_FOR_RATING` (mã lỗi `23514`).
- **Kiểm chứng test** ([040_hold.test.sql:724-750](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/tests/040_hold.test.sql#L724-L750)):
  - Khách chưa cập nhật ngày sinh (`nodob`) đặt phim `T18` -> bắt lỗi `22023` (`DOB_REQUIRED`).
  - Khách 10 tuổi (`underage`) đặt phim `T18` -> bắt lỗi `23514` (`UNDERAGE_FOR_RATING`).
  - Khách đủ tuổi (`Cust1`) đặt phim `T18` -> thành công.

### Defect 5 (MEDIUM — Khiếm khuyết trong quy tắc chống ghế lẻ `ORPHAN_SEAT`): ĐÃ KHẮC PHỤC TRIỆT ĐỂ
- **Kiểm tra code** ([20261111040000_rpc_hold.sql:368-458](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L368-L458)):
  - Bọc toàn bộ logic kiểm tra ghế lẻ trong `if v_channel = 'WEB' then`: miễn trừ hoàn toàn cho kênh bán tại quầy `POS` (AC-02 / R-66).
  - Phân tách phân đoạn (segment) chuẩn xác: coi ghế bị Manager khoá (`showtime_seat_locks`), ghế hỏng (`BROKEN`), và lối đi (`AISLE`) là rào chắn vật lý (`is_barrier = true`) để chia `seg_id`.
  - Bổ sung điều kiện miễn trừ khi phân đoạn chỉ còn `seg_available_before <= 2` ghế trống: khách đi lẻ vẫn có thể mua vé mà không bị khoá kẹt hệ thống.
  - Bỏ qua ghế `SWEETBOX` (ghế đôi).
- **Kiểm chứng test** ([040_hold.test.sql:752-785](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/tests/040_hold.test.sql#L752-L785)):
  - Phân đoạn còn lại đúng 2 ghế trống A9, A10 -> khách mua 1 ghế A9 được chấp nhận (`lives_ok`).
  - Nhân viên POS chọn ghế lẻ B2 kẹp giữa B1 và B3 -> được chấp nhận (`lives_ok`).

### Defect 6 (MEDIUM — Đồng nhất chữ ký và hành vi hàm `generate_booking_code`): ĐÃ KHẮC PHỤC TRIỆT ĐỂ
- **Kiểm tra code** ([20261111040000_rpc_hold.sql:34-65](file:///E:/FilmBooking/.worktrees/layer-4__task-01/supabase/migrations/20261111040000_rpc_hold.sql#L34-L65)):
  - Hàm `generate_booking_code` được cập nhật đồng nhất 100% với file migration `20261111040100_rpc_payment.sql` của Task 02:
    - Bảng ký tự: `'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'`.
    - Định dạng: `UPPER(cinema_code) || '-' || 6_char_rand` (khớp regex `^[A-Z0-9]{2,10}-[A-Z0-9]{6}$`).
    - Vòng lặp kiểm tra trùng mã trong bảng `orders`: `exit when not exists (select 1 from public.orders where booking_code = v_code);`.
    - Quyền truy cập: `grant execute on function public.generate_booking_code(text) to authenticated, service_role;`.

---

## 3. Kết quả chạy Verify Commands

| Kiểm tra | Lệnh | Kết quả | Chi tiết |
|---|---|---|---|
| **pgTAP DB Test (Task 01)** | `npx supabase test db supabase/tests/040_hold.test.sql` | **PASS** | 52/52 tests thành công |
| **Toàn bộ pgTAP Suite** | `npx supabase test db` | **PASS** | 9 files, 385/385 tests thành công |
| **App Unit & E2E Test** | `pnpm test` | **PASS** | 225/225 tests (Shared: 14, Web: 54, API: 157) |
| **TypeScript Typecheck** | `pnpm typecheck` | **PASS** | 0 lỗi trên toàn bộ workspace |
| **ESLint Check** | `pnpm lint` | **PASS** | 0 lỗi linting |
| **Oxlint Scan** | `npx oxlint` | **PASS** | 0 error (15 warnings ngoài scope task) |
| **AI Slop Scan** | `npx aislop scan --changes --json` | **PASS** | Score 100/100 (Healthy, 0 defect) |
| **Open Code Review** | `ocr delegate preview` | **PASS** | 2 files thay đổi được nhận diện và kiểm soát sạch |

---

## 4. Kết luận

Mọi rủi ro bảo mật (IDOR, BOLA, Bypass phân quyền POS), xung đột concurrency (Deadlock) và các vi phạm quy tắc nghiệp vụ (Kiểm tra độ tuổi R-68, quy tắc ghế lẻ R-66) đã được sửa đổi chính xác, chặt chẽ và có đầy đủ test tự động bảo vệ.

- **Verdict**: **STRICT PASS**
- **Đề xuất bước tiếp theo**: Tiến hành merge code của `layer-4/task-01` vào nhánh staging / branch tích hợp của Layer 4 theo đúng quy trình commit-first.
