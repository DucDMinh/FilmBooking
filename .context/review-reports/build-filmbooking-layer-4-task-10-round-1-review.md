# Báo cáo Review Độc lập: layer-4 / task-10 (Round 1)

> **Agent:** reviewer  
> **Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-10`  
> **Task file:** `tasks/build-filmbooking/layer-4-task-10.md`  
> **Review level:** `NORMAL`  
> **Ngày review:** 2026-11-11  
> **Trạng thái:** ✅ **NORMAL PASS**

---

## 1. Tổng quan & Phạm vi kiểm tra (Scope Audit)

Task 10 của Layer 4 đảm nhiệm xây dựng giao diện công khai cho:
- Trang chủ `/`: hiển thị hero banner, tab Phim đang chiếu / Phim sắp chiếu theo tỉnh/thành, danh sách rạp tại khu vực.
- Trang danh sách & tìm kiếm phim `/phim`: bộ lọc theo từ khoá, thể loại, độ tuổi, trạng thái, và danh sách kết quả.
- Component thẻ phim `MovieCard`: poster 2:3 với nhãn tuổi `AgeBadge`, trạng thái chiếu, nút "Đặt vé" hoặc ngày khởi chiếu.
- Component bộ lọc phim `MovieFilters`: đồng bộ query string hai chiều (hỗ trợ back/forward navigation).
- Component hộp thoại chọn khu vực `ProvincePickerDialog`: tự động mở khi chưa có cookie, ghi nhớ lựa chọn vào cookie `fb_province`.
- Test tự động `home.test.tsx`: bao phủ toàn bộ các màn hình và component trên.

### Danh sách file trong worktree:
1. `apps/web/src/app/(public)/page.tsx` (269 dòng — ≤ 300 dòng)
2. `apps/web/src/app/(public)/phim/page.tsx` (98 dòng — ≤ 300 dòng)
3. `apps/web/src/components/catalog/movie-card.tsx` (156 dòng — ≤ 300 dòng)
4. `apps/web/src/components/catalog/movie-filters.tsx` (234 dòng — ≤ 300 dòng)
5. `apps/web/src/components/catalog/province-picker-dialog.tsx` (135 dòng — ≤ 300 dòng)
6. `apps/web/src/components/catalog/__tests__/home.test.tsx` (332 dòng — bộ test suite)

*Kiểm tra surgical changes*: `git status` trong worktree chỉ chứa đúng 6 file được giao theo task scope, không có drive-by refactor hay sửa đổi ngoài lề.

---

## 2. Đối chiếu chéo Frontend ↔ Backend API & Shared Schema (Cross-Boundary Audit)

Reviewer đã đối chiếu trực tiếp giữa mã nguồn Frontend trong worktree với Backend NestJS (`apps/api/src/modules/catalog/movies.controller.ts`, `cinemas.controller.ts`, `movies.service.ts`) và Shared Schemas (`packages/shared/src/schemas/catalog.ts`):

1. **Endpoint `GET /home?province=...`**:
   - Frontend (`page.tsx:47`): gọi `apiFetch<HomeDto>("/home?province=...")`.
   - Backend (`movies.controller.ts:23-26`): `@Get("home")` xác thực qua `homeQuerySchema` (nhận `province?: string`), trả về `HomeDto` gồm `banners`, `nowShowing`, `comingSoon`.
   - Cấu trúc dữ liệu JSON hoàn toàn đồng nhất giữa client và server.

2. **Endpoint `GET /provinces` & `GET /cinemas?province=...`**:
   - Frontend (`page.tsx:52-53`): gọi `/provinces` lấy danh sách tỉnh thành và `/cinemas?province=...` lấy danh sách rạp theo khu vực.
   - Backend (`cinemas.controller.ts:27-36`): cung cấp endpoint công khai trả về mảng `ProvinceDto[]` và `CinemaDto[]`.
   - Các trường `code`, `name`, `address`, `hotline`, `amenities` hiển thị trên thẻ rạp khớp chính xác với DTO backend.

3. **Endpoint `GET /movies?...`**:
   - Frontend (`phim/page.tsx:49`): gửi các query params `q`, `genre`, `age`, `status`, `province`.
   - Backend (`movies.controller.ts:29-32`): `@Get("movies")` kiểm tra qua `listMoviesQuerySchema`:
     - `q`: string tìm kiếm tên phim (Backend tự động sanitize cú pháp PostgREST qua `sanitizeSearchTerm`).
     - `genre`: chuỗi thể loại (Backend lọc mảng qua `.contains("genres", [filters.genre])`).
     - `age`: enum độ tuổi (`P`, `K`, `T13`, `T16`, `T18`). `MovieFilters` đồng thời truyền cả `age` và `ageRating` trên URL params, `phim/page.tsx` parse và chuyển `age` chuẩn cho Backend API.
     - `status`: enum `now_showing` | `coming_soon`.
   - Sự tương thích giữa client và server đạt 100%.

---

## 3. Kiểm tra Acceptance Criteria & Requirements

| Tiêu chí / Requirement | Hiện trạng kiểm tra | Đánh giá |
|---|---|---|
| **AC-1**: SSR trang chủ và `/phim` (NFR-13); lọc phản ánh lên URL, back/forward hoạt động | `page.tsx` và `phim/page.tsx` là async Server Components, thực hiện fetch dữ liệu phía server song song với `Promise.all`. Bộ lọc `MovieFilters` đẩy state lên URL searchParams và lắng nghe thay đổi qua `useEffect` để hỗ trợ back/forward. | **ĐẠT** |
| **AC-2**: Lần đầu không có cookie tỉnh → dialog chọn tỉnh; chọn xong lưu cookie, không hỏi lại (R-35) | `ProvincePickerDialog` kiểm tra `fb_province` từ `document.cookie` (client) và `cookies()` (SSR). Cookie lưu với `max-age=31536000` (1 năm), `SameSite=Lax`. Chọn xong cập nhật cookie và refresh/callback, không mở lại trong các lần sau. | **ĐẠT** |
| **AC-3**: Empty state khi không có phim khớp; skeleton khi tải | Sử dụng component `EmptyState` chuẩn mực cho cả tab phim rỗng và cụm rạp rỗng ở trang chủ, cũng như khi tìm kiếm không ra kết quả ở `/phim` kèm nút xoá bộ lọc. Graceful fallback trong SSR bằng `.catch()` trả về mảng rỗng thay vì làm crash trang. | **ĐẠT** |
| **AC-4**: Responsive 360px; card có alt poster + AgeBadge | Lưới thích ứng linh hoạt: 2 cột trên mobile (≥ 360px) → 3-4 cột trên tablet → 5 cột trên desktop. Poster ảnh có alt rõ ràng: `alt={`Poster phim ${movie.titleVi}`}`. Thẻ tuổi `AgeBadge` hiển thị đúng quy chuẩn. | **ĐẠT** |
| **R-45**: Phim sắp chiếu chưa có suất | `MovieCard` kiểm tra `isComingSoon = movie.availability === "coming_soon"`: hiển thị dải thông tin "Khởi chiếu dd/MM/yyyy" và **ẩn hoàn toàn nút Đặt vé**, chỉ có link xem chi tiết. | **ĐẠT** |
| **R-36 & D9**: Không xin quyền định vị thiết bị | Không có bất kỳ lệnh gọi `navigator.geolocation` nào. Khu vực được xác định thuần tuý qua lựa chọn của người dùng trong `ProvincePickerDialog` hoặc cookie. | **ĐẠT** |

---

## 4. Chất lượng mã nguồn & Design Tokens

- **Design Tokens**: Tuân thủ nghiêm ngặt bảng token CINEMO dark-cinema trong `skills/react-nodejs/design-tokens.md`:
  - Nền trang và bề mặt: `bg-surface`, `bg-surface-elevated`, `bg-surface-input`, `border-border-subtle`, `bg-chrome`.
  - Màu chữ và phân cấp: `text-fg`, `text-fg-secondary`, `text-fg-muted`, `text-brand`, `text-warning`, `text-success`.
  - Nút bấm và hành động: CTA chính dùng `variant="gradient"` (coral-to-crimson), nút phụ dùng `variant="secondary"`, nút viền dùng `variant="outline"`. Không sử dụng màu hex thô (hardcoded hex).
- **Trợ năng (Accessibility - a11y)**:
  - Sử dụng các thẻ ngữ nghĩa: `<article>`, `<section>`, `<nav>`, `<form role="search">`, `role="tablist"`, `role="tab"`.
  - Đầy đủ thuộc tính `aria-label`, `aria-selected`, `aria-hidden` cho các icon Lucide trang trí.
  - Vùng chạm (touch target) đảm bảo tối thiểu 44px (`min-h-11`, `h-12`) cho mobile controls.
  - Trạng thái focus rõ ràng với `focus-visible:ring-2 focus-visible:ring-ring`.

---

## 5. Kết quả kiểm tra lệnh (Automated Verification)

Chạy trực tiếp trong worktree `E:\FilmBooking\.worktrees\layer-4__task-10`:

1. **Vitest Unit/Integration Tests**:
   - Lệnh: `pnpm --filter web test home.test.tsx`
   - Kết quả: **17/17 tests PASS** (MovieCard: 6 tests, ProvincePickerDialog: 3 tests, MovieFilters: 4 tests, HomePage SSR: 2 tests, MoviesPage SSR: 2 tests).
   - Kiểm tra toàn bộ package web: **71/71 tests PASS** (5 test files).
2. **TypeScript Typecheck**:
   - Lệnh: `pnpm --filter web typecheck`
   - Kết quả: **Exit code 0**, không có lỗi type nào.
3. **ESLint**:
   - Lệnh: `pnpm --filter web lint`
   - Kết quả: **Exit code 0**, code sạch theo quy chuẩn linter.
4. **Next.js Production Build**:
   - Lệnh: `pnpm --filter web build`
   - Kết quả: **Exit code 0**, build thành công toàn bộ static pages và dynamic routes (`/`, `/phim`).
5. **AI Gates (Oxlint / Aislop / OCR)**:
   - Các công cụ không có sẵn trong môi trường Windows hiện tại (`skip, not configured/installed`), đánh giá chất lượng được reviewer thực hiện trực tiếp trên từng dòng code và không phát hiện anti-pattern nào.

---

## 6. Kết luận & Phán quyết

Implementation của Task 10 đạt tiêu chuẩn rất cao:
- Bám sát thiết kế CINEMO và đặc tả `SPECIFICATIONS.md`.
- Giao diện trau chuốt, responsive tốt, a11y đầy đủ.
- Cross-boundary giữa Frontend và Backend API đồng bộ hoàn hảo.
- Bộ test suite viết chi tiết và kiểm tra sâu các trường hợp biên.

**Phán quyết:** ✅ **NORMAL PASS**  
Cho phép merge worktree và chuyển sang bước tiếp theo trong quy trình phát triển.