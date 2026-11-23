# Feature nav-skeleton-first-row · phase-3-task-03 — Kiểm chứng end-to-end bằng trình duyệt (Playwright, API giả)

- Classification / Risk: MODIFY (test). Reviewer **NORMAL**. Chạy **SAU** khi merge phase 2 (task-01 + task-02), nên tách phase 3.
- Spec: NFR-19, NFR-20, AC-32, AC-35.

## Thiết kế
1. Dùng bộ có sẵn `e2e/scrub/` (mock API `mock-api.mjs`, `scrub.spec.ts`, cấu hình ở gốc repo `playwright.scrub.config.ts`); thêm tham số làm chậm API (độ trễ cấu hình được, ví dụ 1500ms, qua env) cho các endpoint danh sách/chi tiết; mặc định giữ nguyên hành vi cũ.
2. Spec mới `e2e/scrub/nav-skeleton.spec.ts`:
   - **Điều hướng tức thì**: API chậm 1500ms; từ trang chủ bấm link sang `/phim`, `/lich-chieu`, `/rap`, `/rap/<mã>`, `/phim/<slug>`: trong ≤ 300ms URL đã đổi và có phần tử `[role=status][aria-busy=true]` (skeleton); sau khi dữ liệu về skeleton biến mất và nội dung thật hiện. Đo CLS quanh lúc thay (PerformanceObserver `layout-shift`) < 0.1.
   - **Lỗi tải**: API trả 500 thì hiện trạng thái lỗi hiện có, không kẹt skeleton.
   - **Hàng đầu hiện ngay**: 390×844, 1280×800, 1440×900, 1920×1080: cuộn tới khi tiêu đề mục vừa vào khung nhìn thì phần tử hàng đầu + tiêu đề `opacity 1`, `translate/scale` trung tính; hàng thứ hai trở đi vẫn hiện dần theo cuộn và thu về khi cuộn lên.
   - **AC-32**: cuộn hết trang mọi route khách, không `data-scrub` nào còn `opacity < 1`; reduced-motion: skeleton không có animation hoạt động (computed `animation-name: none`) và mọi phần tử hiện đủ.
3. Sửa test trong `scrub.spec.ts` xung đột với spec mới (hàng đầu không còn "hiện muộn"), ghi rõ lý do trong task. Cập nhật `e2e/scrub/README.md` (mục nội dung bộ kiểm).
4. Ghi số đo (độ trễ hiện skeleton, CLS) vào Evidence. Chụp ảnh nếu cần vào thư mục tạm, KHÔNG commit ảnh.

## Files to Create/Modify
- `e2e/scrub/nav-skeleton.spec.ts`
- `e2e/scrub/scrub.spec.ts`
- `e2e/scrub/mock-api.mjs`
- `e2e/scrub/README.md`
- `playwright.scrub.config.ts`

