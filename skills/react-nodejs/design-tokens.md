# Design Tokens - FilmBooking (CYBERPLEX re-skin của CINEMO)

> Sinh bởi `.agent/design.md` (Phase 2), 2026-11-19. **Trạng thái: user đã confirm 2026-11-19** (xem design-spec §16.8); triển khai qua `/change` CR-010.
> **Nguồn phong cách:** `C:\Users\Duc Dao\Downloads\index-cyberplex-enhanced (2).html` (cyberpunk: vàng điện `#FCEE09` + đỏ crimson `#FF003C` + cyan, góc cắt chamfer, scanline, nhãn HUD mono). Trích CSS thực từ file, không đoán.
> **Thay thế** bộ token CINEMO (coral `#F06D5B`, Inter, radius 8-22) ngày 2026-11-11. Bố cục, route, component, requirement **không đổi** (xem `.context/design-spec.md`); chỉ đổi lớp "da": màu, font, hình khối góc, chuyển động.
> **Tên token giữ nguyên** (`--color-brand`, `--color-fg-*`, `--color-seat-*`, `--color-success`…) để code đã build chỉ cần đổi giá trị trong `globals.css`. Token mới ở §2, §3.
> Stack: Next.js App Router + Tailwind v4 + shadcn/ui (Radix). **Chỉ dark** (xem §0). Builder không dùng hex thô trong component.

---

## 0. Quyết định nền

| # | Quyết định | Lý do |
|---|---|---|
| T1 | **Chỉ dark**, token đặt trên `:root`, `color-scheme: dark`. Không light mode, không `next-themes`. | Tham chiếu chỉ có dark; D1 cũ giữ nguyên. |
| T2 | **Một accent tương tác duy nhất: vàng `brand`.** Crimson = nguy hiểm/khẩn (lỗi, ghế sắp hết, nút huỷ, đường kẻ gradient trang trí). Cyan = thông tin/VIP. Không dùng crimson/cyan làm nút chính. | Taste §4.2 "Color Consistency Lock". Tham chiếu có 2 màu nóng, nên khoá **vai trò** thay vì khoá số màu. Đây là override có chủ đích vì brief yêu cầu đúng phong cách này. |
| T3 | **Phân vai font (quan trọng):** Orbitron chỉ có subset `latin` (không có `Đ`, `Ế`, `ạ`…), Rajdhani không có `vietnamese`. Chuỗi có dấu tiếng Việt **không bao giờ** dùng 2 font này. Heading tiếng Việt dùng **Chakra Petch** (có `vietnamese`, cùng gu kỹ thuật góc cạnh). Orbitron giữ cho wordmark `CINEMO` và chuỗi ASCII thuần. | Đã kiểm tra bằng Google Fonts CSS API 2026-11-19. Nếu để Orbitron đứng đầu font stack, từng ký tự có dấu rơi sang font khác trong cùng một từ, rất xấu. |
| T4 | **Một ngôn ngữ hình khối: chamfer (cắt góc 45°)** 3 cỡ, ô nhập liệu và bảng vuông (radius 0). Không bo tròn. | Taste §4.4 "Shape Consistency Lock". |
| T5 | Chữ trên nền vàng/crimson/cyan luôn là `--color-fg-on-brand` `#07070A`. | Trắng trên crimson chỉ 3.95. Tối trên vàng 16.6, trên crimson 5.09. |
| T6 | Mobile-first ≥ 360px; input mobile ≥ 16px; vùng chạm ≥ 44px. | NFR-11. |
| T7 | **Focus của phần tử có `clip-path` vẽ bằng `box-shadow: inset`**, không dùng `outline` ngoài. | `clip-path` cắt mất outline nằm ngoài. File tham chiếu mắc lỗi này (outline offset 3px trên nút chamfer là vô hình). |
| T8 | Không có em-dash `—` hay en-dash `–` trong chuỗi giao diện. Dùng hyphen `-` hoặc dấu phẩy/chấm. | Taste §9.G. Áp cho copy hiển thị, không áp cho tài liệu spec. |

### Phần của tham chiếu **không** đưa vào (và lý do)

| Bỏ | Lý do |
|---|---|
| Con trỏ chuột tuỳ biến (reticle) + `cursor: none` | Hại a11y và hiệu năng (taste §9.A). |
| Chữ dọc ở hai mép hero (`.rail`), nhãn `SEC.02 // 08 TITLES`, `CUỘN ĐỂ KHÁM PHÁ`, chấm trạng thái trang trí | Taste §9.F (section-number eyebrow, scroll cue, vertical text, decorative dots). |
| Màn `#boot` loading, nút SFX/equalizer | Chặn LCP; âm thanh ngoài phạm vi. |
| Tên "CYBERPLEX", năm "2099", nội dung IMAX/4DX/story | Thương hiệu giả lập; sản phẩm này là CINEMO, dữ liệu từ DB. |
| Glow neon lan toả | Tham chiếu dùng bóng đổ cứng lệch (`drop-shadow(5px 5px 0)`), giữ kiểu đó; glow mờ chỉ ở viền focus nút khi "armed". |

---

## 1. Colors

### 1.1 Nền và bề mặt

