# Review: bug-select-dropdown-theme · phase-1-task-01 · round 1

Agent: reviewer

- **Review level:** STRICT (nâng từ NORMAL)
- **Reason:** CSS toàn cục áp lên mọi `select`/`option`/`::picker(select)` trong `@layer base`, cộng một hằng class dùng chung (`SELECT_FIELD_CLASS`) cho 13 file. Đây là style dùng chung có blast radius rộng, và QuickBookBar có hành vi chặn mở (`onBlocked`) phụ thuộc vào cách trình duyệt mở picker.
- **Blast radius:** 23 ô `<select>` (22 thẻ ở 12 file dùng `SELECT_FIELD_CLASS`, cộng `QuickField` ở `quick-book-bar.tsx` render 4 lần, dùng `home-hero.css`). Màn bị ảnh hưởng gồm `/phim`, `/lich-chieu`, trang chủ (QuickBookBar), và các màn admin: lịch chiếu, đơn hàng, voucher, gán vai trò, khoá ghế, nhật ký, đơn bị ảnh hưởng, nhân sự rạp. Ngoài ra là mọi `<select>`/`<option>` khác về sau (rule toàn cục).

## Verify commands + result (reviewer tự chạy, sau thay đổi cuối)

| Lệnh (project-config) | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: web 53 file / 656 test, api 29 / 658, shared 31, scripts 31 |
| `pnpm build` | PASS (Next 16.4.6, 41 trang) |
| Bộ Playwright cuộn (`playwright.scrub.config.ts`) | **Blocked.** Hook agent-guard chặn với thông báo: `lệnh "pnpm exec playwright test -c apps/web/playwright.scrub.config.ts" không nằm trong allowlist`. Lưu ý cho session chính: config nằm ở **gốc repo** `E:\FilmBooking\playwright.scrub.config.ts`, spec ở `E:\FilmBooking\e2e\scrub\scrub.spec.ts`, không nằm dưới `apps/web`. |
| aislop / oxlint / ocr | skip (không có trong allowlist hoặc chưa cấu hình) |

Kiểm CSS sau build (`apps/web/.next/static/chunks/2vt_gydox7oup.css`):
- Còn đủ `@supports (appearance:base-select){select{appearance:base-select}select::picker(select){...opacity:1...}`.
- `@starting-style{select::picker(select){opacity:0;translate:0 -4px}}` được hoist đúng chỗ.
- Không có `:popover-open`.

Lỗi popup opacity 0 đã hết trong bundle. `.qfield select{appearance:base-select}` trong `@supports` cũng còn trong bundle (`3kpbcq70lb-7_.css`).

## Đã xác nhận đúng

- Phủ đủ: grep `<select` trong `apps/web/src` ra 22 thẻ ở 12 file, tất cả dùng `SELECT_FIELD_CLASS`. QuickField là ô thứ 23 (file thứ 13), theme qua `home-hero.css`. Không còn `SELECT_CLASS`, `selectClass` hay class inline lệch.
- Không đổi `value`, `onChange`, `disabled`, `name`, `aria-*`, `onMouseDown`/`onKeyDown` của QuickBookBar. QuickBookBar không bị sửa TSX.
- Specificity và layer: `.qfield select { appearance: none }` là rule ngoài layer nên thắng `@layer base`. Builder đã khai lại `appearance: base-select` trong `@supports` đặt sau nó (cùng specificity, đứng sau thì thắng), và ẩn `::picker-icon` để không bị hai mũi tên. Đúng.
- Fallback `option {bg surface-elevated}` ngoài `@supports` không đè được `select option:hover` hay `:checked` (specificity thấp hơn). Trên Firefox/Safari nó chỉ tô nền option. Vô hại.
- Contrast `:checked`: vàng `#FCEE09` trên `#2A2706` đạt khoảng 13:1. Option cao 44px dưới md, 36px từ md. Ô đóng `text-base` (16px) trên mobile.
- Screenshot `/lich-chieu` desktop và mobile (open-desk, open-mob, closed-desk): popup vuông, nền tối, viền xám, mục đã chọn nền vàng sẫm, chữ và checkmark vàng, mũi tên xoay khi mở. Đồng bộ CYBERPLEX.

## Findings

### MAJOR-1: Thiếu evidence bắt buộc là screenshot màn admin khi popup đang mở
Acceptance (change doc dòng 25, task dòng 11) yêu cầu chụp "1 màn công khai + 1 màn admin". Cả 4 ảnh (`open-desk.png`, `open-mob.png`, `qbar-prov.png`, `closed-desk.png`) đều là màn công khai, không có ảnh admin nào. Các ô admin trước đây có `text-body-sm`/`bg-transparent`/`px-2` và nay đổi kiểu, nên phải có ảnh để chứng minh. Ví dụ: `/admin/don-hang` lọc trạng thái, hoặc `/admin/lich-chieu` chọn phòng.

### MAJOR-2: Hover/focus của option gần như vô hình và không nhấn vàng như acceptance
`apps/web/src/app/globals.css` (khối `@supports`, rule `select option:hover, select option:focus { background-color: var(--color-surface-control) }`) tô nền `#17171E` trên nền popup `surface-elevated` `#1B1B24`. Chênh sáng khoảng 1.04:1, mắt gần như không phân biệt được, và màu hover lại tối hơn nền.

