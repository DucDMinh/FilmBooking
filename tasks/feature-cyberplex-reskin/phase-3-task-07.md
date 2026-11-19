# Feature cyberplex-reskin · phase-3-task-07 — Rà soát toàn cục: em-dash, hex thô, hiệu năng, a11y, chuyển động

- Classification / Risk: MODIFY (UI). Reviewer **STRICT** (gate cuối). Sau phase 2.
- Spec: NFR-19, NFR-12, NFR-11, AC-32. Thiết kế: tokens §0 T8, §8; spec §16.5, §16.7.

## Thiết kế
1. **Em-dash/en-dash** (`—`, `–`) trong **chuỗi hiển thị** (62 file `.tsx` hiện có ký tự này; bỏ qua comment/test): thay `-` hoặc dấu câu. Không đổi chuỗi bị test kiểm nguyên văn mà không cập nhật test.
2. Quét **hex thô / màu Tailwind mặc định / `rounded-pill|full` / `bg-gradient-brand` / font Inter/Rajdhani còn sót**; map về token.
3. **Playwright** (script giữ lại tại `apps/web/e2e/scrub.spec.ts` hoặc thư mục phù hợp; không thêm dependency nếu repo chưa có): cuộn tới mốc rồi đọc computed (`opacity/translate/scale`), **cuộn lên trả đúng**; hero `0 → 90svh → 0`; lưới phim hiện muộn (bắt đầu top ≤ ~560/800) và hoàn tất khi còn cách mép dưới ≥ 200px; cuộn hết trang không phần tử `data-scrub` nào còn `opacity < 1` **ở cả 4 cỡ màn 390×844, 1280×800, 1440×900, 1920×1080, cho mọi route khách** (AC-32; route nào kẹt thì `--scrub-inset: 0px`); phần tử nhận focus bằng Tab luôn hiện (`:focus-within`); `/dat-ve/*` hiện đủ ngay; reduced-motion = tất cả `1/0/1`; không scroll ngang ở 360px và 1280px; không lỗi console.
4. **Lighthouse** (trang chủ, `/phim`, `/lich-chieu`): CLS < 0.1, LCP < 2.5s; ghi số đo.
5. **A11y**: Tab bàn phím thấy vòng focus trên nút chamfer; kiểm tương phản tokens §6; screen reader đọc được phần tử đang hiện dần.
6. Reconcile tài liệu as-built (`docs/**` nhắc màu/font cũ; `docs/design/cinemo` giữ làm lịch sử). **Không** sửa intent docs.

## KHÔNG làm
Không thêm tính năng mới; không đổi nghiệp vụ; không động `apps/api`, `supabase`.

## Files to Modify
Rải rác `apps/web/src/**` (chuỗi/class), `apps/web/e2e/*` (mới), docs as-built.

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test`, `build`; `pnpm test` toàn repo; chạy script Playwright; số Lighthouse.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: còn dấu gạch dài, class cũ, chưa có test chuyển động.
- Expected: sạch; test cuộn PASS; CLS/LCP đạt.
- Actual after: _(builder điền)_
- Evidence: _(builder điền)_
- Status: pending
