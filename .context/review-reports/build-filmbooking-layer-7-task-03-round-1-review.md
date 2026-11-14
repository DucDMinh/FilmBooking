# Review — build-filmbooking layer-7 task-03 — round 1

Agent: reviewer
Task: Web admin lịch chiếu (danh sách, tạo đơn lẻ/hàng loạt, chi tiết suất: đóng bán + khoá ghế, CancelShowtimesDialog)
Worktree: `E:/FilmBooking/.worktrees/layer-7__task-03` (branch `wt/layer-7__task-03`, thay đổi chưa commit, toàn bộ là file mới)

## Review level
**STRICT**

## Reason
Có thao tác phá huỷ, không hoàn tác được (huỷ suất hàng loạt, chuyển đơn `paid` sang `affected`, gửi email hàng loạt), quyền Manager/Admin theo rạp, bảo vệ R-54, xoá suất. Phụ thuộc contract API dùng chung (cinema-ops, cancellation, public seatmap).

## Blast radius
- Màn mới `/admin/lich-chieu`, `/admin/lich-chieu/tao`, `/admin/lich-chieu/[id]`.
- Component admin mới: `cancel-showtimes-dialog.tsx` (task layer-7-task-01 cũng dùng lại cho luồng đóng rạp qua `?cancelAll=1`), `showtime-bulk-form.tsx`, `seat-lock-panel.tsx`, cùng 3 helper ngoài danh sách file (`showtime-utils.ts`, `use-showtime-cinema.ts`, `showtime-page-gate.tsx`).
- Không sửa API, schema hay migration. Dùng lại `SeatMap` của luồng booking (không sửa file đó).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 20 file, 278 test |
| `cd apps/web && pnpm build` | PASS (có 3 route admin/lich-chieu) |
| oxlint | skip, oxlint chưa cấu hình (repo không có `.oxlintrc`) |
| aislop | skip, không có trong allowlist verify |
| ocr | skip, ocr chưa cài |
| AI-friendly web gate | N/A (màn admin nội bộ, `robots: noindex`) |

Các lệnh xanh không phải bằng chứng đúng. Xem F1: test chính của trang chi tiết mock một hành vi API không tồn tại.

## Cross-boundary check (đối chiếu API/DB thật)
| Lời gọi từ UI | API/DB thật | Khớp? |
|---|---|---|
| `GET /cinemas/:id/showtimes?from&to&roomId` | `showtimes.controller.ts:43-52`, `listShowtimesQuerySchema` (ISO có offset; **không có filter id**) | OK |
| `GET /cinemas/:id/rooms` | `seat-layout.service.ts:142-147` → `toRoomDto` (camelCase `supportedFormats`, `status`) | OK, khớp `RoomOption` |
| `POST /cinemas/:id/showtimes` `{roomId,movieId,startsAt,format,languageMode}` | `createShowtimeSchema` (`cinema-ops.ts:107-113`) | OK |
| `POST /showtimes/bulk` `{movieId,format,languageMode,dates,times,targets:[{cinemaId,roomIds}],skipConflicts}` | `bulkCreateShowtimesSchema` (`cinema-ops.ts:134-150`), response `{created, skipped}` (`showtimes.service.ts:165`) | OK. Ngày/giờ gửi dạng chuỗi giờ VN, server tự đổi bằng `vnLocalToUtc`. Không lệch theo múi giờ trình duyệt |
| 409 `details.reason=SHOWTIME_OVERLAP`, `details.conflicts[]` | `conflictException` (`showtimes.service.ts:517-522`), `ApiError.details` có giữ lại (`client.ts:41-45`) | OK |
| `PATCH /cinemas/:id/showtimes/:sid` `{roomId,startsAt}` | `updateShowtimeSchema`. Server chặn bằng `assertNoSales`, trả 409 `SHOWTIME_HAS_SALES` | OK |
| `DELETE /cinemas/:id/showtimes/:sid` (204) | `showtimes.controller.ts:77-87` | Path đúng, nhưng xử lý kết quả ở UI sai (F2) |
| `POST .../close`, `.../reopen` | `showtimes.controller.ts:89-111` | OK |
| `POST .../locks` `{seatIds, reason: GUEST\|BROKEN_EQUIPMENT\|OTHER}`; `DELETE .../locks/:seatId` | `lockSeatsSchema` (`cinema-ops.ts:162-165`) | OK |
| Seat type | Enum DB `seat_type` là `NORMAL/VIP/SWEETBOX/AISLE/BROKEN` (`20261111020000_catalog.sql:26`). Khớp với `isBookableType` và cách đếm capacity | OK |
| Bấm ghế LOCKED để mở khoá | `SeatMap` luôn gọi `onSeatActivate` (`seat-map.tsx:130`), chỉ đặt `aria-disabled` | OK, mở khoá được |
| `POST /cinemas/:id/showtimes/cancel/preview` `{showtimeIds}\|{allFuture:true}` | `cancellation.controller.ts:89-104`, `previewCancelShowtimesSchema` | OK |
| `POST /cinemas/:id/showtimes/cancel` `{...target, reason}` | `cancelShowtimesSchema` (lý do trim, 1–500 ký tự). RPC `cancel_showtimes` (`20261112150000_cancel_showtimes_hardening.sql:147-363`) | OK |
| `GET /showtimes/:id/seatmap` (public, nguồn dữ liệu của trang chi tiết) | `seatmap.service.ts:71-73` ném `SHOWTIME_CANCELLED` khi suất đã huỷ; `:92-94` ném `NOT_FOUND` khi rạp không `OPEN` hoặc phim không `PUBLISHED` | **KHÔNG KHỚP**: UI giả định endpoint này trả cả suất đã huỷ (F1) |

