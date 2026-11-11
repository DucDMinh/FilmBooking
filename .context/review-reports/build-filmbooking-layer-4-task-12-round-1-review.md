# Review Report: build-filmbooking-layer-4-task-12 (Round 1)

> **Agent:** reviewer  
> **Review Level:** STRICT  
> **Task:** `layer-4/task-12` — Web hệ thống rạp + chi tiết rạp (bản đồ Leaflet) + nút rạp yêu thích + sitemap/robots  
> **Worktree:** `E:\FilmBooking\.worktrees\layer-4__task-12`  
> **Verdict:** **FAIL**

---

## 1. Tổng quan & Phạm vi kiểm tra

Đã thực hiện **Adversarial Cross-Boundary Review** toàn diện cho `layer-4/task-12`, đối chiếu trực tiếp giữa:
1. `tasks/build-filmbooking/layer-4-task-12.md` (AC, DoD)
2. `SPECIFICATIONS.md` (R-16, R-31, R-34, R-35, R-36, R-37, R-46, NFR-08)
3. `.context/design-spec.md` (Màn 03 `/rap`, Màn 04 `/rap/[code]`)
4. Backend API thực tế:
   - `apps/api/src/modules/catalog/cinemas.controller.ts` & `cinemas.service.ts`
   - `apps/api/src/modules/profile/profile.controller.ts` & `profile.service.ts`
   - `packages/shared/src/schemas/catalog.ts` & `profile.ts`
5. 7 file triển khai trong worktree:
   - `apps/web/src/app/(public)/rap/page.tsx`
   - `apps/web/src/app/(public)/rap/[code]/page.tsx`
   - `apps/web/src/components/catalog/cinema-map.tsx`
   - `apps/web/src/components/catalog/favorite-button.tsx`
   - `apps/web/src/lib/seo/cinema-jsonld.ts`
   - `apps/web/src/app/sitemap.ts`
   - `apps/web/src/app/robots.ts`

---

## 2. Kết quả chạy Verify Commands (theo allowlist `project-config.md`)

- `pnpm -w typecheck`: **PASS** (shared, api, web không có type error)
- `pnpm -w lint`: **PASS** (eslint không có cảnh báo/lỗi)
- `pnpm -w test`: **PASS** (tuy nhiên 100% test web là test cũ từ Layer 2; **KHÔNG CÓ test nào cho Task 12**)
- `pnpm -w build`: **PASS** (Turbopack production build thành công)

> ⚔️ **Nguyên tắc Adversarial Review:** Tuyệt đối không duyệt PASS chỉ vì typecheck/lint/test xanh khi phát hiện defect nghiệp vụ và test giả định sai lệch (False-confidence).

---

## 3. Danh sách Defect chi tiết

### 🔴 Defect 1 (CRITICAL — Cross-Boundary Contract Mismatch): `cinema.id` không tồn tại trong `CinemaDto` khiến tính năng Rạp yêu thích (R-31 / AC) bị tê liệt hoàn toàn

- **Vị trí**:
  - `apps/web/src/app/(public)/rap/page.tsx:134-135, 158`
  - `apps/web/src/app/(public)/rap/[code]/page.tsx:139-140, 252`
  - `apps/web/src/components/catalog/favorite-button.tsx:63-66, 73`
- **Đối chiếu Backend & Shared Schema**:
  - `packages/shared/src/schemas/catalog.ts`: Interface `CinemaDto` **chỉ có `code: string`**, KHÔNG CÓ trường `id`.
  - `apps/api/src/modules/catalog/cinemas.service.ts:61-77`: Hàm `cinemaToDto(row: CinemaRow): CinemaDto` chủ động omit `id`. Cả `GET /cinemas` và `GET /cinemas/:code` đều trả về `CinemaDto` không có `id`.
  - `apps/api/src/modules/profile/profile.controller.ts:66-77`: API `PUT /me/favorites/:cinemaId` và `DELETE /me/favorites/:cinemaId` yêu cầu param `cinemaId` phải là **UUID** (`cinemaIdParamSchema = z.uuid()`). `GET /me/profile` cũng trả về `favorite_cinema_ids` gồm các UUID `cinemas.id`.
