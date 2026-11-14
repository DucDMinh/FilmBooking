# Review — build-filmbooking layer-7 task-01 (round 2)

Agent: reviewer

- **Task:** `tasks/build-filmbooking/layer-7-task-01.md`, Web admin phim & rạp (màn 19/20/36/37). Dispatcher đã mở rộng scope sang API: `GET /admin/cinemas`, `GET /admin/cinemas/:cinemaId`, `POST /admin/uploads`, schema shared và `docs/API_SPEC.md`.
- **Worktree:** `E:/FilmBooking/.worktrees/layer-7__task-01` (chưa commit).
- **Review level:** STRICT
- **Reason:** đụng RBAC Admin/Manager và tenant isolation theo rạp (service-role client), cấp quyền upload file (signed upload URL + storage RLS), DTO/schema dùng chung (`packages/shared/src/schemas/catalog.ts`) và API contract mới.
- **Blast radius:**
  - API: `cinemas.controller.ts` (+2 route), `cinemas.service.ts` (+`listAdmin`/`getAdmin`), `uploads.controller.ts` và `uploads.service.ts` (mới), `catalog.module.ts`.
  - Shared: `AdminCinemaDto`, `UploadTicketDto`, `createUploadSchema`, `UPLOAD_*`. Chỉ thêm mới, không đổi kiểu cũ.
  - Web: 4 page `/admin/phim*`, `/admin/rap*` và 5 component trong `components/admin/`. Ba file `form-utils`, `cinema-status-dialog`, `image-upload-field` nằm ngoài danh sách Files. Đã đối chiếu worktree task-02/03/04: không có file trùng tên, nên không có add/add conflict. Rủi ro conflict còn lại là `docs/API_SPEC.md` (task-03 cũng sửa), cần merge tay.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared/api/web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS, 19 file, 288 test |
| `cd apps/api && pnpm test` | PASS, 24 file, 478 test (các log ERROR là test lỗi có chủ đích của payment/reconcile/me) |
| `pnpm build` | PASS. API 102 file. Web có đủ route `/admin/phim`, `/admin/phim/[id]`, `/admin/rap`, `/admin/rap/[id]` |
| oxlint | skip, oxlint chưa cấu hình |
| aislop | skip, không có trong allowlist |
| ocr | skip, ocr chưa cài |
| AI-friendly web | N/A (khu admin nội bộ) |

Các lệnh xanh không phải căn cứ PASS. Mock đã được đối chiếu với migration ở phần dưới.

## Đóng finding round 1

| # | Kết luận | Bằng chứng |
|---|---|---|
| F1 (409 không gắn field, test mock sai) | **Đã sửa đúng root cause** | `form-utils.tsx:51-59` `writeErrorToFields` map: `CONFLICT` → `slug` (phim) / `code` (rạp); `details.provinceCode` → `provinceCode`; `issues[]` → field tương ứng; còn lại → `_form`. Trong module catalog chỉ có hai nguồn sinh `CONFLICT`. Nguồn một là `unwrap` 23505/23503 (`movies.service.ts:63-64`). Nguồn hai là `assertNoFutureShowtimes`, chỉ chạy khi có `status`, mà form sửa không bao giờ gửi `status`, nên không gắn nhầm field. Test nay mock đúng 409 `CONFLICT` không details (`catalog-admin.test.tsx:112-120, 159-169`). Test 400 `details.provinceCode` (`:171-180`) khớp `cinemas.service.ts:254`. |
| F2 (GET settings lỗi → PATCH null reset cấu hình) | **Đã sửa** | `rap/[id]/page.tsx:34-55`: chỉ chấp nhận 404; lỗi khác thì cả trang ra `ErrorState`; settings `undefined` thì không render form. `cinema-form.tsx:173-175` chỉ PATCH settings khi đã load và `settingsChanged`. Có test: `:182-189`, `:283-290`. |
| F3 (R-32: rạp không OPEN biến mất, không mở lại được, không tạo được COMING_SOON) | **Đã sửa** | Danh sách và trang sửa dùng `GET /admin/cinemas[/:id]`, trả mọi trạng thái (`rap/page.tsx:35`, `rap/[id]/page.tsx:35`). Form tạo có Select trạng thái (`cinema-form.tsx:240-254`). `GET /cinemas/:id/settings` dùng JWT, nhưng RLS `cinemas_select using (true)` (`20261111010000_core_identity_chain.sql:409`) nên Manager của rạp đang đóng vẫn đọc được cấu hình. |
| F4 (R-41: không có upload) | **Đã sửa** | `POST /admin/uploads` kết hợp `ImageUploadField` cho poster, banner và ảnh rạp: có preview, nút Xoá, báo lỗi định dạng và dung lượng. PUT dùng FormData, giống hệt `uploadToSignedUrl` của supabase-js. Flow này cùng nguồn `signedUrl`/`publicUrl` (Supabase URL của API) với flow avatar đã chạy (`profile.service.ts:121-127`, `avatar-upload.tsx:103-107`). Avatar PUT binary, còn ở đây PUT multipart; storage-api nhận cả hai. Không có CSP (`Content-Security-Policy`/`connect-src`/`img-src`) trong `apps/web`, nên trình duyệt không bị chặn PUT hay preview `<img>`. |
| M6 (file ngoài scope, conflict song song) | **Đóng** | Worktree task-02/03/04 không có `form-utils`, `cinema-status-dialog`, `image-upload-field`. |

