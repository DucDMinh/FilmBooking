# Review Report: Layer 5 Task 13 (Round 1)

- **Task**: Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm vi rạp
- **Task file**: `tasks/build-filmbooking/layer-5-task-13.md`
- **Worktree**: `.worktrees/layer-5__task-13`
- **Reviewer**: Adversarial Reviewer (vai trò reviewer, Model pro)
- **Review Level**: `STRICT` (Shell quản trị, RBAC navigation filter, scope switcher)
- **Verdict**: `STRICT PASS`

---

## 1. Tóm tắt phạm vi và kết quả kiểm tra

Task 13 xây dựng khung vỏ (shell) chung cho toàn bộ khu vực quản trị `/admin` dành cho 3 vai trò nội bộ: **STAFF**, **MANAGER**, **ADMIN**, đồng thời chặn hoàn toàn khách hàng thông thường (**CUSTOMER**) bằng chuyển hướng tới trang 403 `/khong-co-quyen`.

Các thành phần được triển khai và đánh giá:
1. `apps/web/src/app/admin/layout.tsx`: Server Component kiểm tra phiên đăng nhập và vai trò nhân sự qua `GET /me`, truy xuất danh sách rạp `/cinemas`, chặn CUSTOMER sang `/khong-co-quyen`, bọc Suspense quanh client shell.
2. `apps/web/src/components/admin/admin-shell.tsx`: Client shell tích hợp sidebar, topbar CINEMO, và bộ chọn phạm vi rạp.
3. `apps/web/src/components/admin/nav-config.ts`: Khai báo ma trận điều hướng theo đúng spec MVP và quy tắc phân quyền vai trò.
4. `apps/web/src/components/admin/admin-sidebar.tsx`: Thanh điều hướng desktop (250px) và menu Sheet mobile responsive dưới 768px, hỗ trợ keyboard focus và `aria-current="page"`.
5. `apps/web/src/components/admin/cinema-scope-switcher.tsx`: Dropdown chọn rạp trên topbar, chỉ hiển thị "Toàn chuỗi" cho ADMIN, vô hiệu hoá khi nhân sự chỉ được phân công 1 rạp.
6. `apps/web/src/components/admin/use-admin-scope.ts`: Hook đồng bộ trạng thái phạm vi rạp vào URL query parameter `?cinema=<id>`, tự động chuẩn hoá và phòng ngừa giá trị không hợp lệ.
7. `apps/web/src/components/admin/__tests__/shell.test.tsx`: Bộ kiểm thử toàn diện 20 test case kiểm chứng phân quyền vai trò, scope selector, navigation keyboard/sheet và server layout redirect.

---

## 2. Đối chiếu chi tiết với Acceptance Criteria & Quy chuẩn dự án

