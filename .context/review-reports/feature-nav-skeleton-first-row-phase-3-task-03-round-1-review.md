# Review: feature-nav-skeleton-first-row, phase-3-task-03, round 1

Agent: reviewer

- Review level: NORMAL
- Reason: task chỉ thêm và sửa test e2e, mock API và cấu hình Playwright của bộ scrub. Không đổi mã app, schema hay API.
- Blast radius: `e2e/scrub/**` và `playwright.scrub.config.ts`. Mock API (`mock-api.mjs`) và cấu hình được `scrub.spec.ts` dùng chung. Mã app, DB và CI chính không bị ảnh hưởng.
- Commit review: `edb2f18`, `618b84a`. Scope sạch: chỉ có `e2e/scrub/README.md`, `e2e/scrub/mock-api.mjs`, `e2e/scrub/nav-skeleton.spec.ts`, `playwright.scrub.config.ts` và task file. Không commit file nào dưới `apps/**`, `packages/**`, `SPECIFICATIONS.md` hay `design-spec.md`. Các thay đổi `apps/**` thấy trong `2d5ffeb..HEAD` thuộc merge `fe024a3` của task-02, không thuộc task này.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS. Lưu ý: chỉ chạy cho workspace `packages/shared`, `apps/api`, `apps/web`; thư mục `e2e/` **không** được typecheck. |
| `pnpm lint` | PASS. Lưu ý tương tự: lint không quét `e2e/`. |
| `pnpm exec playwright test -c playwright.scrub.config.ts nav-skeleton` | **Chưa tự chạy**: hook `agent-guard` chặn vì lệnh ngoài allowlist. Không đổi biến thể để lách. Kết quả dispatcher báo ở repo gốc với `SCRUB_SKIP_BUILD=1`: 55 passed, 0 failed. |
| aislop / oxlint / ocr | skip: diff chỉ có e2e test và mock. oxlint chưa cấu hình, ocr chưa cài. |

## Kiểm theo brief

1. **Assertion thật, không tự pass.**
   - (1) Điều hướng (`nav-skeleton.spec.ts:162-170`): kiểm `urlMs <= 300`, `skeletonMs <= 300`, `goneMs >= SLOW_MS-200` (chứng minh API chậm thật sự chặn nội dung, nên cache nóng sẽ làm test đỏ thay vì pass giả), skeleton biến mất, `h1` thật hiện, CLS chuẩn < 0.1 và CLS lúc thay skeleton bằng nội dung < 0.1. Đạt.
   - (2) Lỗi 500 tải thẳng: chữ kỳ vọng ở `/phim` và `/rap` chỉ xuất hiện khi lỗi, vì mock bỏ qua tỉnh lạ, nên phép thử có nghĩa. Đạt.
   - (3) Hàng đầu và hàng sau: đạt, xem mục 2 và MINOR-2.
   - (4) Reduced-motion có test đối chứng: không đặt reduced-motion thì `running > 0`, nên phép thử không rỗng. `/lich-chieu` không dùng `PUBLIC_CACHE` (`apps/web/src/app/(public)/lich-chieu/page.tsx:83,93,218-220`), nên skeleton ở test (4) không phụ thuộc cache. Đạt.
   - (5a), (5b), (5c): kiểm status, `noindex` và giao diện không tìm thấy (sau khi bỏ `<script>`), khớp spec 3.6.1. Ở (5c), mock `CLOSED1` dùng `status: "CLOSED"`, trùng enum thật `CINEMA_DB_STATUSES` (`packages/shared/src/schemas/catalog.ts:9`). App gắn noindex theo `cinema.status !== "OPEN"` (`apps/web/src/app/(public)/rap/[code]/page.tsx:121-127`). Cross-boundary khớp.