| Token | Hex | Nguồn | Dùng cho |
|---|---|---|---|
| `--color-bg` | `#070709` | ref `--void` | Nền trang |
| `--color-chrome` | `#0B0B10` | ref nav `rgba(7,7,9,.88)` đặc | Header, sidebar admin, topbar, bottom nav |
| `--color-surface` | `#111116` | ref `--surface` | Card, panel, bảng |
| `--color-surface-elevated` | `#1B1B24` | ref hover `#1B1B22`, chỉnh nhẹ | Popover, dropdown, dialog, hàng hover |
| `--color-surface-input` | `#0A0A0F` | ref `.input` | Nền input/select/textarea |
| `--color-surface-control` | `#17171E` | ref `--surface-2` | Nút secondary, chip chưa chọn |
| `--color-border` | `rgb(255 255 255 / 0.10)` | ref `--line-soft` ~0.08, nâng nhẹ | Viền trang trí, divider (không mang thông tin) |
| `--color-border-subtle` | `rgb(255 255 255 / 0.07)` | ref | Kẻ ngăn trong card |
| `--color-border-input` | `#6E6E86` | **[điều chỉnh]** ref `rgba(255,255,255,.16)` ≈ 1.6:1 | Viền input/checkbox/radio (3.80 với surface, đạt 1.4.11) |
| `--color-line-brand` | `rgb(252 238 9 / 0.25)` | ref `--line` | Viền khung card chamfer mặc định |
| `--color-overlay` | `rgb(4 4 7 / 0.84)` | ref `.sheet::backdrop` | Lớp phủ dialog |

### 1.2 Chữ

| Token | Hex | Nguồn | Dùng cho |
|---|---|---|---|
| `--color-fg` | `#E8E8EF` | ref `--ink` | Tiêu đề, nội dung chính, số |
| `--color-fg-secondary` | `#A0A0B0` | ref `--ink-dim` | Mô tả, meta, nhãn form |
| `--color-fg-muted` | `#8A8AA0` | **[điều chỉnh]** ref `--ink-faint #74748A` chỉ 4.13 | Placeholder, chú thích, nhãn HUD |
| `--color-fg-on-brand` | `#07070A` | ref `.btn--solid` | Chữ trên vàng, crimson, cyan, ghế chọn |
| `--color-link` | `#FCEE09` | ref `.footer a:hover` | Link chữ, gạch chân khi hover |

### 1.3 Accent và trạng thái

| Token | Hex | Vai trò |
|---|---|---|
| `--color-brand` | `#FCEE09` | **Hành động chính**: nút CTA, chip đang chọn, ghế đang chọn, tab active, focus, số tiền tổng |
| `--color-brand-hover` | `#FFF75E` | Hover nút chính |
| `--color-brand-soft` | `#2A2706` | Nền badge, mục active |
| `--color-danger` | `#FF003C` | **Chỉ dùng làm nền** (nút phá huỷ, chip khẩn) với chữ `fg-on-brand` (5.09). Thanh/viền trang trí gradient vàng-crimson |
| `--color-danger-text` | `#FF4D6D` | **[bổ sung]** Chữ/icon lỗi trên mọi bề mặt (5.32 đến 6.26). `#FF003C` làm chữ chỉ đạt 4.33 trên elevated |
| `--color-danger-hover` | `#FF2E5F` | Hover nút phá huỷ |
| `--color-info` | `#37E6FF` | Thông tin, VIP, trạng thái "Đã check-in". Thông tin/VIP; không còn dùng cho hiệu ứng glitch |
| `--color-success` | `#2FF2A0` | **[bổ sung ngoài tham chiếu]** Trạng thái tốt: "VÉ HỢP LỆ", giữ ghế còn nhiều. Cần vì cyan đã mang nghĩa "thông tin" |
| `--color-warning` | `#FF9F1A` | **[bổ sung]** Cảnh báo tuổi, đồng hồ ≤ 2', ghế đang giữ. Cam, tách khỏi vàng brand |
| `--color-danger-strong` | `#FF8FA3` | Tiêu đề khối cảnh báo trên nền danger-soft |
| `--color-success-strong` | `#8CFFCB` | Chữ nhấn trên banner thành công |
| `--gradient-brand` | `linear-gradient(100deg, rgb(252 238 9 / .85), rgb(255 0 60 / .55) 46%, rgb(252 238 9 / .35))` | **Chỉ trang trí**: viền khung `QuickBookBar`, vạch dưới tiêu đề. Không dùng làm nền nút |

### 1.4 Nền "soft" cho badge và banner

| Token nền | Hex | Token viền | Hex | Chữ |
|---|---|---|---|---|
| `--color-brand-soft` | `#2A2706` | `--color-brand-line` | `#5E5710` | `--color-brand` (12.49) |
| `--color-success-soft` | `#0A2A1E` | `--color-success-line` | `#12684A` | `--color-success` (10.51) |
| `--color-success-banner` | `#06241A` | - | - | `--color-success-strong` |
| `--color-danger-soft` | `#2A0A12` | `--color-danger-line` | `#7A1830` | `--color-danger-text` (5.68) |
| `--color-danger-banner` | `#2E0912` | - | - | `--color-danger-strong` |
| `--color-warning-soft` | `#2A1C08` | `--color-warning-line` | `#7A4F10` | `--color-warning` (8.06) |
| `--color-info-soft` | `#08262C` | `--color-info-line` | `#12697A` | `--color-info` (10.52) |
| `--color-neutral-soft` | `#1E1E27` | - | - | `--color-fg-secondary` (6.42, không dùng muted) |
| `--color-age-pill` | `#191D2A` | - | - | `#FFFFFF` (16.79) |

