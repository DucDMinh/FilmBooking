# Review — build-filmbooking layer-6 task-06 (round 2)

Agent: reviewer
Worktree: E:/FilmBooking/.worktrees/layer-6__task-06 (chưa commit, 9 file untracked dưới `apps/web/src/{app,components}/staff/`)
Report round 1: `E:/FilmBooking/.context/review-reports/build-filmbooking-layer-6-task-06-round-1-review.md`

## Review level
**STRICT**: lý do giữ nguyên như round 1 (guard theo rạp, PII AC-13, có throttler ở API).

## Blast radius
Không đổi so với round 1. Chỉ có route `/staff/*` và `components/staff/*`. Không đụng API, schema hay shared.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 15 file, 209/209 test |
| `cd apps/web && pnpm build` | PASS (có `/staff/chon-rap`, `/staff/soat-ve`) |
| oxlint / aislop / ocr | skip (chưa cấu hình / không có trong allowlist) |

## Đóng finding round 1

**M1 (scanner spam request khi lỗi): ĐÃ ĐÓNG.**
- `soat-ve/page.tsx:56-58`: `lockedRef` được bật đồng bộ trước `await`, nên chặn được nhiều lần decode liên tiếp. State `locked` truyền xuống `QrScanner paused` (`:116`).
- Nhánh `catch` (`:70-72`) không còn mở khoá. Chỉ mở khoá khi bấm "Quét vé khác" / "Nhập lại mã" (`closeResult`) hoặc "Thử lại" (`retryAfterError`).
- Test `staff-pages.test.tsx:140-156` chứng minh: sau lỗi, scanner ở trạng thái paused; decode thêm 2 lần vẫn chỉ có 1 request; bấm "Thử lại" thì mở khoá.

**M2 (thiếu test logic quan trọng): ĐÃ ĐÓNG.**
- `staff-cinema.test.ts`: 3 case (Admin thấy mọi rạp có id, Staff chỉ thấy rạp được gán, chưa gán rạp thì danh sách rỗng).
- `staff-pages.test.tsx`: 7 case. Gồm chỉ có 1 rạp thì tự chuyển; nhiều rạp thì chọn và lưu sessionStorage; chưa chọn rạp thì redirect; body nhập tay được trim và đúng `{cinemaId, bookingCode}`; quét QR gửi `token` 1 lần; nhánh lỗi; lịch sử giữ 5 mục.
- Test render `TOO_EARLY` / `NOT_PAID` / `NOT_FOUND` có trong `checkin-result.test.tsx:90-110`.
- Mock `apiFetch` trả đúng shape `MeResponse` / `CinemaDto` / `ScanTicketResponse`.

**M3 (test AC-13 false-confidence): ĐÃ ĐÓNG.**
- `checkin-result.test.tsx:63-88`: fixture WRONG_CINEMA giờ có `ticket` (ghế C7, phim, phòng, booking code) và `customerName` bị rò, rồi assert không render các giá trị đó.
- Component chỉ render `ticket` trong nhánh `result === "OK"` (`checkin-result.tsx:57`), nên test giờ thật sự chứng minh được việc chặn PII.

**MINOR round 1:**
- Lịch sử không còn lộ token: dùng `bookingCode` hoặc chuỗi "Mã QR" (`page.tsx:24-27`).
- Có nhãn tiếng Việt cho đủ 8 kết quả (`checkin-result.tsx:21-30`).
- Đã thêm hint "Vé không bị đánh dấu check-in" / hướng dẫn CSKH, nút "Nhập lại mã" kèm mã.
- Ẩn khung camera khi bị từ chối quyền (`qr-scanner.tsx:62`).
- Focus vào nút khi overlay mở (`checkin-result.tsx:110-113`). Đã đóng.

## Kiểm ngưỡng "Mở check-in từ" so với RPC thật
- RPC báo TOO_EARLY khi `v_now < starts_at - interval '30 minutes'` (`supabase/migrations/20261111040400_rpc_checkin_reports.sql:228`), tức check-in mở từ đúng `starts_at − 30'`.
- UI tính `startsAt − 30 × 60_000` ms (`checkin-result.tsx:32,86`). **Khớp.**
- Test: suất 12:30Z (19:30 giờ VN) hiển thị 19:00 (`checkin-result.test.tsx:90-100`).
- Còn một điểm: hằng số 30 phút đang bị lặp lại giữa client và DB (xem MINOR 3).

## Findings

### CRITICAL
Không có.

### MAJOR
Không có.

### MINOR (không chặn PASS)
1. **Overlay NOT_FOUND / NOT_PAID hiện nguyên token khi quét QR.**
   - Vị trí: `soat-ve/page.tsx:59` (`setLastCode(trimmed)` không phân biệt `kind`) dẫn tới `checkin-result.tsx:132` ("Mã: {scannedCode}").
   - Với NOT_PAID, token khớp một vé thật của đơn chưa thanh toán. Nếu sau đó đơn được thanh toán thì token này trở thành credential hợp lệ, mà nó vừa hiện trên màn quầy.
   - Phần lịch sử đã che token, nhưng overlay thì chưa. Đề xuất chỉ truyền `scannedCode` khi `kind === "bookingCode"`, hoặc hiện "Mã QR".
2. **Race khi nhập tay trong lúc request quét QR đang chạy.**
   - `onManualSubmit` (`page.tsx:94-99`) gọi `unlock()` khi `!result`, kể cả lúc request trước chưa trả về. Kết quả là có 2 request đồng thời, overlay của request nào về sau sẽ ghi đè.
   - Tác động thấp: cần thao tác tay, không gây vòng lặp. Có thể sửa bằng cách chỉ unlock khi đang có `error`.
3. **Hằng `CHECKIN_OPEN_MINUTES_BEFORE = 30` bị lặp giữa client (`checkin-result.tsx:32`) và RPC.** Hiện giá trị khớp, nhưng nếu DB đổi ngưỡng thì UI sẽ hiện sai giờ mà không ai biết. Tốt hơn là API trả luôn `opensAt`. Đây là gap API, không chặn task này.
4. **Hint CANCELLED luôn ghi "liên hệ CSKH để được hỗ trợ hoàn tiền"** (`checkin-result.tsx:99`). RPC gộp chung vào CANCELLED cả các trạng thái `refunded_manual` / `exchanged` / đơn khách tự huỷ (`migration:167-181`). Với đơn đã hoàn tiền thì câu này dễ gây hiểu nhầm. Chấp nhận được với dự án demo.
5. `ScanTicketPage` khoảng 120 dòng, phần lớn là JSX, vượt khuyến nghị 50 dòng/hàm. Chỉ có 1 indicator nên không chạm ngưỡng FAIL của AI-readable gate (≥3).
6. `staff-cinema.ts` nằm ngoài danh sách file của task. Coordinator đã chấp nhận, dispatcher nên bổ sung file này vào task file khi close-out.
7. (Mang từ round 1) Gap giữa design và API cần đưa vào gap register: bước "Xác nhận check-in" (RPC check-in ngay khi quét) và nhãn tuổi (R-98).

## Regression
Không thấy regression. Toàn bộ 209 test web PASS. Typecheck, lint và build đều xanh. Không có file nào ngoài `staff/` bị đổi.

## Verdict
**STRICT PASS**: M1, M2, M3 đã đóng, có test chứng minh. Ngưỡng "Mở check-in từ" khớp RPC. Còn 7 MINOR, không chặn.
