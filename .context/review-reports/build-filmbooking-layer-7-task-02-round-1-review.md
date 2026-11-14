# Review — build-filmbooking layer-7-task-02 — round 1

Agent: reviewer
Task: Web admin phòng chiếu + trình chỉnh sơ đồ ghế + sao chép sơ đồ (R-47, R-48)
Worktree: E:/FilmBooking/.worktrees/layer-7__task-02 (branch wt/layer-7__task-02, thay đổi chưa commit, toàn bộ là file untracked)

## Review level
STRICT

## Reason
UI phân quyền theo vai trò (Admin / Manager đúng rạp / Staff chỉ xem). PUT sơ đồ và POST copy thay toàn bộ sơ đồ của phòng (xoá rồi chèn lại, copy còn đổi kích thước lưới). PATCH phòng ghi đè cột `supported_formats`.

## Blast radius
- Route mới: `/admin/rap/[id]/phong` và `/admin/rap/[id]/phong/[roomId]`.
- Dữ liệu ghi qua API: `rooms` (insert/patch), `seats` (replace), `rooms.grid_*` (khi copy).
- Ảnh hưởng gián tiếp: xếp suất 3D (trigger `20261111020000_catalog.sql:209` kiểm `format = any(supported_formats)`).
- Không sửa file shared nào. Có 3 file ngoài danh sách task: `room-layout-panel.tsx`, `rooms-manager.tsx`, `room-access.ts`.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS, 19 file, 280 test |
| `cd apps/web && pnpm build` | PASS, có route `ƒ /admin/rap/[id]/phong` và `ƒ /admin/rap/[id]/phong/[roomId]`. Không có `/admin/rap` hay `/admin/phong` |
| aislop / oxlint / ocr | skip: không nằm trong allowlist verify của `.context/project-config.md` (hook agent-guard chặn lệnh ngoài allowlist) |
| AI-friendly web gate | N/A (trang admin nội bộ, `robots: { index: false }`) |

## Đối chiếu chéo (những gì đã kiểm và đúng)
- **Body/path API khớp `rooms.controller.ts`:**
  - `PUT /cinemas/:cinemaId/rooms/:roomId/seats` nhận `{ cells: [{row, col, type}] }`, khớp `saveSeatLayoutSchema`.
  - `POST .../seats/copy` nhận `{ sourceRoomId }`, khớp `copySeatLayoutSchema`.
  - `POST /cinemas/:id/rooms` và `PATCH .../rooms/:roomId` khớp `createRoomSchema` / `updateRoomSchema`.
- **Mã lỗi:**
  - Proxy `app/api/proxy/[...path]/route.ts` chuyển nguyên body.
  - `AppException` trả `error.details`, và `toApiError` giữ lại `details`.
  - `details.reason === "ROOM_HAS_UPCOMING_SHOWTIMES"` (`seat-layout.service.ts:283`) được map đúng ở `room-layout-panel.tsx:47` và `copy-layout-dialog.tsx:91`.
- **Quyền:**
  - Admin qua `@Roles("MANAGER")` (`roles.guard.ts:27`) và `@CinemaScope` (`cinema-scope.guard.ts:45`).
  - `canEdit = isAdmin || managedIds.includes(cinemaId)` khớp quyền ghi của API và RLS (`rooms_write_*`, `seats_write_*`).
  - Staff đúng rạp thì `canEdit = false`, editor ở chế độ chỉ xem.
- **Serialize sơ đồ:**
  - Ô không có trong map nghĩa là ô trống. Lối đi và ghế hỏng được gửi lên.
  - Server tự sinh label (`toSeatInsert`).
  - Sweetbox lưu 1 bản ghi ở ô gốc, server và schema kiểm span 2 và chồng ô.
  - Trang sơ đồ chỉ map `{row, col, type}` nên reload không mất dữ liệu.
