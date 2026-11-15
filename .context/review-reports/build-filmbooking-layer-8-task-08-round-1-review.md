# Review — build-filmbooking layer-8 task-08 — round 1

Agent: reviewer

- Task: `tasks/build-filmbooking/layer-8-task-08.md` (BUG: GET /movies 500, PGRST200 vì thiếu FK `showtimes.cinema_id -> cinemas`)
- Worktree: `E:/FilmBooking/.worktrees/layer-8__task-08` (base `63e7fdb`, thay đổi chưa commit)
- Review level: **STRICT**
- Reason: migration thêm FK trên bảng có dữ liệu (`HIGH_RISK_MIGRATION`), schema dùng chung cho booking/pricing/orders, sửa truy vấn catalog public (`GET /movies`, `/home`, `/movies/:slug`) và admin (`/admin/cinemas`).
- Blast radius: `public.showtimes` (FK mới, ON DELETE RESTRICT); PostgREST schema cache (thêm quan hệ showtimes->cinemas, có thể đổi cách resolve embed ở chỗ khác); `MoviesService.showingMovieIds` + schedule chi tiết phim; `CinemasService` admin list/detail (`roomCount`).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` (reviewer chạy) | PASS (shared, api, web) |
| `pnpm lint` (reviewer chạy) | PASS (shared, api `src test`, web) |
| `pnpm db:test` (reviewer chạy) | PASS — 32 file / 866 test, `062_showtimes_cinema_fk` ok |
| `pnpm test:int catalog-public` | Không chạy lại (không có trong allowlist `project-config.md`); dùng bằng chứng dispatcher: 10/10 PASS x2, mutation bỏ FK -> 7/10 đỏ |
| api unit | Bằng chứng builder: 480/480 |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, not installed |

## Kiểm tra theo điểm cần soi

### 1. Migration `supabase/migrations/20261114190000_showtimes_cinema_fk.sql`
- Migration mới, versioned; không sửa migration cũ. Không destructive (chỉ `ADD CONSTRAINT`).
- An toàn dữ liệu cũ: đúng. `showtimes` có FK ghép `(room_id, cinema_id) -> rooms(id, cinema_id)` (`20261111020000_catalog.sql:123`), `rooms.cinema_id -> cinemas(id)` (`:68`) nên mọi `showtimes.cinema_id` hiện có đều trỏ tới rạp tồn tại; `ADD CONSTRAINT` validate sẽ không lỗi.
- ON DELETE RESTRICT so với hành vi cũ: trước đây xoá rạp còn suất -> cascade xoá `rooms` -> FK ghép của `showtimes` (NO ACTION) chặn -> 23503. Giờ RESTRICT chặn sớm hơn, vẫn 23503. Không có code API nào xoá `cinemas` (grep `from("cinemas")...delete` chỉ có trong cleanup test, đã xoá showtimes trước: `test/integration/helpers/supabase-test.ts:151-152`). Hành vi tương đương; chỉ khác tên constraint trong message.
- Header `HIGH_RISK_MIGRATION` có bảng/cột, thao tác, lý do an toàn, rollback (`DROP CONSTRAINT IF EXISTS`), verify (pgTAP 062). Đủ. Kết thúc `NOTIFY pgrst, 'reload schema'`. OK.

### 2. pgTAP 062
- Ca 1 kiểm tra cấu trúc trong `pg_constraint`: đúng tên, `contype='f'`, `confrelid=cinemas`, `array_length(conkey,1)=1` -> phân biệt được FK 1 cột với FK ghép (FK ghép trỏ `rooms`, không phải `cinemas`, nên vốn không lọt). Đây là ca thật sự chứng minh FK mới.
- Ca 2 (23503 khi `cinema_id` không tồn tại) không phân biệt được FK mới với FK ghép — builder đã ghi chú thẳng trong file (dòng 32-33). Chấp nhận được vì ca 1 + mutation test integration đã cover; ghi MINOR.
- Fixture khớp schema (`rooms` có `grid_rows/grid_cols`, `supported_formats`; `showtimes` không truyền `ends_at`, trigger tính). File chạy trong `begin ... rollback`. PASS thật trên DB (reviewer chạy lại).

### 3. Hint FK trong embed
- `showtimes_cinema_id_fkey`: tên do migration đặt tường minh -> ổn định.
- `rooms_cinema_id_fkey`: tên mặc định Postgres cho FK inline `rooms.cinema_id references cinemas` (`20261111020000_catalog.sql:68`) -> ổn định trừ khi ai đó tạo lại bảng.
- Cú pháp `cinemas!showtimes_cinema_id_fkey!inner(...)` hợp lệ PostgREST; filter `.eq("cinemas.status","OPEN")` và `cinemas.provinces.code` vẫn tham chiếu theo tên embed `cinemas` (không có alias) nên vẫn hoạt động — được integration test chứng minh (lọc tỉnh có/không rạp ở `/movies?province` và `/movies/:slug?province`).
- Ảnh hưởng chỗ khác: rà toàn bộ `apps/api/src` các embed: `orders->tickets`, `showtimes->movies` (orders.service.ts:381, seatmap.service.ts:65, booking.service.ts:122, cinemas.service.ts:150), `cinemas->provinces!inner` (cinemas.service.ts:20) — không cái nào là cặp showtimes<->cinemas hay cinemas<->rooms nên không bị FK mới làm mơ hồ. Web: `apps/web/src/components/ticket/ticket-data.ts:47` `orders -> cinemas(address, hotline)` vẫn là M2O trực tiếp qua `orders.cinema_id`; dispatcher đã gọi PostgREST thật cho `orders?select=id,cinemas(address,hotline)` -> không lỗi.

### 4. Integration test `apps/api/test/integration/catalog-public.int-spec.ts`
- Assert chặt: kiểm body/số phần tử, id suất, roomId, startsAt, loại suất CANCELLED, nhóm theo 2 rạp, lọc tỉnh rỗng, 404 slug lạ, roomCount 2/1.
- Chống flaky ngày VN: suất +48h, `showDate = vnToday(startsAt)` -> không vắt nửa đêm. `release_date` = hôm qua theo UTC — luôn <= ngày VN hiện tại, OK.
- Dữ liệu cách ly theo RunScope (`q=${scope.runId}`, slug/cinema code prefix, tỉnh riêng); cleanup xoá showtimes trước cinemas. Không phụ thuộc thứ tự test (tất cả chỉ đọc).
- 3 ca vẫn xanh khi bỏ FK (`/cinemas`, `/cinemas/:code`, `/admin/cinemas`): hợp lý — 3 route này không dùng embed showtimes->cinemas; chúng là ca regression cho các embed khác trong catalog (`cinemas->provinces`, `showtimes->movies`, `rooms(count)`), đúng yêu cầu task mục 3 "các route catalog public khác có embed". Không phải xanh giả.

### 5. Rà PGRST200/201 còn lại
Xem mục 3. Không còn embed nào trong `apps/api/src` có rủi ro do FK mới.

## Findings

Không có CRITICAL/MAJOR.

- **MINOR-1** `apps/api/src/modules/catalog/movies.service.ts:19-20` — comment giải thích hint FK bị đặt lạc giữa `LIST_LIMIT` và `BANNER_LIMIT`, không nằm cạnh truy vấn nó mô tả (`:260`, `:328`). Ngoài ra lý do nêu ("orders/showtime_seat_locks cũng nối 2 bảng này nên có thể PGRST201") chưa được chứng minh: dispatcher đã thử `showtimes?select=id,cinemas!inner(code)` không hint và không lỗi. Hint vẫn vô hại và mang tính phòng thủ; nên sửa comment cho đúng ("phòng thủ, chốt quan hệ theo tên FK") và dời xuống cạnh truy vấn khi có dịp. Không chặn.
- **MINOR-2** `apps/api/test/integration/catalog-public.int-spec.ts:244-245` — comment khẳng định `rooms(count)` "có thể" mơ hồ qua M2M showtimes; tương tự MINOR-1, chưa chứng minh. Không chặn.
- **MINOR-3** `supabase/tests/062_showtimes_cinema_fk.test.sql:34-48` — ca 2 không phân biệt FK mới với FK ghép (đã tự ghi chú). Có thể thêm assert `confdeltype = 'r'` vào ca 1 để khoá hành vi ON DELETE RESTRICT. Không chặn.
- **MINOR-4** `supabase/migrations/20261114190000_showtimes_cinema_fk.sql:16-18` — `ADD CONSTRAINT` validate ngay (khoá SHARE ROW EXCLUSIVE + quét bảng). Với dự án demo/DB local là chấp nhận được; nếu có môi trường dữ liệu lớn nên tách `NOT VALID` + `VALIDATE CONSTRAINT`. Không chặn.

## Residual / nợ
- `apps/api/test/booking.e2e-spec.ts:643,875` và `apps/api/test/orders-report.e2e-spec.ts:611,1163`: FakeDb vẫn mô phỏng `showtimes -> cinemas(` trả PGRST200. Sau migration này giả định đó không còn đúng với DB thật (embed hợp lệ). Không làm sai code hiện tại (code chủ động không embed), nhưng là mock lệch DB -> nên cập nhật/bỏ trong task sau.
- `docs/ERD.md` chưa ghi FK mới — theo task, dispatcher reconcile sau merge (task-07 đang sửa ERD).
- Integration test không chạy lại được trong phiên review (không có trong allowlist); dựa vào bằng chứng dispatcher (10/10 x2 + mutation).

## Verdict

**STRICT PASS** (4 MINOR, không chặn).
