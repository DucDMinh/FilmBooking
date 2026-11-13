# Review — build-filmbooking layer-6 task-03 — round 2

Agent: reviewer
Task: `tasks/build-filmbooking/layer-6-task-03.md` — Web chọn ghế `/dat-ve/[showtimeId]`
Worktree: `E:/FilmBooking/.worktrees/layer-6__task-03` (branch `wt/layer-6__task-03`, base `aff1df1`, toàn bộ file untracked, chưa commit)
Round 1: `.context/review-reports/build-filmbooking-layer-6-task-03-round-1-review.md` (FAIL, M-1..M-4)

## Review level
**STRICT**

## Reason
Task chạm realtime dùng chung, máy trạng thái giữ ghế (R-60..R-66, AC-06/07) và cổng xác nhận tuổi (R-68). Round 1 có 4 MAJOR.

## Blast radius
Giữ nguyên như round 1: chỉ các file mới của màn chọn ghế, hook realtime và test. Không đổi API, schema hay `packages/shared`. Round này không có file mới ngoài danh sách trên.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS — 13 file, **214 test** |
| `cd apps/web && pnpm build` | PASS — có route `ƒ /dat-ve/[showtimeId]` |

- oxlint: skip, chưa cấu hình. aislop / ocr: skip, không có trong allowlist / chưa cài. AI-friendly web: N/A (trang noindex).

## Xác minh từng MAJOR của round 1

**M-1 (R-59, dòng nhắc không huỷ/hoàn) — ĐÃ SỬA.**
- `seat-picker.tsx:250` render "Không hỗ trợ huỷ / hoàn vé" dưới CTA, cho mọi loại phim (không còn phụ thuộc khối tuổi T13+).
- Có test `seat-map.test.tsx:390-393`.

**M-2 (hold của chính mình bị báo "vừa có người chọn") — ĐÃ SỬA.**
- `seat-picker.tsx:88-97`: effect return sớm khi `holding || hold`; deps có `holding` và `hold`.
- Nhánh SEAT_TAKEN vẫn chạy đúng: lúc refetch, `holding` vẫn true nên effect bỏ qua. Sau `setHolding(false)` (`:153`), effect chạy lại → bỏ chọn + toast cho ghế bị người khác lấy. Test `:402` vẫn pass.
- Test mới `:355-372` phát INSERT HELD cho ghế của mình khi hold đang pending, rồi resolve hold → không toast, không bỏ chọn, vẫn chuyển trang. Test này kiểm đúng kịch bản của round 1.

**M-3 (ghế lẻ client chặt hơn server) — ĐÃ SỬA, đã đối chiếu lại SQL.**
So `seat-rules.ts:70-115` với `supabase/migrations/20261112140000_hold_seats_hardening.sql:325-416`:

| Điểm | SQL | Client | Khớp |
|---|---|---|---|
| Chỉ xét hàng có ghế được chọn | `:328-334` | `:75` | Có |
| Barrier | AISLE, BROKEN, ghế bị khoá (`:344-350`) | `isBarrier` `:92-95`; BROKEN có `state: LOCKED` từ seatmap | Có |
| Tách đoạn | Barrier, ghế ngay sau barrier, hoặc hở cột `prev_col_end <> col_number` (`:383-390`) | `splitSegments` `:101-115` | Có |
| Ghế barrier không thuộc đoạn | `:401` | `:110` | Có |
| Điều kiện kiểm tra | `seg_available_before > 2`, đếm theo `col_span` (`:396, :405`) | `:78-79` | Có |
| Ứng viên ghế lẻ | NORMAL/VIP, còn trống sau khi chọn | `:81-82` | Có |
| Hai bên | `prev`/`next` trong đoạn, null hoặc bị chiếm (`:398-409`) | `:83-85` | Có |
| Thế nào là "bị chiếm" | SOLD, HELD còn hạn, hoặc được chọn | `isOccupied` `:97-99`; hook đã đổi HELD hết hạn thành FREE | Có |
| Sweetbox | Không phải barrier | Không phải barrier | Có |

