Agent: reviewer

# Review: feature-cyberplex-reskin phase-2 task-05 round 1 (CR-010: luồng đặt vé, vé, tài khoản, đăng nhập)

- Worktree: `E:\FilmBooking\.worktrees\cyberplex-t05` (branch `wt/cyberplex-reskin__phase-2__task-05`, base 41b565b), diff chưa commit (41 file M + 1 file mới `app/(public)/dat-ve/layout.tsx`).
- **Review level: STRICT**
- **Reason:** SeatMap (a11y + chọn ghế), đồng hồ giữ ghế, gating checkbox R-71, cảnh báo không huỷ/hoàn R-133, form auth/tài khoản (đổi email, xoá tài khoản). Lỗi UI ở đây gây mất tiền/khiếu nại.
- **Blast radius:** chỉ trình bày (className, icon trang trí, dấu gạch trong chuỗi hiển thị). Shared: `HUD_LABEL` mới export từ `components/auth/auth-ui.tsx`, dùng ở auth + account + voucher-input. `popElement` export từ `seat-map.tsx`, dùng ở seat-picker. Không đụng API/DTO/schema/migration/realtime/hold logic.

## Verify (chạy độc lập trong worktree, mỗi lệnh 1 lần)

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` (root, -r) | apps/api FAIL do worktree thiếu node_modules của api (`Cannot find module '@nestjs/common'`...). Do môi trường, không phải lỗi task (task không đụng apps/api). |
| `cd apps/web && pnpm typecheck` (tsc --noEmit) | PASS, 0 lỗi |
| `pnpm lint` (root, -r: shared/api/web) | PASS |
| `cd apps/web && pnpm test` (vitest) | PASS: 50 files, 629/629 tests (lần chạy này không gặp flaky ChangePasswordForm) |
| `pnpm build` / dev / Playwright | Không chạy (theo brief: cần Supabase) |
| `aislop scan --changes --json` | skip, aislop not installed (`command not found`, exit 127) |
| oxlint | skip, oxlint not configured (không có `.oxlintrc*`) |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A (task reskin, không đổi robots/sitemap/llms) |

## Kiểm bắt buộc

1. **SeatMap hành vi + a11y** (`seat-map.tsx`): so với HEAD, cấu trúc giữ nguyên: `role=grid/row/rowheader/gridcell`, mỗi ghế là `<button>`, `aria-label={seatAriaLabel(...)}` (không đổi), `aria-pressed` chỉ cho ghế bookable, `aria-disabled` cho ghế không chọn được (vẫn focus được), roving `tabIndex`, phím mũi tên `neighbour()`, `onSeatActivate` không đổi. Diff chỉ gồm: className (`STATE_CLASS`, `TYPE_CLASS`, `seatClass`), con của nút đổi từ `<span aria-hidden>{col}</span>` sang `SeatMark` (icon + số, đều `aria-hidden`; ở HEAD span số cũng đã `aria-hidden`, nhãn đọc vẫn là aria-label nên screen reader không mất thông tin), và `onClick` gọi `popElement` trước `onSeatActivate`. Dấu hiệu không-màu có thật: ✓ (Check) cho selected, Timer cho held, X cho sold, Lock + viền đứt cho locked, số gạch ngang + viền đứt cho broken, vạch inset 2px phía trên cho VIP, Heart cho sweetbox. Ghế lẻ R-66: `shadow-[inset_0_0_0_2px_var(--color-danger)]` đặt cuối `cn()` nên tailwind-merge giữ nó thay cho shadow của free/VIP; thông báo `role=alert` + `canContinue` khoá nút Tiếp tục không đổi (xem m2 về hover). Focus: `focus-visible:shadow-[inset_0_0_0_2px_var(--seat-focus,var(--color-brand))]` ở lớp utilities thắng rule base `.chamfer-seat:focus-visible`; selected/held đặt `--seat-focus: fg-on-brand` (vòng tối trên nền sáng), nhìn thấy được. `popElement`: chỉ gọi trong event handler / `useEffect` (client), kiểm `typeof el.animate === "function"` (jsdom bỏ qua), bỏ qua khi `prefers-reduced-motion: reduce`, 160ms không `fill`, không giữ tham chiếu, không chặn `onSeatActivate`. Realtime + toast bỏ chọn khi ghế đang chọn bị người khác giữ: effect trong seat-picker không đổi; test realtime AC-06/AC-07 PASS.
2. **Bất biến nghiệp vụ:** `hold-countdown.tsx` chỉ đổi class (`text-danger` -> `text-danger-text`, `rounded-pill` -> `chamfer-sm`, font-mono cho số); ngưỡng `<=30`/`<=120`, `role=timer`, `aria-live` assertive tại 60s giữ nguyên. `order-summary.tsx` HoldCountdown ngưỡng `<=60` giữ nguyên. `no-refund-warning.tsx`: chỉ đổi class + `–` -> `-` giữa tên rạp và địa chỉ; câu R-133 "không thể huỷ, đổi hoặc hoàn tiền", checkbox `consent-no-refund`, AlertDialog nhắc tên rạp + địa chỉ + suất + ngày giữ nguyên. Phiên bản đồng ý do server quyết (confirm.test.tsx khẳng định body consent không chứa version) nên đổi dấu gạch không ảnh hưởng bằng chứng đồng ý. Dòng "Không hỗ trợ huỷ / hoàn vé" ở seat-picker giữ nguyên. VoucherInput: chỉ class + `HUD_LABEL`; lỗi vẫn `role=alert`, `id=voucher-error`.
3. **Scrub/NFR-19/AC-32:** `dat-ve/layout.tsx` bọc `<div className="scrub-inset-0">` bên trong `<main>` của layout (public); không xuất metadata, không phá flex (page con tự là `flex flex-col`). `--scrub-inset: 0px` kế thừa xuống toàn route. SeatMap và danh sách ghế đã chọn không nằm trong `[data-scrub]`. Chỉ `SeatLegend` bọc `<Scrub kind="ltr">` (không tương tác, không chặn đặt vé). Thanh "Màn hình" dùng `data-scrub-wipe` (trang trí, `aria-hidden`, không phải `data-scrub`); với inset 0 và range `entry 0%..55%` nó hiện đủ khi nằm trong khung nhìn lúc vào trang. NoRefund không bị scrub. `ve/page.tsx`, `ve/[bookingCode]/page.tsx` thêm `scrub-inset-0` trên `<main>` hợp lý.
4. **HUD_LABEL:** cú pháp Tailwind v4 `text-[length:var(--text-hud)]!` / `text-fg-muted!` hợp lệ (typecheck + lint + test PASS; `--text-hud`, `--tracking-hud` có trong globals.css). `ui/label.tsx` không có màu danger theo `aria-invalid`, nên `!` không xoá màu lỗi nào (lỗi hiển thị ở `<p>` riêng `text-danger-text`). Không áp lên label checkbox (checkbox điều khoản/consent/tuổi giữ chữ thường). Dấu `*` bắt buộc trong label họ tên là span `text-danger-text` riêng nên vẫn đỏ.
5. **Token:** Grep `text-danger["\s\`]` và `rounded-` trên toàn bộ `components/booking|account|auth` (kể cả file không có trong diff như `hold-expired-dialog.tsx`, `login-required-dialog.tsx`) và các route trong phạm vi: 0 kết quả. Kết quả còn lại chỉ ở route ngoài phạm vi (lich-chieu, phim, rap, trang chủ, admin, staff: thuộc task khác). Heading thêm `font-heading` (h1-h4 đã có base rule). Tổng tiền `font-display` chứa `₫` (U+20AB, Orbitron không có glyph) -> riêng ký tự này rơi sang system-ui; design-tokens (dòng 138, 435) cho phép font-display cho giá tổng, chữ số vẫn Orbitron. Chấp nhận (MINOR m4).
6. **Auth/tài khoản:** Turnstile `theme: "dark"` còn (`turnstile-field.tsx:25`); `aria-describedby`/`role=alert` trong AuthField không đổi; logic đăng nhập/đăng ký/xác nhận/quên mật khẩu/đổi email/xoá tài khoản không đổi (chỉ class, nút phụ outline -> ghost/secondary, bỏ `shadow-cta-glow`).
7. **Test:** `auth-forms.test.tsx` và `common.test.tsx` chỉ đổi `—`/`–` -> `-` cho khớp chuỗi mới; không nới assertion nghiệp vụ.

## Findings

### BLOCKER
Không có.

### MAJOR
Không có.

### MINOR (Residual, gom cho task-07)
- m1 `apps/web/src/components/booking/seat-map.tsx:32` và `apps/web/src/components/booking/seat-legend.tsx:35`: hex thô `#12697A` trong `shadow-[...]` của VIP (trùng `--color-info-line`). Đề xuất: thay bằng `var(--color-info-line)`.
- m2 (regression nhỏ so với HEAD) `apps/web/src/components/booking/seat-map.tsx:23` + `:43`: ở HEAD khung ghế lẻ là `ring-2 ring-danger` (thuộc tính khác `hover:border-brand`) nên vẫn hiện khi hover. Nay cả hai đều là `box-shadow`, và rule `:hover` thắng nhờ specificity, nên khi rê chuột lên ghế lẻ thì khung danger R-66 biến mất; ghế VIP còn trống cũng mất vạch cyan khi hover. Vẫn là MINOR: `hover:` của Tailwind v4 chỉ áp trên thiết bị có hover, và thông báo `role=alert` + nút Tiếp tục bị khoá vẫn thực thi R-66. Đề xuất: không gắn hover shadow khi `orphan` hoặc khi loại ghế là VIP (hoặc hover đổi `bg` thay vì shadow).
- m3 `apps/web/src/components/booking/seat-legend.tsx:28`: mẫu "Hỏng" trong chú thích chỉ có viền đứt + opacity, còn ô ghế hỏng trên sơ đồ có số gạch ngang; chú thích không lặp đúng dấu hiệu. Đề xuất: thêm dấu gạch (vd icon `Minus`) vào swatch Hỏng.
- m4 `apps/web/src/components/booking/order-summary.tsx:122`, `apps/web/src/components/booking/seat-picker.tsx:251`: `text-[27px]` là giá trị tuỳ ý thay vì token chữ; `₫` rơi font fallback trong Orbitron. Đề xuất: dùng token cỡ chữ nếu design-tokens có, và ghi chú chấp nhận fallback `₫`.
- m5 `apps/web/src/lib/legal.ts:5`: `LEGAL_DRAFT_NOTICE` còn `—`, hiển thị trên dieu-khoan/chinh-sach-bao-mat/huong-dan-xoa-du-lieu (T8). File ngoài phạm vi task. Đề xuất: xử lý ở task dọn copy chung.
- m6 `apps/web/src/components/auth/auth-ui.tsx:108,148`: `8–72` còn en-dash (giữ vì test dùng nguyên văn). Đề xuất: đổi cả chuỗi và test ở task-07.
- m7 Import `HUD_LABEL` từ `@/components/auth/auth-ui` được chèn vào nhóm import bên thứ ba (`add-password-form.tsx:6`, `change-email-dialog.tsx:6`, `change-password-form.tsx:7`, `delete-account-dialog.tsx:6`, `profile-form.tsx:6-7`). Đề xuất: chuyển xuống nhóm `@/`.
- m8 `apps/web/src/components/account/avatar-upload.tsx:136`: `chamfer-md` + `border-2` -> clip-path cắt viền ở góc. Đề xuất: dùng shadow inset như ô ghế nếu muốn viền liền.

## AI-readable gate
Không thấy ≥3 indicator: tên rõ (`SeatMark`, `popElement`, `HUD_LABEL`), hàm ngắn, comment giải thích WHY (clip-path cắt border, chống kẹt ẩn). Magic number `27px`, `160ms` có ngữ cảnh. PASS.

## Verdict
**STRICT PASS** (0 BLOCKER, 0 MAJOR, 8 MINOR ghi Residual cho task-07).
