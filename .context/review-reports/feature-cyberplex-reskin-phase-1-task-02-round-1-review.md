Agent: reviewer

# Review: feature cyberplex-reskin · phase-1-task-02 · round 1

- Task: `tasks/feature-cyberplex-reskin/phase-1-task-02.md` (CR-010 re-skin CYBERPLEX: shell và component dùng chung)
- Diff: `git diff -- apps/web` (17 file, +191/-127); task-01 đã commit `75866c7`.
- **Review level: STRICT**
- **Reason:** shared component dùng ở mọi trang khách và admin (SiteHeader, SiteFooter, AgeBadge, EmptyState/ErrorState/LoadingState, TicketCard/TicketDetail/TicketQr), có nội dung pháp lý bắt buộc (R-132, R-133), có a11y (NFR-12).
- **Blast radius:** mọi route `(public)` (header, footer, scanline), khoảng 60 chỗ gọi EmptyState/ErrorState (public và admin), AgeBadge ở movie-card, order-summary, phim/[slug], rap/[code], dat-ve, admin/phim, các trang vé `/ve`, `/ve/[bookingCode]`, `/dat-ve/don/[id]/ket-qua`, cùng 404/500/403 và global-error.

## Verify commands (chạy độc lập, mỗi lệnh 1 lần)

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | exit 0 (shared, api, web) |
| `pnpm lint` | exit 0 |
| `pnpm test` | PASS: shared 31/31, api 658/658, web 628/628 (50 file), scripts 31/31 |
| `pnpm build` | exit 0 (Next 16.4.6, 41 trang) |
| Soi CSS build `.next/static/chunks/1g4gd7tlmrj_-.css` | có `.scanline{z-index:12;pointer-events:none;opacity:.04;...position:fixed;inset:0}`, `.grid-bg{z-index:-1;pointer-events:none;...mask-image...}`, `@media print` có `.scanline{display:none}`, `.bg-danger-soft\!{...!important}`, `bg-chrome/88`, `h-[78px]`, `after:scale-x-0`, `duration-250` |
| aislop | skip, aislop not installed (exit 127) |
| oxlint | skip, oxlint not configured |
| Open Code Review | skip, ocr not installed |
| AI-friendly web | N/A (task không đổi robots/sitemap/llms) |

## Findings

### MAJOR

**M1. Chế độ "Mở vé toàn màn hình" (QR) bị vỡ vì `clip-path` trên phần tử tổ tiên mới thêm (hồi quy R-87).**
- `apps/web/src/components/ticket/ticket-card.tsx:88` bọc khối QR bằng `<div className="chamfer-lg bg-surface p-3">`, mà `chamfer-lg` là `clip-path: var(--clip-card)`.
- `apps/web/src/components/ticket/ticket-qr.tsx:90` render `FullscreenTicket` **ngay tại chỗ, không qua portal**. Lớp phủ dùng `fixed inset-0 z-50` (`ticket-qr.tsx:58`).
- Một `clip-path` khác `none` cắt mọi phần tử con, kể cả con `position: fixed`. Nó cũng tạo stacking context riêng, nên `z-50` của lớp phủ chỉ có hiệu lực bên trong khung thẻ và không vượt được sticky header (`z-40`).
- Hậu quả: nhấn "Mở vé toàn màn hình" thì nền trắng và QR 304px chỉ hiện trong phạm vi thẻ cắt góc, bị cắt mất phần lớn, và có thể nằm dưới header. Màn hình QR toàn màn hình để staff quét (R-87) không dùng được nữa.
- Trước diff, phần tử bọc chỉ có `rounded-lg border`, không có clip-path, nên đây là hồi quy do task này gây ra.
- Test jsdom không tính layout nên vẫn xanh: đây là false-confidence.
- **Đề xuất:** render `FullscreenTicket` qua `createPortal(..., document.body)`, hoặc bỏ `clip-path` khỏi mọi tổ tiên của `TicketQr` (ví dụ dựng chamfer bằng lớp nền tuyệt đối anh em thay vì clip chính phần tử bọc).

