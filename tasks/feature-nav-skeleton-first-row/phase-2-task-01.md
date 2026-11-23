# Feature nav-skeleton-first-row · phase-2-task-01 — Skeleton trang + điều hướng tức thì (trang khách)

- Classification / Risk: MODIFY (UI, CR-016). Reviewer **NORMAL** (nhiều file nhỏ mới, không đổi dữ liệu/API). **Song song** với task-02 (file không trùng). Sau phase 1 (spec 3.6.0).
- Spec: **NFR-20**, AC-35 (ý 1), NFR-11, NFR-12, NFR-19 (reduced-motion).

## Vấn đề (root cause đã đo bằng đọc code)
`apps/web/src/app` không có file `loading.tsx` nào. Các page server component `await apiFetch(...)` xong mới render, nên Next giữ trang cũ tới khi dữ liệu về rồi mới chuyển. Cần ranh giới loading cho từng route để URL đổi và khung trang + skeleton hiện ngay.

## Thiết kế
1. **Thành phần dùng chung** `apps/web/src/components/common/page-skeleton.tsx` (KHÔNG "use client", giống `states.tsx`; dùng `Skeleton` có sẵn `components/ui/skeleton.tsx`, đã `animate-pulse motion-reduce:animate-none`): ví dụ `PageSkeleton` (vỏ `role="status" aria-busy="true"` + `<span class="sr-only">Đang tải…</span>`), `SectionHeadSkeleton`, `MovieGridSkeleton` (đúng số cột/tỉ lệ poster như `MovieGrid`), `CinemaGridSkeleton`, `DetailHeroSkeleton`, `ListRowsSkeleton`. Dùng token/khối CYBERPLEX sẵn có (`frame`, `chamfer-*`, `bg-surface-elevated`), KHÔNG spinner toàn trang, KHÔNG màu/hex thô, KHÔNG `Scrub` (skeleton hiện tức thì, opacity luôn 1).
2. **`loading.tsx` theo route** (App Router, server component, không "use client"), mỗi file dựng skeleton **cùng bố cục** trang thật (đọc page tương ứng để khớp số cột, chiều cao hàng, khung tab/lọc) để không nhảy bố cục (CLS < 0.1):
   - `app/(public)/loading.tsx` (trang chủ: hero + thanh khu vực + lưới phim + lưới rạp; route con có `loading.tsx` riêng thì dùng riêng)
   - `app/(public)/phim/loading.tsx`, `phim/[slug]/loading.tsx`
   - `app/(public)/lich-chieu/loading.tsx`
   - `app/(public)/rap/loading.tsx`, `rap/[code]/loading.tsx`
   - `app/(public)/dat-ve/loading.tsx` (gồm `dat-ve/[showtimeId]` và `dat-ve/don/**`; nếu bố cục khác nhau nhiều thì thêm `loading.tsx` riêng cho `don/[id]/xac-nhan` và `ket-qua`)
   - `app/(public)/ve/loading.tsx`, `ve/[bookingCode]/loading.tsx`
   - `app/(public)/tai-khoan/loading.tsx` (dùng chung cho `bao-mat`, `rap-yeu-thich`, `thong-bao`; `tai-khoan/page.tsx` đã có `ProfileLoadingSkeleton` riêng cho phần client: tái dùng nếu hợp, không nhân đôi).
   Trang tĩnh (`dieu-khoan`, `chinh-sach-bao-mat`, `huong-dan-xoa-du-lieu`) và `(auth)` không có tải dữ liệu: không bắt buộc.
3. **Kiểm cơ chế**: xác nhận bằng chạy thật rằng sau khi thêm `loading.tsx`, bấm `<Link>` chuyển trang hiện skeleton ngay (không chờ). Nếu một route vẫn chặn vì `layout.tsx` hoặc chỗ `await` ở tầng trên (vd `(public)/layout.tsx` gọi `supabase.auth.getUser()` + `/me`), ghi rõ trong task file và xử lý trong phạm vi (vd bọc phần chậm bằng `Suspense` ngay trong page), KHÔNG đổi logic redirect/StaffAreaGuard/auth.
4. **Lỗi tải**: không đổi `error.tsx`/`global-error.tsx`/`ErrorState`; skeleton không được che trạng thái lỗi (lỗi vẫn hiển thị, không kẹt skeleton).
5. **A11y**: mỗi skeleton có `role="status"` + `aria-busy="true"` + nhãn sr-only tiếng Việt (có dấu); chỉ một vùng `role=status` mỗi trang; không đưa nội dung giả (không chữ lorem, không số) vào skeleton.
6. `.context/design-spec.md` (§5 Loading trang) đã được change-request cập nhật: KHÔNG sửa file này; chỉ đọc để bám đúng (PageSkeleton, `role=status`, không Scrub).

## KHÔNG làm
Không đụng `globals.css`, `components/motion/scrub.tsx`, các `page.tsx`/`showtime-schedule.tsx`/`section-heading.tsx`/`movie-card.tsx` (task-02), `admin|staff`, `apps/api`, `packages/shared`, `supabase`, logic auth/redirect. Không đổi `apiFetch`/cache.

## Files to Create/Modify
- `apps/web/src/components/common/page-skeleton.tsx`
- `apps/web/src/components/common/__tests__/page-skeleton.test.tsx`
- `apps/web/src/app/(public)/loading.tsx`
- `apps/web/src/app/(public)/phim/loading.tsx`
- `apps/web/src/app/(public)/phim/[slug]/loading.tsx`
- `apps/web/src/app/(public)/lich-chieu/loading.tsx`
- `apps/web/src/app/(public)/rap/loading.tsx`
- `apps/web/src/app/(public)/rap/[code]/loading.tsx`
- `apps/web/src/app/(public)/dat-ve/loading.tsx`
- `apps/web/src/app/(public)/ve/loading.tsx`
- `apps/web/src/app/(public)/ve/[bookingCode]/loading.tsx`
- `apps/web/src/app/(public)/tai-khoan/loading.tsx`

## Verify
`pnpm --filter ./apps/web typecheck`, `lint`, `test` (thêm test: skeleton có `role=status`/`aria-busy`/nhãn; không chứa `data-scrub`; mỗi `loading.tsx` render được). Chạy dev/build thật: trang chủ → `/phim` → `/rap/<mã>` với API làm chậm (mock-api của `e2e/scrub` hoặc `sleep` giả), URL đổi + skeleton hiện ngay. `pnpm build` không chạy trong worktree (symlink node_modules): ghi rõ nếu bỏ qua, dispatcher build sau merge.

## Retry/Escalation
≥3 attempt fail → `architecture_review_needed`.

## Repro Verification
- Original: bấm link giữa các trang khách, trang cũ đứng yên tới khi dữ liệu về mới chuyển.
- Expected: URL đổi ngay, skeleton cùng bố cục, dữ liệu điền sau; lỗi vẫn hiện trạng thái lỗi.
- Actual after: (builder điền)
- Evidence: (builder điền)
- Status: (builder điền)
