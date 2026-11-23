# Kiểm chuyển động theo cuộn (AC-32, NFR-19)

Bộ kiểm Playwright chạy Chromium thật với web build + API giả (`mock-api.mjs`), **không cần Supabase/Postgres**.

```bash
pnpm exec playwright test -c playwright.scrub.config.ts        # build web vào .next/scrub rồi chạy
SCRUB_SKIP_BUILD=1 pnpm exec playwright test -c playwright.scrub.config.ts   # dùng lại bản build cũ
```

- Cổng riêng: web `3105`, mock API `4010` (đổi bằng `SCRUB_WEB_PORT`, `SCRUB_API_PORT`); build ở `apps/web/.next/scrub` (`NEXT_DIST_DIR`) nên không đè dev server đang mở.
- Playwright tự khởi và tắt cả hai server; nếu một lần chạy bị ngắt, kiểm `netstat -ano | findstr ":3105 :4010"`.
- Nội dung: (a) cuộn hết mọi route khách ở 390x844, 1280x800, 1440x900, 1920x1080, không phần tử `[data-scrub]` nào kẹt ẩn, không scroll ngang, không lỗi console; (b) hero ghim đảo ngược; (c) thẻ phim hiện muộn; (d) reduced-motion; (e) focus/Tab; (f) `/dat-ve`; (g) hero ở màn thấp; (h) admin/staff không có scrub; (perf) CLS/LCP; (a11y) dấu hiệu focus.
- `nav-skeleton.spec.ts` (CR-016, NFR-19/NFR-20, AC-32/AC-35), chạy trước `scrub.spec.ts` (xếp theo tên file): (1) điều hướng từ trang chủ sang `/phim`, `/lich-chieu`, `/rap`, `/rap/<mã>`, `/phim/<slug>` khi API chậm 1500ms: URL đổi và `[role=status][aria-busy=true]` hiện trong <= 300ms, biến mất khi dữ liệu về, CLS < 0.1; (2) API 500: skeleton không kẹt, hiện trạng thái rỗng/lỗi hiện có của từng trang; (3) hàng đầu hiện đủ khi vừa ló vào khung nhìn và khi cuộn lên, hàng sau vẫn scrub + thu về, ở 4 cỡ màn; (4) reduced-motion: skeleton không có animation chạy (kèm đối chứng không reduced-motion có animation); (5) HTTP theo user-agent: mã rạp / slug phim sai (mọi client, gồm trình duyệt thường, `Googlebot` và `Bingbot`, nhận 200 + `noindex` + giao diện không tìm thấy vì khung đã stream trước, spec 3.6.1), rạp mở 200 không noindex, rạp đóng 200 + noindex.
- Làm chậm / làm lỗi API: `GET http://localhost:4010/__mock/config?delay=1500&fail=500` (mặc định `delay=0&fail=0` = hành vi cũ; `delay=0&fail=0` để trả về bình thường); hoặc env `SCRUB_API_DELAY_MS`, `SCRUB_API_FAIL_STATUS` lúc khởi động mock. Chỉ áp dụng cho endpoint dữ liệu.
- Cache dữ liệu công khai: Next cache fetch 60s (`PUBLIC_CACHE`) và lưu trên đĩa (`apps/web/.next/scrub/cache/fetch-cache`) nên API chậm chỉ chậm ở lần đầu gọi một khoá fetch. `playwright.scrub.config.ts` xoá thư mục này trước khi khởi server; mỗi test chậm dùng cookie `fb_province` riêng và mỗi route chỉ được điều hướng "lạnh" một lần trong nav-skeleton.spec.ts. Thêm test chậm mới thì dùng khoá fetch mới (cookie tỉnh, tham số `date`/`province` khác).
- Đo ngay sau `goto` phải chờ nội dung thật: sự kiện `load` có thể đến khi React còn giữ khung chờ (loading.tsx/Suspense) và lưới đã stream về vẫn nằm trong khối ẩn (top = 0), nhất là ở lần tải đầu khi cache còn lạnh (chạy riêng một test). Dùng `waitForRealContent` (không còn `[role=status][aria-busy=true]` và có phần tử `[data-scrub]` hiển thị) trước khi đánh dấu hàng đầu/hàng sau.
- Mock có thêm rạp `CLOSED1` (trạng thái CLOSED) chỉ ở trang chi tiết `/rap/CLOSED1` (không nằm trong danh sách, để không đổi bố cục các lưới) cho phép thử noindex.
- Giới hạn: `/admin`, `/staff` và việc chọn ghế cần đăng nhập nên mock không dựng được (h kiểm bằng mã nguồn; f kiểm "ghế đang thấy không bị thu về").
- `e2e/*.spec.ts` (đặt vé thật, cần Supabase local) chạy bằng `playwright.config.ts`, không lẫn với bộ này.