Giờ Asia/Ho_Chi_Minh: list (`page.tsx:52-53`), form sửa (`[id]/page.tsx:83-88,115`) và form tạo (`showtime-bulk-form.tsx:66,137`) đều dùng `vnLocalToUtc`/`toVnParts`, không phụ thuộc múi giờ máy. OK.

Quyền: nav chỉ hiện cho ADMIN/MANAGER (`nav-config.ts:26`). Mọi lệnh ghi đều có `@Roles("MANAGER") + @CinemaScope()` ở API. UI không ẩn nút ghi với người chỉ có vai trò STAFF nhưng gõ thẳng URL; API vẫn trả 403. Ghi chú, không chặn.

Chống gửi 2 lần ở dialog huỷ: `busy` disable nút xác nhận, `handleOpenChange` bỏ qua khi đang busy (`cancel-showtimes-dialog.tsx:58-59,174`). OK trong phạm vi dialog. Ở trang chi tiết thì vẫn huỷ lại được một suất đã huỷ, xem F1.

## Findings

### F1 — MAJOR (FAIL): trang chi tiết hỏng với suất đã huỷ, rạp không OPEN, phim không PUBLISHED; sau khi huỷ không hiện "Đã huỷ"; test mock sai (false-confidence)
- `apps/web/src/app/admin/lich-chieu/[id]/page.tsx:59-60` lấy toàn bộ dữ liệu chi tiết từ `GET /showtimes/:id/seatmap`. Đây là endpoint public của khách, ở `apps/api/src/modules/booking/seatmap.service.ts:71-73` nó **ném `SHOWTIME_CANCELLED`** với suất `CANCELLED`, và ở `:92-94` ném `NOT_FOUND` khi `cinemas.status !== 'OPEN'` hoặc `movies.status !== 'PUBLISHED'`.
- Hệ quả trên app thật:
  1. Bấm một suất có badge "Đã huỷ" ở danh sách (`page.tsx:161`) thì trang chi tiết chỉ hiện `ErrorState`, bấm "Thử lại" cũng lỗi mãi. Các nhánh `cancelled`/`lockReason` ở `[id]/page.tsx:76,142-143,211,223` là code chết.
  2. AC-24 ("xác nhận → suất hiển thị Đã huỷ") không đạt ở trang chi tiết. Sau khi huỷ, `onCancelled → reload()` (`[id]/page.tsx:248-253`) làm `loadAll` reject và parent đặt `failed=true`. Nhưng `data` cũ vẫn còn, nên trang render **cả** `ErrorState` **lẫn** `ShowtimeDetail` cũ (`[id]/page.tsx:288-290`): badge vẫn là "Đang bán" và nút "Huỷ suất" vẫn bật. Người dùng có thể huỷ lại. RPC `cancel_showtimes` không chặn suất đã `CANCELLED`, nên sẽ ghi đè `cancel_reason`, `cancelled_by` của suất (`..._cancel_showtimes_hardening.sql:206-212`) và `affected_order_cases.reason` (`:283-285`).
  3. Suất của rạp `TEMP_CLOSED`/`INACTIVE` (đây đúng là ngữ cảnh R-33/AC-26) hoặc của phim đã `ARCHIVED` thì không mở được trang chi tiết để đóng bán, khoá ghế hay huỷ từng suất.