- **Sweetbox không sinh ghế lẻ:**
  - `applyTool` chặn sweetbox ở cột cuối và hiện lỗi ngay tại chỗ.
  - Đặt đè lên nửa sweetbox thì gỡ cả cặp.
  - Có test cho cả hai trường hợp.
- **Bàn phím:**
  - Roving tabindex, phím mũi tên tự nhảy qua nửa sau của sweetbox.
  - Phím 1–5 và 0/Delete hoạt động. Space/Enter đặt công cụ đang chọn (click mặc định của button).

## Findings

### CRITICAL
Không có.

### MAJOR

**M1. Sửa phòng làm mất định dạng 3D (mất dữ liệu)**
- Vị trí: `apps/web/src/components/admin/rooms-manager.tsx:66`, `:84`, `:91`.
- Cơ chế:
  - `openDialog` thu `supportedFormats` về một giá trị: chỉ ra `"3D"` khi phòng có 3D mà không có 2D, còn lại là `"2D"`.
  - `submit` luôn gửi `supportedFormats: [form.format]`, kể cả khi chỉ đổi tên hoặc trạng thái.
- Hậu quả:
  - Phòng `['2D','3D']` (seed `supabase/seed.sql:152`, `:155`, `:158`…) bị ghi thành `['2D']` khi bấm "Sửa" rồi "Lưu".
  - Sau đó trigger `20261111020000_catalog.sql:209` từ chối mọi suất 3D vào phòng này.
- Form tạo phòng cũng không tạo được phòng 2D+3D, trong khi R-47 nói "định dạng hỗ trợ (2D/3D)" và DB là mảng.
- Hướng sửa:
  - Dùng multi-select hoặc checkbox cho định dạng (tối thiểu 1).
  - PATCH chỉ gửi những trường người dùng thực sự đổi.
  - Thêm test cho payload.

**M2. R-48 "sao chép sơ đồ kể cả của rạp khác" chưa làm được với Manager**
- Vị trí: `apps/web/src/components/admin/room-access.ts:31-32`, `copy-layout-dialog.tsx:35`, `:62`.
- Hiện trạng:
  - Nguồn copy của Manager bị giới hạn ở `managedIds`.
  - Danh sách phòng nguồn lấy từ `GET /cinemas/:id/rooms`, endpoint này có `@CinemaScope` nên trả 403 với rạp khác.
- Thực tế phía API và DB:
  - RLS `rooms_select` và `seats_select` là `using (true)` cho anon và authenticated (`20261111020000_catalog.sql:304`, `:313`).
  - `copyLayout` cố ý chỉ kiểm quyền ở phòng đích (`seat-layout.service.ts:217`).
  - Endpoint public `GET /cinemas/:code` (`cinemas.service.ts:127-153`) trả `rooms[{id, name}]` của mọi rạp OPEN.
- Như vậy API đã hỗ trợ, chỉ UI chưa làm. Comment ở `copy-layout-dialog.tsx:35` ("API chỉ cho đọc phòng trong phạm vi quyền") sai so với API thật.
- Manager một rạp chỉ copy được trong rạp mình, trái với yêu cầu M ở R-48.
- Hướng sửa: nguồn rạp cho mọi vai trò sửa được là danh sách `/cinemas`, và lấy phòng qua `GET /cinemas/:code`. Có thể truyền `code` trong `CopySourceCinema`.

### MINOR

1. **Chưa có trạng thái "chỉ đọc khi phòng có suất".** Design-spec `.context/design-spec.md:444` yêu cầu sơ đồ chỉ đọc kèm Alert ngay khi vào trang. Hiện tại chỉ biết khi bấm Lưu (409). Có thể kiểm trước bằng `GET /cinemas/:id/showtimes?roomId=&from=now`. Builder đã tự nêu, cần ghi vào gap register.

