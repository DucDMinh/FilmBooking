# Design Tokens — FilmBooking (CINEMO handoff)

> Sinh bởi `.agent/design.md` (Phase 2), ngày 2026-11-11. **Trạng thái: chờ user confirm** (checkpoint ở session chính) trước khi Builder viết UI.
> **Nguồn sự thật:** bộ handoff CINEMO `docs/design/cinemo/` (`tokens/design-tokens.json`, 40 SVG, `prototype/index.html`). File này **thay thế hoàn toàn** bộ token cũ (tông hổ phách, Be Vietnam Pro, admin nền sáng) — mọi quyết định D1–D12 cũ đã huỷ.
> Builder PHẢI đọc file này + `.context/design-spec.md` trước khi viết bất kỳ component UI nào. **Không dùng hex thô trong component**: chỉ dùng token (class Tailwind sinh từ token hoặc `var(--token)`). SVG handoff dùng nhiều sắc xám lẻ (vd `#9AA3B2`, `#667184`, `#D6DBE3`) — KHÔNG copy, luôn map về token theo §1.6.
> Stack: **Next.js (App Router) + Tailwind CSS v4 + shadcn/ui (Radix)**. **Chỉ dark theme** (xem §0).

Ký hiệu nguồn: `[handoff]` = có trong `design-tokens.json` · `[svg]` = lấy từ SVG/prototype (không có trong JSON) · `[bổ sung]` = suy từ màu handoff để phủ requirement MVP · `[điều chỉnh]` = đổi so với handoff vì a11y (lý do ở §6).

---

## 0. Quyết định nền

| # | Quyết định | Lý do |
|---|---|---|
| T1 | **Chỉ dark-cinema** cho mọi bề mặt (khách, tài khoản, admin, manager, staff soát vé, POS giả lập). **Không có light mode**, không cài `next-themes`. | Handoff chỉ có dark; brainstorm 2026-11-11 chốt "dark-cinema cho mọi bề mặt". Token đặt thẳng trên `:root`, `color-scheme: dark`. |
| T2 | Font **Inter** (variable) qua `next/font/google`, `subsets: ['latin', 'vietnamese']`, `display: 'swap'`. | Handoff dùng Inter; Inter có đủ glyph tiếng Việt (dấu chồng ă/ơ/ư + thanh). Subset `vietnamese` bắt buộc, thiếu sẽ fallback lệch font. |
| T3 | Dùng **variable font** để giữ các weight lẻ của handoff (450/550/650/750/850). | SVG dùng 450 (body), 650 (nút), 750/850 (heading/display). Khai báo weight tuỳ biến trong `@theme` (§2.3). |
| T4 | Radius theo thang handoff **8 / 12 / 16 / 22 / pill**, không dùng `calc(var(--radius) - n)` mặc định của shadcn. | Bám handoff. |
| T5 | Nút chính (coral) dùng **chữ tối `#0B0D12`** thay cho chữ trắng của handoff. | Trắng trên coral chỉ 2.98:1 (fail AA). Xem §6 Đ1 và phương án thay thế ở design-spec "Điểm cần user quyết". |
| T6 | Mobile-first ≥ 360px; form control trên mobile **≥ 16px**. | NFR-11; tránh iOS Safari tự zoom khi focus input. |

---

## 1. Colors

### 1.1 Nền & bề mặt

| Token | Hex | Nguồn | Dùng cho |
|---|---|---|---|
| `--color-bg` | `#0B0D12` | [handoff] `background` | Nền trang |
| `--color-chrome` | `#111620` | [svg] header/sidebar admin (`#10131B`/`#111620`/`#111721` gộp) | Header khách, sidebar + topbar admin, header soát vé/POS, bottom nav mobile |
| `--color-surface` | `#151A24` | [handoff] `surface` | Card, panel, bảng |
| `--color-surface-elevated` | `#1B222E` | [handoff] `surfaceElevated` | Popover, dropdown, dialog, sheet, hàng hover |
| `--color-surface-input` | `#121721` | [svg] prototype `.field` | Nền input/select/textarea |
| `--color-surface-control` | `#202634` | [svg] prototype `.btn` | Nút secondary, chip ngày chưa chọn |
| `--color-border` | `#2B3340` | [handoff] `surfaceBorder` | Viền trang trí (card, divider, bảng) — không mang thông tin |
| `--color-border-subtle` | `#252C39` | [svg] viền card | Viền card lớn (panel 16px) |
| `--color-border-input` | `#66768C` | [bổ sung][điều chỉnh] | Viền input/select/checkbox/radio (≥ 3:1 với nền — §5) |
| `--color-overlay` | `rgb(5 6 9 / 0.72)` | [bổ sung] | Lớp phủ dialog/sheet |

### 1.2 Chữ

| Token | Hex | Nguồn | Dùng cho |
|---|---|---|---|
| `--color-text` | `#F5F6F8` | [handoff] `textPrimary` | Tiêu đề, nội dung chính, giá trị số |
| `--color-text-secondary` | `#AAB3C1` | [handoff] `textSecondary` | Mô tả, meta (rạp • phòng • giờ), nhãn form |
| `--color-text-muted` | `#7E8999` | [handoff] `textMuted` | Placeholder, chú thích, timestamp. **Không** dùng trên `--color-neutral-soft` (3.91:1) |
| `--color-text-on-accent` | `#0B0D12` | [điều chỉnh] | Chữ trên nền coral/gradient/ghế đang chọn/ghế đang giữ |
| `--color-link` | `#FF927E` | [svg] `header nav a, .link` | Link chữ ("Xem tất cả →", "Quên mật khẩu?") |

