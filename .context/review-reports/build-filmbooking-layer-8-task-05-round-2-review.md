# Review — build-filmbooking layer-8 task-05 (round 2)

Agent: reviewer
Ngày: 2026-11-16
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-05` (chưa commit). Round trước: `build-filmbooking-layer-8-task-05-round-1-review.md` (FAIL, 2 MAJOR).

## Review level
NORMAL. Giữ nguyên mức của round 1: chỉ có file test/CI, nhưng test chạm luồng thanh toán và auth.

## Reason
Round này kiểm việc đóng 2 MAJOR, độ đúng của phép đo realtime sau khi builder sửa, và soát regress.

## Blast radius
Chỉ ảnh hưởng `pnpm e2e` và job CI tuỳ chọn. Không có source app nào bị đổi.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm exec eslint e2e playwright.config.ts` | PASS (không có output). |
| Grep `fixme\|skip\|waitForTimeout\|isMoviesEndpointBroken\|MOVIES_BUG` trong `e2e/**` và `playwright.config.ts` | Không còn match nào. |
| `pnpm e2e` | Tôi không chạy vì lệnh không có trong allowlist. Builder báo 10 passed / 0 skipped. Dispatcher cần chạy lại ở bước verify tổng. |

## Kiểm từng điểm

### MAJOR-1 (guard fixme): ĐÃ ĐÓNG
- `e2e/booking.spec.ts:11-17` không còn guard, test chạy vô điều kiện.
- `e2e/admin-new-cinema.spec.ts` không còn `isMoviesEndpointBroken`.
- `e2e/support/data.ts` đã xoá helper và `MOVIES_BUG_REASON`.
- Nếu `/movies` hồi quy, test sẽ FAIL chứ không còn bị skip.

### MAJOR-2 (mốc đo realtime): ĐÃ ĐÓNG
- `e2e/seat-realtime.spec.ts:58-64`: A chọn ghế A1 qua UI, chờ nút "Tiếp tục" enabled, đặt `startedAt` ngay trước `click()`, dừng khi ghế trên B có `data-state="held"`. Khoảng đo nay gồm cả round-trip POST giữ ghế, DB commit, Realtime và render của B. Đây đúng là khoảng "A giữ → B thấy". Nếu có lệch thì lệch về phía bất lợi cho test (đo dư), nên không thể ra xanh giả.
- Đã xác nhận nút "Tiếp tục" thật sự gọi giữ ghế: `apps/web/src/components/booking/seat-picker.tsx:137-149`, `handleContinue` gọi `POST /bookings/holds` rồi `router.push(.../xac-nhan)`.
- Đã xác nhận B đổi trạng thái nhờ sự kiện realtime, không phải do reload hay poll:
  - `use-showtime-seats.ts:84-100` cập nhật override từ `postgres_changes` trên `seat_status_public`.
  - Refetch (`refetchSeatMap`) chỉ chạy qua `onResync` khi kênh subscribe lại (`:104`) hoặc khi lỗi SEAT_TAKEN của chính phiên đó.
  - Ngoài ra không có `setInterval`, poll hay `router.refresh` nào trong seat-picker.
  - Test không reload `pageB`.
- Cơ chế chờ `phx_reply` (`seat-realtime.spec.ts:40-48`):
  - Listener được gắn vào `pageB` trước khi đăng nhập, nên không bỏ lỡ frame nào.
  - Điều kiện lọc là `phx_reply` + `"status":"ok"` + `realtime:`. Heartbeat dùng topic `phoenix` nên không khớp.
  - Trong web, kênh realtime duy nhất là `seats:${showtimeId}` (grep `.channel(` chỉ ra `use-showtime-seats.ts:85`). Trang `/dang-nhap` không mở kênh nào, nên không thể nhận nhầm kênh hay resolve sớm từ trang khác.
  - Nếu không bao giờ join được, test treo tới timeout 90s rồi FAIL rõ ràng, không xanh giả.

### Task file (Gap / AC-19): ĐỦ
`tasks/build-filmbooking/layer-8-task-05.md:47-51` ghi trung thực bốn điểm:
- Gap "đăng ký → Inbucket": nêu lý do (Turnstile R-07), cách thay thế (GoTrue admin `email_confirm`) và hướng gỡ.
- Giới hạn của AC-19: sơ đồ, suất, giá dựng qua API; dừng ở bước giữ ghế / màn xác nhận.
- Việc giãn nhịp login.
- Hai nợ: e2e chưa được typecheck, và import qua `apps/api/node_modules`.

### Regress
- Key PayOS giả nay khai ở một nơi: `playwright.config.ts:45-46` export qua env `E2E_PAYOS_CHECKSUM_KEY`, `data.ts:239` đọc bằng `required(...)`. Nếu thiếu env thì throw.
- `newContext` đã mang theo `isMobile`, `locale`, `timezoneId` (`seat-realtime.spec.ts:24-31`, `admin-new-cinema.spec.ts:101-108`).
- Import đã gọn (`seat-realtime.spec.ts:2` không còn `apiAs`); eslint sạch.

## Findings

MAJOR: không có.

MINOR (không chặn):
1. `seat-realtime.spec.ts:44`: `phx_reply ok` của Realtime đến **trước** message `system` "Subscribed to PostgreSQL" (extension `postgres_changes`). Về lý thuyết, nếu A giữ ghế quá nhanh trong khe hở đó thì B có thể lỡ sự kiện, và test sẽ FAIL theo kiểu flake. Đây không phải xanh giả. Thực tế A còn phải click chọn ghế rồi chờ nút enabled, nên khe hở rất nhỏ. Nếu muốn chắc hơn: chờ frame `"extension":"postgres_changes"` + `"status":"ok"`.
2. Các MINOR còn lại của round 1 đã được ghi thành residual trong task file: `reuseExistingServer` khi chạy local, `listUsers` chỉ đọc 1 trang, `like('E2E_%')`, CI workflow chưa chạy thật.

## Residual risk
- Dispatcher phải chạy `pnpm e2e` và xác nhận 10 passed / 0 skipped. Reviewer bị allowlist chặn nên không chạy được.
- e2e chưa nằm trong lệnh typecheck nào.
- `.github/workflows/e2e.yml` chưa chạy thật.

## Verdict
**NORMAL PASS.** Cả 2 MAJOR của round 1 đã đóng, có kiểm chứng trong code. Không có regress. Điều kiện: `pnpm e2e` ở bước verify tổng phải ra 0 skipped.
