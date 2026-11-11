# Review Report: Layer 3 — Task 04 (Round 1)

**Task:** API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ, tìm kiếm  
**Worktree:** `E:\FilmBooking\.worktrees\layer-3__task-04`  
**Reviewer:** Independent Reviewer  
**Review Level:** `STRICT` (RBAC/CinemaScope/API contract/shared schemas)  
**Verdict:** `STRICT PASS`

---

## 1. Scope & Surgical Diff Analysis

Các file được tạo mới trong worktree khớp 100% với danh sách `Files to Create/Modify` trong `tasks/build-filmbooking/layer-3-task-04.md`:
- `packages/shared/src/schemas/catalog.ts` (200 dòng)
- `apps/api/src/modules/catalog/catalog.module.ts` (14 dòng)
- `apps/api/src/modules/catalog/cinemas.controller.ts` (68 dòng)
- `apps/api/src/modules/catalog/cinemas.service.ts` (225 dòng)
- `apps/api/src/modules/catalog/movies.controller.ts` (74 dòng)
- `apps/api/src/modules/catalog/movies.service.ts` (347 dòng)
- `apps/api/test/catalog.e2e-spec.ts` (454 dòng)

**Đánh giá phẫu thuật (Surgical Changes):**
- Không có bất kỳ file nào ngoài scope bị thay đổi hoặc thêm mới.
- Không sửa file `app.module.ts` (giữ đúng kế hoạch wiring ở Layer 4 task 07).
- Mọi hàm trong service và controller đều ngắn gọn (đều ≤ 25 dòng), phân chia trách nhiệm mạch lạc giữa controller (routing, decorators, validation pipes) và service (business logic, query Supabase).

---

## 2. Requirements & Acceptance Criteria Verification

### 2.1. API Catalog Công Khai & Lọc Trạng Thái Rạp (R-32, R-33, R-34, R-35, AC-19)
- **`GET /provinces`:** Truy vấn bảng `provinces` bằng anonymous client (`SUPABASE_ANON_KEY`), sắp xếp theo `sort_order` và `name`.
- **`GET /cinemas?province=` & `GET /cinemas/:code`:**
  - Áp dụng lọc kép: tầng API chủ động thêm `.eq("status", "OPEN")` kết hợp cùng chính sách RLS DB (R-33). Rạp `CLOSED` hoặc `TEMP_CLOSED` bị loại bỏ khỏi danh sách công khai và trả về 404 NOT_FOUND khi truy vấn trực tiếp theo mã.
  - Khi Admin tạo rạp mới với trạng thái `OPEN`, rạp xuất hiện ngay lập tức trên các endpoint công khai (AC-19).
  - Tách bỏ trường nội bộ `id` (UUID), chỉ trả về `code` và các thông tin công khai chuẩn `CinemaDto`.
- **`GET /cinemas/:code`:** Trả về chi tiết phòng chiếu (`rooms`) và suất chiếu trong ngày (`showtimes`) kèm thông tin phim liên kết.

### 2.2. Phân loại hiển thị theo Quyết định #13 (`now_showing` / `coming_soon`)
- **Quy tắc `classifyMovie`:**
  - Có ít nhất một suất chiếu còn bán/chưa kết thúc (`ends_at >= now`) tại rạp `OPEN` thuộc khu vực/tỉnh → `now_showing` (hỗ trợ trường hợp có suất chiếu sớm dù chưa đến ngày khởi chiếu chính thức).
  - Chưa có suất chiếu nào nhưng ngày khởi chiếu ở tương lai (`release_date > today`) → `coming_soon`.
  - Phim đã qua ngày khởi chiếu nhưng không còn suất chiếu nào → `null` (không xếp vào nhóm đang chiếu lẫn sắp chiếu).
- **`GET /home?province=`:**
  - Phân chia chính xác `nowShowing` và `comingSoon` theo tỉnh/thành.
  - Sinh danh sách `banners` từ các phim `nowShowing` có `banner_url`, giới hạn tối đa 5 banner theo hằng số `BANNER_LIMIT = 5`.
- **`GET /movies`:** Hỗ trợ đầy đủ bộ lọc `q`, `genre`, `age`, `status` (`now_showing` / `coming_soon`), `province`.
- **`GET /movies/:slug`:** Nhóm lịch chiếu theo từng rạp (`groupByCinema`), chỉ lấy suất chiếu của rạp `OPEN`, hỗ trợ lọc theo ngày và theo tỉnh.

### 2.3. Quản trị & Phân quyền RBAC / CinemaScope (R-37, R-38, R-40, R-41, R-42, R-43, R-44, R-45)
- **`POST /admin/cinemas`:** Chỉ dành cho Admin (`@Roles("ADMIN")`). Manager gọi vào bị chặn 403 FORBIDDEN.
- **`PATCH /admin/cinemas/:cinemaId`:**
  - Được bảo vệ bởi `@Roles("MANAGER")` và `@CinemaScope()`.
  - Manager của HN01 gửi PATCH cho rạp HN02 bị `CinemaScopeGuard` chặn 403 `FORBIDDEN_CINEMA` ngay tại guard, không sinh query tới database.
  - Phân quyền theo trường (field-level authorization): Hằng số `CINEMA_ADMIN_ONLY_FIELDS` (`code`, `provinceCode`, `status`, `cleaningMinutes`, `onlineCutoffMinutes`) chặn Manager chỉnh sửa; nếu Manager gửi bất kỳ trường nào trong nhóm này sẽ nhận lỗi 403 FORBIDDEN. Manager chỉ được phép chỉnh sửa thông tin mô tả, hotline, email, giờ mở cửa, tiện ích của rạp mình.