### 1.5 Ghế (SeatMap)

Ô ghế **vuông cắt góc nhỏ** (chamfer 4px), 32×28 desktop. Viền + ký hiệu giữ nguyên để đạt 1.4.11 và 1.4.1 (không chỉ dựa vào màu).

| Trạng thái | Fill | Viền | Ký hiệu không-màu | Chữ số |
|---|---|---|---|---|
| Còn trống | `--color-seat-available` `#1C2230` | `--color-seat-available-line` `#5A6A86` (3.44) | ô trơn | `fg-secondary` |
| Đang chọn (của tôi) | `--color-seat-selected` `#FCEE09` | không | dấu ✓ góc trên + số đậm | `fg-on-brand` |
| Đang được giữ | `--color-seat-held` `#FF9F1A` | không | icon đồng hồ 10px | `fg-on-brand` |
| Đã bán | `--color-seat-sold` `#2A2A33` | không | dấu × `--color-seat-sold-mark` `#8A8AA0` thay số | - |
| VIP (còn trống) | `--color-seat-vip` `#12333D` | `--color-seat-vip-line` `#37E6FF` | vạch 2px cyan phía trên ô | `fg` |
| Khoá | `--color-seat-locked` `#1B1B24` | `--color-seat-locked-line` `#6A6A80` nét đứt | icon ổ khoá | - |
| Sweetbox (ghế đôi) | `--color-seat-sweetbox` `#3B1226` | `--color-seat-sweetbox-line` `#FF4D8D` | ô rộng 2 cột + icon tim | `fg` |
| Màn hình | `--color-seat-screen` `#9A9AB0` | | thanh 6-7px, hiệu ứng tia quét xem §5 | |

Ghế đang chọn dùng vàng nên tách rõ khỏi ghế VIP (cyan) và sweetbox (hồng). Ghế đang giữ cam, cách vàng bằng icon đồng hồ.

### 1.6 Nhãn độ tuổi (AgeRatingBadge)

Mặc định `tone="neutral"`: `--color-age-pill` + chữ trắng. `tone="semantic"`:

| Nhãn | Nền | Chữ |
|---|---|---|
| P | `success-soft` | `success` |
| K | `info-soft` | `info` |
| T13 | `warning-soft` | `warning` |
| T16 | `brand-soft` | `brand` |
| T18 | `danger-soft` | `danger-text` |

Luôn có chữ nhãn + `role="img"` + `aria-label="Phân loại T16: ..."`.

### 1.7 Trạng thái đơn, soát vé, thực thể

Bảng nhãn/tone giữ nguyên bản CINEMO (`.context/design-spec.md` §6, tokens cũ §1.8): tone `warning/success/info/neutral/danger` map sang các token §1.4 ở trên. Kết quả soát vé: hợp lệ = `success-banner` + `success-strong`; thất bại = `danger-banner` + `danger-strong`. **Nhãn kết quả giữ chữ + icon**, không chỉ màu.

---

## 2. Typography

### 2.1 Font (4 họ, mỗi họ một việc)

| Token | Họ | Subset nạp | Weight | Chỉ dùng cho |
|---|---|---|---|---|
| `--font-display` | **Orbitron** | `latin` | 700, 900 | Wordmark `CINEMO`, số lớn (giá tổng, đếm giờ, mã ghế `E5`), chuỗi ASCII thuần. **Cấm** chuỗi có dấu tiếng Việt |
| `--font-heading` | **Chakra Petch** | `latin`, `latin-ext`, `vietnamese` | 600, 700 | Tiêu đề h1-h3, tên phim, tên rạp, nhãn nút, nhãn chip. Thường UPPERCASE |
| `--font-sans` | **Be Vietnam Pro** | `latin`, `latin-ext`, `vietnamese` | 400, 500, 600, 700 | Nội dung, mô tả, input, bảng |
| `--font-mono` | **JetBrains Mono** | `latin`, `latin-ext`, `vietnamese` | 400, 500 | Nhãn HUD (overline), mã đặt vé, số giờ/đồng hồ nhỏ, khoá |

`next/font/google`, `display: 'swap'`, mỗi họ khai `subsets` đúng bảng, biến `--font-orbitron`, `--font-chakra`, `--font-be-vietnam`, `--font-jetbrains`. Bỏ `Inter` và `Rajdhani`.

Quy tắc fallback: `--font-heading: var(--font-chakra), var(--font-be-vietnam), system-ui, sans-serif`. **Không** đặt Orbitron làm font đầu của chuỗi có thể chứa tiếng Việt.

### 2.2 Thang cỡ chữ