### 1.3 Nhấn (accent) & trạng thái

| Token | Hex | Nguồn | Dùng cho |
|---|---|---|---|
| `--color-accent` | `#F06D5B` | [handoff] `accent` | Nút primary (fill phẳng), focus ring, chip ngày đang chọn, thanh active sidebar, icon nhấn |
| `--color-accent-hover` | `#FF8A76` | [handoff] `accentHover` | Hover nút primary |
| `--gradient-accent` | `linear-gradient(135deg, #FF6B56, #E63C58)` | [svg] `#accent` | Nút CTA chính của luồng đặt vé (Đặt vé ngay, Tiếp tục, Thanh toán, Xác nhận check-in, Xác nhận bán). Chữ `--color-text-on-accent` |
| `--color-accent-soft` | `#3A2226` | [bổ sung] từ `#34232B` | Nền badge T16, nền item active |
| `--color-sidebar-active` | `#292331` | [svg] item active sidebar | Nền mục đang chọn trong AdminSidebar |
| `--color-success` | `#8FE0B1` | [handoff] `success` | Đồng hồ giữ ghế còn nhiều thời gian, trạng thái OK, "VÉ HỢP LỆ" |
| `--color-warning` | `#F2B17D` | [handoff] `warning` | Cảnh báo độ tuổi, đồng hồ ≤ 2', "Chờ xử lý" |
| `--color-danger` | `#F07173` | [handoff] `danger` | Lỗi, kết quả soát vé thất bại, nút phá huỷ (fill → chữ tối) |
| `--color-info` | `#9DB7E0` | [bổ sung] | Trạng thái trung tính có nghĩa (Đã check-in, Đã đổi suất) |
| `--color-danger-strong` | `#FFB0A2` | [svg] "⚠ LƯU Ý QUAN TRỌNG" | Tiêu đề khối cảnh báo trên nền danger-soft |

### 1.4 Nền "soft" cho badge / banner (mẫu tint của handoff)

Handoff dùng cặp nền tối ngả màu + chữ sáng cùng tông (vd `#1D3931`/`#8EE0B1` cho "HN01 • LONG BIÊN", `#34232B` + viền `#7F464B` cho khối cảnh báo). Bộ dưới mở rộng mẫu đó.

| Token nền | Hex | Token viền | Hex | Chữ đi kèm | Nguồn |
|---|---|---|---|---|---|
| `--color-success-soft` | `#1D3931` | `--color-success-line` | `#2F6B53` | `--color-success` | [svg] |
| `--color-success-banner` | `#15372D` | — | — | `#9BE6BA` (`--color-success-strong`) | [svg] header "✓ VÉ HỢP LỆ" |
| `--color-danger-soft` | `#34232B` | `--color-danger-line` | `#7F464B` | `--color-danger` / `--color-danger-strong` | [svg] khối "LƯU Ý QUAN TRỌNG" |
| `--color-danger-banner` | `#3A1F25` | — | — | `--color-danger-strong` | [bổ sung] header kết quả soát vé thất bại |
| `--color-warning-soft` | `#3A2C20` | `--color-warning-line` | `#7A5A3C` | `--color-warning` | [bổ sung] |
| `--color-info-soft` | `#1E2A3D` | `--color-info-line` | `#3B5274` | `--color-info` | [bổ sung] |
| `--color-neutral-soft` | `#252D3A` | — | — | `--color-text-secondary` (không dùng muted) | [svg] pill filter admin |
| `--color-age-pill` | `#191D2A` | — | — | `#FFFFFF` | [svg] pill nhãn tuổi trên poster |

### 1.5 Ghế (SeatMap)

Fill giữ nguyên handoff. **Viền + ký hiệu** là [bổ sung] để đạt WCAG 1.4.11 (ranh giới thành phần tương tác ≥ 3:1) và 1.4.1 (không chỉ dựa vào màu). Ô ghế 32×28 desktop (`rx=6` → `--radius-seat: 6px`).

| Trạng thái | Token fill | Hex fill | Viền (token / hex) | Ký hiệu không-màu | Chữ số ghế | Tương tác |
|---|---|---|---|---|---|---|
| Còn trống (Thường) | `--seat-available` | `#263847` [handoff] | `--seat-available-line` `#4F7591` | — (ô trơn) | `--color-text-secondary` | chọn được |
| Đang chọn (của tôi) | `--seat-selected` | `#EF715F` [handoff] | không viền | dấu ✓ nhỏ góc trên + số ghế đậm | `--color-text-on-accent` | bỏ chọn |
| Đang được giữ (web khác / POS) | `--seat-held` | `#B07C49` [handoff] | không viền | icon đồng hồ 10px | `--color-text-on-accent` | disabled |
| Đã bán | `--seat-sold` | `#4A505C` [handoff] | không viền | dấu × `#8A919C` (`--seat-sold-mark`) thay số ghế | — | disabled |
| VIP (còn trống) | `--seat-vip` | `#485B78` [handoff] | `--seat-vip-line` `#7A8EAD` | gạch ngang 2px phía trên ô (vạch "vương miện") | `--color-text` | chọn được |
| Khoá (Manager/ghế hỏng) | `--seat-locked` | `#1B222E` [bổ sung] | `--seat-locked-line` `#5C6B80` nét đứt | icon ổ khoá `--color-text-muted` | — | disabled |
| Sweetbox (ghế đôi) | `--seat-sweetbox` | `#6B3F5E` [bổ sung, từ poster3 `#C16A83`] | `--seat-sweetbox-line` `#C77A9E` | ô rộng 2 cột + gap, icon trái tim nhỏ | `#FFFFFF` | chọn theo cặp |
| Lối đi | — | trong suốt | — | — | — | không render nút |

