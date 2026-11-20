# Spec Update — 2026-11-20 select-dropdown-theme
**spec_version:** 3.5.0 → 3.5.0 (KHÔNG bump — bug-fix thuần, không đổi requirement)
**Trigger:** bug-fix · CR-012 · `tasks/bug-select-dropdown-theme/phase-1-task-01.md` (review STRICT PASS round 2) · workItem `bug/select-dropdown-theme`

## Requirements
- Không THÊM / SỬA / XOÁ requirement nào; `SPECIFICATIONS.md` giữ nguyên.
- Đây là đưa giao diện ô chọn `<select>` gốc về đúng design-spec "Input/Select/Textarea" (`.context/design-spec.md`) của giao diện CYBERPLEX (spec 3.5.0): **NFR-19** (giao diện & chuyển động), **AC-31** (thanh Đặt vé nhanh R-138 dùng 4 ô chọn gốc), **NFR-12** (tương phản, focus nhìn thấy), **NFR-11** (360px) liên quan nhưng không đổi.

## Lỗi đã sửa (UI web, không đổi API/DB)
1. Danh sách xổ xuống của `<select>` gốc là popup mặc định của Windows (nền sáng, bo/viền hệ điều hành), lệch hẳn giao diện CYBERPLEX. Nay CSS toàn cục `apps/web/src/app/globals.css` (`@layer base`, bọc `@supports (appearance: base-select)`) bật `appearance: base-select` cho `select` và `::picker(select)`: popup vuông, nền `popover`/`surface-elevated`, viền, `shadow-overlay`, mục rê/bàn phím có vạch trái vàng, mục đã chọn nền `brand-soft` + chữ/tick vàng, mũi tên `picker-icon` xoay khi mở, `option` cao tối thiểu 44px dưới md. Trình duyệt chưa hỗ trợ: dự phòng `color-scheme: dark` + màu nền/chữ `option`.
2. Ô đóng rải rác nhiều class lệch nhau (`SELECT_CLASS` ×4, `selectClass`, `FIELD_CLASS`, inline ở `manager-staff-panel`, `orders-list`, `lich-chieu/page`, `lich-chieu/[id]/page`, `seat-lock-panel`). Nay hằng chung `SELECT_FIELD_CLASS` (`apps/web/src/components/catalog/filter-field.ts`) áp cho 22 `<select>` ở 12 file; `QuickBookBar` dùng cùng kiểu qua `apps/web/src/components/home/home-hero.css`. Chiều cao giữ 44px (mobile) / 40px (md+).
3. Hành vi không đổi: `value`, `onChange`, `disabled`, `name`, `aria-*`; `QuickBookBar` vẫn chặn mở danh sách khi chưa chọn tỉnh (`onBlocked`, R-35) và mở hộp chọn tỉnh.

## Ảnh hưởng
- Module: web, kiểu dùng chung cho mọi `<select>` gốc: `/lich-chieu`, `/phim` (bộ lọc), trang chủ `QuickBookBar`, màn admin (lịch chiếu + chi tiết suất, đơn hàng, đơn bị ảnh hưởng, nhật ký, khoá ghế, nhân sự rạp, gán vai trò, tạo suất hàng loạt, voucher). Thêm test `apps/web/src/components/catalog/__tests__/select-theme.test.ts`.
- Test: mở popup trên Chromium (hỗ trợ `base-select`) ở `/lich-chieu`, `/phim`, QuickBookBar; ô đóng đồng nhất; QuickBookBar chưa chọn tỉnh không xổ danh sách mà mở hộp chọn tỉnh; bộ cuộn Playwright 21/21 không hồi quy.
- Không đổi DB / schema / API contract / nghiệp vụ đặt vé.
- Residual (chấp nhận): bố cục `w-auto` ở 3 màn admin (`lich-chieu`, `seat-lock-panel`, `manager-staff-panel`) chưa kiểm bằng mắt; 2 `<select>` trong Radix Dialog (`role-assign-dialog.tsx`) chưa thử trên trình duyệt thật; nhánh `onBlocked` chỉ có số đo, không có ảnh; Firefox/Safari chưa hỗ trợ `base-select` nên popup vẫn của hệ điều hành (chỉ đổi được màu option), ô đóng vẫn đồng nhất; chỉ có chuyển động mở popup, không có chuyển động đóng.

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 28, specVersion 3.5.0.