- **Cơ chế lỗi**:
  - Trong `rap/page.tsx`:
    ```ts
    const cinemaId = (cinema as { id?: string }).id ?? "";
    const isFav = Boolean(cinemaId && favoriteIds.includes(cinemaId));
    ```
  - Trong `rap/[code]/page.tsx`:
    ```ts
    const cinemaId = (cinema as { id?: string }).id ?? "";
    const isFavorite = Boolean(cinemaId && favoriteIds.includes(cinemaId));
    ```
  - Vì `cinema` không có trường `id`, `cinemaId` **luôn là `""`**.
  - Dẫn đến:
    1. Trạng thái `isFav` / `isFavorite` luôn là `false` kể cả khi rạp đã nằm trong danh sách yêu thích của người dùng.
    2. Khi người dùng đã đăng nhập nhấn vào nút `FavoriteButton`:
       ```ts
       if (!cinemaId) {
         toast.info("Không có mã định danh rạp để lưu yêu thích.");
         return;
       }
       ```
       Nút bấm chỉ hiển thị toast và thoát ra, **hoàn toàn không thể gọi API PUT/DELETE `/me/favorites/:cinemaId`**.
- **Hậu quả**: Tính năng Rạp yêu thích (R-31 / BR-PRO-06) không hoạt động trên toàn bộ giao diện Web.
- **Yêu cầu sửa**:
  1. Bổ sung trường `id: string` vào `CinemaDto` trong `packages/shared/src/schemas/catalog.ts`.
  2. Bổ sung `id: row.id` trong mapper `cinemaToDto` tại `apps/api/src/modules/catalog/cinemas.service.ts`.
  3. Xoá bỏ ép kiểu lén lút `(cinema as { id?: string }).id` trong cả 2 trang, dùng trực tiếp `cinema.id`.

---

### 🔴 Defect 2 (HIGH — Vi phạm Definition of Done): Không có Unit/Integration Test cho Task 12

- **Vị trí**: Thư mục `apps/web/src`
- **Đối chiếu DoD**:
  ```markdown
  ## DoD (Definition of Done)
  - [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
  - [ ] Tests added + pass
  ```
- **Thực tế**:
  - Không có bất kỳ test file nào được bổ sung cho 7 file thuộc Task 12.
  - Các test hiện có trong `apps/web` chỉ là test layout shell và proxy route từ Layer 2.
  - Cần có test kiểm chứng:
    1. `FavoriteButton`: kiểm tra hành vi chưa login thì `router.push('/dang-nhap?next=...')` (R-16), đã login thì gọi `apiFetch` PUT/DELETE, optimistic toggle và xử lý lỗi 401.
    2. `CinemaMap`: render fallback khi toạ độ `null` hoặc `NaN`, không throw lỗi SSR.
    3. `buildCinemaJsonLd`: kiểm tra output schema `MovieTheater`, toạ độ `geo`, `PostalAddress` và việc chống XSS.
    4. `robots` & `sitemap`: kiểm tra cấu trúc danh sách URL và các path bị chặn.

---

### 🟡 Defect 3 (MEDIUM — Security / Stored XSS): Render JSON-LD không escape ký tự `<`

