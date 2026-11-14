Agent: reviewer

# Review: build-filmbooking layer-7 task-08, round 2
Mục tiêu vòng này: xác minh bản sửa F1–F3 từ round 1 (`build-filmbooking-layer-7-task-08-round-1-review.md`) và kiểm tra regression.

## Review level
**STRICT**

## Reason
Task là báo cáo có RBAC (Manager chỉ xem rạp mình, Admin xem toàn chuỗi), có tiền VND, và AC-25. Round 1 FAIL vì một lỗi MAJOR.

## Blast radius
Chỉ các file mới của task bị chạm: `report-dashboard.tsx`, `report-utils.ts`, `revenue-report.tsx` và `__tests__/reports.test.tsx`. Không sửa API, shared schema hay migration. Không file dùng chung nào bị chỉnh.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `cd apps/web && pnpm test` | PASS: 25 file, 355/355 test, không có timeout (round 1 là 353 test, vòng này thêm 2) |
| `pnpm build` | PASS (`/admin/bao-cao` build được sau khi bỏ import thừa) |
| oxlint / aislop / ocr | skip (repo chưa cấu hình oxlint; aislop và ocr không nằm trong allowlist) |

Tôi không chạy lần hai `pnpm exec vitest run` vì lần đầu đã pass hết và không có timeout (Tool Loop Guard). Hai test cũ MovieForm/PriceMatrix vẫn không tái hiện lỗi timeout.

## Xác minh các finding của round 1
- **F1: ĐÃ SỬA đúng root cause.**
  - Code tách 2 khoảng ngày. Khoảng "Theo ngày tạo đơn" dùng `defaultVnRange`, từ hôm nay −29 đến hôm nay, và chỉ áp cho revenue. Ngày ở đây khớp `created_at` VN (hardening.sql:132).
  - Khoảng "Theo ngày chiếu" dùng `defaultVnShowtimeRange`, từ hôm nay −30 đến hôm nay +30 (`report-utils.ts:67-69`). Khoảng này áp cho showtimes và cancelled, khớp với `starts_at` VN mà RPC dùng (hardening.sql:447-448, 591-592).
  - Wiring đúng: `report-dashboard.tsx:120-145` và `revenue-report.tsx:151-164`.
  - Test giờ có ý nghĩa thật. Fixture là suất chiếu sau hôm nay 10 ngày với status `CANCELLED`. Mock lọc theo `fromDate`/`toDate` (`reports.test.tsx:46-54`). Test `:138-147` khẳng định request mặc định có `toDate` lớn hơn hôm nay.
  - Kiểm ngược: nếu quay lại bản round 1 (`toDate` = hôm nay) thì mock sẽ lọc bỏ hàng của suất tương lai, và cả 2 test AC-25 sẽ fail.
- **F2: ĐÃ SỬA.** Mỗi khoảng ngày có fieldset riêng, với legend và hint nói rõ dùng ngày tạo đơn hay ngày chiếu, khớp với RPC.
- **F3: ĐÃ SỬA.** Thêm `status: "forbidden"` hiển thị EmptyState "Không có quyền xem báo cáo", không có nút Thử lại. Test `:149-155` xác nhận không gửi request báo cáo nào. API vẫn là nơi chặn quyền thật.
- **F4:** giữ nguyên. Nhãn "Phạm vi" hiển thị đúng nên chấp nhận.

## Kiểm tra regression
Các phần sau vẫn đúng như round 1:
- Scope MANAGER/Admin khớp giữa UI, API và RPC.
- Admin xem toàn chuỗi không gửi `cinemaId`.
- Manager không bao giờ gửi rạp mà mình chỉ có vai trò STAFF.
- Request cũ bị huỷ khi đổi filter, có test với nhãn mới.
- Lỗi hiển thị ErrorState, không giữ dữ liệu cũ.
- Định dạng VND đúng.
- Nhãn discrepancy PayOS khớp SQL.
- Không truyền `channel` vẫn ra tổng đúng.

## Findings mới (đều MINOR, không chặn)
- **N1:** nếu một trong hai khoảng ngày không hợp lệ thì ẩn cả 3 section, kể cả section không dùng khoảng đó (`report-dashboard.tsx:141`). Chỉ là UX, người dùng vẫn thấy cảnh báo rõ.
- **N2:** tên biến `held`/`setHeld` (`report-dashboard.tsx:110`) không nói rõ đây là khoảng ngày chiếu. Nên đặt `showtimeRange`.
- **N3:** suất bị huỷ có ngày chiếu xa hơn 30 ngày sẽ nằm ngoài khoảng mặc định. Người dùng tự mở rộng được và hint đã nói rõ. Mức này chấp nhận được cho bản demo MVP.
- **Gap từ round 1 (F5) vẫn còn:** R-116 thiếu tổng tiền theo rạp và danh sách giao dịch đầy đủ; API PayOS không lọc theo ngày. Ghi vào gap register khi close-out.

## Verdict
**STRICT PASS**