2. **`waitForRealContent`** (`nav-skeleton.spec.ts:95-98, 253, 258`): chờ hết skeleton rồi chờ có phần tử `[data-scrub]` hiển thị; bộ lọc `getClientRects` chỉ bỏ con `display:none`. Không assertion nào bị nới. Sửa đúng nguyên nhân.
3. **Mock và cấu hình.**
   - Mặc định `delay=0, fail=0` giữ hành vi cũ. `/__mock/config` và ảnh trả về trước nhánh chaos; `/health` được loại trừ.
   - `workers: 1, fullyParallel: false`, nên trạng thái mock toàn cục không đua giữa các test. Mỗi test reset bằng `beforeEach`/`afterEach`.
   - `rmSync` có guard `TEST_WORKER_INDEX === undefined`, nên chỉ chạy ở tiến trình điều phối. Đúng.
   - `stdout: "pipe"` hợp lý.
   - `CLOSED1` không nằm trong danh sách, nên không đổi bố cục các lưới của `scrub.spec.ts`.
4. **Flaky.** Mức thấp đến trung bình, xem MINOR-1. Phần lớn rủi ro cache hoặc thứ tự sẽ làm test đỏ to, không gây pass giả.
5. **Ngoài scope.** Không có file ngoài scope trong 2 commit.

## Findings

### CRITICAL
Không có.

### MAJOR

- **MAJOR-1: Evidence trong task file và README mâu thuẫn với test đã commit và spec 3.6.1** (source of truth bị sai). `618b84a` đã đổi (5b) sang kỳ vọng bot nhận 200 + noindex + giao diện không tìm thấy, và đã bỏ `test.fail`. Tài liệu vẫn mô tả hành vi cũ:
  - `e2e/scrub/README.md:13`: mục (5) vẫn ghi "`Googlebot` 404". Câu này trái `nav-skeleton.spec.ts:428-445` và trái NFR-20/R-137/AC-28 bản 3.6.1. Người bảo trì sau có thể "sửa lại" về 404.
  - `tasks/feature-nav-skeleton-first-row/phase-3-task-03.md:32`: "gồm 1 test `test.fail` ghi nhận lệch spec 3.6.1 ở bot". Test này không còn tồn tại.
  - `phase-3-task-03.md:47`: "**Googlebot 200 + noindex …; Bingbot 200 + noindex** (LỆCH spec 3.6.1: kỳ vọng 404 cho bot)". Không còn lệch.
  - `phase-3-task-03.md:49`: "test 5b giữ kỳ vọng 404 và đánh `test.fail`". Sai.
  - `phase-3-task-03.md:52`: "Status: PASS (kèm 1 phát hiện lệch spec ở bot, test.fail)". Sai.
  - Dòng 50 cùng file lại nói ngược ("Test (5b) do dispatcher sửa theo spec 3.6.1"), nên Evidence tự mâu thuẫn.

  Sửa (chỉ đổi tài liệu, không đổi test): cập nhật README mục (5) thành "mọi client, kể cả Googlebot và Bingbot, nhận 200 + noindex + giao diện không tìm thấy". Viết lại các dòng 32, 47, 49, 52 của task file theo kết quả thật: 55 passed, không có `test.fail`, (5b) khớp spec 3.6.1.

### MINOR

- **MINOR-1 (flaky, mức thấp đến trung bình):**
  - `NAV_CASES` phụ thuộc thứ tự (`/rap/SGN1` phải chạy trước `/rap`), phụ thuộc cache fetch 60s, và phụ thuộc việc `nav-skeleton.spec.ts` chạy trước `scrub.spec.ts` theo thứ tự tên file. Chạy lọc bằng `--grep` chỉ lấy `/rap` thì vẫn ổn; đảo thứ tự hoặc thêm test gọi `/cinemas/SGN1?date=<hôm nay>` trước đó sẽ làm đỏ ở `goneMs >= 1300`. Lỗi kiểu này lộ rõ, không gây pass giả.
  - Ngưỡng 300ms so với số đo 25-50ms còn dư nhiều.
  - `rmSync` dùng đường dẫn tương đối theo cwd, và `force: true` sẽ âm thầm không làm gì nếu chạy từ thư mục khác gốc repo.
  - Nhánh build đầy đủ (không có `SCRUB_SKIP_BUILD`) chưa được dispatcher chạy.
  - Cookie `NAVLICH` là thừa, vì `/lich-chieu` không cache. Vô hại.
