# Review — build-filmbooking layer-7-task-02 — round 2

Agent: reviewer
Task: Web admin phòng chiếu + trình chỉnh sơ đồ ghế + sao chép sơ đồ (R-47, R-48)
Worktree: E:/FilmBooking/.worktrees/layer-7__task-02 (chưa commit, toàn bộ file untracked)

## Review level
STRICT

## Reason
Phân quyền theo rạp (Admin / Manager đúng rạp / Staff chỉ xem). Sao chép sơ đồ ghi đè toàn bộ sơ đồ và có thể đổi kích thước lưới phòng đích. PATCH phòng ghi cột `supported_formats`, cột này quyết định suất 3D có xếp được hay không.

## Blast radius
- Route: `/admin/rap/[id]/phong`, `/admin/rap/[id]/phong/[roomId]`.
- Ghi qua API: `rooms` (insert/patch), `seats` (replace), `rooms.grid_*` (khi copy).
- Đọc thêm endpoint public `GET /cinemas` và `GET /cinemas/:code`. Không sửa file shared hay API.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS, 20 file, 294 test |
| `cd apps/web && pnpm exec vitest run` (lần 2, kiểm flaky) | PASS, 20 file, 294 test |
| `pnpm exec vitest run src/components/admin/__tests__/room-admin.test.tsx` | PASS, 14 test, không có cảnh báo |
| `pnpm build` | PASS; có route `ƒ /admin/rap/[id]/phong` và `ƒ /admin/rap/[id]/phong/[roomId]` |
| aislop / oxlint / ocr | skip: không nằm trong allowlist verify |
| AI-friendly web | N/A (trang admin, `robots: { index: false }`) |

Ghi chú: dòng `Not implemented: navigation to another Document` trong full suite không đến từ file test của task này. Chạy riêng `room-admin.test.tsx` thì không có dòng đó.

## Kiểm M1: sửa phòng làm mất cờ 3D
**Đã sửa đúng gốc.**
- Form đổi sang checkbox nhiều định dạng (`rooms-manager.tsx:227-241`). Khi mở dialog, form nạp đủ mảng `supportedFormats` (`:87`). Submit chặn trường hợp không chọn định dạng nào (`:102`).
- `buildRoomPatch` (`:54-66`) chỉ đưa vào patch những trường đã đổi. So sánh định dạng không phụ thuộc thứ tự. Patch rỗng thì không gọi API (`:122`).
- Đối chiếu API `seat-layout.service.ts:168-173`: `updateRoom` chỉ ghi trường `!== undefined`, nên patch `{name}` không chạm `supported_formats`. Khớp `updateRoomSchema` (các trường optional).
- Tạo phòng 2D+3D đã làm được.
- Test (`room-admin.test.tsx:51-108`) đi qua UI thật:
  - phòng `['2D','3D']`, đổi tên → payload đúng `{ name: "Phòng A" }`;
  - tạo phòng 2D+3D;
  - chặn bỏ hết định dạng.

  Các test này bắt được M1 cũ: nếu code cũ còn gửi `supportedFormats: ["2D"]` thì `toHaveBeenCalledWith` sẽ fail.

## Kiểm M2: Manager copy sơ đồ từ rạp khác
**Đã sửa đúng gốc.**
- `room-access.ts:29-35`: `sourceCinemas` là mọi rạp từ `GET /cinemas` (public, chỉ rạp OPEN), không còn lọc theo `managedIds`.
- `canEdit` vẫn là `isAdmin || managedIds.includes(cinemaId)`, tức chỉ xét rạp đích.
- `copy-layout-dialog.tsx:64-71`: lấy phòng nguồn qua `GET /cinemas/:code`. Endpoint này dùng `publicClient`, lọc `status = OPEN` và trả `rooms[{id,name,…}]` (`cinemas.service.ts:127-153`), nên không bị `@CinemaScope` chặn.
- Đối chiếu API copy thật `seat-layout.service.ts:218-242`:
  - `requireRoom(db, cinemaId, roomId)` kiểm phòng đích thuộc rạp đích. Endpoint có `@CinemaScope` theo `:cinemaId`.
  - Phòng nguồn chỉ đọc bằng JWT user, và RLS `rooms_select` / `seats_select` là `using (true)` (`20261111020000_catalog.sql:304`, `:313`).
  - API **cố ý không** kiểm quyền ở phòng nguồn, đúng R-48 ("kể cả của rạp khác").
  - Sơ đồ ghế vốn đọc công khai (màn chọn ghế), nên không lộ dữ liệu nào ngoài phạm vi public. Không có lỗ hổng RBAC mới.
