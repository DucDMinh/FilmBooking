Agent: reviewer

# Review — build-filmbooking layer-7 task-10 — round 1

- Task: `tasks/build-filmbooking/layer-7-task-10.md` (fix GAP-008 / GAP-011 / GAP-027 từ phase review layer 7)
- Diff: chưa commit, main checkout `E:/FilmBooking`, branch `layer-7-integration`
- Review level: **NORMAL**
- Reason: chỉ điều hướng web (nav-config, sidebar, 2 trang rạp, nhãn), không đổi API/schema/quyền. Mục nav dùng chung cho mọi vai trò nên soát kỹ input `?cinema=`.
- Blast radius: sidebar admin (desktop + mobile Sheet) cho mọi vai trò; `/admin/rap`, `/admin/rap/[id]`; `affectedActionLabel` (order-utils).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` (root, gồm `apps/web vitest run`; hook chặn dạng `cd apps/web && pnpm test`) | PASS — web 28 file / 433 test, api 480 test, shared 14 test, scripts 16 test |
| `pnpm build` | PASS — có route `/admin/rap/[id]/phong`, `/admin/rap/[id]/phong/[roomId]`, `/admin/ngay-le` |
| aislop / oxlint / ocr | skip (không nằm trong allowlist verify, oxlint chưa cấu hình, chưa cài ocr) |

Typecheck/lint/test/build đều xanh nhưng chưa đủ để PASS, xem Findings.

## Findings

### MAJOR-1: sidebar "Phòng & sơ đồ ghế" thành dead link khi `?cinema=all` (Admin chọn "Toàn chuỗi")
- `apps/web/src/components/admin/nav-config.ts` (`resolveNavHref`, dòng cuối file): `item.cinemaHref && cinemaParam ? item.cinemaHref(cinemaParam) : item.href` coi mọi giá trị `?cinema=` khác rỗng là id rạp.
- `ALL_CINEMAS = "all"` (`use-admin-scope.ts:6`) là giá trị hợp lệ mà bộ chọn ghi lên URL khi Admin chọn "Toàn chuỗi" (`cinema-selector.tsx:113` → `setScope` → `params.set("cinema", next)`).
- Hệ quả: Admin ở bất kỳ trang nào có `?cinema=all` bấm mục sidebar thì vào `/admin/rap/all/phong` → `GET /cinemas/all/rooms` trả 400/404 → `rethrowRoomApiError` gọi `notFound()` (`room-access.ts:42`) → trang 404. Điều này vi phạm Acceptance "Sidebar không còn href tới route không tồn tại" và đúng ca bạn yêu cầu kiểm.
- Ở mức nhẹ hơn: giá trị lạ hoặc rạp không được gán (Manager dán `?cinema=<rạp khác>`) cũng đi thẳng vào href → `/khong-co-quyen` hoặc 404. Các trang khác đều lọc qua `resolveScope(...)` trước khi dùng `?cinema=`; mục nav này bỏ qua bước đó. Encode thì ổn (`encodeURIComponent`), không có rủi ro injection.
- Sửa: tối thiểu loại `ALL_CINEMAS` (và rỗng) trong `resolveNavHref` để fallback về `/admin/rap`. Nếu có danh sách rạp của shell thì validate qua `resolveScope`/membership. Thêm test `resolveNavHref(rooms, "all") === "/admin/rap"`.

### MAJOR-2: thiếu test cho link rạp → phòng trong trang (trọng tâm của blocker GAP-008)
- `apps/web/src/app/admin/rap/page.tsx:106-110` (nút "Phòng" mỗi dòng) và `apps/web/src/app/admin/rap/[id]/page.tsx:65-71` (nút "Phòng & sơ đồ ghế", ẩn khi `moi`) không có test nào. Grep `/phong` trong `*.test.tsx` chỉ thấy các test nav-config.
- Bộ test mới chỉ chứng minh hàm thuần `resolveNavHref` với `"c1"`/`null`. Chưa có test nào chứng minh luồng click "/admin/rap → chi tiết → phòng" (R-38/R-47/R-48) hay việc ẩn nút khi `id === "moi"`. GAP-008 là P0 blocker, nên logic này không được để thiếu test.
- Sửa: render test cho 2 trang (mock `apiFetch`/`useAdminMe`/`useParams`): có link `href="/admin/rap/<id>/phong"` cho cả ADMIN và MANAGER; trang `moi` không có link. Thêm test render `NavList` có `?cinema=c1` và kiểm href của mục phòng (không gắn thêm `?cinema=`).

### MINOR-1: mất scope `?cinema=` khi đi qua mục phòng, và có hai mục cùng active
- `admin-sidebar.tsx:40` cố ý bỏ `?cinema=` cho mục có `cinemaHref`. Sau khi tới `/admin/rap/c1/phong`, URL mất `cinema`: bộ chọn rạp reset (Admin về "Toàn chuỗi", Manager về rạp đầu) và các link sidebar khác cũng mất scope. Việc này lệch với hành vi G/M13-1 (giữ `?cinema=` khi chuyển route con). Mục phòng sau đó resolve lại về `/admin/rap`.
- `isNavItemActive`: ở `/admin/rap` khi không có cinema, cả "Rạp chiếu" và "Phòng & sơ đồ ghế" đều có `aria-current="page"`. Ở `/admin/rap/c1/phong`, "Rạp chiếu" cũng active vì khớp tiền tố `/admin/rap/`. Hai mục cùng `aria-current` gây nhiễu cho a11y/UX.
- Đề xuất: giữ `?cinema=` cho cả mục theo rạp (route `/admin/rap/<id>/phong?cinema=<id>` vô hại), và chỉ đánh active một mục.

### Đã kiểm, OK
- Ngày lễ: `GET /holidays` là `@Public()`, `POST`/`DELETE` là `@Roles("ADMIN")` (`pricing.controller.ts:83-98`). Nav chỉ cho ADMIN là khớp Acceptance "mục ngày lễ cho Admin". Manager vẫn tới được bản chỉ đọc qua link ở `/admin/gia/page.tsx:22` (mục "Giá & ngày lễ"), và `HolidayManager` ẩn thao tác khi không phải Admin. Không bắt buộc thêm nav cho Manager.
- Manager mở nút phòng ở rạp mình: `/admin/cinemas` API tự giới hạn Manager về rạp mình nên danh sách chỉ có rạp được gán. `loadRoomAccess` tính `canEdit` theo membership MANAGER, API `@CinemaScope` kiểm quyền thật. OK.
- Không còn `/admin/phong` trong nav, có test chặn hồi quy. Key `li` đổi sang `label` là đúng vì hai mục cùng `href` `/admin/rap`, và label là duy nhất.
- GAP-027: đã bỏ `EXCHANGED` khỏi `order-utils.ts:74`. Giá trị lạ fallback hiển thị raw, chấp nhận được.
- Surgical diff: mọi dòng đều trace được về task, không có refactor ngoài phạm vi.

## Verdict

**FAIL**: MAJOR-1 (dead link `/admin/rap/all/phong` từ sidebar khi Admin chọn "Toàn chuỗi", vi phạm Acceptance) và MAJOR-2 (luồng click rạp → phòng của blocker GAP-008 không có test). Builder sửa `resolveNavHref` + bổ sung test, MINOR-1 nên xử lý cùng lượt.