- **False-confidence test:** `apps/web/src/components/admin/__tests__/showtime-detail.test.tsx:57-61` mock seatmap trả `showtime.status = "CANCELLED"` rồi assert badge "Đã huỷ". API thật không bao giờ trả như vậy.
- Hướng sửa (Builder tự chọn cơ chế): thông tin suất phải lấy từ nguồn admin không lọc trạng thái, chỉ gọi seatmap khi suất chưa huỷ. Ví dụ: `GET /cinemas/:cinemaId/showtimes` (đã có, Roles STAFF+, RLS theo rạp; URL đã có `?cinema=`). Endpoint này **không có filter id**, nên phải lấy theo cửa sổ `from/to` rồi lọc id ở client, cộng `GET .../locks`. Nếu cần endpoint admin `GET /cinemas/:cid/showtimes/:sid` thì ghi Blocked hoặc gap, báo dispatcher. Đồng thời sau khi huỷ không được render dữ liệu cũ kèm nút "Huỷ suất" còn bật. Sửa test để mock đúng lỗi 4xx `SHOWTIME_CANCELLED` của seatmap.

### F2 — MAJOR (FAIL): xoá suất báo "Đã xoá" cả khi API lỗi
- `apps/web/src/app/admin/lich-chieu/[id]/page.tsx:125-128`:
  ```ts
  if (action === "delete") {
    await run(() => apiFetch(base, { method: "DELETE" }));
    setDeleted(true);
  }
  ```
  `run` (`:96-108`) nuốt mọi lỗi và không rethrow hay trả cờ, nên `setDeleted(true)` **luôn** chạy. Nếu DELETE trả 409 `SHOWTIME_HAS_SALES` (vé vừa bán sau lúc tải trang; UI chỉ kiểm SOLD lúc load) hoặc lỗi mạng/403, màn vẫn hiện "Đã xoá suất." (`:131-140`) và thông báo lỗi bị ẩn. Người dùng tin suất đã bị xoá trong khi suất vẫn đang bán. Ngoài ra, khi xoá thành công, `reload()` trong `run` gọi seatmap của suất đã mất, nên parent hiện thêm `ErrorState`.
- Hướng sửa: chỉ `setDeleted(true)` khi DELETE thành công (để `run` trả boolean), không `reload()` sau khi xoá. Thêm test cho nhánh xoá lỗi 409.

### F3 — MINOR: huỷ suất đã qua giờ chiếu ở trang chi tiết
`[id]/page.tsx:211` chỉ disable nút "Huỷ suất" khi suất đã huỷ. Danh sách thì chỉ cho chọn suất tương lai (`page.tsx:80`). API và RPC không chặn suất đã chiếu, nên huỷ một suất đã qua giờ sẽ chuyển đơn `checked_in` sang `affected` và gửi email. Nên disable nút theo cùng điều kiện với danh sách.