2. **Không đổi được số hàng/cột sau khi tạo, và không có "＋ Thêm hàng ghế"** (`design-spec.md:443`). `updateRoomSchema` không có trường grid. Đây là giới hạn của API, builder đã tự nêu, cần ghi gap. Ngoài ra copy từ phòng khác lưới có thể âm thầm đổi kích thước lưới phòng đích (`seat-layout.service.ts:230`), nhưng dialog không cảnh báo (`copy-layout-dialog.tsx:110`).

3. **Lỗi 403 FORBIDDEN_CINEMA không được map.**
   - Hai trang chỉ bắt 404/400 (`phong/page.tsx:38`, `[roomId]/page.tsx:31`), nên 403 rơi vào `app/error.tsx` chung.
   - Ví dụ: Staff hoặc Manager mở URL rạp không thuộc mình.
   - Nên `redirect("/khong-co-quyen")`.
   - Comment ở `seat-layout-editor.tsx:98` ("Manager không thuộc rạp: chỉ xem") không bao giờ xảy ra, vì API trả 403 trước.

4. **Mỗi phòng gọi thêm một GET sơ đồ trên trang danh sách** (`phong/page.tsx:41-47`).
   - Các lời gọi chạy song song bằng `Promise.all`, mỗi lời gọi tốn 2 query DB.
   - Với 5–15 phòng mỗi rạp thì chấp nhận được, nhưng là N+1 (mức thấp).
   - `.catch(() => null)` khiến lỗi hiện thành "0 ghế", gây hiểu nhầm.

5. **Nguồn rạp của Admin chỉ gồm rạp OPEN.** `room-access.ts:29` dùng `/cinemas` public. Nếu rạp hiện tại không OPEN, giá trị mặc định của Select (`copy-layout-dialog.tsx:49`) không khớp option nào. `/cinemas` lỗi thì bị nuốt thành `[]`.

6. **Điều hướng:**
   - `nav-config.ts:25` trỏ `/admin/phong`, route này không tồn tại (build không có). Không task layer-7 nào nhận sửa, cần ghi gap.
   - Link quay lại `/admin/rap` (`phong/page.tsx:52`) do layer-7-task-01 tạo (`tasks/build-filmbooking/layer-7-task-01.md:38`). Hiện 404 trong worktree, sẽ ổn sau khi merge.
   - Design-spec đặt editor ở `/admin/phong/[roomId]/so-do`, còn code dùng `/admin/rap/[id]/phong/[roomId]`. Lệch này chấp nhận được vì theo đúng Files của task, nhưng cần ghi lại.

7. **Scope:** 3 file ngoài danh sách "Files to Create/Modify" (`room-layout-panel.tsx`, `rooms-manager.tsx`, `room-access.ts`). Đã grep các task khác, không trùng file nào. Cần bổ sung vào task file khi close-out.

8. **Test còn thiếu.** Chỉ có test editor và các hàm thuần. Chưa có test cho:
   - payload của `RoomsManager` (đã có thể bắt được M1);
   - logic `canEdit` / `sourceCinemas` của `loadRoomAccess`;
   - map `details.reason` ở `RoomLayoutPanel` và `CopyLayoutDialog`.

   Phần đã test có ý nghĩa, không phải false-confidence: không mock API, chỉ kiểm logic thuần.

9. **A11y nhỏ:**
   - aria-label của sweetbox chỉ ghi "A3 Ghế đôi" mà không ghi "3–4" (design-spec:230 ghi dạng "ghế đôi 7–8").
   - Click chuột đặt sweetbox ở ô trái của ô đang active (ô active bị che) làm mất phần tử `tabIndex=0` trên Safari, nơi click không focus button.
   - Không cảnh báo khi rời trang mà chưa lưu.

## Verdict
**FAIL**. Có 2 MAJOR:
- M1: mất `supported_formats` khi sửa phòng.
- M2: R-48 copy liên rạp chưa làm được với Manager.

Sửa M1 và M2, thêm test cho M1, rồi review round 2. Các MINOR 1, 2, 6 (nav) cần ghi vào gap register nếu không sửa.