| Token | Desktop | Mobile (< 768) | Họ / weight | Line-height | Dùng cho |
|---|---|---|---|---|---|
| `--text-display` | `clamp(48px, 8vw, 112px)` | 44 | heading 700 UPPERCASE, tracking -0.03em | 0.95 | Tên phim hero (chỉ 1 chỗ/trang) |
| `--text-h1` | 40 | 30 | heading 700 UPPERCASE | 1.05 | Tiêu đề trang |
| `--text-h2` | 30 | 24 | heading 700 UPPERCASE | 1.1 | Tiêu đề section |
| `--text-h3` | 18 | 17 | heading 700 | 1.3 | Tiêu đề card/panel, tên phim trong card |
| `--text-body` | 15 | 15 | sans 400 | 1.65 | Nội dung |
| `--text-body-sm` | 13 | 13 | sans 500 | 1.5 | Nhãn nút, bảng, sidebar |
| `--text-small` | 12 | 12 | sans 400-600 | 1.45 | Meta, badge |
| `--text-hud` | 11 | 11 | mono 400, UPPERCASE, tracking 0.16em | 1.8 | Overline/nhãn HUD ("BƯỚC 2 / 4", "RẠP ĐÃ CHỌN") |
| `--text-input-mobile` | - | **16** | sans 400 | 1.4 | input/select/textarea dưới `md` |

Sàn cỡ chữ: HUD ≥ 11px (tham chiếu dùng 8.5-10.5px, **nâng lên**). Thông tin bắt buộc (giá, giờ, ghế, tên + địa chỉ rạp, cảnh báo không hoàn) ≥ 12px.
Chữ HOA tiếng Việt có dấu chồng cao: line-height display ≥ 0.95 chỉ dùng cho Chakra Petch, kiểm bằng "TRẦN MỸ ẨN"; các heading còn lại ≥ 1.05; không cắt `overflow` dọc.

### 2.3 Hiệu ứng chữ

| Token | Giá trị | Dùng |
|---|---|---|
| `--tracking-hud` | `0.16em` | Nhãn mono |
| `--tracking-btn` | `0.08em` | Nhãn nút UPPERCASE |
| Outline text | `color: transparent; -webkit-text-stroke: 1.5px rgb(232 232 239 / .72)` | Dòng thứ 2 của tên phim hero. Chỉ cỡ ≥ 48px |

---

## 3. Hình khối, khoảng cách, bóng, layout

### 3.1 Chamfer (ngôn ngữ hình khối duy nhất)

| Token | Giá trị | Dùng |
|---|---|---|
| `--cut-lg` | `24px` | Card, panel, dialog, `QuickBookBar` |
| `--cut-md` | `12px` | Nút, tab, ô chọn ngày/giờ |
| `--cut-sm` | `7px` | Chip, badge, nhãn tuổi |
| `--cut-seat` | `4px` | Ô ghế |
| `--clip-card` | `polygon(0 0, calc(100% - var(--cut-lg)) 0, 100% var(--cut-lg), 100% 100%, var(--cut-lg) 100%, 0 calc(100% - var(--cut-lg)))` | Cắt chéo góc trên-phải và dưới-trái |
| `--clip-btn` / `--clip-chip` | như trên với `--cut-md` / `--cut-sm` | |

Khung viền chamfer = 2 lớp: lớp ngoài `padding: 1px; background: var(--frame-color)` + `clip-path`, lớp trong `background: surface` + cùng `clip-path` (cách của tham chiếu; CSS `border` không đi theo `clip-path`).
**Vuông (radius 0):** input, select, textarea, bảng, hàng dữ liệu, thanh tiến độ. **Admin/Staff** dùng chamfer ở nút, badge, dialog; card dữ liệu chỉ `--cut-sm` hoặc vuông để không cắt nội dung bảng.

`--radius-*` trong shadcn đặt `0`: `--radius: 0px`, `--radius-sm/md/lg: 0`, `--radius-pill` **không dùng**. Chip và badge dùng `--clip-chip`.

### 3.2 Spacing (đơn vị 4, Tailwind mặc định)

Giữ nguyên thang CINEMO: 4/8/12/16/24/32/48. Section khách hàng `padding-block`: 108px desktop, 76px < 900. Admin 32px.

### 3.3 Bóng và hiệu ứng nền

| Token | Giá trị | Dùng |
|---|---|---|
| `--shadow-overlay` | `0 14px 40px rgb(0 0 0 / 0.6)` | Dialog, toast, popover |
| `--shadow-hard-brand` | `drop-shadow(5px 5px 0 rgb(255 0 60 / 0.9))` | Hover nút vàng (bóng lệch cứng, không blur) |
| `--shadow-hard-danger` | `drop-shadow(5px 5px 0 rgb(252 238 9 / 0.55))` | Hover nút crimson |
| `--scanline` | `repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.5) 0 1px, transparent 1px 3px)` ở `opacity: 0.04` | Lớp phủ cố định `pointer-events: none`, **chỉ** trang khách. Tắt ở admin, soát vé, in |
| `--grid-bg` | lưới 84px `rgb(255 255 255 / 0.035)`, mask radial từ đỉnh | Chỉ hero trang chủ và 404. Không đặt sau nội dung đọc dài hay bảng |
| `--grain` | SVG `feTurbulence` `opacity: .12` trên pseudo `fixed`, `pointer-events: none` | Chỉ khung cinematic (hero), không trên container cuộn |

Không dùng gradient chữ cho tiêu đề lớn (taste §9.A). Nút chính là **vàng đặc**.

### 3.4 Layout