- Dialog có cảnh báo lưới sẽ đổi theo phòng nguồn (`copy-layout-dialog.tsx:153-155`). Phần cảnh báo này đóng MINOR 2 (phần copy) của round 1.
- Nếu rạp đích không OPEN (Admin), giá trị mặc định rơi về `cinemas[0]` (`:51`). MINOR 5 round 1 đã được xử lý.
- Test `loadRoomAccess` gồm: Manager đúng rạp sửa được và thấy rạp khác làm nguồn; Manager rạp khác không sửa được; Staff không sửa được, Admin sửa được.

## Soi: đổi `mockRejectedValue` sang `mockRejectedValueOnce` (test 409)
**Không che bug.**
- Trong cây render của test (`RoomLayoutPanel`), `apiFetch` chỉ được gọi ở một chỗ: `save` (`room-layout-panel.tsx:43`).
  - `SeatLayoutEditor` không gọi API, cũng không có `useEffect` gọi API. Grep `seat-layout-editor.tsx` chỉ thấy `onSave` ở nút Lưu (`:263`).
  - `CopyLayoutDialog` được render với `open=false`, nên effect `return` ngay (`copy-layout-dialog.tsx:59`).
  - Không có retry.
- Vì `apiFetch` chỉ được gọi một lần, hai cách mock cho kết quả như nhau.
- Kể cả khi giả định có lần gọi thứ hai: với `Once`, lần gọi đó resolve `undefined` và `save` chạy `setSaveError(null)` (`:41`), làm mất alert. Test sẽ fail chứ không pass oan.
- `beforeEach(apiFetch.mockReset)` cách ly giữa các test. Hai lần chạy full suite đều xanh, chạy riêng file cũng xanh.
- Hệ quả: thay đổi này vô hại nhưng không có lý do. Xem MINOR 1.

## Findings

### CRITICAL
Không có.

### MAJOR
Không có. M1 và M2 của round 1 đã đóng.

### MINOR
1. `room-admin.test.tsx:127`: test 409 chỉ kiểm `calls[0]` mà không assert `toHaveBeenCalledTimes(1)`. Nên thêm để khoá hành vi "một lần lưu = một request". Không chặn PASS.
2. Các gap builder để lại. Chấp nhận được theo task file, vì AC của task chỉ gồm sweetbox, lưu/reload/copy độc lập, và bàn phím; các gap dưới đây không thuộc AC. **Điều kiện khi close-out: ghi vào `docs/changes/TECHNICAL_REQUIREMENT_GAPS.md`** (hiện chưa có trong GAP-001..007):
   - Không đổi được số hàng/cột sau khi tạo, và không có "＋ Thêm hàng ghế" (`design-spec.md:443`). Đây là giới hạn API: `updateRoomSchema` không có trường grid. Ngoài phạm vi task web.
   - `nav-config.ts:25` trỏ `/admin/phong`, route này không tồn tại. File nằm ngoài danh sách Files của task. Link `/admin/rap` sẽ ổn sau khi merge task-01.
   - Editor chưa ở chế độ read-only kèm Alert khi phòng có suất sắp chiếu (`design-spec.md:444`). Hiện chỉ biết khi bấm Lưu/Copy, nhưng 409 được map sang tiếng Việt và API vẫn chặn, nên không mất dữ liệu.
   - N+1 GET sơ đồ ở trang danh sách (`phong/page.tsx:39-45`). Các lời gọi chạy song song, 5–15 phòng mỗi rạp, demo chấp nhận được. Khi lỗi thì hiện "—" thay vì "0 ghế" nên không gây hiểu nhầm.
3. Scope: 3 file ngoài danh sách Files (`room-layout-panel.tsx`, `rooms-manager.tsx`, `room-access.ts`) và thêm test `room-admin.test.tsx`. Không trùng file với task khác. Cần bổ sung vào task file khi close-out.
4. Code quality: hàm component `RoomsManager` dài khoảng 210 dòng, phần lớn là JSX. File 280 dòng, dưới giới hạn 300. Chưa đủ 3 chỉ dấu AI-chaos.
5. A11y nhỏ (MINOR 9 round 1) vẫn còn: aria-label sweetbox, không cảnh báo khi rời trang mà chưa lưu. Không chặn.

## Verdict
**STRICT PASS**, kèm điều kiện close-out: ghi 4 gap ở MINOR 2 vào gap register và bổ sung file ngoài scope vào task file.