| Tiêu chí | Trạng thái | Đánh giá chi tiết |
|---|---|---|
| **CR remove-pos (spec 2.0.0)** | **PASS** | Kiểm tra toàn bộ file code và test: Không còn bất kỳ mục POS nào trong `ADMIN_NAV_ITEMS`. Test case `CR remove-pos` kiểm tra triệt để `href` và `label`. |
| **Phân quyền vai trò Sidebar** | **PASS** | - **Staff**: Đúng 4 mục: *Việc cần làm* (`/admin`), *Đơn hàng* (`/admin/don-hang`), *Đơn bị ảnh hưởng* (`/admin/don-bi-anh-huong`), *Soát vé* (`/staff/soat-ve`).<br>- **Manager**: Bổ sung *Rạp chiếu* (`/admin/rap`), *Lịch chiếu* (`/admin/lich-chieu`), *Đơn cần xử lý* (`/admin/don-can-xu-ly`), *Giá & ngày lễ* (`/admin/gia`), *Người dùng* (`/admin/nguoi-dung`), *Báo cáo* (`/admin/bao-cao`).<br>- **Admin**: Đầy đủ mục hệ thống bao gồm *Phim* (`/admin/phim`), *Voucher* (`/admin/voucher`), *Audit log* (`/admin/audit-log`), *Cấu hình* (`/admin/cau-hinh`). |
| **Chặn CUSTOMER truy cập `/admin`** | **PASS** | Trong `layout.tsx`, hàm `resolveAdminRole(me)` trả về `null` cho tài khoản khách hàng thông thường (`isAdmin === false` và không có rạp phân công). Server layout redirect ngay lập tức về `/khong-co-quyen`. Người chưa đăng nhập redirect về `/dang-nhap?next=/admin`. |
| **CinemaScopeSwitcher trên Topbar** | **PASS** | - ADMIN được chọn "Toàn chuỗi" (`all`) hoặc từng rạp cụ thể trong toàn bộ hệ thống.<br>- MANAGER / STAFF chỉ được chọn các rạp được gán trong `me.cinemas`. Nếu nhân sự chỉ có 1 rạp, dropdown tự động `disabled` hiển thị dạng cố định.<br>- `resolveScope` ngăn chặn can thiệp URL: nếu Staff/Manager tự ý gõ `?cinema=all` hoặc id rạp ngoài quyền gán, scope tự fallback về rạp đầu tiên được gán. |
| **Responsive & Keyboard Navigation** | **PASS** | - Desktop (≥768px): Sidebar cố định `w-[250px]`, topbar `h-18` (72px).<br>- Mobile (<768px): Topbar `h-14` (56px), nút Menu mở `Sheet` Radix UI chứa danh sách link, tự động đóng khi bấm chọn mục.<br>- Touch target đạt chuẩn WCAG (`min-h-11` = 44px).<br>- Focus ring rõ ràng (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`), `aria-current="page"`, `aria-label="Điều hướng quản trị"`. |
| **Surgical Diff & File Limit** | **PASS** | Tất cả các file đều ≤ 91 dòng (file test 396 dòng), các hàm đều ≤ 35 dòng. Không có drive-by refactor hay sửa đổi ngoài phạm vi admin shell. |
| **Next.js App Router Architecture** | **PASS** | Server Component `layout.tsx` fetch data với `cache: "no-store"` (đảm bảo không rò rỉ dữ liệu phiên giữa các người dùng), bao bọc `<Suspense>` quanh `<AdminShell>` để tương thích với `useSearchParams()`. |

---

## 3. Kết quả chạy Verify Commands (Allowlist)

Tất cả các lệnh kiểm tra được thực thi trực tiếp trong worktree `E:\FilmBooking\.worktrees\layer-5__task-13`:

1. **Typecheck Workspace**:
   ```bash
   pnpm -w typecheck
   ```
   - **Kết quả**: `Done` trên toàn bộ packages/shared, apps/api, apps/web. Không có lỗi kiểu.

2. **Lint Workspace**:
   ```bash
   pnpm -w lint
   ```
   - **Kết quả**: `Done` không có cảnh báo hay lỗi ESLint nào.

3. **Oxlint Scan**:
   ```bash
   npx oxlint apps/web/src/app/admin apps/web/src/components/admin
   ```
   - **Kết quả**: `Found 0 warnings and 0 errors. Finished on 7 files with 96 rules.`

4. **Web Unit & Component Tests**:
   ```bash
   pnpm --filter @filmbooking/web test
   ```
   - **Kết quả**: `9 passed (9 files), 113 passed (113 tests)`. File test `shell.test.tsx` pass toàn bộ 20/20 test cases.

5. **Web Production Build**:
   ```bash
   pnpm --filter @filmbooking/web build
   ```
   - **Kết quả**: `next build` hoàn thành thành công trong Turbopack. Route `/khong-co-quyen` prerender tĩnh, route `/admin` dynamic server-rendered an toàn.

---

## 4. Kết luận

Triển khai của task `layer-5-task-13` đáp ứng đầy đủ và chuẩn xác các tiêu chí kỹ thuật, phân quyền RBAC UX, responsive A11y và không có bất kỳ khiếm khuyết nào. Đạt chuẩn phê duyệt.

**Verdict**: `STRICT PASS`
