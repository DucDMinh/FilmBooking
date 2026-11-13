# Bug layer5-review · phase-3-task-10 — Web Admin Shell, Cinema Scope & Navigation

- Classification / Risk: BUG · severity=medium · review level expected=NORMAL · nguồn: `.context/review-reports/independent-review-layer-5-G-web-account-admin.md` (G/M13-1..M13-3)
- Root cause:
  1. **G/M13-1**: Điều hướng sidebar `/admin` đánh mất query `?cinema=` (phạm vi rạp) khi người dùng bấm chuyển giữa các mục quản trị.
  2. **G/M13-2**: Bộ chọn rạp admin dùng `GET /cinemas` (chỉ trả rạp `OPEN`) -> Admin không lọc được rạp tạm đóng/đóng/sắp mở để xử lý đơn bị ảnh hưởng & mở lại rạp; nhân sự rạp không OPEN bị hiện ID rạp thô `Rạp 1a2b3c4d`.
  3. **G/M13-3**: `nav-config.ts` lệch SPEC §5.3 & design-spec (Manager thiếu Voucher xem-chỉ-đọc, thiếu Cấu hình rạp, thiếu mục Phòng & sơ đồ ghế).
- Files to Create/Modify:
  - `apps/web/src/components/admin/admin-sidebar.tsx`
  - `apps/web/src/components/admin/admin-shell.tsx`
  - `apps/web/src/components/admin/cinema-selector.tsx`
  - `apps/web/src/components/admin/nav-config.ts`
  - `apps/web/src/components/admin/__tests__/shell.test.tsx`
- Status: done

## Repro Verification
- Original repro:
  1. Chọn rạp `HN01` tại `/admin?cinema=HN01` -> bấm sang "Đơn bị ảnh hưởng" trong sidebar -> URL bị mất `?cinema=HN01`, rạp bị reset.
  2. Rạp `HN03` đang ở trạng thái `TEMP_CLOSED` -> bộ chọn rạp không có HN03, Admin không chọn được để xử lý đơn ảnh hưởng.
  3. Cinema Manager đăng nhập -> không có lối tắt xem Voucher xem-chỉ-đọc hoặc xem sơ đồ ghế phòng chiếu.
- Expected:
  - Sidebar giữ nguyên query `?cinema=` khi chuyển đổi giữa các route con `/admin/*`.
  - Bộ chọn rạp tải danh sách rạp từ endpoint admin hoặc hiển thị đầy đủ rạp (kể cả tạm đóng).
  - `nav-config.ts` khớp ma trận §5.3 và design-spec.
- Actual before fix: Mất query rạp khi bấm sidebar, thiếu rạp non-OPEN, nav thiếu mục.
- Actual after fix:
  - `formatNavHref` trong `admin-sidebar.tsx` giữ nguyên query `?cinema=` khi người dùng điều hướng qua các link `/admin/*`.
  - `CinemaSelector` trong `cinema-selector.tsx` hiển thị đầy đủ rạp các trạng thái (`TEMP_CLOSED`, `COMING_SOON`, `CLOSED`) kèm nhãn trạng thái cho Admin; tự động đồng bộ tên rạp thật từ Supabase thay thế fallback ID thô `Rạp 1a2b3c4d` cho nhân sự rạp non-OPEN.
  - `nav-config.ts` bổ sung `Phòng & sơ đồ ghế` (`/admin/phong`), `Voucher` (`ADMIN_MANAGER`), `Cấu hình` (`ADMIN_MANAGER`) khớp ma trận SPEC §5.3 và design-spec §3.
- Evidence:
  - 24/24 unit tests pass trong `src/components/admin/__tests__/shell.test.tsx` (gồm 4 tests mới cho G/M13-1, G/M13-2, G/M13-3).
  - Lint `npx eslint src/components/admin` và `npx oxlint src/components/admin` hoàn tất 0 lỗi.
- Status: PASS
