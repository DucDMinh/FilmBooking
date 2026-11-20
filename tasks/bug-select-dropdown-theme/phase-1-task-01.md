# Bug select-dropdown-theme · phase-1-task-01 — `<select>` gốc: popup xổ xuống theo token CYBERPLEX + ô đóng đồng nhất (CR-012)

- Classification / Risk: BUG (UI ≠ design-spec "Input/Select/Textarea") · severity=medium · scope=apps/web, CSS toàn cục + 13 file dùng `<select>` gốc · expected review level=NORMAL (style dùng chung, không auth/DB/API) · blast radius: 23 ô chọn công khai + admin; `QuickBookBar` (bộ Playwright cuộn 20 test đo vị trí/cỡ) · doc impact: design-spec "Input/Select/Textarea" thêm câu mô tả popup; không đổi requirement → không bump `spec_version`.
- Root cause: `<select>` gốc không có CSS cho popup (`::picker(select)`), nên Chrome/Edge vẽ popup mặc định hệ điều hành; class ô đóng rải rác (`SELECT_CLASS` ×4, `selectClass`, `FIELD_CLASS`, inline ở `manager-staff-panel.tsx`, `orders-list.tsx`, `lich-chieu/page.tsx`, `lich-chieu/[id]/page.tsx`, `seat-lock-panel.tsx`, `quick-book-bar.tsx`) và lệch nhau.
- Hướng sửa (đã chốt, KHÔNG đổi sang Radix `Select`):
  1. `apps/web/src/app/globals.css` (`@layer base`): `select, ::picker(select) { appearance: base-select }` bọc trong `@supports (appearance: base-select)`; style `::picker(select)` vuông, nền `--color-popover`/`surface-elevated`, viền `border`, `shadow-overlay`, max-height; `option` min-height ≥ 44px dưới md, hover/`:checked` nhấn vàng (`accent`/`brand`), `option::checkmark` màu brand; `select::picker-icon` mũi tên `fg-secondary`, xoay khi `select:open`. Fallback trình duyệt chưa hỗ trợ: `select { color-scheme: dark }` + `option { background-color: var(--color-surface-elevated); color: var(--color-fg) }`.
  2. Một hằng class chung cho ô đóng (đặt cạnh `FIELD_CLASS` ở `components/catalog/filter-field.ts` hoặc export `SELECT_FIELD_CLASS`) khớp design-spec: vuông, `border-border-input`, `bg-surface-input`, `px-3`, `h-11 md:h-10`, `text-base md:text-body`, focus viền brand + ring, disabled `opacity-45`, `aria-invalid` viền danger. Thay toàn bộ class rải rác ở 13 file bằng hằng này (giữ riêng phần bố cục như `w-full`/`min-w-0`).
  3. Không đổi hành vi: `value=""`, `onChange`, `disabled`, `name`, `aria-*`, và `onMouseDown` + `preventDefault` của `QuickBookBar` (`onBlocked`).
- Files to Modify (dự kiến): `apps/web/src/app/globals.css`, `apps/web/src/components/catalog/filter-field.ts`, 13 file: `app/admin/lich-chieu/page.tsx`, `app/admin/lich-chieu/[id]/page.tsx`, `components/admin/{affected-orders-list,audit-log-view,manager-staff-panel,orders-list,role-assign-dialog,seat-lock-panel,showtime-bulk-form,voucher-form}.tsx`, `components/catalog/{movie-filters,quick-book-bar,schedule-filters}.tsx`; test: thêm test hằng/`globals.css` nếu hợp lý (vd đọc `globals.css` kiểm có `::picker(select)`).
- Acceptance:
  - Mở popup của một select công khai (`/lich-chieu` lọc rạp) và một select admin (`/admin/don-hang` hoặc tương đương): nền tối, viền, chữ, hover/chọn vàng theo token; chụp screenshot khi popup đang mở (Chrome).
  - 23 ô đóng cùng một kiểu; không còn `bg-transparent`/`px-2` lệch; không đổi chiều cao (44/40px) → `QuickBookBar` và bộ Playwright cuộn (`5a4adfd`, 20 test) vẫn xanh.
  - `QuickBookBar` vẫn chặn mở khi `onBlocked`; opacity luôn 1.
  - lint / typecheck / test / build web PASS (lệnh từ `.context/project-config.md`).
