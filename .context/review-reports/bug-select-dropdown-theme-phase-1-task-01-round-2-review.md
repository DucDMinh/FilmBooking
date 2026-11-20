# Review: bug-select-dropdown-theme · phase-1-task-01 · round 2

Agent: reviewer

- **Review level:** STRICT (giữ như round 1)
- **Reason:** CSS toàn cục trong `@layer base` áp lên mọi `select`/`option`/`::picker(select)`, cộng hằng `SELECT_FIELD_CLASS` dùng chung ở 12 file. QuickBookBar có hành vi chặn mở (`onBlocked`) phụ thuộc vào cách trình duyệt mở picker.
- **Blast radius:** không đổi so với round 1. 22 thẻ `<select>` ở 12 file dùng `SELECT_FIELD_CLASS`, cộng `QuickField` (4 ô, `home-hero.css`). Thay đổi vòng 2 chỉ đụng `globals.css` (hover/focus option) và 4 file admin (`lich-chieu/page.tsx`, `seat-lock-panel.tsx`, `manager-staff-panel.tsx`, `affected-orders-list.tsx`).

## Verify commands + result (reviewer tự chạy)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: web 53 file / 657 test, api 29 / 658, shared 31, scripts 31 |
| `pnpm build` | Không chạy lại. Round 1 PASS, theo brief thì tránh xung đột `.next`. `.next/static/chunks/1oo757occerur.css` hiện có `.min-w-auto{min-width:auto}` |
| Playwright cuộn (scrub) | Không chạy (round 1 bị hook chặn; brief yêu cầu không chạy). Dùng bằng chứng builder: 21/21 PASS trên CSS cuối, ghi ở journal `.context/runs/bug-select-dropdown-theme-phase-1-task-01.md:24` |
| Kiểm `twMerge` bằng `node -e` | **Blocked** (agent-guard: ngoài allowlist). Thay bằng đọc source `tailwind-merge@3.7.0` (xem dưới) |
| aislop / oxlint / ocr | skip (không có trong allowlist hoặc chưa cấu hình) |

## Đối chiếu finding round 1

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| MAJOR-1: thiếu ảnh admin | **Chấp nhận thay thế, có residual** | Không chụp được admin vì cần phiên Supabase. `/phim` dùng đúng `SELECT_FIELD_CLASS` và CSS toàn cục. Popup (`::picker`, `option`) do rule toàn cục lo, không phụ thuộc màn, nên ảnh `/phim` và `/lich-chieu` chứng minh được phần popup cho admin. Phần chưa được kiểm bằng mắt chỉ còn bố cục ô đóng ở 3 chỗ `w-auto` và select trong Radix Dialog (`role-assign-dialog.tsx`). Xem residual R1 và R2 |
| MAJOR-2: hover/focus vô hình | **Đã sửa** | `globals.css`: `select option:hover, select option:focus` thêm `box-shadow: inset 3px 0 0 var(--color-brand)`; `:checked` giữ `brand-soft` cộng chữ vàng. Ảnh `r2-phim-hover`/`r2-lich-hover`: mục đang rê có vạch trái vàng rõ, phân biệt được với mục `:checked` (nền vàng sẫm, checkmark). Ảnh `r2-phim-kbd`/`r2-lich-kbd`: mục focus bàn phím có vạch vàng cộng outline `:focus-visible` vàng, không bị cắt |
| MAJOR-3: scrub và `onBlocked` | **Chấp nhận, có residual** | Scrub 21/21 PASS trên CSS cuối (theo builder và journal). `onBlocked`: builder đo được `select:open` = false với click, Enter và ArrowDown, đồng thời hộp chọn tỉnh mở ra. Code chặn không đổi (`quick-book-bar.tsx:77-86`: `preventDefault` ở mousedown và ở `OPEN_KEYS`). Không có ảnh của nhánh bị chặn (`r2-qbar-open-kbd.png` là nhánh đã có tỉnh), xem R3 |
| MINOR-1: `font-normal` | **Đã sửa** | `manager-staff-panel.tsx:56` `cn(SELECT_FIELD_CLASS, "w-auto min-w-auto font-normal")` |
| MINOR-2: input dùng hằng select | **Đã sửa** | `affected-orders-list.tsx:177` dùng `FIELD_CLASS` (import ở dòng 16) |
| MINOR-3: `w-full min-w-0` đổi layout | **Đã sửa** | 3 chỗ dùng `cn(SELECT_FIELD_CLASS, "w-auto min-w-auto")`. `cn` = `twMerge(clsx(...))` (`lib/utils.ts:19-20`), import `@/lib/utils` đúng ở cả 3 file. `tailwind-merge@3.7.0` xếp `w-*` vào cùng một group, còn group `min-w` gồm `scaleSizing()`, có `'auto'` và spacing `0` (`bundle-mjs.mjs:671, 1443-1445`). Như vậy `w-auto` thắng `w-full` và `min-w-auto` thắng `min-w-0`. `min-w-auto` là utility Tailwind v4 hợp lệ, có trong CSS build. `manager-staff-panel` trước đây có `block`, nay là `flex` (cũng block-level) nên vẫn xuống dòng dưới nhãn |
| MINOR-4: ảnh QuickBookBar lệch | **Đã sửa** | `r2-qbar-static.png`: nhãn "RẠP" và chữ "Chọn rạp" thẳng hàng với 3 ô còn lại, padding trái đều, mũi tên cùng vị trí ở cả 4 ô |