Ghi chú: VIP/Sweetbox khi **đang chọn / đang giữ / đã bán / khoá** dùng fill của trạng thái đó, giữ ký hiệu loại ghế (vạch VIP, độ rộng sweetbox) để vẫn nhận ra loại. Màn hình chiếu: thanh `#7D8998` cao 6–7px (`--seat-screen`).

### 1.6 Map xám lẻ trong SVG → token (bắt buộc)

| Hex trong SVG | Số lần | Map sang | Ghi chú |
|---|---|---|---|
| `#FFFFFF`, `#F7F8FA`, `#E5E8EE`, `#E8EBF0`, `#E7EAF0`, `#DDE4EC`, `#D6DBE3`, `#D5DAE2` | ~900 | `--color-text` | |
| `#9AA3B2`, `#AAB1BF`, `#ADB4C1`, `#99A3B2`, `#97A2B2`, `#B8C0CE` | ~400 | `--color-text-secondary` | |
| `#667184`, `#657386`, `#8994A5`, `#8892A2`, `#929CAB`, `#758092`, `#778294`, `#788495`, `#697384` | ~500 | `--color-text-muted` | `#667184` chỉ 3.54:1 trên surface → **fail**; muted chuẩn `#7E8999` đạt 4.92 |
| `#131A25`, `#151923`, `#151B25`, `#141B26`, `#171C26` | ~400 | `--color-surface` / `--color-surface-input` | |
| `#111827`, `#121721`, `#111620`, `#10131B`, `#0D1017`, `#090D14` | | `--color-chrome` / `--color-bg` | |
| `#252C39`, `#29303C`, `#2D3542`, `#303746`, `#303847`, `#343B49`, `#35404F` | | `--color-border` / `--color-border-subtle` (trang trí); input dùng `--color-border-input` | |
| `#FF927F`, `#FF806B`, `#FF725F`, `#D96D61` | | `--color-link` / `--color-accent` | |

### 1.7 Nhãn độ tuổi (AgeRatingBadge) [bổ sung]

Mặc định theo handoff: **pill trung tính** `--color-age-pill` + chữ trắng 11px/600 (trên poster, thẻ phim). Biến thể `tone="semantic"` (dùng ở màn chọn ghế, tóm tắt đơn, vé, soát vé — nơi nhãn tuổi kéo theo cảnh báo R-68):

| Nhãn | Nền | Chữ | Tỉ lệ | Ý nghĩa |
|---|---|---|---|---|
| P | `--color-success-soft` | `--color-success` | 8.01 | Mọi lứa tuổi |
| K | `--color-info-soft` | `--color-info` | 7.07 | Dưới 13 tuổi xem cùng người giám hộ |
| T13 | `--color-warning-soft` | `--color-warning` | 7.28 | ≥ 13 tuổi |
| T16 | `--color-accent-soft` | `--color-accent-hover` | 6.37 | ≥ 16 tuổi |
| T18 | `--color-danger-banner` | `--color-danger-strong` | 8.54 | ≥ 18 tuổi |

Luôn hiển thị **chữ** nhãn (không chỉ màu); tên đọc được qua `role="img"` + `aria-label="Phân loại T16: phim dành cho khán giả từ 16 tuổi trở lên"` (`aria-label` trên `<span>` không role bị trình đọc màn hình bỏ qua — reconcile theo review layer-2/task-05).

### 1.8 Trạng thái đơn / soát vé / email / thực thể [bổ sung]

| Nhóm | Giá trị | Nhãn tiếng Việt | Tone (nền soft + chữ) |
|---|---|---|---|
| Đơn | `holding` | Đang giữ ghế | warning |
| Đơn | `pending_payment` | Chờ thanh toán | warning |
| Đơn | `paid` | Đã thanh toán | success |
| Đơn | `checked_in` | Đã check-in | info |
| Đơn | `expired` | Hết hạn | neutral |
| Đơn | `cancelled` | Đã huỷ | neutral |
| Đơn | `needs_manual_review` | Cần xử lý | danger |
| Đơn | `affected` | Bị ảnh hưởng (suất huỷ) | danger |
| Đơn | `exchanged` | Đã đổi suất | info |
| Đơn | `refunded_manual` | Đã hoàn tiền thủ công | neutral |
| Email outbox | `sent` / `pending` / `failed` | Đã gửi / Đang gửi / Lỗi gửi | success / neutral / danger |
| Soát vé | valid | ✓ VÉ HỢP LỆ | banner `--color-success-banner` + `--color-success-strong` |
| Soát vé | used / wrong_cinema / wrong_time / not_found | ✕ ĐÃ SỬ DỤNG / SAI RẠP / SAI SUẤT – CHƯA TỚI GIỜ – ĐÃ KẾT THÚC / KHÔNG TỒN TẠI – CHƯA THANH TOÁN | banner `--color-danger-banner` + `--color-danger-strong` |
| Rạp | Đang hoạt động / Sắp khai trương / Tạm đóng / Ngừng hoạt động | | success / info / warning / neutral |
| Suất | Đang bán / Ngừng bán online / Đóng bán / Đã huỷ | | success / warning / neutral / danger |
| Phim | Đang chiếu / Sắp chiếu / Ẩn | | success / info / neutral |
| Khoá API | Đang hoạt động / Đã thu hồi | | success / neutral |
| Người dùng | Hoạt động / Đã khoá | | success / danger |

