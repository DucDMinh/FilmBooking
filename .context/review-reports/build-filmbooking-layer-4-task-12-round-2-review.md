# Review Report: build-filmbooking-layer-4-task-12 (Round 2)

> **Agent:** reviewer  
> **Review Level:** STRICT  
> **Task:** `layer-4/task-12` — Web hệ thống rạp + chi tiết rạp (bản đồ Leaflet) + nút rạp yêu thích + sitemap/robots  
> **Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-12`  
> **Verdict:** **STRICT PASS**

---

## 1. Tổng quan & Mục tiêu Review Round 2

Thực hiện **Adversarial Cross-Boundary Review (Round 2)** đối chiếu toàn diện giữa:
1. Báo cáo đánh giá Round 1: `.context/review-reports/build-filmbooking-layer-4-task-12-round-1-review.md` (5 defects).
2. Database Schema thật: `supabase/migrations/20261111010000_core_identity_chain.sql` (bảng `cinemas`, `favorite_cinemas`).
3. Backend Service & Shared Schema:
   - `packages/shared/src/schemas/catalog.ts`
   - `apps/api/src/modules/catalog/cinemas.service.ts`
   - `apps/api/src/modules/profile/profile.controller.ts`
4. Triển khai Web & Test suite:
   - `apps/web/src/app/(public)/rap/page.tsx`
   - `apps/web/src/app/(public)/rap/[code]/page.tsx`
   - `apps/web/src/lib/seo/cinema-jsonld.ts`
   - `apps/web/src/app/robots.ts`
   - `apps/web/src/components/catalog/__tests__/cinemas.test.tsx`
   - `apps/api/test/catalog.e2e-spec.ts`

---

## 2. Kết quả Verify Commands (Allowlist `project-config.md`)

Chạy trực tiếp trong worktree `E:\FilmBooking\.worktrees\layer-4__task-12`:
- `pnpm test`: **PASS** (157 api tests, 63 web tests, 14 shared tests — toàn bộ 234 tests xanh)
- `pnpm typecheck`: **PASS** (shared, api, web hoàn toàn sạch type)
- `pnpm lint`: **PASS** (eslint hoàn toàn sạch lỗi)
- `pnpm build`: **PASS** (Next.js 16 Turbopack production build thành công, bao gồm dynamic `/rap`, `/rap/[code]` và static `/robots.txt`, `/sitemap.xml`)

---

## 3. Xác minh xử lý các Defect từ Round 1

### ✅ Defect 1 (CRITICAL — Cross-Boundary Contract Mismatch): `cinema.id` trong `CinemaDto`
- **Tình trạng:** **ĐÃ SỬA TRIỆT ĐỂ**
- **Bằng chứng:**
  - `packages/shared/src/schemas/catalog.ts:153-169`: `CinemaDto` đã bổ sung trường `id?: string;`.
  - `apps/api/src/modules/catalog/cinemas.service.ts:61-78`: mapper `cinemaToDto` đã gán `id: row.id` khớp với `CINEMA_COLUMNS` (`id, code, name...`).
  - `apps/api/test/catalog.e2e-spec.ts:209`: đã có test e2e xác nhận API trả về `expect(response.body[0]).toHaveProperty("id", HN01)`.
  - `apps/web/src/app/(public)/rap/page.tsx:139`: sử dụng `const cinemaId = cinema.id ?? "";` trực tiếp từ DTO, xoá bỏ hoàn toàn ép kiểu `as`.
  - `apps/web/src/app/(public)/rap/[code]/page.tsx:139`: sử dụng `const cinemaId = cinema.id ?? "";` trực tiếp, không còn ép kiểu lén lút.
  - Tính năng Rạp yêu thích (R-31 / BR-PRO-06) hoạt động liền mạch từ Web tới Backend `PUT /me/favorites/:cinemaId`.

### ✅ Defect 2 (HIGH — Vi phạm Definition of Done): Bổ sung Unit/Integration Test cho Task 12
- **Tình trạng:** **ĐÃ SỬA TRIỆT ĐỂ**
- **Bằng chứng:**
  - Đã thêm file test toàn diện: `apps/web/src/components/catalog/__tests__/cinemas.test.tsx` (9 tests, 269 dòng).
  - Kiểm thử đầy đủ các nhánh nghiệp vụ:
    1. `FavoriteButton` khi chưa đăng nhập: bấm nút chuyển hướng sang `/dang-nhap?next=...` (R-16).
    2. `FavoriteButton` khi đã đăng nhập: toggle trạng thái và gọi đúng API `PUT /me/favorites/:cinemaId` / `DELETE /me/favorites/:cinemaId`.
    3. `FavoriteButton` xử lý lỗi phiên hết hạn (401) chuyển hướng về `/dang-nhap`.
    4. `CinemaMap` render fallback an toàn khi toạ độ `null` hoặc không hợp lệ, không gây lỗi SSR.
    5. `buildCinemaJsonLd` sinh đúng cấu trúc Schema.org `MovieTheater`, toạ độ `geo`, `PostalAddress`.
    6. `serializeCinemaJsonLd` escape ký tự `<` thành `\u003c` chống Stored XSS.
    7. `robots()` chặn đầy đủ endpoint nhạy cảm và cho phép bot AI.
    8. `sitemap()` trả về danh sách các URL tĩnh công khai.

### ✅ Defect 3 (MEDIUM — Security / Stored XSS): Escape JSON-LD
- **Tình trạng:** **ĐÃ SỬA TRIỆT ĐỂ**
- **Bằng chứng:**
  - `apps/web/src/lib/seo/cinema-jsonld.ts:54-56`: tạo helper `serializeCinemaJsonLd` chuyển đổi `<` thành `\u003c`.
  - `apps/web/src/app/(public)/rap/[code]/page.tsx:168-171`: sử dụng `serializeCinemaJsonLd(jsonLd)` trong thẻ `<script type="application/ld+json">`.
  - Unit test `cinemas.test.tsx:209-226` xác minh chuỗi độc hại `</script><script>alert('xss')</script>` được vô hiệu hoá hoàn toàn.

### ✅ Defect 4 (MEDIUM — Acceptance Criteria & SEO/Security): Chặn route nhạy cảm trong `robots.ts`
- **Tình trạng:** **ĐÃ SỬA TRIỆT ĐỂ**
- **Bằng chứng:**
  - `apps/web/src/app/robots.ts:11-28`: mảng `disallowedPaths` đã bổ sung đầy đủ:
    - `"/dat-ve"`, `"/dat-ve/*"`
    - `"/checkin"`, `"/checkin/*"`
    - `"/quan-tri"`, `"/quan-tri/*"`
    - `"/admin"`, `"/staff"`, `"/pos"`, `"/tai-khoan"`, `"/api"`
  - Quy tắc áp dụng cho cả User-Agent `*` và các AI bot (`GPTBot`, `ClaudeBot`, `PerplexityBot`...).

### ✅ Defect 5 (LOW / UI Spec Conformance): Khối MapView tại trang `/rap`
- **Tình trạng:** **ĐÃ SỬA TRIỆT ĐỂ**
- **Bằng chứng:**
  - `apps/web/src/app/(public)/rap/page.tsx:238-255`: đã tích hợp component `CinemaMap` hiển thị vị trí rạp đại diện trực quan theo OpenStreetMap.
  - File giữ cấu trúc tinh gọn với 258 dòng (tuân thủ giới hạn <= 300 dòng).

---

## 4. Đánh giá chất lượng nâng cao (Adversarial Gates)

1. **Security & Privacy (NFR-08):**
   - Không sử dụng Geolocation API của trình duyệt, không thu thập toạ độ cá nhân của người dùng.
   - Cơ chế escape JSON-LD ngăn chặn triệt để nguy cơ Stored XSS từ dữ liệu rạp do Admin nhập.
2. **Surgical Diff & Code Quality:**
   - Các thay đổi bám sát 100% phạm vi task, không phát sinh drive-by refactoring.
   - Code viết rõ ràng, type-safe, không dùng `any` hay ép kiểu mù quáng.
3. **Cross-Boundary Integrity:**
   - Cột `id` của bảng `cinemas` (Postgres UUID) được phản ánh chuẩn xác từ DB -> Supabase Client -> NestJS DTO -> Shared Type -> Next.js Frontend -> User Action API (`/me/favorites/:cinemaId`).

---

## 5. Kết luận

Toàn bộ 5 defect phát hiện ở Round 1 đã được Builder khắc phục hoàn chỉnh, chuẩn xác và có bộ test tự động kiểm chứng đầy đủ. Mã nguồn đáp ứng hoàn hảo các tiêu chí kỹ thuật và nghiệp vụ.

**Verdict:** **STRICT PASS**