### F4 — MINOR: lệch design-spec B20
- Bước 1 chỉ hiện nhãn đếm (`scopeLabel`), không liệt kê suất (phim, phòng, giờ) như B20 yêu cầu. Bước 2 thiếu mẫu email.
- Sau khi huỷ ở danh sách, UI hiện banner kèm link `/admin/don-bi-anh-huong?cinema=` (`page.tsx:135`). B20 yêu cầu toast và điều hướng tới `?showtime=…`.
- Số email ở preview lấy bằng `paidOrdersCount` (`cancel-showtimes-dialog.tsx:133-134`), trong khi RPC chỉ enqueue email cho đơn có `contact_email` (`..._hardening.sql:328-329`). Đây chỉ là xấp xỉ, chấp nhận được vì POS đã bỏ.

### F5 — MINOR: bulk với `skipConflicts=true` bỏ qua suất trùng mà không báo
`showtime-bulk-form.tsx:123-135` chỉ đọc `created.length` rồi điều hướng đi; field `skipped` (`showtimes.service.ts:165`) bị bỏ qua, người dùng không biết suất nào không được tạo. `dateRange` cũng cắt im lặng ở 62 ngày (`showtime-utils.ts:71`).

### F6 — MINOR: khoá/mở khoá ghế, form sửa
- Mở khoá gọi DELETE tuần tự (`seat-lock-panel.tsx:69-72`). Nếu lỗi giữa chừng thì một phần ghế đã mở khoá nhưng `onChanged` không được gọi, nên sơ đồ hiện dữ liệu cũ.
- B19 yêu cầu `SeatMap` thời gian thực; hiện chỉ có snapshot.
- Dropdown phòng ở form sửa liệt kê cả phòng `MAINTENANCE` và phòng không hỗ trợ định dạng (`[id]/page.tsx:173-177`). Server sẽ từ chối, UX kém.

### F7 — MINOR (process / AI-readable)
- 3 helper (`showtime-utils.ts`, `use-showtime-cinema.ts`, `showtime-page-gate.tsx`) và 2 test nằm ngoài "Files to Create/Modify". Task Notes yêu cầu báo dispatcher. Đều là file mới, tên riêng, rủi ro conflict thấp. Dispatcher cần ghi nhận.
- Component dài: `ShowtimeDetail` ~185 dòng, `ShowtimeBulkForm` ~210 dòng (vượt mốc hàm ≤50 dòng). File vẫn ≤300 dòng. Tên rõ, comment nói lý do. Tính 1 indicator, dưới ngưỡng 3.
- Rạp không có trong `/cinemas` public thì mã xác nhận rơi về 8 ký tự đầu của UUID (`use-showtime-cinema.ts:47-52`, `[id]/page.tsx:68-69`). Vẫn chạy được, nhưng người dùng phải gõ một chuỗi khó hiểu. Đã nằm trong gap Builder tự nêu.

## Những điểm đã kiểm và đạt
- Dialog huỷ: bắt buộc lý do (trim) trước khi xem trước; preview dùng đúng body target; xác nhận yêu cầu gõ mã rạp (không phân biệt hoa thường); body huỷ là `{...target, reason}` đúng schema; chặn bấm 2 lần trong dialog.
- `?cancelAll=1` mở sẵn dialog với `{allFuture:true}`; gate tải xong mới mount nên state khởi tạo đúng.
- R-54 (đã bán thì khoá sửa giờ/phòng và xoá, kèm lý do): khớp với `hasSales` của server ở phần SOLD. HELD không tính là đã bán, server cũng vậy.
- AC-14: hiển thị đúng danh sách xung đột từ `details.conflicts`; test bulk dùng đúng shape lỗi thật.
- Rooms DTO camelCase, seat type uppercase, ghế LOCKED bấm được để mở khoá: đều khớp code/DB thật.

## Verdict
**FAIL**. Có 2 MAJOR (F1, F2); F1 kèm một false-confidence test.

Việc cần làm cho round 2: sửa F1 (nguồn dữ liệu trang chi tiết với suất huỷ/rạp đóng/phim archived, trạng thái sau khi huỷ, test mock đúng lỗi seatmap) và F2 (xoá chỉ thành công khi API thành công, kèm test). Nên xử lý luôn F3.
