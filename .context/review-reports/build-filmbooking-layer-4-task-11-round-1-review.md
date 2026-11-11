# Review Report: build-filmbooking-layer-4-task-11 (Round 1)

**Reviewer:** Adversarial Reviewer (pro model)  
**Date:** 2026-11-11  
**Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-11`  
**Task:** `tasks/build-filmbooking/layer-4-task-11.md` (Layer 4, Task 11)  
**Scope:** Web chi tiết phim (`/phim/[slug]`), lịch chiếu (`/lich-chieu`), stepper đặt vé (`BookingStepper`), schema SEO JSON-LD (`movie-jsonld.ts`)  
**Review Level:** STRICT

---

## 1. Executive Summary

| Tiêu chí | Đánh giá | Trạng thái |
|---|---|:---:|
| Requirements coverage (R-42, R-44, R-45, R-46, R-57, R-67) | Đầy đủ mọi tiêu chí, đúng hành vi mong đợi | **PASS** |
| Cross-Boundary Schema & API Audit (Backend ↔ Frontend) | Khớp chính xác `MoviesController`, `CinemasController`, `MovieScheduleDto` | **PASS** |
| Security & XSS Audit (JSON-LD sanitization, rel=noopener) | Thoát ký tự `<` thành `\u003c` trong `<script type="application/ld+json">` | **PASS** |
| A11y & Touch targets (WCAG 2.1 AA) | `aria-current="step"`, `aria-pressed`, chip ≥ 44×44px | **PASS** |
| Test suite & False-confidence Audit | 9 test case chi tiết cho Stepper, Schedule, SEO, múi giờ VN, cutoff 15' | **PASS** |
| Verify commands (`test`, `lint`, `typecheck`, `build`) | Toàn bộ 4 lệnh pass không có cảnh báo hay lỗi | **PASS** |

**Verdict:** **STRICT PASS**

---

## 2. Requirements & Specification Traceability

| Requirement | Mô tả | Minh chứng trong Implementation |
|---|---|---|
| **R-42** | Nhãn phân loại độ tuổi (P, K, T13, T16, T18) | Hiển thị `AgeBadge` tại poster góc trên trái, badge độ tuổi cạnh tiêu đề phim trên cả `/phim/[slug]` và `/lich-chieu`. |
| **R-44** | Lịch chiếu trên chi tiết phim (dải 7 ngày) | `ShowtimeSchedule` sinh 7 ngày liên tiếp qua `generateNext7Days` từ ngày hiện tại; lọc theo ngày được chọn; nhóm theo rạp và theo định dạng (2D/3D • Phụ đề/Lồng tiếng). |
| **R-45** | Phim sắp chiếu chưa có suất | Xử lý cả ở cấp độ trang (ẩn CTA "Chọn suất chiếu", hiển thị thông báo ngày khởi chiếu) và trong `ShowtimeSchedule` (render `EmptyState` "Sắp chiếu — Lịch chiếu sẽ được cập nhật sớm", không có link đặt vé). |
| **R-46** | SEO SSR + JSON-LD `Movie` & `ScreeningEvent` | `generateMetadata` tạo đầy đủ `title`, `description`, `openGraph` type `video.movie`. `buildMovieJsonLd` sinh cấu trúc Schema.org `Movie` kèm danh sách `ScreeningEvent` (bỏ qua suất `CANCELLED`/`CLOSED`). |
| **R-57** | Hiển thị giờ Việt Nam (`Asia/Ho_Chi_Minh`) | Dùng hàm chuẩn `toVnParts` từ `@filmbooking/shared` cho `getVnDateString`, `formatVnTime`, `generateNext7Days`. |
| **R-67** | Đóng bán online 15 phút trước giờ chiếu | Hàm `isShowtimeOnlineClosed` tính `cutoffTime = startsAt - cutoffMinutes * 60 * 1000`. Suất đã qua mốc bị vô hiệu hoá, hiển thị nhãn `Mua tại quầy` màu warning, không có link đặt vé. |

---

## 3. Adversarial Deep Dive

### 3.1 Cross-Boundary Frontend ↔ Backend Catalog Audit
- **Endpoint `GET /movies/:slug`:**
  - Backend controller: `MoviesController.detail(slug, query)` trả về `MovieScheduleDto` gồm `{ movie: MovieDto, schedule: Array<{ cinema: { code, name }, showtimes: ShowtimeDto[] }> }`.
  - Frontend: `apps/web/src/app/(public)/phim/[slug]/page.tsx` gọi `apiFetch<MovieScheduleDto>('/movies/${slug}')` qua query params `date` và `province`. Interface khai báo ở frontend hoàn toàn tương thích và đồng bộ với backend.
  - Khi `apiFetch` trả lỗi 404 (`NOT_FOUND`), trang gọi `notFound()` chuyển sang trang 404 của Next.js một cách chuẩn mực.
- **Endpoint `GET /cinemas/:code`:**
  - Ở trang `/lich-chieu/page.tsx`, khi chọn lọc theo rạp (`selectedCinemaCode`), trang gọi `apiFetch<CinemaDetailDto>('/cinemas/${code}?date=...')` và gom nhóm các suất chiếu theo phim để render `ShowtimeSchedule`.

### 3.2 XSS Sanitization & Injection Defense
- Trong `apps/web/src/lib/seo/movie-jsonld.ts`:
  ```ts
  export function serializeJsonLd(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
  }
  ```
  Thoát ký tự `<` thành `\u003c` ngăn chặn triệt để việc bẻ gãy thẻ script (`</script><script>alert(1)</script>`) khi chèn qua `dangerouslySetInnerHTML`. Test case `serializeJsonLd thoát ký tự < thành \u003c an toàn chống XSS` đã chứng minh điều này.
- Các link ngoại bộ (trailer YouTube): sử dụng `rel="noopener noreferrer"` và `target="_blank"`.

### 3.3 A11y & Touch Targets Audit (WCAG 2.1 AA)
- `BookingStepper`:
  - `nav` có `aria-label="Tiến trình đặt vé: Bước 1 trên 4: Chọn suất"`.
  - Phần tử bước hiện tại có `aria-current="step"`.
  - Các bước đã qua có icon `Check` với `aria-hidden="true"`.
- `ShowtimeSchedule`:
  - Nút chọn ngày có `aria-pressed={isSelected}` và vùng bấm ≥ 88×44px.
  - Chip suất chiếu mở bán: `min-h-[44px] min-w-[76px]` kèm `aria-label="Đặt vé suất 15:00 đến 17:18"`.
  - Chip suất chiếu đóng bán: `min-h-[44px]` kèm `aria-label="Suất chiếu ...: Đã đóng bán online, vui lòng mua tại quầy"`.
- Tương phản màu sắc: dùng tokens chuẩn (`text-brand`, `bg-brand-soft`, `text-fg`, `text-fg-secondary`, `text-fg-muted`, `bg-surface`, `bg-surface-control`).

### 3.4 False-Confidence & Test Suite Audit
- File `apps/web/src/components/catalog/__tests__/schedule.test.tsx` gồm 9 tests:
  - Unit test `movie-jsonld.ts` (3 tests): kiểm tra Schema.org Movie structure, ScreeningEvent filtering (bỏ `CANCELLED`), XSS sanitization.
  - Unit test `booking-stepper.tsx` (2 tests): kiểm tra `aria-current="step"`, 4 bước hiển thị đầy đủ.
  - Integration/Unit test `showtime-schedule.tsx` (4 tests): kiểm tra múi giờ VN `formatVnTime` (03:30Z -> 10:30 VN), `isShowtimeOnlineClosed` với các mốc 20' và 14', render link đặt vé với suất hợp lệ và nhãn "Mua tại quầy" cho suất quá hạn, empty state cho phim sắp chiếu R-45.
- Toàn bộ test chạy trên Vitest và `@testing-library/react` render cây DOM thật, không dùng mock giả tạo.

---

## 4. Check Commands Execution Results

Các lệnh được chạy trực tiếp trong worktree `E:\FilmBooking\.worktrees\layer-4__task-11`:

1. **Unit Test (`pnpm --filter web test`):**
   ```
   ✓ src/app/api/proxy/[...path]/__tests__/route.test.ts (10 tests)
   ✓ src/lib/api/__tests__/client.test.ts (14 tests)
   ✓ src/app/__tests__/layout.test.tsx (10 tests)
   ✓ src/components/catalog/__tests__/schedule.test.tsx (9 tests)
   ✓ src/components/common/__tests__/common.test.tsx (20 tests)
   Test Files: 5 passed (5)
   Tests: 63 passed (63)
   ```
2. **Typecheck (`pnpm typecheck`):**
   ```
   packages/shared typecheck: Done
   apps/api typecheck: Done
   apps/web typecheck: Done
   Exit code: 0
   ```
3. **Linter (`pnpm lint`):**
   ```
   packages/shared lint: Done
   apps/web lint: Done
   apps/api lint: Done
   Exit code: 0
   ```
4. **Build (`pnpm build`):**
   ```
   apps/api build: Built 48 files -> apps\api\dist (Done)
   apps/web build:
     Route (app)
     ├ ƒ /lich-chieu
     └ ƒ /phim/[slug]
   Compiled successfully in Turbopack, static page generation 7/7 complete.
   Exit code: 0
   ```

---

## 5. Scope & Surgical Diff Compliance

Tất cả các file được tạo mới thuộc phạm vi quy định của Task 11:
- `apps/web/src/app/(public)/phim/[slug]/page.tsx` (231 lines ≤ 300)
- `apps/web/src/app/(public)/lich-chieu/page.tsx` (249 lines ≤ 300)
- `apps/web/src/components/catalog/showtime-schedule.tsx` (285 lines ≤ 300)
- `apps/web/src/components/booking/booking-stepper.tsx` (77 lines ≤ 300)
- `apps/web/src/lib/seo/movie-jsonld.ts` (110 lines ≤ 300)
- `apps/web/src/components/catalog/__tests__/schedule.test.tsx` (224 lines ≤ 300)

Không có file nào ngoài danh sách bị chỉnh sửa. Không có drive-by refactoring hay AI-slop code.

---

## 6. Kết luận

Task `layer-4/task-11` đạt chuẩn chất lượng cao, tuân thủ nghiêm ngặt design-spec CINEMO, specifications BRD, an toàn bảo mật XSS, và đã vượt qua tất cả các cổng kiểm tra tự động.

**Verdict:** **STRICT PASS**