- Status: done (reviewer STRICT PASS round 2)

## Repro Verification
- Original repro: mở `/lich-chieu` (hoặc `/phim`, trang chủ QuickBookBar, các màn admin có ô chọn), bấm ô chọn để xổ danh sách.
- Expected: popup vuông, nền tối, viền, chữ, mục chọn/rê có nhấn vàng theo token CYBERPLEX; ô đóng đồng nhất.
- Actual before fix: popup mặc định Windows; ô đóng lệch class (`bg-transparent`, `px-2`, `px-3`, không mũi tên riêng).
- Actual after fix (Chromium Playwright 158, hỗ trợ `base-select`): popup `/lich-chieu` và `/phim` đúng token; hover/bàn phím có vạch trái vàng 3px, mục đã chọn nền `brand-soft` + chữ/tick vàng; QuickBookBar cao 44px, rộng 223px như trước, opacity 1.
- Evidence:
  - lint, typecheck, test (web 657, api 658, shared 31, scripts 31), build: PASS (builder + reviewer chạy lại độc lập lint/typecheck/test).
  - Bộ Playwright cuộn `pnpm exec playwright test -c playwright.scrub.config.ts` (gốc repo, build lại trên CSS cuối): 21/21 PASS.
  - `onBlocked` QuickBookBar khi chưa chọn tỉnh: click / Enter / ArrowDown ở ô Rạp đều `select:open = false` và mở hộp chọn tỉnh.
  - Grep CSS build: có `picker(select)`, `base-select`, `picker-icon`, `checkmark`, `@starting-style`, không có `popover-open` (lightningcss xoá selector này và làm popup vô hình, nên không dùng).
  - Ảnh (scratchpad `C:\Users\DUCDAO~1\AppData\Local\Temp\claude\4a1285bf41074379\13e7cf0d-9b6c-4ec3-8c93-af5ffb893cee\scratchpad\`): `open-desk.png`, `open-mob.png`, `r2-phim-hover.png`, `r2-phim-kbd.png`, `r2-lich-hover.png`, `r2-lich-kbd.png`, `r2-qbar-static.png`, `r2-qbar-open-kbd.png`.
  - Reports: `.context/review-reports/bug-select-dropdown-theme-phase-1-task-01-round-{1,2}-review.md` (round 1 FAIL: hover vô hình + 4 minor + thiếu bằng chứng; round 2 PASS).
- Residual (đã biết, chấp nhận):
  - R1: bố cục `w-auto` ở 3 màn admin (`lich-chieu`, `seat-lock-panel`, `manager-staff-panel`) chưa kiểm bằng mắt.
  - R2: 2 `<select>` trong Radix Dialog (`role-assign-dialog.tsx`) chưa thử trên trình duyệt thật.
  - R3: nhánh `onBlocked` chỉ có số đo, không có ảnh.
  - Không chụp được màn admin (cần phiên Supabase, bản scrub chỉ có API giả): dùng `/phim` làm bằng chứng tương đương (cùng `SELECT_FIELD_CLASS` + CSS toàn cục).
  - Firefox/Safari chưa hỗ trợ `base-select`: popup vẫn của hệ điều hành, chỉ đổi được màu option; ô đóng vẫn đồng nhất.
  - Chỉ có chuyển động mở popup, không có chuyển động đóng.
- Doc impact: design-spec "Input/Select/Textarea" thêm câu mô tả popup (đã làm trong close-out); `no doc impact` cho API_SPEC/ERD/DESIGN.
- Status: PASS