| Token | Giá trị |
|---|---|
| `--layout-content-max` | 1340px (khách; tham chiếu `.shell`), gutter `calc(100% - 96px)` ≥ 900, `- 48px` < 900, `- 32px` < 560 |
| `--layout-admin-sidebar` | 250px |
| `--layout-header-h` | 78px desktop (≤ 80 theo taste), 56px mobile |
| `--layout-admin-topbar-h` | 72px |
| `--layout-bottom-nav-h` | 64px + `env(safe-area-inset-bottom)` |
| `--layout-booking-aside` | 370px |
| Breakpoints | `sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1440` |
| Z-index | Thực tế đang dùng (không có file `lib/z-index.ts`): `scanline 12` · `header 40` · `dialog / dropdown / overlay 50` (mặc định shadcn) · `ticket QR toàn màn hình 60`; toast do Sonner tự quản. Không thêm `z-[n]` tuỳ ý, cần tầng mới thì chọn trong dãy trên |

Dùng `min-h-[100dvh]`, không `h-screen`. Hero: `min-height: 100svh`.

---

## 4. Motion (chạy theo cuộn; kịch bản chi tiết ở `design-spec.md` §16.4)

### 4.1 Token

| Token | Giá trị | Dùng |
|---|---|---|
| `--enter-x` | 56px desktop / 24px mobile | Quãng trượt ngang khi vào |
| `--enter-y` | 48px desktop / 28px mobile | Quãng trượt dọc khi vào |
| `--scale-from` | 0.86 desktop / 0.92 mobile | Scale lúc bắt đầu |
| `--scale-peak` | 1.05 | Đỉnh "phóng to" ở 70% tiến độ, sau đó về 1 |
| `--scrub-spread` | 62% | Tổng độ lệch pha giữa phần tử đầu và cuối của một nhóm |
| `--scrub-inset` | `min(36%, 300px)` | **Hiện muộn:** inset đáy của timeline; phần tử chỉ bắt đầu khi đã lên cao hơn mép dưới ngần này. `0px` cho footer, `/dat-ve/*`, trang ngắn (xem spec §16.4) |
| `--scrub-span` | 38% | Độ dài đoạn cuộn của mỗi phần tử (range `entry A` → `entry A + 38%`) |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Chỉ cho chuyển động **theo thời gian** (hover, dialog, toast, phản hồi chọn ghế) |
| `--dur-hover` | 200ms | Hover, đổi màu (120ms cho đổi trạng thái ghế realtime). Dưới `prefers-reduced-motion` mọi `transition`/`animation` rút về tức thì (NFR-19) |
| `--dur-enter` | 560ms | Chỉ cho vào cảnh theo thời gian (dialog, toast) |

Chuyển động **vào cảnh theo cuộn** dùng easing `linear` (1:1 với vị trí cuộn); không có `duration`.

### 4.2 Hai nhóm

| Nhóm | Áp cho | Hướng | Cách vào |
|---|---|---|---|
| **A. Đặt vé** | Hero ghim + `QuickBookBar`, `DateStrip`, `ShowtimeGroup`, chọn ghế (stepper, màn hình, hàng ghế, chú thích, `BookingSummary`), các khối bước xác nhận/thanh toán | **Trái sang phải** | Từng phần tử một theo tiến độ cuộn, trượt từ trái, scale 0.86 → 1.05 → 1; **cuộn lên thì thu về** |
| **B. Phần bên dưới** | Tiêu đề section, lưới phim, rạp, footer | **Trên xuống** hoặc **từ hai bên** | Như trên; poster có tia vàng quét từ trên xuống |

### 4.3 Ràng buộc

1. Cơ chế: **CSS scroll-driven animations** (`animation-timeline: view()` / `view-timeline` nhóm / `scroll(root)` cho hero ghim). Không JS, không `window.addEventListener('scroll')`, không thư viện.
2. Chỉ animate `translate`, `scale`, `opacity` (thuộc tính riêng lẻ, không `transform` để khỏi xung đột hover). Ngoại lệ có chủ đích: `clip-path` cho wipe tiêu đề và tia quét poster, `filter` cho nút "lên đạn". **Không glitch/nhấp nháy** (WCAG 2.3.1). Ở trạng thái nghỉ mọi chữ/viền điều khiển đạt tương phản; trong lúc chuyển động cho phép fade từ 0 (ngoại lệ có chủ đích), riêng thanh đặt vé nhanh và điều khiển trong khung nhìn lúc vào trang **không bao giờ giảm opacity**.
   - `[data-scrub]:focus-within` ép hiện (không ẩn phần tử đang focus).
3. Chỉ áp trong `@media (prefers-reduced-motion: no-preference)` **và** `@supports (animation-timeline: view())`. Ngoài điều kiện: nội dung hiển thị tĩnh và đầy đủ (không ẩn trước, không CLS, không cần script cứu hộ).
4. Phần tử đã ở trong khung nhìn lúc vào trang có tiến độ hoàn tất, nên **hiện đủ ngay**. Phần tử chỉ thu về khi ở mép dưới khung nhìn, không thu khi trôi khỏi mép trên. Vì vậy trang `/dat-ve/*` dùng được ngay (đồng hồ giữ ghế đang chạy) và ghế đang chọn không bao giờ bị thu về.
5. Hero ghim chỉ ở desktop `≥ 768px` và cao `≥ 620px`; ghim bằng `position: sticky` (section cha dùng `overflow-x: clip`, không `hidden`).
6. Vòng lặp vô hạn bị cấm trên nội dung. "Lên đạn" của nút là scrub, không lặp.
7. Phần tử đang chạy vẫn focus được, đọc được bởi screen reader (không `visibility: hidden`, không `display: none`).
8. Admin và soát vé không dùng nhóm A/B.