- **MINOR-2 (test (3)):**
  - Điều kiện `setup.later > size.height` (`nav-skeleton.spec.ts:307, 323`) bỏ qua toàn bộ kiểm "hàng sau ẩn rồi hiện, thu về khi cuộn lên" nếu phần tử sâu nhất nằm trong khung nhìn lúc vào trang.
  - `waitForRealContent` chỉ chờ một phần tử `[data-scrub]` hiển thị (`some`), không chờ mọi `[data-scrub-grid]`.
  - Evidence dòng 43 ("/rap 1280x800 và 1920x1080 có lần chạy mà phần tử sâu nhất không đi qua vùng ẩn") không khớp logic: nếu phần tử nằm dưới khung nhìn thì test phải đỏ. Nghĩa là ghi chú này đã cũ, hoặc test có thể flaky. Nên làm rõ khi sửa MAJOR-1.
  - Hàng sau đã được `scrub.spec.ts` (i2) phủ, nên chỉ xếp MINOR.
- **MINOR-3 (độ phủ, đã thừa nhận một phần):**
  - Ca 500 của `/lich-chieu` chỉ kiểm `h1` "Lịch chiếu phim", tiêu đề này cũng có khi thành công. Không chứng minh được trạng thái lỗi, chỉ chứng minh skeleton không kẹt.
  - Hai test điều hướng 500 (`nav-skeleton.spec.ts:216-231`) không kiểm `urlMs` và không kiểm chữ trạng thái lỗi.
  - `/rap/SGN1` điều hướng bằng `router.push` thay vì bấm `<Link>` thật. `/rap` và `/rap/<mã>` xuất phát từ `/dieu-khoan`, không phải trang chủ.
  - Các route cần đăng nhập (đặt vé, vé, tài khoản) và điều hướng về trang chủ chưa có test.
  - Chưa kiểm shimmer không quá 3 lần/giây (WCAG 2.3.1).
- **MINOR-4:** `inspectSkeleton` (`nav-skeleton.spec.ts:347`) ép kiểu `root as HTMLElement` mà không kiểm null. Nếu skeleton biến mất giữa `waitForSelector` và `evaluate` thì test lỗi TypeError khó đọc. Rủi ro thấp vì API chậm 3s.
- **MINOR-5:** `e2e/` không nằm trong phạm vi `pnpm typecheck` / `pnpm lint`, nên kiểu và lint của file spec không có gate nào giữ. Playwright chỉ transpile, không check type. Đây là nợ hạ tầng có từ trước, không do task này gây ra.

### Phụ thuộc close-out (không phải lỗi của builder)

- `SPECIFICATIONS.md` bản 3.6.1 (NFR-20, R-137, AC-28: mọi client nhận 200 + noindex) **chưa commit**: `git diff HEAD -- SPECIFICATIONS.md` vẫn còn diff 3.6.0 → 3.6.1. HEAD hiện có test (5b) trái với spec đã commit (3.6.0 ghi "mã rạp sai vẫn 404"). Dispatcher phải commit spec 3.6.1 cùng lúc hoặc trước close-out task này.

## Verdict

**FAIL** (round 1).

Lý do duy nhất là MAJOR-1: Evidence trong task file và README mâu thuẫn với test đã commit và spec 3.6.1. Phần test, mock và cấu hình đạt yêu cầu: assertion thật, có đối chứng, `waitForRealContent` sửa đúng mà không nới kỳ vọng, mock mặc định giữ hành vi cũ, scope sạch. Round 2 chỉ cần sửa tài liệu (README dòng 13, task file dòng 32, 47, 49, 52, và làm rõ dòng 43); không cần đổi test.