## Cross-boundary / security check endpoint mới

**`GET /admin/cinemas`** (`cinemas.controller.ts:48-55`, `cinemas.service.ts:184-190`)
- `@Roles("MANAGER")`. `RolesGuard` (`roles.guard.ts:27-31`) cho qua Admin và Manager của ít nhất một rạp. Staff-only và Customer nhận 403 (có test).
- Lọc rạp cho Manager theo `cinemaRoles` có role `=== "MANAGER"`, lấy từ `staff_assignments` bằng service role (`access.service.ts:59-72`), không lấy từ input của client. Manager không thấy được rạp chỉ được gán STAFF hay rạp khác. Danh sách rỗng → `in("id", [])` → trả rỗng.
- Dùng service role bỏ qua RLS nhưng không gây rò dữ liệu: `cinemas_select` vốn đã cho anon đọc mọi dòng, và cột trả về là `CINEMA_COLUMNS` (liên hệ công khai), không có PII.
- `provinces!inner(code)` không làm rơi rạp nào vì `cinemas.province_id` là `not null` (`core_identity_chain.sql:89`). `rooms(count)` trả về dạng `[{count}]`. `adminCinemaToDto` đọc đúng dạng đó, và mock e2e cũng trả `rooms: [{ count: 4 }]`, khớp PostgREST.

**`GET /admin/cinemas/:cinemaId`**: có `@Roles("MANAGER")` + `@CinemaScope()`. `CinemaScopeGuard` (`cinema-scope.guard.ts:45-55`) đòi role MANAGER **tại đúng rạp** đó, sai thì 403 `FORBIDDEN_CINEMA`. Rạp không tồn tại thì 404. Có test cả ba nhánh.

**`POST /admin/uploads`** (`uploads.controller.ts`, `uploads.service.ts`)
- Path traversal: client không điều khiển được path. Path do server ghép: `<"" | "new/" | "<cinemaId>/"><randomUUID>.<ext từ enum>`. `cinemaId` qua `z.guid()`. Schema là `strictObject`, nên field lạ như `path` bị 400 (có test).
- Giả mạo cinemaId: Manager phải là MANAGER tại `cinemaId` (`uploads.service.ts:51-53`). GUID viết hoa hoặc thuộc rạp khác không khớp key của map, nên bị 403 (fail-closed). Admin được upload vào mọi thư mục, khớp policy `cinema_images_insert` (`20261111020000_catalog.sql:381-389`). Posters/banners chỉ Admin, khớp `movie_images_admin_insert` (`:372-373`).
- Signed URL tạo bằng `forUser(user.jwt)`, không phải service role (test assert `jwt !== "admin"`). Storage RLS vì thế là lớp chặn thứ hai.
- contentType/size: schema chỉ là khai báo của client. Lớp chặn thật là cấu hình bucket `file_size_limit 5242880` + `allowed_mime_types` (`catalog.sql:360-362`), khớp với schema.
- `docs/API_SPEC.md` đã cập nhật 3 endpoint.

## Findings

Không có finding CRITICAL/MAJOR mới.

