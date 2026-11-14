# Review — build-filmbooking layer-7 task-01 (round 1)

Agent: reviewer

- **Task:** `tasks/build-filmbooking/layer-7-task-01.md` — Web admin phim & rạp (màn 19/20/36/37)
- **Worktree:** `E:/FilmBooking/.worktrees/layer-7__task-01` (branch `wt/layer-7__task-01`, chưa commit, toàn bộ file mới/untracked)
- **Review level:** STRICT
- **Reason:** RBAC Admin/Manager trên UI, guard AC-26 (đổi trạng thái rạp), contract admin API (movies/cinemas/settings/status), ghi đè cấu hình rạp (kích hoạt trigger `cinemas_recompute_showtimes`).
- **Blast radius:** 4 page mới dưới `/admin/phim`, `/admin/rap`; 5 component mới trong `components/admin/` (trong đó `form-utils.tsx` với `useAdminMe` và `cinema-status-dialog.tsx` nằm ngoài danh sách Files của task, có thể bị các task khác dùng chung). Không sửa file tracked nào.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared/api/web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS, 19 file, 279 test |
| `cd apps/web && pnpm build` | PASS, đủ route `/admin/phim`, `/admin/phim/[id]`, `/admin/rap`, `/admin/rap/[id]` |
| oxlint | skip, oxlint chưa cấu hình |
| aislop | skip, không có trong allowlist `project-config.md` |
| ocr | skip, ocr chưa cài |
| AI-friendly web | N/A (khu admin nội bộ) |

Các lệnh xanh **không** được dùng làm căn cứ PASS (xem F1: test mock bịa contract).

## Cross-boundary check (đã làm)

- `POST /admin/cinemas` có `@Roles("ADMIN")`. `PATCH /admin/cinemas/:cinemaId` có `@Roles("MANAGER")` + `@CinemaScope`, và service chặn các field `CINEMA_ADMIN_ONLY_FIELDS`. Form của Manager không gửi `code`/`provinceCode` (có test). Path, method và body khớp `createCinemaSchema`/`updateCinemaSchema`.
- `PATCH /cinemas/:cinemaId/settings` có `@Roles("MANAGER")` + `@CinemaScope`, và Admin bypass guard. RLS `cinemas_update` cho Manager rạp mình. Trigger `cinemas_guard_manager_columns` chỉ chặn `code`/`status`. Semantics `null = mặc định chuỗi` khớp `updateCinemaSettingsSchema` và `toSettingsDto` (`effective*`).
- **AC-26:** dialog gọi `PATCH /admin/cinemas/:id/status` (RPC `set_cinema_status`, raise `23514` → API 409 `CONFLICT` + `details.showtimeIds` lấy bằng regex từ message). `infoFields()` không bao giờ gửi `status`, nên UI không có đường bypass qua PATCH chung. Bị chặn thì hiển thị cảnh báo, danh sách và link `/admin/lich-chieu?cinema=..&cancelAll=1`, không gọi `onChanged`. Đạt.
- Role lấy từ `GET /me` (`resolveAdminRole`), không tin query/localStorage. API vẫn là lớp quyền thật.
- `GET /admin/movies` (`listAll`) trả `MovieDto & {status}`, khớp `AdminMovie`. PATCH toggle `{status}` hợp lệ với `updateMovieSchema`.
- Lỗi 400 của `ZodValidationPipe` có dạng `details.issues[{path:"a.b", message}]`, và `serverFieldErrors` parse đúng shape này.

## Findings