Grep lại: `<select` vẫn là 22 thẻ ở 12 file, tất cả dùng `SELECT_FIELD_CLASS` (3 chỗ qua `cn`). QuickField vẫn dùng `home-hero.css`. Không còn `SELECT_CLASS`/`selectClass`. Không có regression mới.

Đánh giá CYBERPLEX trên ảnh: popup vuông, nền `surface-elevated`, viền xám. Mục chọn có nền vàng sẫm, chữ và checkmark vàng. Hover và focus có vạch vàng 3px. Mũi tên xoay khi mở. Trên `/lich-chieu`, picker tự lật lên trên khi thiếu chỗ phía dưới, vẫn đúng style. Khớp design-spec.

## Findings

Không còn finding chặn (CRITICAL/MAJOR).

### NOTE-1 (không chặn): hai vạch vàng cùng lúc
Hover và focus dùng chung một style. Khi chuột đang nằm trên một mục mà người dùng lại di bàn phím sang mục khác, cả hai mục đều có vạch vàng (`r2-phim-kbd.png`: "Hành động" focus, "Phiêu lưu" hover). Mục focus vẫn phân biệt được nhờ outline vàng. Native select cũng có hành vi tương tự nên chấp nhận được.

### NOTE-2 (close-out, không chặn review): task file chưa ghi evidence
`tasks/bug-select-dropdown-theme/phase-1-task-01.md` chưa có Verification summary hay Repro Verification. Hiện evidence scrub 21/21 và `onBlocked` (`select:open` = false) chỉ có trong brief và journal. Ở bước close-out, dispatcher cần ghi vào task file: verify commands, scrub 21/21, kết quả đo `onBlocked`, đường dẫn ảnh, và residual R1-R3 bên dưới.

## Residual risk

- **R1: ảnh admin được thay bằng `/phim`.** Tôi thấy hợp lý cho phần popup và ô đóng mặc định, vì các ô này dùng cùng hằng và cùng CSS toàn cục. Rủi ro còn lại là bố cục `w-auto` ở 3 chỗ admin (`lich-chieu/page.tsx:110`, `seat-lock-panel.tsx:91`, `manager-staff-panel.tsx:56`) chưa được nhìn bằng mắt. Mức thấp, vì `w-auto` gần với hành vi cũ hơn là `w-full`.
- **R2: select trong Radix Dialog (`role-assign-dialog.tsx:129,144`) chưa được kiểm trên trình duyệt.** `::picker(select)` nằm trong top layer, là con của select, và select nằm trong dialog content. Vì vậy về lý thuyết picker không bị focus trap hay `pointer-events: none` trên body của Radix chặn. Dù vậy chưa có evidence. Nên chụp khi có phiên Supabase.
- **R3: chưa có ảnh nhánh `onBlocked`.** Chỉ có kết quả đo dạng chữ từ builder. Code chặn không đổi, nhưng hành vi của base-select với `preventDefault` ở mousedown và keydown mới chỉ được kiểm trên đúng một phiên Chrome của builder.
- Firefox/Safari chưa hỗ trợ base-select nên vẫn dùng popup hệ điều hành, chỉ đổi màu option (fallback đã ghi trong design).

## Verdict

**STRICT PASS.** Đã sửa đúng MAJOR-2 và cả 4 MINOR. MAJOR-1 và MAJOR-3 được chấp nhận bằng chứng tương đương, ghi residual R1-R3. lint, typecheck và test xanh khi reviewer tự chạy. Điều kiện close-out: ghi NOTE-2 vào task file trước khi commit.