### MINOR

- **m1. Vòng focus của `TicketCard` chỉ còn 1px, giống hệt trạng thái hover** (`ticket-card.tsx:54`, Link `group frame`).
  - Quy tắc `.frame:focus-visible` (globals.css:206-209) vẽ `box-shadow: inset 2px`, nhưng con `frame-in` (nền `surface`) phủ kín, chỉ chừa padding 1px. Vì vậy focus chỉ hiện thành viền vàng 1px, trùng với hover (`hover:[--frame-color:var(--color-brand)]`).
  - Vẫn "thấy được" theo WCAG 2.1 AA 2.4.7, nhưng yếu so với ý định của T7.
  - **Đề xuất:** thêm `focus-visible:[--frame-color:var(--color-brand)]` và `group-focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)]` trên `frame-in` (hoặc tăng padding khung khi focus).
- **m2. Nav header không có `whitespace-nowrap`** (`site-header.tsx:43`).
  - Ở 768px, khi `displayName` dài và có thêm nút Đăng xuất, nhãn "LỊCH CHIẾU" (tracking .12em) có thể xuống 2 dòng, trái yêu cầu nav một dòng.
  - **Đề xuất:** thêm `whitespace-nowrap shrink-0` vào `navLinkClass`.
- **m3. Viền nét đứt của khung QR chạm đường chamfer** (`ticket-card.tsx:88-89`). Padding `p-3` (12px) cộng 12px vừa bằng `--cut-lg` 24px, nên góc trên phải và dưới trái của viền nét đứt bị cắt sát.
  - **Đề xuất:** dùng `p-4` hoặc lớn hơn cho lớp chamfer ngoài (nếu vẫn giữ cách làm này sau khi sửa M1).
- **m4. Thụt lề JSX lệch** ở `apps/web/src/app/not-found.tsx:13-24` (`<main>` không thụt vào trong div mới) và `ticket-card.tsx:72-99` (nội dung `frame-in` và khối QR). Lint vẫn qua nhưng khó đọc.
  - **Đề xuất:** chạy formatter cho 2 file.
- **m5. Còn dấu gạch dài ngoài phạm vi task:** `apps/web/src/app/(auth)/layout.tsx:11` (`aria-label="CINEMO – Trang chủ"`), `app/(public)/dieu-khoan/page.tsx:14,74` ("Không huỷ – Không hoàn").
  - **Đề xuất:** ghi cho phase 2 (auth/legal) xử lý theo T8.
- **m6. Chưa có `lib/z-index.ts`** như tokens §3.3 yêu cầu: z-index 12 của scanline đang viết cứng trong `globals.css:305`. Việc này có từ task-01, không chặn task này.
  - **Đề xuất:** gom vào task sau.

## Đối chiếu checklist bắt buộc

1. **Header và footer.**
   - Header 56px/78px (`h-14 md:h-[78px]`), nền `bg-chrome/88` + `backdrop-blur-[10px]`.
   - Logo Orbitron chỉ có chuỗi ASCII "CINEMO", nav `font-heading` UPPERCASE, gạch chân scaleX.
   - Còn đủ chức năng: đăng nhập/đăng xuất, Sheet mobile (Sheet có portal nên không bị `backdrop-filter` làm hỏng), banner chưa xác nhận email.
   - Phiên bản trước (HEAD) không có chọn tỉnh và tìm kiếm trong header, nên không có gì bị mất.
   - Footer 4 cột, mỗi cột link có `nav aria-label`, không có dòng phiên bản, chưa gắn scrub.
   - `LEGAL_LINKS` giữ nguyên 3 link, route có thật. Link mới `/rap`, `/lich-chieu`, `/ve`, `/tai-khoan` đều tồn tại.
   - Hai câu chính sách cũ vẫn còn, chỉ tách thành 2 dòng.
   - Không có e2e nào phụ thuộc aria-label "Liên kết pháp lý".
   - Kết quả: OK (MINOR m2).