### F1 — MAJOR (False-confidence test + AC "lỗi server hiển thị đúng field" không đạt trên contract thật)
- Test `apps/web/src/components/admin/__tests__/catalog-admin.test.tsx:108-119` tên "lỗi server theo field hiển thị đúng ô (slug trùng)". Test mock trường hợp slug trùng thành `VALIDATION_ERROR` 400 với `issues[{path:"slug"}]`.
- API thật thì khác. `apps/api/src/modules/catalog/movies.service.ts:63-64` (`unwrap`, `cinemas.service.ts` cũng import hàm này) map Postgres `23505` thành **409 `CONFLICT` không có details**. Vì vậy slug phim trùng hoặc mã rạp trùng rơi vào banner `_form` (`movie-form.tsx:149-151`, `cinema-form.tsx:172-174`), không gắn vào ô `slug`/`code`.
- Client validate bằng chính schema mà server dùng, nên lỗi server dạng `issues` gần như không xảy ra. Ca thực tế còn lại là "Unknown province" (`cinemas.service.ts:222`, details `{provinceCode}`, không có `issues`), và nó cũng rơi vào `_form`.
- **Hướng sửa:** map `CONFLICT` (409) của POST/PATCH phim thành `errors.slug`, của rạp thành `errors.code` (thông điệp "đã tồn tại"). Map `VALIDATION_ERROR` có `details.provinceCode` thành `errors.provinceCode`. Sửa test cho mock đúng 409 `CONFLICT` không details như API thật, kèm test cho mã rạp trùng.

### F2 — MAJOR (mất dữ liệu cấu hình rạp khi GET settings lỗi)
- `apps/web/src/app/admin/rap/[id]/page.tsx:36` dùng `.catch(() => undefined)` cho `GET /cinemas/:id/settings`. Khi lỗi, form hiển thị 2 ô cấu hình rỗng với hint "Để trống = mặc định chuỗi".
- `cinema-form.tsx:149,158` luôn `PATCH /cinemas/:id/settings` với `{cleaningMinutes:null, onlineCutoffMinutes:null}`.
- Chỉ cần một lần GET lỗi tạm thời (mạng, 5xx) rồi bấm "Lưu rạp" là giá trị riêng của rạp bị reset về mặc định chuỗi. Thay đổi `cleaning_minutes` còn kích hoạt trigger `cinemas_recompute_showtimes` (`20261111030020_catalog_fixes.sql:85`), làm tính lại giờ kết thúc suất.
- **Hướng sửa:** settings lỗi thì cho trang vào `ErrorState`, hoặc không gửi PATCH settings khi chưa load được. Chỉ gửi field nào user thật sự đổi so với giá trị đã load.

### F3 — MAJOR (R-32 "mở/đóng rạp" + trạng thái "Sắp khai trương" không đạt; Blocked do thiếu API)
- Trang danh sách (`rap/page.tsx:35`) và trang sửa (`rap/[id]/page.tsx:35`) đều lấy dữ liệu từ `GET /cinemas` công khai, mà API này chỉ trả rạp `OPEN` (`cinemas.service.ts:121`). Hệ quả:
  - Sau khi Admin đổi rạp sang `TEMP_CLOSED`/`CLOSED`/`COMING_SOON`, rạp biến mất khỏi `/admin/rap` khi reload và **không thể mở lại hay sửa** từ UI. R-32 (thuộc R-list của task) ghi rõ "Admin CRUD rạp, mở/đóng rạp".
  - Form tạo rạp hard-code `status: "OPEN"` (`cinema-form.tsx:135`), nên không tạo được rạp "Sắp khai trương". Design 36 có ô "Trạng thái" trong form.
  - Manager của rạp không `OPEN` không sửa được thông tin hay cấu hình rạp mình (R-32, R-56).
- Builder đã tự nêu gap, nhưng đây là yêu cầu chính của task chứ không chỉ là hạn chế. Việc sửa cần endpoint `GET /admin/cinemas` (+ `/:id`), tức thay đổi API nằm ngoài danh sách Files của task. Hướng xử lý: dispatcher tạo task API (hoặc mở rộng scope), rồi web chuyển sang endpoint đó. Trước khi có endpoint, ghi task là `Blocked` một phần, không đánh dấu done R-32.

