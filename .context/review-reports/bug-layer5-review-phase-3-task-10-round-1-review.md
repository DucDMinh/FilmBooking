# Independent Review Report — bug/layer5-review · phase-3-task-10 (Round 1)

**Reviewer:** Adversarial Reviewer (Independent)  
**Agent:** reviewer  
**Date:** 2026-11-13  
**Review Level:** NORMAL  
**Target:** `tasks/bug-layer5-review/phase-3-task-10.md`  
**Verdict:** NORMAL PASS  

---

## 1. Executive Summary

Báo cáo nghiệm thu độc lập cho **Phase 3 - Task 10** (`Web Admin Shell, Cinema Scope & Navigation`), xử lý triệt để 3 lỗi nghiêm trọng (MAJOR) đã ghi nhận tại `.context/review-reports/independent-review-layer-5-G-web-account-admin.md` (mục G/M13-1, G/M13-2, G/M13-3):
- **G/M13-1**: Phạm vi rạp (`?cinema=`) bị mất khi chuyển trang trong sidebar `/admin/*`.
- **G/M13-2**: Bộ chọn rạp chỉ hiển thị rạp `OPEN` do lấy từ `GET /cinemas` công khai; thiếu rạp `TEMP_CLOSED`, `COMING_SOON`, `CLOSED` cho Admin và nhân sự rạp non-OPEN bị hiển thị ID thô `Rạp 1a2b3c4d`.
- **G/M13-3**: `nav-config.ts` lệch ma trận phân quyền SPEC §5.3 và design-spec §3 (Manager thiếu Voucher xem-chỉ-đọc, thiếu Cấu hình rạp, thiếu mục Phòng & sơ đồ ghế).

Toàn bộ 3 mục đã được khắc phục chuẩn xác, kiểm chứng đối chiếu chéo cơ sở dữ liệu Supabase, kiểm tra tĩnh và kiểm thử tự động 100% đạt chuẩn.

---

## 2. Chi tiết đánh giá theo tiêu chí

### 2.1. G/M13-1 — Duy trì query param `?cinema=` khi điều hướng sidebar
- **Hiện thực:** Hàm `formatNavHref` trong `apps/web/src/components/admin/admin-sidebar.tsx` kiểm tra:
  - Bỏ qua link ngoài (`isExternal: true` hoặc không bắt đầu bằng `/admin`).
  - Khi có `cinemaParam`, tự động nối `?cinema=...` (hoặc `&cinema=...` nếu href đã có query khác) với giá trị được mã hóa bằng `encodeURIComponent`.
  - Áp dụng đồng bộ cho cả desktop `AdminSidebar` và mobile `AdminMobileNav` qua component dùng chung `NavList`.
- **An toàn điều hướng & A11y:**
  - Link soát vé `/staff/soat-ve` (`external: true`) không bị gán nhầm query quản trị.
  - `NavList` nằm dưới `AdminShell` được bọc bởi `<Suspense>` trong `layout.tsx`, ngăn ngừa hiện tượng Next.js SSR de-opt khi đọc `useSearchParams()`.
  - Link giữ nguyên `aria-current="page"` dựa trên `isNavItemActive(item.href, pathname)`, không bị ảnh hưởng bởi query string.
- **Kết quả:** ĐẠT.

