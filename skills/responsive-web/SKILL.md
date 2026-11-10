---
name: responsive-web
description: "Đảm bảo responsive cho web template (opencode-project-template). Dùng trong Phase 2.5 Design (khai báo responsive behavior từng screen) và Phase 5 Review (chạy responsive checklist gate trước khi merge). Kỹ thuật: container queries, fluid typography, mobile-first breakpoints, responsive images, adaptive navigation."
---

# Responsive Web — Skill cho Web Template

Skill này đảm bảo mọi screen/component trong project render đúng, đẹp trên mọi kích thước màn hình (mobile → tablet → desktop → large).

## WHEN TO USE

- **Phase 2.5 Design**: ĐỌC file `responsive.md` trước khi viết screen specs. Bắt buộc khai báo responsive behavior cho TỪNG screen.
- **Phase 5 Review**: Chạy **Responsive Checklist Gate** (bên dưới) cho từng task/layer trước khi PASS → merge.
- **Phase 4 Loop**: Coding Agent đọc `responsive.md` trước khi implement bất kỳ UI component nào.

## FILES

- `responsive.md` — Kỹ thuật cốt lõi: breakpoint scale, container queries, fluid typography, responsive grid/nav/images/tables, viewport units, best practices, NEVER list. (Nguồn: curate từ ClawHub `responsive-design` + bổ sung checklist gate)
- `references/breakpoint-strategies.md` — Chiến lược breakpoint content-based, design tokens, @supports, print/preference queries, testing script.
- `references/container-queries.md` — Container queries deep dive (component-level responsive), Tailwind integration, fallback, performance.
- `references/fluid-layouts.md` — Fluid typography/spacing bằng clamp(), CSS Grid auto-fit, intrinsic sizing, min()/max(), viewport units.

## RESPONSIVE CHECKLIST GATE (BẮT BUỘC — trước khi PASS review)

> Checklist này là **GATE**. Task/Layer KHÔNG được PASS nếu còn bất kỳ mục nào FAIL.
> Test ở ít nhất 3 widths: **375px (mobile) / 768px (tablet) / 1280px (desktop)**.

### Layout
- [ ] KHÔNG horizontal scroll (document scrollWidth ≤ clientWidth ở mọi breakpoint)
- [ ] Layout dùng mobile-first: base styles cho mobile, `min-width` media query để enhance
- [ ] Grid dùng `auto-fit`/`minmax` hoặc responsive column classes (không cột cố định)
- [ ] Container không fixed width px; dùng `min(max-width)` hoặc `%`/`fr`/`vw`

### Typography & Spacing
- [ ] KHÔNG dùng `px` cho font-size (dùng `rem`)
- [ ] Heading dùng fluid (`clamp()`) — không fixed px
- [ ] Spacing dùng scale/`clamp()` hoặc Tailwind spacing (không hardcode px lẻ)

### Media & Images
- [ ] Mọi ảnh có `max-width: 100%; height: auto` (hoặc `w-full h-auto` + aspect-ratio)
- [ ] Ảnh quan trọng dùng `srcset`/`sizes` (hero/product) — resolution switching
- [ ] Video/embed có aspect-ratio cố định, không tràn

### Touch & Interaction
- [ ] Touch target ≥ **44×44px** trên mobile (button, link, input, nav item)
- [ ] Nav: hamburger/dropdown trên mobile, horizontal ≥ lg (không tràn)
- [ ] Table: horizontal scroll wrapper HOẶC chuyển card layout trên mobile

### Viewport & A11y
- [ ] KHÔNG dùng `100vh` đơn thuần trên mobile — dùng `100dvh`/`100svh` hoặc fallback
- [ ] `prefers-reduced-motion` tôn trọng (giảm animation)
- [ ] KHÔNG che giấu lỗi bằng `overflow: hidden`
- [ ] Logical properties / RTL-safe nếu cần

---

## Integration Points (AGENT.md)

- **Phase 2.5 Design** (`.agent/design.md`): Đọc skill + thêm mục **"Responsive Behavior"** cho từng screen (mobile/tablet/desktop layout).
- **Phase 5 Review** (`.agent/reviewer.md`): Chạy Responsive Checklist Gate như điều kiện PASS.