### MINOR (không chặn, ghi gap ở close-out)
- **N1 (M2 cũ).** `cinema-status-dialog.tsx:97-100, 113`: khi API không parse được `showtimeIds`, dialog hiện "còn 0 suất". Danh sách mỗi suất chỉ có giờ và định dạng, thiếu tên phim, phòng và "(n đơn)" như design 19. AC-26 (cảnh báo, danh sách, không đổi trạng thái, link huỷ hàng loạt) vẫn đạt, nên chấp nhận là gap UX.
- **N2 (M3 cũ).** Bảng 20 hiển thị trạng thái DB thay vì Đang chiếu/Sắp chiếu/Ẩn. Thể loại và tiện ích nhập dạng text phân tách bằng dấu phẩy, chưa có multi-select/chip. Chưa có MapView. Bảng 19 đã có cột Phòng nhưng chưa có cột Quản lý. Mức demo nên chấp nhận được (`demo-project-keep-lean`), cần ghi gap.
- **N3 (M4 cũ).** `useAdminMe` đã có `failed`/`retry` (`form-utils.tsx:174-200`) nhưng các page không dùng. Khi `/me` lỗi, page vẫn hiện "Không có quyền" thay vì `ErrorState`. Chỉ ảnh hưởng UX, không ảnh hưởng quyền.
- **N4 (M1 cũ).** `cinema-form.tsx:171-175`: hai lần PATCH không atomic. Nếu info lưu xong mà settings lỗi thì chỉ hiện message chung ở `_form`. Tác động đã giảm vì settings chỉ được gửi khi thật sự đổi.
- **N5.** Ảnh mồ côi: upload xong nhưng không lưu form, hoặc Admin upload vào `new/` khi tạo rạp, thì file nằm lại trong bucket, không có cơ chế dọn. `POST /admin/uploads` không có rate limit riêng. Endpoint chỉ dành cho staff, chấp nhận được ở mức demo.
- **N6.** Residual risk: PUT lên Storage thật và cú pháp `rooms(count)` mới kiểm bằng mock, chưa chạy trên Supabase thật. Cả hai đi theo pattern đã có (avatar) và tài liệu supabase-js. Nên smoke test thủ công hoặc qua `test:int` sau merge.
- **N7.** `AdminMovie` (`movie-form.tsx:31`) vẫn khai báo kiểu tại chỗ, không lấy từ shared (M5 cũ).
- **N8.** `cinema-form.tsx` dài 305 dòng, **vượt ngưỡng 300**. Ghi nợ kỹ thuật không chặn, theo tiền lệ review task-04 round 2. Khi có dịp nên tách phần `settingsFields`/`settingsChanged` hoặc section "Cấu hình rạp" ra.

### Về việc builder để lại M2/M3/M4
Task file không có AC nào yêu cầu số đơn chi tiết, multi-select hay ErrorState cho `/me`. Cả 4 AC của task đều đạt: AC-19, AC-26, Manager không thấy nút tạo, và zod shared + lỗi server gắn đúng field. Các mục còn lại là MINOR về UX/design, chấp nhận làm gap. Điều kiện: dispatcher phải ghi N1–N3 và N5 vào gap register khi close-out, không lặng lẽ bỏ qua.

## Ghi chú cho dispatcher
- `GET /admin/cinemas` giải quyết luôn gap "rạp không OPEN mất tên" mà task-03 đang ghi. Sau merge có thể chuyển task-03 sang endpoint này.
- `docs/API_SPEC.md` sẽ conflict với task-03 ở dòng bảng CatalogModule/CinemaOpsModule, cần merge tay.

## Điểm đạt
- AC-19: Admin tạo rạp (có chọn trạng thái) qua `POST /admin/cinemas`. Rạp `OPEN` xuất hiện ngay ở `/rap`.
- AC-26: đạt, có test.
- Manager không thấy nút Thêm rạp, Đổi trạng thái, Thêm phim. `/admin/rap/moi` và `/admin/phim*` chặn Manager. API là lớp quyền thật.
- Form validate bằng zod schema shared; lỗi server gắn đúng field theo contract thật.
- Surgical diff: mọi thay đổi ở API đều truy được về F3/F4. Hàm ≤ 50 dòng. Các file mới/sửa ≤ 300 dòng, trừ `cinema-form.tsx` (305, xem N8). AI-readable: chưa tới 3 indicator.

## Verdict

**STRICT PASS**. F1–F4 đã sửa đúng root cause. RBAC/tenant isolation của endpoint mới đúng: Manager được lọc theo `staff_assignments` phía server, upload fail-closed, signed URL dùng JWT của caller, storage RLS + bucket limit là lớp chặn thật. Không còn MAJOR. Các MINOR N1–N8 cần ghi gap/nợ khi close-out.