## Verify
`pnpm exec playwright test -c playwright.scrub.config.ts` PASS toàn bộ; `pnpm lint`, `pnpm typecheck`.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: không có kiểm chứng tự động cho skeleton/điều hướng và cho hàng đầu hiện ngay.
- Expected: bộ Playwright phủ NFR-20/AC-35/AC-32, PASS.
- Actual after: bộ `nav-skeleton.spec.ts` (20 test) + `scrub.spec.ts` (35 test): `pnpm exec playwright test -c playwright.scrub.config.ts` = 55 passed, 0 failed (gồm 1 test `test.fail` ghi nhận lệch spec 3.6.1 ở bot, xem dưới). `pnpm typecheck`, `pnpm lint` PASS. `scrub.spec.ts` KHÔNG cần sửa thêm: các test xung đột với "hàng đầu không còn hiện muộn" đã được phase 2 sửa (dùng hàng thứ hai, test (i)(i2)(i3)); phase 3 chỉ bổ sung khoảng trống.
- Evidence (API chậm 1500ms, Chromium 1280x800, `next start` bản build scrub; mốc tính từ sự kiện click):
  | Route | URL đổi | Skeleton hiện | Skeleton biến mất | CLS (chuẩn) | CLS lúc thay skeleton -> nội dung |
  |---|---|---|---|---|---|
  | /phim | 40ms | 40ms | 1573ms | 0.0000 | 0.0000 |
  | /lich-chieu | 27ms | 27ms | 3109ms (3 đợt fetch tuần tự) | 0.0000 | 0.0000 |
  | /rap/SGN1 | 43ms | 43ms | 1575ms | 0.0000 | 0.0000 |
  | /rap | 25ms | 25ms | 1540ms | 0.0000 | 0.0000 |
  | /phim/phim-1 | 50ms | 50ms | 1563ms | 0.0000 | 0.0000 |
  - Một lần chạy khác của /phim/phim-1 đo CLS tính cả shift sát lúc nhấn = 0.3675 (hadRecentInput nên không vào CLS chuẩn); xảy ra ở bước "trang chủ đã cuộn xuống -> skeleton ngắn hơn" (chân trang dịch), KHÔNG phải lúc thay skeleton bằng nội dung (0.0000). Không lặp lại ở lần chạy cuối (0.0000).
  - Lỗi API 500: skeleton hiện 31ms/29ms rồi biến mất sau ~1535ms (điều hướng /phim, /lich-chieu), không kẹt. Trạng thái hiện có: /phim "Không tìm thấy phim phù hợp", /rap "Không tìm thấy rạp phù hợp", /lich-chieu hiện tiêu đề + bộ lọc rỗng, /rap/<mã> và /phim/<slug> hiện trang "Không tìm thấy trang".
  - Hàng đầu/hàng sau (4 cỡ màn x /, /phim, /rap): hàng đầu luôn opacity 1 khi cuộn xuống từng 40px và khi cuộn ngược; phần tử hàng sau đi 0.00 -> 1.00 và về 0 khi cuộn về đầu trang (1280x800 và 1920x1080 ở /rap có lần chạy mà bố cục khiến phần tử sâu nhất không đi qua vùng ẩn trong mẫu 40px; xem kiểm tra có điều kiện trong test).
  - reduced-motion: skeleton 43 phần tử, 0 animation đang chạy, 0 phần tử có animation-name; đối chứng không reduced-motion: 17 animation đang chạy.
  - perf (có sẵn): LCP /phim 1416-1500ms (do mock ảnh), CLS <= 0.0001.
  - HTTP theo user-agent (next start, mock): 
    - /rap/MA-RAP-SAI và /phim/slug-phim-sai: trình duyệt thường 200 + `<meta name="robots" content="noindex">` + giao diện "Không tìm thấy trang" (đúng spec 3.6.1); **Googlebot 200 + noindex + giao diện không tìm thấy; Bingbot 200 + noindex** (LỆCH spec 3.6.1: kỳ vọng 404 cho bot).
    - /rap/SGN1, /phim/phim-1 (còn mở): 200, không noindex, mọi UA. /rap/CLOSED1 (mock CLOSED): 200 + noindex, mọi UA.
- Phát hiện lệch spec: bot nhận 200 chứ không phải 404 cho mã rạp / slug phim sai (test 5b giữ kỳ vọng 404 và đánh `test.fail` để ghi nhận; gỡ `test.fail` khi sửa). Nguyên nhân dự đoán: khi có loading.tsx, phản hồi đã bắt đầu stream nên `notFound()` trong generateMetadata không đổi được status; chưa điều tra sâu (ngoài phạm vi task test).
- Sửa sau khi dispatcher chạy lại (4 test (3) đỏ khi chạy riêng/cache lạnh): nguyên nhân là test đo ngay sau `goto(load)` trong khi React còn giữ khung chờ Suspense, lưới thật còn nằm trong khối ẩn (mọi phần tử scrub có top 0, grid đầu là skeleton 8 thẻ) nên heuristic gán 15 "hàng đầu" và không thấy hàng sau. Không phải bản build cũ (BUILD_ID 10:59 sau merge phase 2 10:50) và không phải lỗi app. Sửa: `waitForRealContent` + bỏ qua phần tử không hiển thị khi đánh dấu; không đổi kỳ vọng. Kết quả: chạy riêng (3) 4 passed; toàn bộ 55 passed. Test (5b) do dispatcher sửa theo spec 3.6.1 đã chỉnh (bot cũng 200 + noindex).
- Giới hạn: `/rap` và trang chủ cache chi tiết mọi rạp (`/cinemas/<mã>?date=`, cache 60s) nên /rap/<mã> chỉ lạnh khi đi từ trang không gọi API rạp (test dùng `window.next.router.push` từ /dieu-khoan, và chạy trước /rap). Nội dung /lich-chieu khi 500 chỉ kiểm tiêu đề, không kiểm chữ lỗi riêng.
- Status: PASS (kèm 1 phát hiện lệch spec ở bot, test.fail)
