Agent: reviewer

# Review: feature-cyberplex-reskin phase-2 task-03 (round 2)

Trang chủ: hero ghim + QuickBookBar (R-138, AC-31, NFR-19, AC-32). Worktree `E:\FilmBooking\.worktrees\cyberplex-t03`. Round này kiểm lại 2 MAJOR của round 1 và phần sửa hero.

## Review level
**STRICT**

## Reason
R-138 là lối tắt điều hướng vào luồng đặt vé và có yêu cầu a11y nêu rõ trong spec. Round 1 FAIL vì 2 lỗi a11y. Trang chủ là trang có lưu lượng cao nhất.

## Blast radius
- Không đổi so với round 1, giới hạn trong `quick-book-bar.tsx`, `home-hero.css`, `page.tsx` (hex đổi sang token) và test của các file đó.
- Không có API mới. Không đụng code dùng chung.
- Rủi ro merge với task-04 vẫn còn: `showtime-schedule.tsx` đang được sửa song song. Typecheck ở integration sẽ bắt được.

## Verify commands + result
Chạy trong `apps/web`, mỗi lệnh 1 lần, không bị chặn.

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | **PASS** |
| `pnpm lint` | **PASS** |
| `pnpm test` | **PASS**, 52 file / 650 test (round 1 là 647) |
| aislop / oxlint / ocr | skip: chưa cài hoặc chưa cấu hình |
| dev server / Playwright | không chạy, theo chỉ thị |

## Kiểm MAJOR round 1

**MAJOR-1 (kẹt Tab khi chưa chọn tỉnh): ĐÃ ĐÓNG.**
- `quick-book-bar.tsx:71-86`: bỏ `onFocus`. Hộp chọn tỉnh chỉ mở khi `onMouseDown`, hoặc `onKeyDown` với Enter/Space/ArrowUp/ArrowDown. Alt+ArrowDown cũng có `key` = ArrowDown nên được bắt.
- `:140-151`: lưu ô đã mở hộp vào `pickerTrigger`. Khi đóng hộp, `setTimeout(() => trigger.focus(), 0)` trả focus về ô đó, chạy sau khi Radix gỡ focus scope.
- Không có vòng lặp mở lại: focus quay về select không còn trình xử lý nào mở hộp.
- Submit khi chưa có tỉnh: trigger = `document.activeElement`, tức nút Đặt vé, đúng mô tả của builder.
- Khi chọn tỉnh: `handleSelect`, rồi `handleOpenChange(false)`, rồi `router.refresh()`. Sau refresh thì `hasProvince = true` và hộp thoại bị gỡ.
- 3 test mới kiểm đúng hành vi (`quick-book-bar.test.tsx:151-185`):
  - Tab đi qua 4 ô tới nút Đặt vé mà không mở hộp.
  - Enter mở hộp, Esc đóng và focus về đúng ô Phim.
  - Click vẫn mở hộp.

**MAJOR-2 (vùng live bị `display:none`): ĐÃ ĐÓNG.**
- `<p role="status" aria-live="polite">` luôn render (`:247`). CSS (`home-hero.css:231-236`) không còn `display:none`; khi rỗng chỉ bỏ margin.
- `announceError` (`:154-157`) xoá chuỗi về "" rồi gán lại ở frame kế tiếp, nên lỗi lặp y hệt vẫn được đọc lại.
- Không bị đọc hai lần: xoá về rỗng là thao tác bỏ chữ, mặc định `aria-relevant` không thông báo; chỉ lần thêm chữ được đọc.
- Test MutationObserver (`:129-149`) xác nhận có bước "" trước khi gán lại và vùng live vẫn là cùng một node DOM.

## Kiểm phần sửa hero
- **Cỡ chữ tên phim** `clamp(36px, min(7vw, 10svh), 112px)` hợp lệ. Ở 1440×900 khoảng 90px, nhỏ hơn mức tối đa 112px. Chấp nhận được: spec §16.4 không ấn định cỡ chữ title, 112px là trần của preview, và đổi lại không bị cắt ở laptop thấp.
- **Padding/margin theo svh**: dùng `clamp` có sàn tính bằng px, không về 0.
- **Tự ước lượng trường hợp xấu nhất** (768×620, tên phim 50 ký tự gãy 4 dòng): thân hero khoảng 364px cộng thanh khoảng 183px (4 ô 1 hàng, CTA 48px) ≈ 547px, so với khung ghim 542px. Phần tràn khoảng 5px, chỉ lấn vào padding trên, nội dung không mất. Khớp số liệu Playwright builder báo.
- **4 ô một hàng ở 768–1080**:
  - Ở 768px mỗi ô rộng khoảng 168px, vùng chữ của select khoảng 108px.
  - Nhãn "GIỜ CHIẾU" (11px mono) khoảng 76px, vừa.
  - Giá trị dài bị cắt bằng ellipsis, danh sách gốc vẫn hiện đủ.
  - `minmax(0,1fr)` nên không tràn ngang.
- **Màn nhỏ**: dưới 768 là 2 cột, dưới 520 là 1 cột, CTA luôn chiếm cả hàng. Không có hồi quy.
- **Điều kiện ghim, range svh, `opacity` luôn 1 của `hsLit`** không đổi so với round 1 (đã đạt).
- **Hex đã đổi sang token** có thật trong globals (`--color-surface-elevated`, `--color-chrome`, `--color-bg`, `--color-surface`). Không còn hex trong `page.tsx`. Còn lại `rgb()` cho lớp phủ và vệt sáng, giữ đúng giá trị preview.

## Findings

### BLOCKER
Không có.

### MAJOR
Không có.

### MINOR (Residual, chuyển task-07/integration)
1. `requestAnimationFrame` (`quick-book-bar.tsx:156`) và `setTimeout` (`:150`) không được huỷ khi unmount. Nếu component bị gỡ đúng lúc, sẽ có một lần setState/focus vô hại trên component đã gỡ. Nên huỷ bằng ref + cleanup effect.
2. `aria-label` trên `<div className="qbar">` (`:226`) vẫn không có tác dụng (div không có role). Nên chuyển sang `<form aria-label>` hoặc `<section>`.
3. Còn mở từ round 1:
   - Mốc đóng bán cố định 15'.
   - Tải lỗi cả 7 ngày thì hiện "Chưa có suất" thay vì báo lỗi.
   - `--bar` lệch 1px so với header, và hero lệch thêm khi có `UnverifiedEmailBanner`.
   - Lệch pha thẻ rạp theo `index%3` không khớp lưới 2 cột ở md.
   - `QuickBookBar` và `HomePage` dài hơn 50 dòng.
4. AC-32 cần Playwright ở integration:
   - Quét `[data-scrub]` opacity ở 390×844, 1280×800, 1440×900 và 1920×1080, đặc biệt thẻ rạp cuối sát footer (inset 300px; footer chưa có `scrub-inset-0`).
   - Script chỉ quét `[data-scrub]`: `.hs-lead` có `opacity:0` ở cuối trang theo thiết kế.
   - Evidence Playwright do builder tự báo; reviewer không chạy lại được (không được dựng server).

## Verdict
**STRICT PASS**: cả 2 MAJOR của round 1 đã đóng, có test kiểm đúng hành vi. Phần sửa hero không gây hồi quy. Typecheck, lint và test web đều xanh. Các MINOR ghi Residual cho task-07/integration.