---

## 5. Mapping sang shadcn/ui + Tailwind v4

### 5.1 Biến shadcn

| Biến | Giá trị | Token |
|---|---|---|
| `--background` / `--foreground` | `#070709` / `#E8E8EF` | bg / fg |
| `--card` / `--card-foreground` | `#111116` / `#E8E8EF` | surface |
| `--popover` / `--popover-foreground` | `#1B1B24` / `#E8E8EF` | surface-elevated |
| `--primary` / `--primary-foreground` | `#FCEE09` / `#07070A` | brand / fg-on-brand |
| `--secondary` / `--secondary-foreground` | `#17171E` / `#E8E8EF` | surface-control |
| `--muted` / `--muted-foreground` | `#1B1B24` / `#8A8AA0` | |
| `--accent` / `--accent-foreground` | `#1B1B24` / `#E8E8EF` | nền hover item (**không** phải màu thương hiệu) |
| `--destructive` / `--destructive-foreground` | `#FF003C` / `#07070A` | danger |
| `--border` / `--input` / `--ring` | `rgb(255 255 255 / .10)` / `#6E6E86` / `#FCEE09` | |
| `--chart-1..5` | `#FCEE09`, `#37E6FF`, `#FF003C`, `#2FF2A0`, `#FF9F1A` | brand, info, danger, success, warning |
| `--sidebar` / `-foreground` | `#0B0B10` / `#A0A0B0` | chrome / fg-secondary |
| `--sidebar-primary` / `-foreground` | `#FCEE09` / `#07070A` | |
| `--sidebar-accent` / `-foreground` | `#17171E` / `#E8E8EF` | |
| `--sidebar-border` / `--sidebar-ring` | `rgb(255 255 255 / .09)` / `#FCEE09` | |
| `--radius` | `0px` | |

### 5.2 `apps/web/src/app/globals.css` (phần thay đổi)

Giữ cấu trúc 3 khối (`@theme`, `:root`, `@theme inline`) và 2 `@utility` của file hiện có; thay giá trị và thêm:

```css
@theme {
  --color-bg: #070709;  --color-chrome: #0B0B10;
  --color-surface: #111116;  --color-surface-elevated: #1B1B24;
  --color-surface-input: #0A0A0F;  --color-surface-control: #17171E;
  --color-border: rgb(255 255 255 / 0.10);  --color-border-subtle: rgb(255 255 255 / 0.07);
  --color-border-input: #6E6E86;  --color-line-brand: rgb(252 238 9 / 0.25);
  --color-overlay: rgb(4 4 7 / 0.84);

  --color-fg: #E8E8EF;  --color-fg-secondary: #A0A0B0;  --color-fg-muted: #8A8AA0;
  --color-fg-on-brand: #07070A;  --color-link: #FCEE09;

  --color-brand: #FCEE09;  --color-brand-hover: #FFF75E;  --color-brand-soft: #2A2706;  --color-brand-line: #5E5710;
  --color-danger: #FF003C;  --color-danger-hover: #FF2E5F;  --color-danger-text: #FF4D6D;  --color-danger-strong: #FF8FA3;
  --color-danger-soft: #2A0A12;  --color-danger-line: #7A1830;  --color-danger-banner: #2E0912;
  --color-info: #37E6FF;  --color-info-soft: #08262C;  --color-info-line: #12697A;
  --color-success: #2FF2A0;  --color-success-strong: #8CFFCB;
  --color-success-soft: #0A2A1E;  --color-success-line: #12684A;  --color-success-banner: #06241A;
  --color-warning: #FF9F1A;  --color-warning-soft: #2A1C08;  --color-warning-line: #7A4F10;
  --color-neutral-soft: #1E1E27;  --color-age-pill: #191D2A;

  --color-seat-available: #1C2230;  --color-seat-available-line: #5A6A86;
  --color-seat-selected: #FCEE09;   --color-seat-held: #FF9F1A;
  --color-seat-sold: #2A2A33;       --color-seat-sold-mark: #8A8AA0;
  --color-seat-vip: #12333D;        --color-seat-vip-line: #37E6FF;
  --color-seat-locked: #1B1B24;     --color-seat-locked-line: #6A6A80;
  --color-seat-sweetbox: #3B1226;   --color-seat-sweetbox-line: #FF4D8D;
  --color-seat-screen: #9A9AB0;

  --font-display: var(--font-orbitron), "Orbitron", system-ui, sans-serif;           /* ASCII only */
  --font-heading: var(--font-chakra), var(--font-be-vietnam), system-ui, sans-serif;
  --font-sans: var(--font-be-vietnam), system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, "Courier New", monospace;

  --radius-seat: 0px;  --radius-sm: 0px;  --radius-md: 0px;  --radius-lg: 0px;
  --shadow-overlay: 0 14px 40px rgb(0 0 0 / 0.6);
  --breakpoint-2xl: 1440px;
}

:root {
  color-scheme: dark;
  --cut-lg: 24px;  --cut-md: 12px;  --cut-sm: 7px;  --cut-seat: 4px;
  --clip-card: polygon(0 0, calc(100% - var(--cut-lg)) 0, 100% var(--cut-lg), 100% 100%, var(--cut-lg) 100%, 0 calc(100% - var(--cut-lg)));
  --clip-btn:  polygon(0 0, calc(100% - var(--cut-md)) 0, 100% var(--cut-md), 100% 100%, var(--cut-md) 100%, 0 calc(100% - var(--cut-md)));
  --clip-chip: polygon(0 0, calc(100% - var(--cut-sm)) 0, 100% var(--cut-sm), 100% 100%, var(--cut-sm) 100%, 0 calc(100% - var(--cut-sm)));
  --gradient-brand: linear-gradient(100deg, rgb(252 238 9 / .85), rgb(255 0 60 / .55) 46%, rgb(252 238 9 / .35));

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);  --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-enter: 560ms;
  --enter-x: 56px;  --enter-y: 48px;  --scale-from: 0.86;  --scale-peak: 1.05;

  /* biến shadcn: xem §5.1 */
}

@media (max-width: 767.98px) {
  :root { --enter-x: 24px; --enter-y: 28px; --text-display: 44px; --text-h1: 30px; --text-h2: 24px; --text-h3: 17px; }
}
```