- **`POST /admin/movies`, `PATCH /admin/movies/:id`, `DELETE /admin/movies/:id`, `GET /admin/movies`:**
  - Đều được bảo vệ bởi `@Roles("ADMIN")`.
  - Nhân sự xem được toàn bộ phim gồm cả trạng thái `DRAFT` qua `GET /admin/movies`.
  - `DELETE /admin/movies/:id`: Nếu phim đã có ràng buộc dữ liệu (suất chiếu), mã lỗi PostgreSQL `23503` được ánh xạ chuẩn xác thành 409 CONFLICT.

### 2.4. Vòng đời rạp & Chặn đóng rạp khi còn suất chiếu tương lai
- Khi Admin gửi yêu cầu chuyển trạng thái rạp sang `TEMP_CLOSED` hoặc `CLOSED`, hàm `assertNoFutureShowtimes` kiểm tra các suất chiếu có `starts_at >= now` và `status != 'CANCELLED'`.
- Nếu còn suất chiếu tương lai, thao tác bị từ chối với 409 CONFLICT kèm chi tiết `{ upcomingShowtimes: count }`, bảo vệ an toàn cho đơn hàng và suất chiếu của khách hàng.

---

## 3. Security, Input Validation & Data Integrity

- **Input Validation (Zod):**
  - Mọi tham số URL (`cinemaId`, `code`, `slug`, `id`) và query string đều được validate thông qua `ZodValidationPipe`.
  - Định dạng mã rạp `^[A-Z0-9]{2,10}$`, mã tỉnh `^[A-Z0-9_]{2,20}$`, slug `^[a-z0-9]+(-[a-z0-9]+)*$` ngăn ngừa triệt để các ký tự đặc biệt hoặc cú pháp inject.
- **Phòng chống PostgREST Filter Injection:**
  - Hàm `sanitizeSearchTerm` loại bỏ các ký tự đặc biệt có nghĩa trong PostgREST DSL (`[,()%*_\\"'.:]`) trước khi đưa vào biểu thức `or(title_vi.ilike..., title_original.ilike...)`, triệt tiêu nguy cơ PostgREST syntax injection.
- **Supabase Client & RLS Context:**
  - Các thao tác admin/manager truyền trực tiếp JWT của caller (`this.supabase.forUser(jwt)`), đảm bảo cơ chế Row-Level Security của Postgres luôn được kích hoạt song song với các NestJS Guard.
- **Error Handling:**
  - Hàm `unwrap()` bọc tất cả kết quả từ Supabase, dịch các mã lỗi Postgres (`23505`, `23503` -> `CONFLICT`, `42501` -> `FORBIDDEN`, `23514`, `22P02` -> `VALIDATION_ERROR`) sang `AppException`, tuyệt đối không để lộ chi tiết database nội bộ hay stack trace cho client.
- **Múi giờ & Định dạng ngày giờ:**
  - Chuyển đổi chính xác ngày giờ địa phương Việt Nam sang dải thời gian UTC ISO (`vnDayRange` và `toIso`), tính chuẩn mốc 00:00:00 đến 24:00:00 theo múi giờ Việt Nam (+07:00).

---

## 4. Verification Commands & Gate Checks

| Lệnh / Tiêu chí kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `git status --short` | PASS | Đúng 7 file theo scope task-04, không có file thừa |
| `pnpm lint` | PASS | 0 error, 0 warning trên toàn monorepo |
| `pnpm typecheck` | PASS | TypeScript compile thành công 100% |
| `pnpm test` | PASS | 133/133 tests PASS (65 api, 54 web, 14 shared). Riêng `catalog.e2e-spec.ts` đạt 20/20 test cases |
| `pnpm build` | PASS | Build thành công NestJS API dist + Next.js Web pages |
| Anti-slop / oxlint gate | N/A | `skip, oxlint not configured` |
| Open Code Review gate | PASS | `ocr delegate preview` ghi nhận 7/7 files, cấu trúc code sạch, 0 defect |
| AI-slop gate | N/A | `skip, aislop not installed` |
| AI-Friendly Web gate | N/A | Scope là backend API module và shared schemas |
| AI-Readable gate | PASS | Naming tường minh, không magic number, hàm ≤ 25 dòng, tách biệt rõ ràng |

---

## 5. Kết luận

Mọi tiêu chí chấp nhận (AC-19, Quyết định #13, phân quyền Admin/Manager, CinemaScope, và kiểm soát đóng rạp) đều được đáp ứng đầy đủ và có 20 e2e test cases bảo vệ độc lập. Mã nguồn sạch, bảo mật cao và tuân thủ nghiêm ngặt quy chuẩn kiến trúc của dự án.

**Verdict:** `STRICT PASS`
