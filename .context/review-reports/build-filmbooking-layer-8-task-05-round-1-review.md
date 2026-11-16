# Review — build-filmbooking layer-8 task-05 (round 1)

Agent: reviewer
Ngày: 2026-11-16
Worktree: `E:/FilmBooking/.worktrees/layer-8__task-05` (base `layer-8-integration` @ 19de8d3, đã gồm fix task-08 6958fec)
Diff: các file mới chưa commit: `playwright.config.ts`, `e2e/{booking,checkin,seat-realtime,admin-new-cinema}.spec.ts`, `e2e/support/{data,ui,global-teardown}.ts`, `.github/workflows/e2e.yml`

## Review level
NORMAL. Diff chỉ thêm test và CI, nhưng test đi qua thanh toán (webhook HMAC), auth và dọn dữ liệu DB bằng service-role, nên tôi soi kỹ các chỗ có thể cho kết quả xanh giả.

## Reason
Không đổi source app. Rủi ro chính: test xanh nhưng không chứng minh được AC (bị skip âm thầm, phép đo sai), và cleanup xoá nhầm dữ liệu.

## Blast radius
Chỉ ảnh hưởng `pnpm e2e` và job CI tuỳ chọn (chạy tay hoặc nightly, không chặn PR). Cleanup chạy với khoá service-role trên Supabase local. URL Supabase bị ép phải là localhost (`e2e/support/data.ts:33`).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm exec eslint e2e playwright.config.ts` | PASS, không có output |
| typecheck e2e (`tsc --noEmit ...`) | BLOCKED (agent-guard: không có trong allowlist). Root không có script `typecheck` riêng, và `pnpm -r typecheck` không phủ `e2e/` hay `playwright.config.ts`, nên các file này **không được typecheck bởi lệnh verify nào đã cấu hình** (residual). |
| `pnpm e2e` | KHÔNG chạy: lệnh không có trong allowlist `.context/project-config.md`. Tôi không tìm cách lách. Con số "10/10 passed" chỉ dựa trên bằng chứng của builder; dispatcher phải chạy lại và xác nhận **skipped = 0**. |

## Findings

### MAJOR-1 — Guard `test.fixme(isMoviesEndpointBroken())` biến lỗi thật thành skip, Playwright vẫn exit 0
- `e2e/booking.spec.ts:14`, `e2e/admin-new-cinema.spec.ts:101`, `e2e/support/data.ts:352-358`.
- Base đã có fix task-08 (`/movies` 500 → FK showtimes.cinema_id), nên guard này giờ là code chết và `MOVIES_BUG_REASON` mô tả một bug đã sửa.
- Nếu `GET /movies` hỏng lại (5xx), hoặc API không gọi được (`.catch(() => null)` trả `true`), thì spec happy-path đặt vé (R-38/AC-08) và spec UI ở rạp mới (AC-19) bị đánh dấu skipped, `pnpm e2e` vẫn exit 0, job nightly vẫn xanh. Đây đúng là kiểu xanh giả cần loại bỏ: hồi quy của chính endpoint mà luồng đặt vé phụ thuộc sẽ không làm test đỏ.
- Yêu cầu: xoá `test.fixme(...)` ở cả hai spec, xoá `isMoviesEndpointBroken` và `MOVIES_BUG_REASON`. Nếu `/movies` lỗi thì test phải FAIL.

### MAJOR-2 — Phép đo R-60/NFR-03 bắt đầu sai mốc nên thấp hơn thực tế
- `e2e/seat-realtime.spec.ts:44-51`: `startedAt = Date.now()` được lấy **sau khi** `apiAs(...)` trả về. `apiAs` (`data.ts:282-305`) gồm cả `signInWithPassword` lẫn POST `/bookings/holds`. Sự kiện realtime có thể đến B trong lúc request giữ ghế đang xử lý hoặc trả về (sau khi DB commit). Khoảng đó không được tính, và trong trường hợp xấu nhất B đã ở trạng thái `held` trước khi đồng hồ bắt đầu. Số 53 ms trong bằng chứng khớp với kiểu sai lệch này.
- Con số báo cáo (53–647 ms) vì vậy không phải "A giữ ghế → B thấy" như AC yêu cầu. Assert `timeout: REALTIME_BUDGET_MS` cũng đếm từ sau khi API trả về.
- Comment ở dòng 42-43 ("nút bị khoá bởi bug GET /movies") đã lỗi thời sau task-08. Phiên web của A (`pageA`) được mở nhưng không dùng vào việc gì.
- Yêu cầu: A giữ ghế qua UI (bấm ghế A1 → "Tiếp tục") và bấm giờ ngay trước khi click. Tối thiểu thì đăng nhập (lấy token) trước, rồi bấm giờ ngay trước `fetch` POST holds. Cập nhật comment cho đúng.

### MINOR
1. `e2e/seat-realtime.spec.ts:40` dùng `waitForTimeout(1500)` để chờ kênh realtime subscribe. Đây là chờ cố định, có thể giấu flake. Nên chờ một tín hiệu thật: hook có state `connected` (`apps/web/src/lib/realtime/use-showtime-seats.ts:101-108`); nếu seat-map đưa nó ra DOM thì chờ theo đó.
2. `e2e/seat-realtime.spec.ts:23-27` và `e2e/admin-new-cinema.spec.ts:104-108`: `browser.newContext` chỉ truyền `baseURL/viewport/hasTouch`, nên bị mất `isMobile`, `locale: vi-VN`, `timezoneId`. Giả lập mobile-360 ở các phiên này không đầy đủ, và giờ hiển thị có thể lệch múi giờ.
3. Key PayOS giả bị khai ở hai chỗ: `playwright.config.ts:45` và `e2e/support/data.ts:15`. Nên khai một chỗ rồi import.
4. `playwright.config.ts:36` có comment trỏ tới `support/env.ts`, file này không tồn tại.
5. `playwright.config.ts:80,99` đặt `reuseExistingServer: !process.env.CI`. Khi chạy local, nếu cổng 3100/3101 đang có server chạy sẵn (env khác, `NODE_ENV` khác, build cũ) thì test sẽ dùng nó. Lệch key webhook sẽ làm test đỏ chứ không xanh giả, nhưng vẫn có khả năng test chạy trên code cũ. Nên ghi vào README/comment.
6. `e2e/support/data.ts:4-7` import supabase-js theo đường dẫn tương đối vào `apps/api/node_modules`. Cách này dễ vỡ khi api đổi version hoặc pnpm đổi layout (đã được ghi trong comment).
7. `e2e/support/data.ts:408` gọi `listUsers({ perPage: 1000 })`, chỉ lấy một trang. Nếu DB local có hơn 1000 user thì user e2e có thể sót.
8. `e2e/support/data.ts:405`: `like('E2E_%')` có `_` là wildcard, nên khớp mọi province code bắt đầu bằng `E2E`. Tôi đã grep seed và int-test, không có code nào bắt đầu bằng `E2E`/`e2e_`/`e2e-` ngoài e2e, nên hiện vô hại.
9. `e2e/admin-new-cinema.spec.ts`: sơ đồ ghế, suất và giá được tạo qua API chứ không qua UI quản trị. Test 1 chỉ assert `orderId` có giá trị (giữ ghế), chưa thanh toán. Với dự án demo thì chấp nhận được cho AC-19 ("thêm rạp = thêm dữ liệu").
10. `e2e/checkin.spec.ts`: sau soát vé không assert trạng thái đơn hay vé trong DB (`checked_in`). Assert UI "VÉ HỢP LỆ" rồi "VÉ ĐÃ SỬ DỤNG" đã đủ chặt, phần DB chỉ là bổ sung.
11. Ngoài phạm vi khai báo: `e2e/support/*` và `.github/workflows/e2e.yml` không nằm trong "Files to Create/Modify". Đều là file mới, rủi ro conflict thấp, nhưng nên ghi vào task file.
12. CI `e2e.yml` chưa chạy lần nào. Chưa xác minh được các `env()` chưa đặt trong `supabase/config.toml` (OPENAI_API_KEY, TWILIO, APPLE, S3_*) có làm `supabase start` lỗi trên runner không. Action pin `@v4` chấp nhận được cho demo. Workflow tối thiểu quyền (`contents: read`), không chặn PR, upload `test-results/` khi fail, `db:stop` luôn chạy: đạt.

### Gap "đăng ký → xác nhận email Inbucket"
Chấp nhận được cho dự án demo: AC của task chỉ gồm AC-08/AC-19, còn đăng ký chỉ xuất hiện trong Description. Tuy nhiên gap **chưa được ghi chính thức**: task file `tasks/build-filmbooking/layer-8-task-05.md` không có mục Residual hay Gap, gap mới chỉ nằm trong tin nhắn bàn giao của builder. Yêu cầu ghi vào task file (lý do: Turnstile phía Nest; user tạo qua GoTrue admin `email_confirm`). Gợi ý: `config.toml:227-228` đặt `[auth.captcha] enabled = false`, nên chỗ chặn nằm ở Nest. Nếu API đọc Turnstile secret từ env, có thể truyền test secret "luôn pass" của Cloudflare qua env của webServer để gỡ gap này (không bắt buộc).

### Điểm đạt (có bằng chứng)
- Không bỏ qua kiểm chữ ký: `apps/api/src/modules/payment/payos.client.ts:110-130`, `verifyWebhook` luôn kiểm HMAC bằng `timingSafeEqual`. `NODE_ENV=test` chỉ ảnh hưởng `createPaymentLink`/`cancelPaymentLink` (link mock). Production thiếu key thì throw (`:79-81`, `env.ts:57-68`). Test ký webhook bằng key giả `e2e-payos-checksum-key`, chỉ truyền cho API do Playwright khởi động. Key này không phải secret thật và không có trong CI secrets.
- Khoá Supabase đọc từ `supabase status -o env` lúc chạy (`playwright.config.ts:13-33`), không hard-code. Chốt localhost ở `data.ts:33`.
- Assert chặt: đơn `paid` trong DB + `booking_code` hiện ở `/ve` (`booking.spec.ts:46-53`); AC-08 kiểm nút thanh toán disabled → enabled sau khi đồng ý (`:32-35`); soát vé "VÉ HỢP LỆ" rồi "VÉ ĐÃ SỬ DỤNG"; realtime kiểm `data-state="held"` trên B mà không tải lại, nguồn là `postgres_changes` trên `seat_status_public` (`use-showtime-seats.ts:84-100`), cùng accessible name "đang giữ".
- Không có `retries` (`retries: 0`), `workers: 1`, không có `test.skip`. Ngoài guard ở MAJOR-1 và `waitForTimeout` ở MINOR-1 thì không thấy chỗ nào khác che kết quả.
- Cleanup đúng thứ tự FK so với migration: `payments` và `affected_order_actions` (FK `orders` ON DELETE RESTRICT, `20261111030100_booking_tables.sql:174,226`) bị xoá trước `orders`; `tickets`/`order_seats` cascade; `showtimes` (RESTRICT tới cinema, `20261114190000_showtimes_cinema_fk.sql:8`) bị xoá trước `cinemas`. Mọi lần xoá đều lọc theo id của rạp có tiền tố `E2E` hoặc slug/email có tiền tố e2e, không đụng seed. `globalTeardown` chạy cả khi test fail. Lỗi cleanup được gom lại rồi throw, không nuốt im lặng.
- Có giãn nhịp đăng nhập để không tự chạm rate limit (`ui.ts:5-20`). PayOS checkout được stub bằng `page.route`, không gọi mạng ngoài.

## Residual risk
- Chưa chạy e2e độc lập (agent-guard); dispatcher phải chạy `pnpm e2e` và xác nhận 10 passed, 0 skipped.
- e2e và config không được typecheck bởi lệnh verify nào.
- Workflow CI chưa chạy thật.
- An toàn khi chạy song song với int-test: tiền tố tách biệt (không có dữ liệu ngoài e2e dùng tiền tố `E2E`/`e2e_`/`e2e-`), nhưng tải đồng thời lên cùng Supabase local có thể làm phép đo realtime dao động.

## Verdict
**FAIL** (2 MAJOR). Cả hai sửa nhỏ: xoá guard fixme; sửa mốc bấm giờ realtime (A giữ ghế qua UI hoặc bấm giờ ngay trước POST). Kèm theo: ghi gap đăng ký/Inbucket vào task file. Nên làm luôn MINOR 1-4.