Utility cần có (`@utility`): `chamfer-lg`, `chamfer-md`, `chamfer-sm` (gán `clip-path`), `frame` (khung viền 2 lớp §3.1), `hud` (mono 11px UPPERCASE tracking 0.16em `fg-muted`), `scrub-*` (§4, spec §16.4: keyframes `scrubPop`, `wipeIn`, `drawX`, `beamOpen`, `beamLine`).

Focus (T7), đặt trong `@layer base`:

```css
:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 3px; }   /* phần tử không clip-path */
.chamfer-lg:focus-visible, .chamfer-md:focus-visible, .chamfer-sm:focus-visible, .btn:focus-visible {
  outline: none; box-shadow: inset 0 0 0 2px var(--focus-inset, var(--color-brand));
}
.btn-primary:focus-visible { --focus-inset: #07070A; }   /* nền vàng: vòng tối */
```

### 5.3 Nút (CTA)

| Biến thể | Nền | Chữ | Hover | Ghi chú |
|---|---|---|---|---|
| `primary` | `brand` đặc, `clip-btn` | `fg-on-brand` | `brand-hover` + `shadow-hard-brand`, `translateY(-1px)` | **Một CTA mỗi màn**. Nhãn UPPERCASE Chakra Petch 700, 13px, tracking 0.08em, `min-height: 46px` |
| `danger` | `danger` đặc | `fg-on-brand` | `danger-hover` + `shadow-hard-danger` | Luôn qua AlertDialog |
| `outline` | khung 1px crimson, nền `rgb(255 0 60 / .10)` | `fg` | nền .22 | Hành động phụ nhấn mạnh (vd "Xem trailer") |
| `ghost` | khung 1px `rgb(255 255 255 / .16)`, nền `surface` | `fg` | khung vàng | Hành động phụ |
| disabled | `opacity: .45`, `cursor: not-allowed`, bỏ hover | | | Kèm dòng giải thích ngay dưới khi là nút Thanh toán (R-71) |

Nhãn nút không xuống dòng ở desktop (`white-space: nowrap`).

---

## 6. Bảng kiểm tương phản (WCAG 2.1 AA), tính bằng công thức luminance 2026-11-19

### 6.1 Chữ

| Chữ | Nền | Tỉ lệ | |
|---|---|---|---|
| fg `#E8E8EF` | bg / surface / elevated | 16.50 / 15.44 / 14.01 | PASS |
| fg-secondary `#A0A0B0` | bg / surface / elevated | 7.81 / 7.31 / 6.63 | PASS |
| fg-muted `#8A8AA0` | bg / surface / elevated / input | 5.96 / 5.58 / 5.06 / 5.85 | PASS |
| `#74748A` (ref `--ink-faint`) | surface | **4.13** | **FAIL, thay bằng fg-muted** |
| brand `#FCEE09` (chữ) | bg / surface / elevated | 16.65 / 15.57 / 14.14 | PASS |
| fg-on-brand `#07070A` | brand / brand-hover / danger / info / success / warning | 16.64 / 17.93 / 5.09 / 13.34 / 13.73 / 9.80 | PASS |
| danger `#FF003C` (chữ) | surface / **elevated** | 4.77 / **4.33** | FAIL ở elevated, **chỉ dùng làm nền**; chữ dùng `danger-text` |
| danger-text `#FF4D6D` | bg / surface / elevated / danger-soft | 6.26 / 5.86 / 5.32 / 5.68 | PASS |
| info `#37E6FF` | surface / info-soft | 12.48 / 10.52 | PASS |
| success `#2FF2A0` | surface / success-soft | 12.84 / 10.51 | PASS |
| warning `#FF9F1A` | surface / warning-soft | 9.17 / 8.06 | PASS |
| brand | brand-soft `#2A2706` | 12.49 | PASS |
| fg-secondary | neutral-soft `#1E1E27` | 6.42 | PASS |
| trắng | age-pill | 16.79 | PASS |
| trắng `#FFFFFF` | danger `#FF003C` | **3.95** | **FAIL, đã đổi sang chữ tối** |

### 6.2 Thành phần UI (≥ 3:1)

