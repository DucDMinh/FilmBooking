# Kiểm chuyển động theo cuộn (AC-32, NFR-19)

Bộ kiểm Playwright chạy Chromium thật với web build + API giả (`mock-api.mjs`), **không cần Supabase/Postgres**.

```bash
pnpm exec playwright test -c playwright.scrub.config.ts        # build web vào .next/scrub rồi chạy
SCRUB_SKIP_BUILD=1 pnpm exec playwright test -c playwright.scrub.config.ts   # dùng lại bản build cũ
```

- Cổng riêng: web `3105`, mock API `4010` (đổi bằng `SCRUB_WEB_PORT`, `SCRUB_API_PORT`); build ở `apps/web/.next/scrub` (`NEXT_DIST_DIR`) nên không đè dev server đang mở.
- Playwright tự khởi và tắt cả hai server; nếu một lần chạy bị ngắt, kiểm `netstat -ano | findstr ":3105 :4010"`.
- Nội dung: (a) cuộn hết mọi route khách ở 390x844, 1280x800, 1440x900, 1920x1080, không phần tử `[data-scrub]` nào kẹt ẩn, không scroll ngang, không lỗi console; (b) hero ghim đảo ngược; (c) thẻ phim hiện muộn; (d) reduced-motion; (e) focus/Tab; (f) `/dat-ve`; (g) hero ở màn thấp; (h) admin/staff không có scrub; (perf) CLS/LCP; (a11y) dấu hiệu focus.
- Giới hạn: `/admin`, `/staff` và việc chọn ghế cần đăng nhập nên mock không dựng được (h kiểm bằng mã nguồn; f kiểm "ghế đang thấy không bị thu về").
- `e2e/*.spec.ts` (đặt vé thật, cần Supabase local) chạy bằng `playwright.config.ts`, không lẫn với bộ này.