Badge luôn có chữ; icon tuỳ chọn. Bảng admin trong handoff hiển thị trạng thái dạng chữ `#D6DBE3` trơn — spec chuyển sang badge tone (điều chỉnh nhẹ để quét nhanh, xem §6 Đ6).

---

## 2. Typography

### 2.1 Font

```
--font-sans: var(--font-inter), "Inter", ui-sans-serif, Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;   /* mã đặt vé, khoá API */
```
Mã đặt vé (`HN01-7K3P9Q`) dùng `font-sans` + `font-variant-numeric: tabular-nums` + `letter-spacing: 0.04em` (handoff không dùng mono). Khoá API dùng `font-mono`. Mọi số tiền/giờ/đồng hồ: `tabular-nums`.

### 2.2 Thang cỡ chữ

| Token | px (desktop) | px (mobile < 768) | Weight | Line-height | Nguồn | Dùng cho |
|---|---|---|---|---|---|---|
| `--text-display` | 44 | 32 | 850 | 1.05 | [handoff] display 44; mobile 32 [svg prototype] | Tên phim hero (UPPERCASE) |
| `--text-h1` | 32 | 26 | 760 | 1.15 | [handoff] h1 32; SVG tiêu đề trang 25–27 | Tiêu đề trang ("Chọn ghế của bạn", "Tổng quan") |
| `--text-h2` | 24 | 20 | 750 | 1.25 | [handoff] h2 24 | Tiêu đề section ("Phim đang chiếu") |
| `--text-h3` | 18 | 17 | 700 | 1.35 | [handoff] h3 18 | Tiêu đề card/panel, tên phim trong card |
| `--text-body` | 14 | 14 | 450 | 1.5 | [handoff] body 14 | Nội dung, bảng, mô tả |
| `--text-body-sm` | 13 | 13 | 450–650 | 1.45 | [svg] cỡ dùng nhiều nhất (492 lần) | Nhãn nút, item sidebar, ô bảng admin |
| `--text-small` | 12 | 12 | 450–600 | 1.4 | [handoff] small 12 | Meta, nhãn form, badge |
| `--text-caption` | 10 | 11 | 650–750 | 1.3 | [handoff] caption 10 | Overline UPPERCASE ("BƯỚC 2 / 4", "RẠP ĐÃ CHỌN"), tracking `0.08em` |
| `--text-input-mobile` | — | **16** | 450 | 1.4 | [điều chỉnh] | Mọi `input/select/textarea` dưới `md` (tránh iOS zoom) |

Quy tắc:
- Thông tin bắt buộc (giá, giờ chiếu, ghế, tên + địa chỉ rạp, cảnh báo §7.2) **không** dùng cỡ < 12px.
- Cỡ 8–9px trong SVG (vd "PHIM ĐANG CHIẾU" trên poster, ghi chú dưới nút) → dùng `--text-caption` (10/11px). Có nâng tối thiểu không là quyết định của user (design-spec "Điểm cần user quyết").
- Tiêu đề hero UPPERCASE: chữ in hoa tiếng Việt có dấu chồng cao → line-height ≥ 1.05, không cắt `overflow` theo chiều dọc.

### 2.3 Weight

| Token | Giá trị | Dùng |
|---|---|---|
| `--font-weight-regular` | 450 | Body |
| `--font-weight-medium` | 550 | Nhãn KPI, meta nhấn |
| `--font-weight-semibold` | 650 | Nút, item active, nhãn badge |
| `--font-weight-bold` | 750 | Tiêu đề h2/h3, giá trị lớn |
| `--font-weight-heavy` | 850 | Display, logo CINEMO |

---

## 3. Spacing, radius, shadow, layout

### 3.1 Spacing [handoff] (unit 4)

| Token | px | Tailwind | Dùng |
|---|---|---|---|
| `xs` | 4 | `1` | Khe icon–chữ |
| `sm` | 8 | `2` | Khe ghế (gap 8 desktop, 6 mobile), khe chip |
| `md` | 12 | `3` | Padding badge, khe trong card |
| `lg` | 16 | `4` | Gutter mobile, padding card nhỏ |
| `xl` | 24 | `6` | Padding panel, khe giữa card |
| `2xl` | 32 | `8` | Khe giữa section (admin) |
| `3xl` | 48 | `12` | Khe giữa section (trang khách) |

Tailwind v4 dùng `--spacing: 4px` nên thang trên trùng scale mặc định — không cần token riêng.

### 3.2 Radius [handoff]

| Token | px | Dùng |
|---|---|---|
| `--radius-seat` | 6 | Ô ghế [svg] |
| `--radius-sm` | 8 | Input, select, chip ngày, nút nhỏ |
| `--radius-md` | 12 | Nút (handoff `rx=12`), khối cảnh báo, toast |
| `--radius-lg` | 16 | Card, panel, dialog, bảng |
| `--radius-hero` | 22 | Hero banner, poster lớn, vé điện tử |
| `--radius-pill` | 9999 | Badge, pill nhãn tuổi, chip giờ chiếu, avatar |

### 3.3 Shadow

Handoff gần như không dùng bóng (dark UI phân lớp bằng màu nền + viền). Một filter duy nhất: `feDropShadow dy=8 blur=14 opacity .26`.

| Token | Giá trị | Dùng |
|---|---|---|
| `--shadow-none` | `none` | Card/panel (dùng viền) |
| `--shadow-overlay` | `0 8px 28px rgb(0 0 0 / 0.26)` | Popover, dropdown, dialog, sheet, sticky summary mobile |
| `--shadow-cta-glow` | `0 6px 20px rgb(240 109 91 / 0.28)` | [bổ sung] hover nút gradient (tuỳ chọn, tắt khi reduced-motion không ảnh hưởng) |