### 2.2. G/M13-2 — Hiển thị rạp non-OPEN và giải quyết tên thật cho nhân sự
- **Hiện thực:**
  - Tạo mới `CinemaSelector` (và re-export alias `CinemaScopeSwitcher` tương thích ngược) trong `apps/web/src/components/admin/cinema-selector.tsx`.
  - Tích hợp `fetchCinemasFromSupabase()` truy vấn trực tiếp bảng `public.cinemas` (`id, name, code, status`).
  - **Cross-Boundary DB Audit:** Đối chiếu `supabase/migrations/20261111010000_core_identity_chain.sql` dòng 407-409:
    ```sql
    grant select on public.cinemas to anon, authenticated;
    create policy cinemas_select on public.cinemas for select to anon, authenticated using (true);
    ```
    Bảng `cinemas` cho phép quyền `SELECT` công khai cho `authenticated` với policy `using (true)`, không có rào cản RLS hay giới hạn quyền cột làm phát sinh lỗi 42501.
  - **Admin Scope:** Tải toàn bộ rạp các trạng thái, gán nhãn trạng thái trực quan:
    - `TEMP_CLOSED` → `CINEMO Cầu Giấy (Tạm đóng)`
    - `COMING_SOON` → `CINEMO Hoàng Mai (Sắp mở)`
    - `CLOSED` → `CINEMO Ba Đình (Đóng cửa)`
  - **Manager/Staff Scope:** Ánh xạ danh sách rạp được phân công (`me.cinemas`) qua `nameMap` lấy từ Supabase, thay thế triệt để fallback ID thô `Rạp 1a2b3c4d` bằng tên thật và nhãn trạng thái chính xác, đồng thời vẫn giữ tính cô lập phân quyền (không cho phép chọn rạp ngoài phạm vi phân công).
  - **Hydration Guard:** `resolveInitialCinemas` trong `admin-shell.tsx` xử lý giữ scope khi khởi tạo SSR/hydration, chống nhảy scope về `"all"` khi Admin truy cập trực tiếp URL rạp non-OPEN.
- **Kết quả:** ĐẠT.

### 2.3. G/M13-3 — Khớp ma trận phân quyền SPEC §5.3 và design-spec §3
- **Hiện thực:** `apps/web/src/components/admin/nav-config.ts`:
  - Thêm mục `/admin/phong` ("Phòng & sơ đồ ghế") với quyền `ADMIN_MANAGER`.
  - Mở quyền xem Voucher `/admin/voucher` cho `ADMIN_MANAGER` (SPEC §5.3: Cinema Manager 👁 xem).
  - Mở quyền Cấu hình rạp `/admin/cau-hinh` cho `ADMIN_MANAGER` (design-spec §3: Manager ✅ cấu hình rạp).
  - Giữ nghiêm ngặt quyền Staff: chỉ thấy 4 mục ("Việc cần làm", "Đơn hàng", "Đơn bị ảnh hưởng", "Soát vé").
  - Loại bỏ hoàn toàn các mục POS theo CR remove-pos (spec 2.0.0).
- **Kết quả:** ĐẠT.

---

## 3. Kiểm chứng thực thi (Verification Evidence)

1. **Unit Tests:**
   - Lệnh: `pnpm test src/components/admin/__tests__/shell.test.tsx`
   - Kết quả: **24/24 tests passed** (100%).
   - Bao gồm các test case trực tiếp cho M13-1, M13-2, M13-3.
2. **Web Suite Regression Check:**
   - Lệnh: `pnpm test` (toàn bộ `@filmbooking/web`)
   - Kết quả: **12 test files passed, 170 tests passed** (0 failures, 0 regressions).
3. **Static Analysis & Linting:**
   - Lệnh: `npx eslint src/components/admin` → 0 errors.
   - Lệnh: `npx oxlint src/components/admin` → 0 warnings, 0 errors trên toàn bộ 7 files.

---

## 4. Minor Observations (Không chặn PASS)

- Hàm `CinemaSelector` trong `apps/web/src/components/admin/cinema-selector.tsx` có độ dài 68 dòng (hơi vượt nhẹ mức khuyến nghị 50 dòng của UI conventions do chứa cả khối `useEffect` fetch dữ liệu Supabase và JSX dropdown). Trong các đợt refactor tới có thể trích xuất hook riêng `useCinemasCatalog()` để code tinh gọn hơn.

---

## 5. Kết luận

| Yêu cầu | Trạng thái |
|---|---|
| G/M13-1 (Giữ query `?cinema=` khi điều hướng sidebar) | PASS |
| G/M13-2 (Bộ chọn rạp non-OPEN & giải quyết tên thật) | PASS |
| G/M13-3 (Khớp ma trận SPEC §5.3 & design-spec §3) | PASS |
| Unit Test & Typecheck & Lint | PASS |

**Verdict:** **NORMAL PASS**. Phase 3 - Task 10 đủ điều kiện close-out và commit.