| Thành phần | So với surface | Tỉ lệ | |
|---|---|---|---|
| viền input `#6E6E86` | surface / elevated | 3.80 / 3.45 | PASS |
| seat-available-line `#5A6A86` | surface | 3.44 | PASS |
| seat-vip-line `#37E6FF` | surface | 12.48 | PASS |
| seat-sweetbox-line `#FF4D8D` | surface | 6.00 | PASS |
| seat-locked-line `#6A6A80` | surface | 3.57 | PASS |
| seat-selected `#FCEE09` / seat-held `#FF9F1A` | surface | 15.57 / 9.17 | PASS |
| seat-sold `#2A2A33` | surface | 1.32 | Disabled (miễn 1.4.11); dấu × `#8A8AA0` (5.58) báo hiệu |
| focus ring brand | bg / surface | 16.65 / 15.57 | PASS |
| viền trang trí `border` | | ~1.2 | Không mang thông tin |
| số ghế `#E8E8EF` trên available / vip / sweetbox | | 13.04 / 10.99 / 13.24 | PASS |

---

## 7. Điều chỉnh so với tham chiếu CYBERPLEX

| # | Tham chiếu | Điều chỉnh | Lý do |
|---|---|---|---|
| Đ1 | Heading Orbitron/Rajdhani | **Chakra Petch** cho heading tiếng Việt; Orbitron chỉ ASCII | Không có glyph tiếng Việt (T3) |
| Đ2 | `--ink-faint #74748A` | `#8A8AA0` | 4.13 < 4.5 |
| Đ3 | Viền input `rgba(255,255,255,.16)` | `#6E6E86` | 1.4.11 |
| Đ4 | Focus bằng outline trên phần tử clip-path | Vòng inset (T7) | Outline bị `clip-path` cắt |
| Đ5 | Nhãn HUD 8.5-10.5px | ≥ 11px | Đọc được |
| Đ6 | Crimson làm chữ | `danger-text` `#FF4D6D` | 4.33 trên elevated |
| Đ7 | Không có success/warning | Bổ sung `#2FF2A0`, `#FF9F1A` | Trạng thái đơn, ghế giữ, đồng hồ, soát vé (R-55, R-61, R-98) |
| Đ8 | Hover nút vàng drop-shadow crimson 5px | Giữ; tắt ở `prefers-reduced-motion` và `hover: none` | Cảm giác "bấm" kiểu cơ khí, không glow |
| Đ9 | Scanline + lưới phủ toàn trang | Scanline chỉ trang khách; lưới chỉ hero/404 | Mật độ cao ở admin/soát vé cần sạch |
| Đ10 | Cuộn "như video" gắn scrub bằng GSAP ScrollTrigger + JS đo cuộn, hero ghim | **Giữ ý tưởng (scrub theo cuộn, hero ghim)** nhưng chuyển sang CSS scroll-driven animations (không JS, đảo ngược tự nhiên); hero chỉ ghim desktop đủ cao, mobile tĩnh | Taste §5.D cấm scroll listener; CSS native nhẹ hơn, chạy trên compositor; mobile cần dùng thanh đặt vé ngay |

## 8. Quy tắc dùng (cho Builder)

1. **Một nút `primary` mỗi màn.** Hành động phụ: `ghost`/`outline`/link.
2. Không hex thô, không màu Tailwind mặc định. Chữ tiếng Việt có dấu **không** dùng `font-display`.
3. Tiền: `Intl.NumberFormat('vi-VN')` + hậu tố `đ`, `font-display` hoặc `font-mono` + `tabular-nums` (chỉ ký tự ASCII nên Orbitron an toàn). Giờ `HH:mm`, ngày `dd/MM/yyyy`, múi Asia/Ho_Chi_Minh.
4. Icon: **lucide-react** (stroke 1.75-2). Không emoji, không glyph ký tự. Icon-only có `aria-label`.
5. Poster/banner thật lấy từ storage; chưa có ảnh: gradient placeholder §9 + tên phim đè.
6. Mọi component mới có chuyển động vào theo cuộn phải chọn **nhóm A hoặc B** (§4.2) và dùng `<Scrub>`/`<ScrubGroup>`, không tự viết keyframe riêng.
7. Phần tử `clip-path` không đặt `overflow` có nội dung tràn (tooltip, dropdown) bên trong; portal ra ngoài.

## 9. Phụ lục: gradient placeholder poster (đêm neon)

| Tên | Giá trị |
|---|---|
| `hero` | `linear-gradient(135deg, #1A0A14 0%, #0B0B14 52%, #070709 100%)` + `radial-gradient(70% 55% at 78% 26%, rgb(255 0 60 / .16), transparent 70%)` |
| `poster1` | `#FCEE09 → #FF003C → #14091A` (dọc, 0 / 45 / 100%) |
| `poster2` | `#0F4C5C → #37E6FF → #07131A` |
| `poster3` | `#4A1A5E → #FF4D8D → #12091C` |
| `poster4` | `#0E5C4A → #2FF2A0 → #07130F` |
| `poster5` | `#7A1830 → #FF9F1A → #140A08` |

Chữ trên poster/hero luôn có lớp phủ `linear-gradient(to top, #070709 4%, rgb(7 7 9 / .72) 26%, transparent 62%)` để giữ ≥ 4.5:1.