2. **AgeBadge.** Màu đúng tokens §1.6 (P success, K info, T13 warning, T16 brand/brand-soft, T18 danger-text/danger-soft; neutral age-pill + chữ trắng 16.79). Còn `role="img"` và aria-label. Kết quả: OK.
3. **Vé.**
   - Nội dung bắt buộc còn đủ: tên rạp + địa chỉ, "Vé chỉ có giá trị khi quét tại rạp ghi trên vé" (R-132), "Vé không hỗ trợ huỷ / đổi / hoàn tiền." (R-133), QR nền trắng + `aria-label`, mã đặt vé, trạng thái (Badge danger/neutral).
   - Logic polling và trạng thái của `payment-result` không đổi, chỉ đổi markup khối chờ (có thêm `motion-reduce:animate-none`).
   - Dấu gạch chỉ đổi ở chuỗi hiển thị.
   - **Nhưng chức năng toàn màn hình hỏng: M1.**
4. **States.**
   - `role="alert"` còn (nằm trên khung ngoài); icon lỗi dùng `text-danger-text`.
   - `bg-danger-soft!` cần thiết để thắng `background` shorthand của `frame-in`, không gây hại; build có `!important` đúng.
   - Padding `px-4 py-10` lớn hơn đường cắt 24px nên chamfer không cắt chữ.
   - Caller duy nhất truyền className là `ve/page.tsx:43` (`mt-6`), vẫn hợp lệ trên khung ngoài.
   - Kết quả: OK.
5. **A11y.**
   - Skip link vẫn hoạt động, chỉ bỏ `rounded-md`.
   - Scanline có `aria-hidden`.
   - Link header/footer không có clip-path nên outline vẫn thấy.
   - Nút đi qua Button dùng inset ring (T7).
   - Reduced-motion: rule toàn cục trong globals.css:218-220 phủ cả transition gạch chân.
   - Kết quả: OK (MINOR m1).
6. **Scanline.**
   - Chỉ có trong `(public)/layout.tsx:56`, có `pointer-events:none`, z 12 (dưới header 40, dialog/Sheet portal 50+).
   - Tắt khi in; rule đặt cuối file và tách khỏi khối print của scrub.
   - `grid-bg` ở 404 nằm trong cha `relative isolate min-h-dvh`, đặt đúng chỗ.
   - Kết quả: OK.
7. **`global-error.tsx`.** Đã bỏ Inter. Font stack trong globals.css có fallback `system-ui` khi không có biến next/font. Nút `btn-primary` có focus inset. Kết quả: OK.
8. **Dấu gạch dài.** Các file trong phạm vi không còn `—`/`–` trong chuỗi hiển thị (2 comment trong code thì không áp dụng). Hai test chỉ đổi ký tự gạch, assertion nghiệp vụ giữ nguyên. Kết quả: OK (m5 nằm ngoài phạm vi).
9. **Verify.** Xanh toàn bộ, CSS build có đủ utility. Kết quả: OK.
10. **Hồi quy.**
    - AgeBadge thêm `min-h-6` + chamfer-sm, không caller nào truyền className xung đột.
    - EmptyState/ErrorState đã soát ở mục 4.
    - TicketCard/TicketDetail: **hồi quy M1**.

## Verdict: **FAIL**

Lý do: M1 là hồi quy chức năng thật (R-87, QR toàn màn hình bị clip-path của tổ tiên mới cắt), do diff này gây ra, và test jsdom không phát hiện được. Sửa M1 (portal cho `FullscreenTicket` hoặc bỏ clip-path khỏi tổ tiên của `TicketQr`), nên xử lý luôn m1-m4, rồi chạy reviewer round 2.