### 3.4 Layout

| Token | Giá trị | Nguồn |
|---|---|---|
| `--layout-content-max` | 1300px (khách) | [handoff] `customerContentMax` |
| `--layout-admin-sidebar` | 250px | [handoff] `adminSidebar` |
| `--layout-header-h` | 72px desktop / 56px mobile | [svg] 70–82 / 56 |
| `--layout-admin-topbar-h` | 72px | [svg] |
| `--layout-gutter` | 16px (< 768) · 24px (≥ 768) · 70px (≥ 1440, khớp SVG x=70) | [svg] + mobile-first |
| `--layout-bottom-nav-h` | 64px + `env(safe-area-inset-bottom)` | [svg] 30-mobile-home |
| `--layout-booking-aside` | 370px (tóm tắt đặt vé bên phải) | [svg] 06 |
| Breakpoints | `sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1440` | Tailwind mặc định + 1440 handoff |

Vùng chạm tối thiểu **44×44px** (nút, chip giờ, item nav). Ô ghế desktop 32×28 nhỏ hơn 44 → xem quy tắc mobile ở design-spec §SeatMap (ô ≥ 32px + pinch-zoom/scroll, cộng danh sách ghế đã chọn có nút bỏ chọn ≥ 44px).

### 3.5 Motion

| Token | Giá trị | Dùng |
|---|---|---|
| `--duration-fast` | 120ms | Hover, đổi màu ghế |
| `--duration-base` | 200ms | Dialog/sheet, toast |
| `--duration-slow` | 300ms | Banner kết quả soát vé |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | |

Ghế đổi trạng thái do realtime: chỉ chuyển màu 120ms, không bounce. `prefers-reduced-motion: reduce` → tắt mọi transition trừ opacity.

---

## 4. Mapping sang shadcn/ui + Tailwind v4

### 4.1 Bảng map biến shadcn

> Lưu ý trùng tên: trong shadcn, `--accent` là **nền hover nhạt** của menu/item, không phải màu thương hiệu. Màu coral thương hiệu map vào `--primary`.

| Biến shadcn | Giá trị | Token nguồn |
|---|---|---|
| `--background` / `--foreground` | `#0B0D12` / `#F5F6F8` | bg / text |
| `--card` / `--card-foreground` | `#151A24` / `#F5F6F8` | surface / text |
| `--popover` / `--popover-foreground` | `#1B222E` / `#F5F6F8` | surface-elevated / text |
| `--primary` / `--primary-foreground` | `#F06D5B` / `#0B0D12` | accent / text-on-accent |
| `--secondary` / `--secondary-foreground` | `#202634` / `#F5F6F8` | surface-control / text |
| `--muted` / `--muted-foreground` | `#1B222E` / `#7E8999` | surface-elevated / text-muted |
| `--accent` / `--accent-foreground` | `#1B222E` / `#F5F6F8` | (hover item) |
| `--destructive` / `--destructive-foreground` | `#F07173` / `#0B0D12` | danger |
| `--border` | `#2B3340` | border |
| `--input` | `#66768C` | border-input |
| `--ring` | `#F06D5B` | accent |
| `--chart-1..5` | `#F06D5B`, `#8FE0B1`, `#9DB7E0`, `#F2B17D`, `#C77A9E` | accent, success, info, warning, sweetbox-line |
| `--sidebar` / `--sidebar-foreground` | `#111620` / `#AAB3C1` | chrome / text-secondary |
| `--sidebar-primary` / `--sidebar-primary-foreground` | `#F06D5B` / `#0B0D12` | |
| `--sidebar-accent` / `--sidebar-accent-foreground` | `#292331` / `#F5F6F8` | sidebar-active |
| `--sidebar-border` / `--sidebar-ring` | `#29303C` / `#F06D5B` | |

### 4.2 `apps/web/src/app/globals.css`

> **Tránh trùng tên với shadcn:** trong theme Tailwind, `--color-accent` / `bg-accent` thuộc về shadcn (nền hover item — ghost button, dropdown dùng `hover:bg-accent`). Vì vậy màu coral thương hiệu đặt tên **`--color-brand*`** (`bg-brand`, `text-brand`, `bg-gradient-brand`). Mọi chỗ trong tài liệu nói "coral/accent" = token `brand`.