- Ca round 1 (đoạn 2 ghế giữa barrier, chọn 1 ghế) giờ cho qua: test `:165-167`.
- Các ca đoạn 3 ghế, hở cột, sweetbox đều có test (`:168-179`), và tôi tự trace từng ca theo SQL ra cùng kết quả.

**M-4 (realtime không lọc `showtime_id`) — ĐÃ SỬA.**
- `use-showtime-seats.ts:92` bỏ qua payload khi `row.showtime_id !== showtimeId`. Điều kiện áp cho cả new (INSERT/UPDATE) và old (DELETE).
- PK `(showtime_id, seat_id)` nên `showtime_id` luôn có trong `old`, kể cả khi bật RLS.
- Mock đã phát đúng `showtime_id`. Test `:319-323`: DELETE từ suất khác → ghế SOLD giữ nguyên.
- Thêm: callback được giữ qua ref (`:62-68`), effect kênh chỉ phụ thuộc `[showtimeId]` (`:113`), nên lambda inline không làm kênh subscribe lại. Test `:325-329` xác nhận `removeChannel` được gọi khi unmount.

## Các MINOR đã sửa
- **m-1:** `page.tsx:82` truyền `ageUnknown={movie === null}`. `seat-picker.tsx:167, 215-219` chặn "Tiếp tục" và hiện thông báo, không còn bỏ qua R-68 khi tải phim lỗi. Có test `:395`.
- **m-3:** `page.tsx:51-63`: `SHOWTIME_CANCELLED` có HTTP 409 (`packages/shared/src/errors.ts:76`), nên không bị nhánh 404/400 chặn trước; hiện EmptyState "Suất chiếu không còn mở bán" + link "Chọn suất khác".
- **m-6:** `seat-legend.tsx:13` đã có mục "Hỏng".
- **m-8:** đã có test age-confirm lỗi → `DELETE /bookings/:id/hold` (`:374-388`) và test unmount gỡ kênh.

## Findings round 2

### CRITICAL
Không có.

### MAJOR
Không có.

### MINOR
- **n-1** Khi age-confirm lỗi: hold đã commit, nên realtime có thể đã đánh dấu ghế của mình là HELD. Sau đó `setHolding(false)` (`seat-picker.tsx:153`) có thể chạy trước khi sự kiện DELETE (từ lệnh nhả ghế) tới. Hệ quả: effect M-2 có thể báo nhầm "vừa có người chọn" và bỏ chọn ghế của chính mình. Nhánh này hiếm, không làm sai dữ liệu, chỉ khiến khách phải chọn lại. Gợi ý: refetch seatmap sau khi nhả ghế, trước khi `setHolding(false)`.
- **n-2** `loadMovie` vẫn tải cả danh sách phim đang chiếu chỉ để tìm 1 phim (`page.tsx:34-41`). Chấp nhận được với quy mô demo.
- **Residual còn để ngỏ** (Builder đã ghi gap; tôi đồng ý không tính FAIL):
  - m-2: hardcode đóng bán trước 15 phút, trong khi R-67 cho cấu hình theo rạp; server vẫn chặn `SALES_CLOSED`.
  - m-4: chưa có ConfirmDialog cho R-64 vì API không có endpoint trả về đơn đang giữ.
  - m-5: khi quay lại từ màn 08, ghế của mình chưa hiện "Đang chọn" + đồng hồ.
  - m-7: dialog hết giờ chưa liệt kê các ghế đã bị nhả.
  - m-9: cửa sổ nhỏ có thể nuốt sự kiện trong lúc refetch.

### AI-readable gate
- 2 indicator, dưới ngưỡng 3:
  - `SeatPicker` khoảng 205 dòng.
  - Magic number ở countdown.
- `seat-picker.tsx` dài 257 dòng, dưới giới hạn 300 của file.

### Surgical diff
OK: mọi thay đổi round 2 đều trace về finding của round 1.

## Verdict
**STRICT PASS** — M-1..M-4 đều đã sửa và có test kiểm đúng kịch bản. Thuật toán ghế lẻ khớp từng điều kiện với SQL `20261112140000`. Verify xanh. Không còn MAJOR. n-1 và các residual còn lại để handoff hoặc ghi vào gap register.
