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
- Actual after: (builder điền)
- Evidence: (builder điền)
- Status: (builder điền)