### F4 — MAJOR (upload poster/banner/ảnh rạp không có; Blocked do thiếu API)
- Description của task ghi "poster upload". R-41 ghi "upload poster/banner lên storage". Design 37 yêu cầu ô upload Poster 2:3/Banner 16:9 có preview, thay/xoá, báo lỗi định dạng/dung lượng, và preview embed trailer. Design 36 có upload "Ảnh đại diện rạp".
- Code hiện chỉ có ô nhập URL (`movie-form.tsx:234-239`, `cinema-form.tsx:242`).
- Bucket `posters`/`banners`/`cinema-images` và RLS đã có (`20261111020000_catalog.sql:359-394`), nhưng browser không giữ session (`lib/supabase/browser.ts`: cookie HttpOnly), và không có endpoint signed-upload kiểu `/me/avatar`. Đây cũng là yêu cầu chưa đạt vì thiếu API, cần task API (signed upload URL cho Admin/Manager) hoặc quyết định chính thức hạ yêu cầu (Change Request), không lặng lẽ thay bằng ô URL.

### MINOR
- M1. `cinema-form.tsx:157-158`: 2 lần PATCH tuần tự không atomic. Info lưu xong mà settings lỗi thì thành lưu dở, và UI báo lỗi chung chung.
- M2. `cinema-status-dialog.tsx:84-100`: `details.showtimeIds` rỗng (API parse không ra id) thì hiện "còn 0 suất" với danh sách rỗng. Số đếm lấy `blockedIds.length`, còn danh sách chỉ gồm id tìm được trong `GET showtimes?from=now`, nên số và danh sách có thể lệch nhau. Dòng không có tên phim hay phòng, và không có số đơn ảnh hưởng như design 19 ("({n} đơn)").
- M3. Bảng 19 thiếu cột Phòng, Quản lý và hành động "Phòng chiếu". Bảng 20 hiển thị trạng thái DB (Ẩn/Hiển thị/Lưu trữ), trong khi design ghi Đang chiếu/Sắp chiếu/Ẩn (có `availability` sẵn). Thể loại là text phân tách dấu phẩy chứ không phải multi-select, tiện ích không phải chip, không có MapView (mức demo chấp nhận được, nên ghi gap).
- M4. `useAdminMe` lỗi (`failed`) thì các page hiện "Không có quyền" thay vì `ErrorState` kèm retry.
- M5. `movie-form.tsx:30`: `AdminMovie` là kiểu tự khai báo `MovieDto & {status}`, không lấy từ shared. `listAll` của API trả `status: string`, nên lệch kiểu chỉ được che bằng cast.
- M6. `form-utils.tsx` và `cinema-status-dialog.tsx` nằm ngoài danh sách Files của task. Tôi không kiểm tra được worktree layer-7 khác (hook chặn lệnh `git worktree list`), nên còn residual risk add/add conflict khi merge song song.

## Điểm đạt
- AC-19: Admin tạo rạp `OPEN` qua `POST /admin/cinemas` thì rạp có ngay trong `GET /cinemas` công khai.
- AC-26 (UI): đạt, có test (giới hạn ở M2).
- Manager không thấy nút Thêm rạp, Đổi trạng thái hay Thêm phim; `/admin/rap/moi` và `/admin/phim*` chặn Manager (có test cho trang rạp).
- Form validate bằng zod schema shared, lỗi client gắn đúng field (có test).
- Code gọn, file ≤ 300 dòng, không drive-by refactor. AI-readable: không đủ 3 indicator.

## Verdict

**FAIL** (STRICT). 4 MAJOR: F1 false-confidence test + AC lỗi server, F2 mất dữ liệu cấu hình, F3 R-32 mở/đóng rạp (Blocked API), F4 upload media (Blocked API).
- Builder sửa được ngay trong scope web: F1, F2 (và M1, M2, M4 nếu muốn).
- F3 và F4 cần dispatcher quyết định: tạo task API (`GET /admin/cinemas[/:id]`, signed upload URL) hoặc Change Request hạ yêu cầu có user duyệt. Không được đóng task với R-32/R-41 là done khi chưa có một trong hai.