```css
@import "tailwindcss";
@import "tw-animate-css";

/* 1) Token thương hiệu CINEMO — sinh cả CSS var lẫn class Tailwind (bg-surface, text-fg-secondary, bg-seat-vip...) */
@theme {
  --color-bg: #0B0D12;
  --color-chrome: #111620;
  --color-surface: #151A24;
  --color-surface-elevated: #1B222E;
  --color-surface-input: #121721;
  --color-surface-control: #202634;
  --color-border: #2B3340;            /* trùng tên shadcn — cùng ý nghĩa (viền trang trí) */
  --color-border-subtle: #252C39;
  --color-border-input: #66768C;
  --color-overlay: rgb(5 6 9 / 0.72);

  --color-fg: #F5F6F8;                /* = textPrimary */
  --color-fg-secondary: #AAB3C1;      /* = textSecondary */
  --color-fg-muted: #7E8999;          /* = textMuted */
  --color-fg-on-brand: #0B0D12;       /* chữ trên coral / ghế chọn / ghế giữ */
  --color-link: #FF927E;

  --color-brand: #F06D5B;             /* = accent (handoff) */
  --color-brand-hover: #FF8A76;       /* = accentHover */
  --color-brand-soft: #3A2226;
  --color-sidebar-active: #292331;

  --color-success: #8FE0B1;  --color-success-strong: #9BE6BA;
  --color-success-soft: #1D3931;  --color-success-line: #2F6B53;  --color-success-banner: #15372D;
  --color-warning: #F2B17D;  --color-warning-soft: #3A2C20;  --color-warning-line: #7A5A3C;
  --color-danger: #F07173;   --color-danger-strong: #FFB0A2;
  --color-danger-soft: #34232B;  --color-danger-line: #7F464B;  --color-danger-banner: #3A1F25;
  --color-info: #9DB7E0;     --color-info-soft: #1E2A3D;  --color-info-line: #3B5274;
  --color-neutral-soft: #252D3A;
  --color-age-pill: #191D2A;

  --color-seat-available: #263847;  --color-seat-available-line: #4F7591;
  --color-seat-selected: #EF715F;
  --color-seat-held: #B07C49;
  --color-seat-sold: #4A505C;       --color-seat-sold-mark: #8A919C;
  --color-seat-vip: #485B78;        --color-seat-vip-line: #7A8EAD;
  --color-seat-locked: #1B222E;     --color-seat-locked-line: #5C6B80;
  --color-seat-sweetbox: #6B3F5E;   --color-seat-sweetbox-line: #C77A9E;
  --color-seat-screen: #7D8998;

  --font-weight-regular: 450;
  --font-weight-medium: 550;
  --font-weight-semibold: 650;
  --font-weight-bold: 750;
  --font-weight-heavy: 850;

  --text-display: 44px;  --text-display--line-height: 1.05;
  --text-h1: 32px;       --text-h1--line-height: 1.15;
  --text-h2: 24px;       --text-h2--line-height: 1.25;
  --text-h3: 18px;       --text-h3--line-height: 1.35;
  --text-body: 14px;     --text-body--line-height: 1.5;
  --text-body-sm: 13px;  --text-body-sm--line-height: 1.45;
  --text-small: 12px;    --text-small--line-height: 1.4;
  --text-caption: 10px;  --text-caption--line-height: 1.3;

  --radius-seat: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-hero: 22px;
  --radius-pill: 9999px;

  --shadow-overlay: 0 8px 28px rgb(0 0 0 / 0.26);
  --shadow-cta-glow: 0 6px 20px rgb(240 109 91 / 0.28);

  --breakpoint-2xl: 1440px;
}

/* 2) Biến shadcn/ui — chỉ dark, đặt thẳng trên :root */
:root {
  color-scheme: dark;
  --gradient-brand: linear-gradient(135deg, #FF6B56, #E63C58);

  --background: var(--color-bg);
  --foreground: var(--color-fg);
  --card: var(--color-surface);
  --card-foreground: var(--color-fg);
  --popover: var(--color-surface-elevated);
  --popover-foreground: var(--color-fg);
  --primary: var(--color-brand);
  --primary-foreground: var(--color-fg-on-brand);
  --secondary: var(--color-surface-control);
  --secondary-foreground: var(--color-fg);
  --muted: var(--color-surface-elevated);
  --muted-foreground: var(--color-fg-muted);
  --accent: var(--color-surface-elevated);       /* shadcn: nền hover item, KHÔNG phải coral */
  --accent-foreground: var(--color-fg);
  --destructive: var(--color-danger);
  --destructive-foreground: var(--color-fg-on-brand);
  --input: var(--color-border-input);
  --ring: var(--color-brand);
  --chart-1: #F06D5B; --chart-2: #8FE0B1; --chart-3: #9DB7E0; --chart-4: #F2B17D; --chart-5: #C77A9E;
  --sidebar: var(--color-chrome);
  --sidebar-foreground: var(--color-fg-secondary);
  --sidebar-primary: var(--color-brand);
  --sidebar-primary-foreground: var(--color-fg-on-brand);
  --sidebar-accent: var(--color-sidebar-active);
  --sidebar-accent-foreground: var(--color-fg);
  --sidebar-border: #29303C;
  --sidebar-ring: var(--color-brand);
  --radius: 12px;
}

/* 3) Map biến shadcn → class Tailwind (bg-primary, bg-accent, border-input, ring-ring ...) */
@theme inline {
  --font-sans: var(--font-inter), "Inter", ui-sans-serif, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1); --color-chart-2: var(--chart-2); --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4); --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html { background: var(--color-bg); }
  body {
    @apply bg-background text-foreground font-sans text-body font-regular antialiased;
  }
  :focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
  /* iOS: tránh auto-zoom khi focus */
  @media (max-width: 767.98px) {
    input, select, textarea { font-size: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
  }
}

/* Thang chữ mobile (< 768px) theo §2.2 — reconcile 2026-11-11 (review layer-1/task-01 MAJOR-1) */
@media (max-width: 767.98px) {
  :root {
    --text-display: 32px;
    --text-h1: 26px;
    --text-h2: 20px;
    --text-h3: 17px;
    --text-caption: 11px;
  }
}

@utility bg-gradient-brand { background-image: var(--gradient-brand); color: var(--color-fg-on-brand); }
@utility tabular { font-variant-numeric: tabular-nums; }
```

Ghi chú:
- Tên token ở §1 (`--color-text`, `--color-text-secondary`, `--color-text-muted`, `--color-text-on-accent`, `--color-accent*`, `--gradient-accent`, `--seat-*`) là tên **khái niệm**; tên **thực thi** trong code là bảng dưới (tránh class xấu `text-text` và trùng `accent` của shadcn):

