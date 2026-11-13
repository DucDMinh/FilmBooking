# Review — build-filmbooking layer-6 task-06 (round 1)

Agent: reviewer
Task: Web Staff: chọn rạp làm việc + soát vé QR/nhập mã + kết quả màu
Worktree: E:/FilmBooking/.worktrees/layer-6__task-06 (branch wt/layer-6__task-06, base aff1df1, thay đổi chưa commit)
Ghi chú: agent-guard chặn ghi report vào `<worktree>/.context/review-reports/`, nên report được ghi ở `E:/FilmBooking/.context/review-reports/`.

## Review level
**STRICT**

## Reason
Task chạm guard quyền theo rạp (Staff/Manager chỉ rạp được gán, Customer bị chặn), có ràng buộc PII (AC-13 / R-102), gọi API có throttler toàn cục, và có logic quan trọng (lọc rạp, vòng đời quét) mà chưa có test.

## Blast radius
- Route mới `/staff/chon-rap` và `/staff/soat-ve`, cùng layout `/staff` (guard phía server).
- Component mới `components/staff/*`: `qr-scanner.tsx`, `checkin-result.tsx`, `staff-cinema.ts` (file này nằm ngoài scope).
- Tiêu thụ `POST /checkin/scan`, `GET /me`, `GET /cinemas`. Không đổi API, schema hay shared package.
- Throttler API là 100 req/phút **theo IP**, và mọi máy ở cùng quầy/rạp thường dùng chung IP NAT. Vì vậy lỗi vòng lặp request bên dưới ảnh hưởng cả rạp, không chỉ một máy.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` (lần 1) | **FAIL**: web có 2 file / 3 test fail. Một file là `src/components/account/__tests__/linked-accounts.test.tsx` (AddPasswordForm, timeout khoảng 5s). File thứ hai bị cắt khỏi output nên **không xác định được**, chưa loại trừ khả năng đó là test `QrScanner` mới. |
| `pnpm test` (lần 2) | PASS: shared 14/14, api 414/414, web 195/195, scripts 16/16 |
| `pnpm build` | PASS (có route `/staff/chon-rap`, `/staff/soat-ve`) |
| `pnpm --filter @filmbooking/web test` | Bị agent-guard chặn (không nằm trong allowlist). Thay bằng `pnpm test` |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, không có trong allowlist verify / ocr not installed |

## Cross-boundary check (API/DB thật)
- RPC `checkin_ticket` (`supabase/migrations/20261111040400_rpc_checkin_reports.sql:35-291`) được map qua `checkin.service.ts:19-80` thành `ScanTicketResponse` (`packages/shared/src/schemas/checkin.ts:44-62`). UI đọc đúng các trường `ticket`, `used.{checkedInAt,staffName}`, `correctCinema.{name,address}` và `startsAt`. Cả 8 giá trị `ScanResult` đều có headline (`checkin-result.tsx:7-16`, kiểu `Record<ScanResult,…>`).
- AC-13: RPC chỉ trả `correct_cinema_*` cùng message cố định. Service dựng response theo whitelist và UI chỉ render tên + địa chỉ (`checkin-result.tsx:61-67`). **OK.**
- AC-12: RPC trả `staff_name` và `checked_in_at`. UI render cả hai trên nền danger-banner. **OK.**
- QR mã hoá nguyên `qr_token` (`mail/templates.ts:114`), khớp với `token` gửi lên API. **OK.**
- Guard: `proxy.ts:7` bảo vệ `/staff`. `staff/layout.tsx:26-29` chặn Customer bằng `resolveAdminRole` và redirect `/khong-co-quyen` (trang có tồn tại). Lớp thật là `CinemaScopeGuard` (API) + `has_cinema_scope` (RPC). Nếu sessionStorage bị sửa tay thì giá trị đó cũng bị lọc lại theo danh sách (`soat-ve/page.tsx:38`). **OK.**
- Cleanup camera: khi unmount, `cancelled=true` và gọi `stop()`. Nếu unmount xảy ra lúc `start()` còn treo thì scanner vẫn được stop sau khi start resolve (`qr-scanner.tsx:40-55`). **OK.**
- Fallback camera: `start()` reject thì status chuyển `unavailable` kèm hướng dẫn nhập mã. **OK.**

## Findings

### CRITICAL
Không có.

### MAJOR

**M1. Scanner gửi request liên tục, không giới hạn, khi API lỗi. Hệ quả là cả rạp bị throttle 429.**
`apps/web/src/app/staff/soat-ve/page.tsx:60-63` cùng `:95` và `apps/web/src/components/staff/qr-scanner.tsx:35-37`.
- Nhánh `catch` đặt `busy.current = false` nhưng không set `result`, nên `paused` vẫn là `false`.
- html5-qrcode decode khoảng 10 lần/giây và gọi `onScan` mỗi lần decode được. Chừng nào mã QR còn trong khung hình, mỗi khi request trước trả lỗi thì request mới được gửi ngay.
- Các trường hợp kích hoạt thực tế:
  - QR không phải vé, dài hơn 200 ký tự (`checkin.ts:7,13`) → 400.
  - Lỗi mạng hoặc 5xx.
  - 429.
  - 403 (vẫn spam request).
- Request 400 đi qua ThrottlerGuard, vì pipe validation chạy sau guard (`app.module.ts:22,43`). Với giới hạn 100 req/phút/IP (`auth.module.ts:15`), quota cạn trong vài giây. Sau đó mọi máy soát vé dùng chung IP bị 429, và lỗi 429 lại tiếp tục nuôi vòng lặp.
- Thông báo lỗi nhấp nháy liên tục, trái với design-spec §17 States.
- Hướng sửa: khi lỗi thì tạm dừng scanner (trạng thái lỗi riêng, hoặc cooldown / bỏ qua cùng `text` vừa lỗi), chỉ cho quét lại khi người dùng bấm "Thử lại" hoặc khi mã đổi. Cần có test cho hành vi này.

**M2. Logic quan trọng chưa có test (dưới chuẩn STRICT).**
- `apps/web/src/components/staff/staff-cinema.ts:15-26` (`loadStaffCinemas`, lọc rạp theo `me.cinemas` / `isAdmin`) chưa có test nào.
- `apps/web/src/app/staff/soat-ve/page.tsx` chưa có test cho: gửi đúng body `{cinemaId, token|bookingCode}`, khoá `busy`, nhánh lỗi (gồm M1), lịch sử giữ tối đa 5 mục, redirect khi chưa chọn rạp.
- `apps/web/src/app/staff/chon-rap/page.tsx` chưa có test cho trường hợp chỉ có 1 rạp thì tự lưu và chuyển thẳng sang màn soát vé.
- Ba kết quả `TOO_EARLY`, `NOT_PAID`, `NOT_FOUND` chưa có test render.

**M3. Test AC-13 tạo cảm giác an toàn giả (false-confidence).**
`apps/web/src/components/staff/__tests__/checkin-result.test.tsx:63-77`.
- Fixture WRONG_CINEMA không chứa dữ liệu vé nào, nên `not.toHaveTextContent(/Ghế|Phim|Khách/)` luôn pass, bất kể component viết ra sao.
- Fixture cần mô phỏng một response bị rò, tức `result: "WRONG_CINEMA"` nhưng kèm `ticket: { seatLabel: "C7", movieTitle: "Phim A", … }`. Sau đó assert rằng "C7" và "Phim A" không được render.

### MINOR
1. **Lịch sử hiển thị nguyên `qr_token`** (`soat-ve/page.tsx:58,119`). Với lượt quét QR, `code` chính là token, tức credential của vé, và nó đang hiện trên màn hình quầy. Design §17 muốn hiển thị booking code. Nên dùng `response.ticket?.bookingCode` hoặc che bớt token.
2. **Nhãn lịch sử hiện enum tiếng Anh** (`soat-ve/page.tsx:16,119`): `RESULT_LABEL` chỉ có `OK`.
3. **Còn thiếu so với design-spec §17:**
   - CANCELLED chưa có hướng dẫn "liên hệ CSKH để được hoàn tiền".
   - TOO_EARLY chưa có "Mở check-in từ {starts_at − 30'}" (`checkin-result.tsx:69-75`).
   - SAI RẠP chưa có ghi chú "Vé không bị đánh dấu check-in".
   - NOT_FOUND/NOT_PAID chưa có nút "Nhập lại mã" và chưa hiển thị mã.
   - Khi camera bị từ chối, vẫn còn khung camera vuông trống.
4. **A11y:** overlay `role="alert"` không chuyển focus vào nút "Quét vé khác" và không có focus trap (`checkin-result.tsx:87-104`).
5. **Vi phạm scope quy trình:** `staff-cinema.ts` không nằm trong "Files to Create/Modify". `parallel-dispatch.mjs` chỉ dùng danh sách này để check độc lập, và không task nào khác khai báo `components/staff/`, nên không có rủi ro conflict. Dispatcher cần ghi nhận và bổ sung vào task file.
6. Bỏ bước "Xác nhận check-in" là hợp lý, vì RPC check-in ngay khi quét (`migration:258-267`). Đây là gap giữa design và API, nên ghi vào gap register. Nhãn tuổi (R-98) cũng không có trong response API.
7. `GET /cinemas` chỉ trả rạp `OPEN` (`cinemas.service.ts:121`), nên Staff ở rạp `TEMP_CLOSED` sẽ thấy "chưa được gán rạp nào". Đây là edge case, chấp nhận được với dự án demo.

## AI-readable gate
Tên rõ, hàm ≤50 dòng, không có magic number khó hiểu, comment viết theo kiểu "tại sao". **PASS** (0–1 indicator).

## Residual risk
- Test flaky ở lần chạy 1 (3 fail, 1 file không xác định được). Lần 2 xanh.
- Chưa kiểm tra camera trên thiết bị thật.

## Verdict
**FAIL**: có 3 MAJOR (M1, M2, M3). Sửa M1–M3, rồi xử lý MINOR 1–2 trong cùng vòng nếu được.
