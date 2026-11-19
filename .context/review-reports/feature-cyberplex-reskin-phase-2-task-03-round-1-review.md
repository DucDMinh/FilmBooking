Agent: reviewer

# Review: feature-cyberplex-reskin phase-2 task-03 (round 1)

Trang chủ: hero ghim + QuickBookBar (R-138, AC-31, NFR-19, AC-32). Worktree `E:\FilmBooking\.worktrees\cyberplex-t03`, branch `wt/cyberplex-reskin__phase-2__task-03`, base 41b565b.

## Review level
**STRICT** (nâng từ NORMAL).

## Reason
R-138 là lối tắt điều hướng vào luồng đặt vé (`/dat-ve/<showtimeId>`) và lọc suất bán được. Đổi trang chủ, trang có lưu lượng cao nhất. Có yêu cầu a11y nêu rõ trong spec ("dùng được bằng bàn phím và trình đọc màn hình").

## Blast radius
- File mới: `apps/web/src/lib/quick-book.ts`, `components/catalog/quick-book-bar.tsx`, `components/home/home-hero.tsx`, `components/home/home-hero.css`, cùng 2 file test.
- File sửa: `app/(public)/page.tsx`, `components/catalog/__tests__/home.test.tsx` (1 dòng).
- Code dùng chung bị phụ thuộc (không sửa): `isShowtimeOnlineClosed`, `generateNext7Days`, `formatVnTime` trong `components/catalog/showtime-schedule.tsx`. Task-04 đang sửa file này song song nên có **rủi ro khi merge**: nếu đổi tên hoặc chữ ký các hàm đó thì `quick-book.ts:2` gãy. Typecheck ở integration sẽ bắt được.
- Không có API mới. Gọi `GET /cinemas/:code?date=` (R-44) 7 lần mỗi lần chọn rạp, qua `/api/proxy` (`lib/api/client.ts:30`, dùng được từ client).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm --filter ./apps/web typecheck/lint/test` | agent-guard chặn (ngoài allowlist), chuyển sang lệnh gốc |
| `pnpm typecheck` (root) | apps/api lỗi do worktree thiếu `node_modules` của api, không liên quan task. `cd apps/web && pnpm typecheck`: **PASS** |
| `pnpm lint` (root) | **PASS** (shared, api, web) |
| `pnpm test` (root) | shared PASS. apps/api lỗi `vitest not recognized` (thiếu node_modules) nên web không chạy. `cd apps/web && pnpm test`: **PASS 52 file / 647 test** |
| `aislop scan --changes --json` | skip, aislop chưa cài (command not found) |
| `npx oxlint` | skip, oxlint chưa cấu hình |
| `ocr` | skip, ocr chưa cài |
| `pnpm build` / Playwright | không chạy (theo brief: cần Supabase) |

## Kiểm theo checklist

**1. R-138/AC-31: logic lọc và điều hướng đạt.**
- 4 `<select>` gốc có `<label htmlFor>`.
- Nguồn dữ liệu đúng endpoint R-44, chạy 7 ngày qua `generateNext7Days`. Ngày tính theo giờ Việt Nam bằng `getVnDateString`, đúng R-57.
- Loại CLOSED/CANCELLED và suất quá mốc 15' (`quick-book.ts:67-71`).
- Loại rạp không OPEN ở 2 lớp: danh sách rạp (`quick-book-bar.tsx:104`) và `detail.cinema.status !== "OPEN"` (`quick-book.ts:156`).
- Đổi ô trước thì reset các ô sau (`applyFieldChange`). Khi đổi rạp, `setShowtimes([])` xoá suất cũ nên không lẫn suất của rạp trước. Có chống race (`latestRequest`).
- Ô không còn lựa chọn hiện "Chưa có suất". Thiếu ô thì báo lỗi và không điều hướng. Guest vẫn điều hướng (không chặn phía client).
- URL: `showtimeId` chỉ lấy từ `option.value`, tức id suất do API trả, và được `encodeURIComponent`. Đích luôn là đường dẫn tương đối `/dat-ve/...`, không có rủi ro open-redirect/XSS.
- Enum khớp shared: `SHOWTIME_STATUS_VALUES = ON_SALE|CLOSED|CANCELLED`, `CINEMA_DB_STATUSES = COMING_SOON|OPEN|TEMP_CLOSED|CLOSED`. Mock trong test dùng đúng giá trị.
- Mốc mặc định 15' chấp nhận được: `CinemaDto` công khai không lộ `online_cutoff_minutes` (test api `catalog.e2e-spec.ts:262` cố ý chặn). R-138 nêu rõ "server vẫn là nơi quyết định cuối". Ghi Residual.

**2. Hero: đúng như preview.**
- Điều kiện ghim đủ 4 vế, khớp preview.html:169-186. Range svh khớp bảng §16.4.
- `hsLit` giữ `opacity: 1` ở mọi keyframe. Ở trạng thái nghỉ nhãn màu brand, vạch dưới đã vẽ.
- `.hs-pin` là phần tử sticky. Tổ tiên (`.hs-scene`, `main`, `div.flex`) không có overflow, globals.css không đặt overflow trên html/body. Các section `overflow-x-clip` là anh em của hero, không phải tổ tiên.
- `margin-top: -2rem` ở md khớp `md:py-8` của main.
- Có `RemoteImage priority`, lớp phủ tối, title dùng `--font-heading`, có một `h1` duy nhất (shell không có h1). Không có banner thì vẫn có fallback "Đặt vé xem phim" và thanh đặt vé dùng được.

**3. AC-32 (phần tử kẹt ẩn):** chưa có bằng chứng Playwright, xem MINOR-5/6.

**4–7.** Xem Findings. Không có `text-danger` dùng làm màu chữ (lỗi dùng `text-danger-text`), không `rounded-*`, không `—/–`, không JS chuyển động hay scroll listener.

## Findings

### BLOCKER
Không có.

### MAJOR

**MAJOR-1: chưa chọn tỉnh thì bàn phím bị kẹt vòng ở thanh đặt vé, Tab tiến không qua được (vi phạm R-138 "dùng được bằng bàn phím", AC-32 điều khoản Tab).**
- Vị trí: `apps/web/src/components/catalog/quick-book-bar.tsx:77` (`onFocus={onBlocked}`) và `:207` (gắn cho cả 4 select).
- Cơ chế:
  1. Tab vào ô Rạp: `onFocus` mở `ProvincePickerDialog`.
  2. Esc đóng hộp thoại. Radix `DialogContentModal.onCloseAutoFocus` gọi `preventDefault()` rồi `context.triggerRef.current?.focus()` (đã kiểm: `node_modules/.pnpm/@radix-ui+react-dialog@1.3.*/dist/index.mjs:174-177`). Ở đây không có `DialogTrigger` nên `triggerRef` là null, focus rơi về `body`.
  3. Tab kế tiếp chạy lại từ đầu trang (skip link, header, CTA hero) rồi vào ô Rạp, hộp thoại lại mở.
- Hệ quả: khách dùng bàn phím mà chưa chọn tỉnh không thể Tab tới lưới phim, danh sách rạp hay footer. Chỉ Shift+Tab từ body mới vòng ngược được, không phải cách dùng thông thường. Đây đúng là trạng thái mặc định của lần truy cập đầu.
- Test không phủ đường bàn phím; test hiện có chỉ dùng `user.click`.
- Đề xuất: bỏ `onFocus`, chỉ mở hộp chọn tỉnh khi kích hoạt (`onMouseDown` như hiện tại cộng `onKeyDown` Enter/Space/ArrowDown/Alt+ArrowDown), hoặc truyền `onCloseAutoFocus` trả focus về đúng select. Thêm test Tab và Esc để chứng minh Tab đi tiếp được.

**MAJOR-2: thông báo lỗi "Vui lòng chọn: ..." có thể không được trình đọc màn hình đọc (vi phạm R-138 "dùng được bằng trình đọc màn hình", phần báo lỗi của AC-31).**
- Vị trí: `apps/web/src/components/home/home-hero.css:223-225` (`.qbar__error:empty { display: none; }`) kết hợp `quick-book-bar.tsx:219` (`aria-live="polite"`).
- Lý do 1: vùng live bị `display:none` thì nằm ngoài cây a11y. Khi chữ lỗi xuất hiện, vùng đó được thêm vào cùng lúc với nội dung, và nhiều cặp trình đọc/trình duyệt không đọc vùng live mới xuất hiện.
- Lý do 2: bấm "Đặt vé" lần 2 với cùng ô thiếu thì `setErrorText` gán lại đúng chuỗi cũ, DOM không đổi nên không có thông báo nào.
- Focus vẫn nằm trên nút submit. `aria-describedby` trên select chỉ được đọc khi người dùng quay lại từng ô.
- Đề xuất: giữ phần tử luôn trong cây a11y (bỏ `display:none`, chỉ thu chiều cao khi rỗng), hoặc dùng `role="alert"`. Khi submit lặp lại thì xoá chuỗi rồi gán lại, hoặc chuyển focus tới ô thiếu đầu tiên.

### MINOR (Residual)

1. **Mốc đóng bán cố định 15'** (`quick-book.ts:49`): rạp cấu hình mốc lớn hơn (ví dụ 45') thì thanh vẫn liệt kê suất mà màn chọn ghế sẽ từ chối. Chấp nhận được vì server quyết định (R-138). Nên ghi gap nếu sau này `CinemaDto` công khai có trường mốc đóng bán.

2. **Lỗi tải hiện như "Chưa có suất"** (`quick-book.ts:153-154`, `quick-book-bar.tsx:171`): cả 7 lệnh gọi lỗi (mạng hoặc 5xx) thì ô Phim hiện "Chưa có suất" thay vì báo lỗi tải. Nên phân biệt lỗi tải với rỗng thật.

3. **`aria-label` trên `<div className="qbar">` bị bỏ qua** (`quick-book-bar.tsx:198`): div không có role nên aria-label vô hiệu. Nên chuyển sang `<form aria-label="Đặt vé nhanh">` hoặc `<section>`.

4. **Hero ghim có thể tràn và bị cắt ở mép trên** (`home-hero.css:17-23` kết hợp `:269-273`). Khi ghim, `.hs-pin` có `height` cố định, `overflow: hidden` và `justify-content: flex-end`, nên phần tràn mất ở phía trên.
   - Ước lượng ở 768–1080 rộng × 620–700 cao (ví dụ iPad ngang khoảng 1024×690, cửa sổ 900×650), title 2 dòng: thân hero khoảng 370px cộng thanh 2 hàng khoảng 276px, vượt khung ghim 542–612px khoảng 30–60px.
   - Phần bị cắt: padding trên 32px cộng kicker "Phim nổi bật". Title chưa mất.
   - Title dài gãy thành 3 dòng: mất thêm phần đầu title, kể cả ở 1366×657 (title 3 dòng thì tràn khoảng 14px).
   - Cấu trúc sao chép preview nên tôi không xếp MAJOR, nhưng **bắt buộc kiểm Playwright ở integration**: 1024×690 và 1366×657 với title dài khoảng 40 ký tự, khẳng định top của `.hs-title` ≥ top của `.hs-pin`.

5. **AC-32, thẻ rạp cuối sát footer.** Thẻ cuối có `i=2,n=3`, nên range kết thúc ở `entry 100%` với inset đáy `min(36%,300px)`. Muốn hoàn tất, dưới thẻ cần ≥ 300px chỗ cuộn. Hiện có `main pb-8` (32px) cộng footer (`py-10` + 4 cột + dòng bản quyền, ước khoảng 300–340px), tức sát ngưỡng ở 1920×1080. Footer chưa có `scrub-inset-0`. Integration cần chạy Playwright quét `[data-scrub]` ở 4 cỡ màn AC-32.

6. **`.hs-lead` lệch so với preview.** Ở cuối trang `.hs-lead` có `opacity:0` theo thiết kế. Builder thêm `visibility:hidden` (khác preview:157, hợp lý vì tránh CTA vô hình mà vẫn nhận focus). Script AC-32 phải chỉ quét `[data-scrub]`, nếu không sẽ báo sai ở `.hs-lead`.

7. **Hex trong file mới**: `page.tsx` (`from-[#14141B] to-[#0C0C11]` trên thẻ rạp) và `home-hero.css:34,128,175` (lấy từ preview). Nên đổi sang token surface nếu có; không chặn.

8. **`--bar` lệch 1px.** `--bar: 78px` trong khi header là `md:h-[78px]` cộng `border-b` 1px, nên pin trượt dưới header 1px. Ngoài ra, khi `UnverifiedEmailBanner` hiện (không sticky), hero bắt đầu muộn hơn chiều cao banner nên animation chạy trước khi ghim một đoạn đúng bằng chiều cao banner. Chỉ ảnh hưởng thẩm mỹ.

9. **Lệch pha thẻ rạp theo `index % 3`** (`page.tsx`): ở md, lưới chỉ có 2 cột nên pha không khớp cột. Chỉ ảnh hưởng thẩm mỹ.

10. **AI-readable.** `QuickBookBar` khoảng 135 dòng và `HomePage` khoảng 170 dòng, đều vượt 50 dòng/hàm; `HomePage` vốn đã dài. File ≤ 300 dòng, tên rõ, magic number có hằng đặt tên. Tổng 1–2 indicator, chưa tới ngưỡng FAIL. Nên tách `rows` hoặc phần thẻ rạp thành component con.

11. **Repro Verification trong task file đang `Status: BLOCKED`**: thiếu bằng chứng Playwright cuộn 0 → 90svh → 0 (§16.5 kiểm bắt buộc). Đây là task feature nên không tự động FAIL. Tuy vậy AC-31/AC-32 phần chuyển động **chưa được kiểm**; phải chạy ở integration trước khi đóng CR.

### Test
- 12 test mới kiểm đúng logic thật: lọc CLOSED/CANCELLED/quá mốc, rạp không OPEN, 7 ngày, reset ô, điều hướng `/dat-ve/st-1`, lỗi thiếu ô không push, "Chưa có suất", mở picker khi chưa có tỉnh.
- Mock `apiFetch` trả đúng hình dạng `CinemaDetailDto` (`cinema.status`, `showtimes[].movie`), khớp `rap/[code]/page.tsx:35-40`.
- Thiếu test: đường bàn phím (MAJOR-1), cơ chế loại bỏ kết quả tải cũ khi đổi rạp nhanh (race).
- 1 dòng sửa `home.test.tsx:286` hợp lý: tên rạp giờ xuất hiện thêm trong `<option>` của QuickBookBar nên `getByText` sẽ trùng.

## Verdict
**FAIL**: 2 MAJOR (MAJOR-1 kẹt Tab khi chưa chọn tỉnh; MAJOR-2 vùng `aria-live` bị `display:none`). Cả hai vi phạm trực tiếp câu "dùng được bằng bàn phím và trình đọc màn hình" của R-138 và điều khoản Tab của AC-32. Phần logic lọc suất, điều hướng an toàn và hero CSS đạt.

Sửa tối thiểu cho round 2:
- `quick-book-bar.tsx:77`: bỏ `onFocus`, mở picker bằng mousedown/keydown, thêm test Tab/Esc.
- `home-hero.css:223-225`: bỏ `display:none` trên vùng live, hoặc dùng `role="alert"` và xử lý trường hợp submit lặp lại cùng lỗi.