Change doc (Expected) ghi "mục đang chọn/**đang rê** có nhấn vàng", task dòng 6 ghi "hover/`:checked` nhấn vàng". Hiện chỉ `:checked` có vàng. Người dùng bàn phím di mũi tên trong picker cũng chỉ thấy nền này, vì Chrome base-select chuyển focus vào option. Như vậy hiện chỉ trông vào outline `:focus-visible` toàn cục, và chưa có evidence outline đó hiện ra mà không bị cắt (WCAG 2.4.7 / 1.4.11).

Ghi chú: Radix `ui/select.tsx:135` và `ui/dropdown-menu.tsx:42` dùng `focus:bg-accent` (= `surface-elevated`, trùng nền popover), nên vấn đề này có sẵn từ trước ở các menu Radix. Dù vậy task này đặt acceptance rõ là phải nhấn vàng.

Đề xuất: hover/focus dùng nền `brand-soft` (hoặc viền/vạch trái `brand-line`/`brand`), phân biệt được với `:checked`. Ví dụ checked thì chữ vàng cộng checkmark, hover thì nền `brand-soft` hoặc outline vàng inset. Kèm screenshot đang rê chuột và đang di bằng bàn phím.

### MAJOR-3: Bộ kiểm cuộn Playwright và hành vi `onBlocked` chưa có evidence trên CSS cuối
- Lần chạy 21/21 của builder là **trước** khi đổi sang `@starting-style`. Reviewer chạy lại thì bị hook chặn (xem bảng trên). Acceptance "bộ kiểm cuộn Playwright vẫn xanh" vì thế chưa có evidence cho trạng thái cuối. Session chính hoặc builder cần chạy `pnpm exec playwright test -c playwright.scrub.config.ts` ở gốc repo, không đặt `SCRUB_SKIP_BUILD`, rồi ghi kết quả vào task.
- Acceptance "QuickBookBar vẫn chặn mở khi `onBlocked`" chưa được kiểm trên trình duyệt thật dưới `appearance: base-select`. `quick-book-bar.test.tsx:179` chạy jsdom, nơi `user.click` không mở picker gốc nào, nên test này không chứng minh gì về Chrome. Bộ scrub đặt cookie `fb_province=ALL` (`e2e/scrub/scrub.spec.ts:36-38`) nên không đi qua nhánh chặn. `qbar-prov.png` thì cho thấy picker rạp **đang mở** khi đã có tỉnh, tức nhánh không chặn. Cần evidence ở trạng thái chưa chọn tỉnh: bấm chuột (và Enter) vào ô Rạp thì phải ra hộp chọn tỉnh, `select:open` là false, không có danh sách rạp. Có thể dùng screenshot hoặc một test Playwright nhỏ.

### MINOR-1: `manager-staff-panel.tsx:52-55` mất `font-normal`
Class cũ có `font-normal`. Label bọc ngoài có `font-semibold`, và preflight Tailwind cho `select` dùng `font: inherit`, nên ô chọn rạp (và các option) giờ thành chữ đậm, lệch với 22 ô còn lại. Cách sửa: thêm `font-normal` ở chỗ dùng hoặc đưa vào hằng.

### MINOR-2: `affected-orders-list.tsx:177` gán `SELECT_FIELD_CLASS` cho `<input>`
Ô "Mã suất chiếu" là `<input>` nhưng dùng hằng của select. Tên gây hiểu lầm. Nên dùng `FIELD_CLASS`.

### MINOR-3: Gộp `w-full min-w-0` vào hằng làm đổi layout ở 3 chỗ trước đây không có `w-full`
Task dòng 7 nói "giữ riêng phần bố cục như `w-full`/`min-w-0`" ở chỗ dùng, nhưng hằng đã gộp sẵn hai class này. Ba chỗ bị đổi:
- `app/admin/lich-chieu/page.tsx:109`
- `components/admin/seat-lock-panel.tsx:90`: nằm trong `<label class="flex items-center gap-2">` cạnh chữ "Lý do khoá", `min-w-0` cho phép ô bị bóp khi hàng hẹp.
- `components/admin/manager-staff-panel.tsx:55`

Cả ba nằm trong `flex flex-wrap`. Không ai kiểm bằng mắt. Nên kèm vào screenshot admin ở MAJOR-1, hoặc tách bố cục ra khỏi hằng.

### MINOR-4: `qbar-prov.png` không dùng làm bằng chứng layout được
Chữ "Chọn rạp" của ô đầu lệch ra ngoài mép trái khung và mờ hơn các ô khác. Có thể ảnh được chụp giữa lúc chuyển động cuộn. Cần một ảnh tĩnh QuickBookBar (đã cuộn xong) để chắc padding trái của ô Rạp không bị đổi dưới base-select.

## Verdict

**FAIL.** Ba lý do: MAJOR-1 (thiếu screenshot admin theo acceptance), MAJOR-2 (hover/focus không nhấn vàng và gần như vô hình, trái acceptance), MAJOR-3 (Playwright cuộn và `onBlocked` chưa có evidence trên CSS cuối). Sửa MAJOR-2 cùng các MINOR, sau đó bổ sung evidence cho MAJOR-1 và MAJOR-3 rồi review round 2.