- **Vị trí**: `apps/web/src/app/(public)/rap/[code]/page.tsx:168-171`
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
  />
  ```
- **Cơ chế lỗi**:
  - `JSON.stringify` không escape ký tự `<`.
  - Nếu tên rạp, địa chỉ, hoặc mô tả rạp do quản trị viên nhập chứa chuỗi `</script><script>...`, trình duyệt khi phân tích HTML sẽ đóng thẻ script JSON-LD sớm và thực thi mã script chèn thêm (Stored XSS).
- **Yêu cầu sửa**:
  - Escape ký tự `<` bằng cách:
    ```tsx
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
    }}
    ```
  - Hoặc tạo hàm helper `safeJsonLdStringify(jsonLd)`.

---

### 🟡 Defect 4 (MEDIUM — Acceptance Criteria & SEO/Security): `robots.ts` thiếu chặn các route nhạy cảm

- **Vị trí**: `apps/web/src/app/robots.ts:11-23`
- **Đối chiếu**:
  - AC Task 12: `chặn /admin, /staff, /pos, /tai-khoan.`
  - Hướng dẫn task: `chặn /dat-ve/, /tai-khoan/, /quan-tri/, /pos/, /checkin/, /api/`
- **Thực tế**:
  - Hiện tại chỉ khai báo:
    ```ts
    const disallowedPaths = [
      "/admin", "/admin/*",
      "/staff", "/staff/*",
      "/pos", "/pos/*",
      "/tai-khoan", "/tai-khoan/*",
      "/api", "/api/*",
    ];
    ```
  - **Thiếu `/dat-ve` / `/dat-ve/*`**: Luồng đặt vé có cơ chế giữ ghế (hold seats) có thời hạn và tạo session đơn hàng, không được để bot và AI crawler truy cập gây khóa ghế ảo hoặc quá tải hệ thống.
  - **Thiếu `/checkin` / `/checkin/*`**: Endpoint soát vé nhân viên.
- **Yêu cầu sửa**:
  Bổ sung `"/dat-ve"`, `"/dat-ve/*"`, `"/checkin"`, `"/checkin/*"` vào mảng `disallowedPaths` cho cả nhóm bot AI lẫn bot chung (`*`).

---

### 🔵 Defect 5 (LOW / UI Spec Conformance): Màn 03 (`/rap`) thiếu khối MapView danh sách rạp theo Design Spec

- **Vị trí**: `apps/web/src/app/(public)/rap/page.tsx`
- **Đối chiếu**: `.context/design-spec.md` mục `03 — Hệ thống rạp /rap`:
  - Desktop: Giao diện 2 cột gồm bên trái là `MapView` (hiển thị marker tất cả các rạp), bên phải là danh sách card rạp theo tỉnh/thành.
  - Mobile: Nút "Xem bản đồ" mở bản đồ dạng Sheet.
- **Thực tế**:
  - Trang `/rap` hiện tại mới dựng danh sách dạng lưới Card + bộ lọc chip tỉnh thành, chưa tích hợp MapView tổng quan.
  - *Ghi chú:* Đây là UI feature gap so với Design Spec, tuy nhiên bản đồ tại từng rạp (`/rap/[code]`) đã hoạt động tốt. Builder nên ghi nhận để hoàn thiện hoặc bổ sung `MapView` tổng cho trang `/rap`.

---

## 4. Bảng tổng kết & Điểm đánh giá

| Tiêu chí | Trạng thái | Ghi chú |
|---|---|---|
| **SSR trang rạp & chi tiết rạp** | PASS | Render SSR chuẩn, lấy dữ liệu qua `apiFetch` |
| **Bản đồ Leaflet client-only (không SSR crash)** | PASS | `useEffect` + dynamic `import('leaflet')`, có fallback khi lỗi/thiếu toạ độ |
| **Bảo vệ dữ liệu cá nhân (NFR-08)** | PASS | Tuyệt đối không gọi `navigator.geolocation`, không lưu toạ độ người dùng |
| **Chuyển hướng đăng nhập (R-16)** | PASS | Chưa login bấm nút yêu thích chuyển `/dang-nhap?next=...` |
| **Logic Yêu thích rạp (R-31)** | **FAIL** | `cinemaId` rỗng do lệch schema `CinemaDto`, không gọi được API thêm/bỏ yêu thích |
| **JSON-LD MovieTheater (R-46)** | **FAIL** | Thiếu chống XSS (`\u003c`) trong thẻ script |
| **Sitemap & Robots (ai-friendly-web)** | **FAIL** | `robots.ts` thiếu chặn `/dat-ve/` và `/checkin/` |
| **Definition of Done (DoD: Tests added)** | **FAIL** | 0 test mới được viết cho Task 12 |

---

## 5. Kết luận & Hướng dẫn cho Builder

Task **chưa đạt yêu cầu** để hoàn thành do có defect nghiêm trọng làm đứt gãy luồng người dùng (Defect 1) và vi phạm cổng chất lượng (Defect 2, 3, 4).

**Builder cần thực hiện các bước sau để vượt qua vòng Review:**
1. Thêm `id: string` vào `CinemaDto` (`packages/shared/src/schemas/catalog.ts`) và map `id: row.id` trong `apps/api/src/modules/catalog/cinemas.service.ts`.
2. Cập nhật `rap/page.tsx` và `rap/[code]/page.tsx` sử dụng trực tiếp `cinema.id` thay vì ép kiểu lén lút.
3. Thêm escape `\u003c` cho JSON-LD tại `rap/[code]/page.tsx`.
4. Bổ sung `"/dat-ve"`, `"/dat-ve/*"`, `"/checkin"`, `"/checkin/*"` vào `robots.ts`.
5. Viết unit test đầy đủ (tối thiểu cho `FavoriteButton`, `buildCinemaJsonLd`, `robots`, `sitemap`).