| Khái niệm (§1) | Tên trong CSS | Class ví dụ |
|---|---|---|
| `--color-text` / `-secondary` / `-muted` | `--color-fg` / `--color-fg-secondary` / `--color-fg-muted` | `text-fg-secondary` |
| `--color-text-on-accent` | `--color-fg-on-brand` | `text-fg-on-brand` |
| `--color-accent` / `-hover` / `-soft` | `--color-brand` / `--color-brand-hover` / `--color-brand-soft` | `bg-brand hover:bg-brand-hover` |
| `--gradient-accent` | `--gradient-brand` | `bg-gradient-brand` |
| `--seat-<x>` | `--color-seat-<x>` | `bg-seat-vip border-seat-vip-line` |

- `layout.tsx`: `const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter', display: 'swap' })` (không truyền `weight` → nạp variable font đủ trục 100–900, dùng được 450/650/750/850), `<html lang="vi" className={inter.variable}>`. Không thêm class `.dark`, không cài `next-themes`.
- `components.json` shadcn: `"cssVariables": true`. Radius: `rounded-md` = 12px (Button, khối cảnh báo), `rounded-sm` = 8px (Input/Select/chip), `rounded-lg` = 16px (Card/Dialog), `rounded-hero` = 22px. Sau khi `add` Input/Select, đổi `rounded-md` → `rounded-sm` để khớp handoff.

---

## 5. Bảng kiểm tương phản (WCAG 2.1 AA)

Tính bằng công thức relative luminance WCAG (script kiểm, 2026-11-11). Ngưỡng: chữ thường **4.5**, chữ lớn (≥ 18.66px bold / ≥ 24px) **3.0**, thành phần UI / ranh giới đồ hoạ **3.0** (1.4.11).

### 5.1 Chữ

| Chữ | Nền | Tỉ lệ | Kết quả |
|---|---|---|---|
| text `#F5F6F8` | bg `#0B0D12` / surface `#151A24` / elevated `#1B222E` | 17.97 / 16.11 / 14.77 | PASS |
| text-secondary `#AAB3C1` | bg / surface / elevated / chrome `#111620` | 9.19 / 8.24 / 7.55 / 8.56 | PASS |
| text-muted `#7E8999` | bg / surface / elevated / input `#121721` | 5.48 / 4.92 / **4.51** / 5.06 | PASS (elevated sát ngưỡng — không dùng muted cho thông tin quan trọng trên dialog) |
| text-muted `#7E8999` | neutral-soft `#252D3A` | 3.91 | FAIL → dùng text-secondary (6.55) trên badge neutral |
| `#667184` (xám SVG) | surface | 3.54 | FAIL → map sang text-muted (§1.6) |
| brand `#F06D5B` (chữ/icon) | bg / surface / elevated / chrome | 6.52 / 5.84 / 5.36 / 6.07 | PASS |
| link `#FF927E` | surface / bg | 8.02 / 8.94 | PASS |
| **trắng `#FFFFFF`** | **brand `#F06D5B`** | **2.98** | **FAIL (handoff)** |
| trắng | gradient `#FF6B56` → `#E63C58` | 2.80 → 4.08 | **FAIL (handoff)** |
| fg-on-brand `#0B0D12` | brand / brand-hover / gradient đầu / gradient cuối | 6.52 / 8.47 / 6.93 / 4.77 | PASS (đã điều chỉnh) |
| fg-on-brand `#0B0D12` | seat-selected `#EF715F` / seat-held `#B07C49` / danger `#F07173` | 6.66 / 5.39 / 6.77 | PASS |
| success `#8FE0B1` | surface / success-soft `#1D3931` | 11.17 / 8.01 | PASS |
| success-strong `#9BE6BA` | success-banner `#15372D` | 8.92 | PASS |
| warning `#F2B17D` | surface / warning-soft `#3A2C20` / danger-soft | 9.43 / 7.28 / 7.99 | PASS |
| danger `#F07173` | surface / elevated / danger-soft `#34232B` / danger-banner `#3A1F25` | 6.07 / 5.56 / 5.15 / 5.22 | PASS |
| danger-strong `#FFB0A2` | danger-soft / danger-banner | 8.43 / 8.54 | PASS |
| `#F1D8D4` (nội dung khối cảnh báo, prototype) | danger-soft | 10.91 | PASS |
| info `#9DB7E0` | info-soft `#1E2A3D` | 7.07 | PASS |
| brand-hover `#FF8A76` | brand-soft `#3A2226` (T16) | 6.37 | PASS |
| trắng | age-pill `#191D2A` | 16.79 | PASS |
| text | sidebar-active `#292331` | 14.08 | PASS |
| `#FF927F` (badge "ADMIN") | `#292E3B` | 6.25 | PASS |
| text-secondary (số ghế) | seat-available `#263847` | 5.71 | PASS |
| text | seat-vip `#485B78` / seat-sold `#4A505C` | 6.38 / 7.49 | PASS |
| trắng | seat-sweetbox `#6B3F5E` | 8.41 | PASS |

### 5.2 Thành phần UI / đồ hoạ (≥ 3:1)

| Thành phần | So với | Tỉ lệ | Kết quả |
|---|---|---|---|
| seat-available fill `#263847` | surface | 1.44 | FAIL → thêm viền `#4F7591` = **3.56** PASS |
| seat-vip fill `#485B78` | surface | 2.53 | FAIL → viền `#7A8EAD` = **5.23** PASS |
| seat-vip vs seat-available | nhau | 1.75 | phân biệt bằng vạch VIP + chú thích, không chỉ bằng màu |
| seat-selected `#EF715F` | surface | 5.97 | PASS |
| seat-held `#B07C49` | surface | 4.83 | PASS (thành phần disabled — vẫn đạt) |
| seat-sold `#4A505C` | surface | 2.15 | Disabled → miễn 1.4.11; thêm dấu × để nhận biết (1.4.1) |
| seat-locked line `#5C6B80` | surface | 3.21 | PASS |
| seat-sweetbox fill `#6B3F5E` | surface | 2.07 | viền `#C77A9E` = **5.56** PASS |
| viền input `#66768C` | surface / input-bg / elevated / bg | 3.76 / 3.88 / 3.45 / 4.20 | PASS (handoff `#303746` ≈ 1.4 → điều chỉnh) |
| focus ring brand `#F06D5B` | surface / bg / elevated | 5.84 / 6.52 / 5.36 | PASS |
| viền trang trí `#2B3340` | surface | 1.37 | Không mang thông tin → không áp 1.4.11 |

---

## 6. Điều chỉnh so với handoff (tổng hợp)

| # | Handoff | Điều chỉnh | Lý do |
|---|---|---|---|
| Đ1 | Nút primary/gradient chữ **trắng** | Chữ **`#0B0D12`** (giữ nguyên fill coral + gradient) | Trắng/coral 2.98, trắng/gradient 2.80–4.08 < 4.5. Phương án thay thế (giữ chữ trắng, tối fill xuống `#C9473A` = 4.72) để user chọn — xem design-spec "Điểm cần user quyết" #1 |
| Đ2 | Xám lẻ (`#667184` ×216, …) | Map về 3 token chữ (§1.6) | `#667184` 3.54 < 4.5; thống nhất token |
| Đ3 | Viền input `#303746` | `--color-border-input` `#66768C` | Ranh giới ô nhập ≥ 3:1 (1.4.11) |
| Đ4 | Ghế chỉ phân biệt bằng fill | Thêm viền cho ghế chọn được + ký hiệu (×, đồng hồ, khoá, vạch VIP, ô đôi) + `aria-label` | 1.4.11 + 1.4.1 + NFR-12 |
| Đ5 | Input body 13–14px | Mobile < 768px: 16px | Tránh iOS zoom (ràng buộc đã chốt) |
| Đ6 | Trạng thái trong bảng admin là chữ xám trơn | Badge tone (§1.8) | Quét nhanh trạng thái `needs_manual_review`/`affected`; giữ chữ, chỉ thêm nền soft |
| Đ7 | Không có token cho: ghế khoá, sweetbox, nhãn tuổi màu, kết quả soát vé thất bại, trạng thái đơn, info | Bổ sung từ họ màu handoff (§1.4, §1.5, §1.7, §1.8) | Requirement MVP R-42, R-48, R-55, R-98 cần |
| Đ8 | Caption 8–9px ở vài chỗ | Sàn 10px (desktop) / 11px (mobile); thông tin bắt buộc ≥ 12px | Đọc được; nâng thêm là quyết định của user |

Không đổi: palette nền/bề mặt, coral `#F06D5B`, gradient, Inter, thang cỡ, spacing, radius, layout 1440/390, sidebar 250, content 1300.

---

## 7. Quy tắc dùng (cho Builder)

1. **Một CTA gradient mỗi màn** (bước chính của luồng). Hành động phụ: `secondary` (`bg-secondary` + viền `border` `#35404F`→`--color-border`), `ghost`, hoặc link.
2. Nút phá huỷ (Huỷ suất, Thu hồi khoá, Xoá tài khoản): `destructive` fill `--color-danger` + chữ tối, **luôn** qua AlertDialog xác nhận.
3. Nút disabled: `opacity: 0.45` + `cursor-not-allowed` + `aria-disabled`; với nút Thanh toán (R-71) kèm dòng giải thích ngay dưới (text-muted 12px).
4. Không dùng hex thô; không dùng màu Tailwind mặc định (`red-500`, `zinc-*`…).
5. Tiền: `Intl.NumberFormat('vi-VN')` + hậu tố `đ` (vd `325.000đ`), `tabular`. Giờ: `HH:mm`, ngày `dd/MM/yyyy`, múi Asia/Ho_Chi_Minh.
6. Icon: **lucide-react** (stroke 1.75–2px) thay cho ký tự glyph trong SVG (`⌕`, `⌄`, `▣`, `♧`, `⌖`). Icon-only button phải có `aria-label`.
7. Poster/banner chưa có ảnh: dùng gradient poster handoff (`poster1..5`, §8) làm placeholder, có tên phim chữ đè.

## 8. Phụ lục — gradient trang trí (handoff)

| Tên | Giá trị | Dùng |
|---|---|---|
| `hero` | `linear-gradient(135deg, #311C39 0%, #171D32 52%, #10131C 100%)` | Hero trang chủ, nền màn auth (12/13/14/33) |
| `poster1` | `#F2A65A → #A64D58 → #261B35` (dọc) | Placeholder poster |
| `poster2` | `#294C60 → #4D6D76 → #171C2D` | |
| `poster3` | `#624D91 → #C16A83 → #23223B` | |
| `poster4` | `#1C7775 → #E1B46A → #172338` | |
| `poster5` | `#BE5446 → #563D62 → #111727` | |

Chữ trên gradient poster/hero: luôn có lớp phủ `linear-gradient(to top, rgb(11 13 18 / .85), transparent 60%)` dưới vùng chữ để giữ ≥ 4.5:1.

