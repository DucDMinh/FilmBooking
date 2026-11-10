---
name: ui-ux-pro-max
description: "Use when designing UI/UX, generating design systems, choosing product-specific color, typography, layout, interaction, animation, accessibility, or responsive design rules."
---

# UI/UX Pro Max — Design Intelligence (Curated)

> Curated from [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — chọn phần hay nhất (design-system generation + 10 priority rule categories) khớp với Phase 2 Design Agent của template. Không copy nguyên xi database/scripts; giữ lại tinh túy rule-based design.

## Dùng khi nào

Design Agent tạo design spec, hoặc khi cần chọn color/typography/layout/animation cho UI. Bổ sung cho taste-skill v2 — taste-skill chống AI slop, còn skill này đưa **quyết định thiết kế cụ thể theo sản phẩm**.

Skip cho backend logic, API, infra, non-visual work.

## Rule Categories by Priority

*Follow priority 1→10 để biết tập trung cái gì trước. KIỂM TRA "Must Have" trước, tránh "Anti-Patterns".*

| # | Category | Mức ưu tiên | Key Checks (Must Have) | Anti-Patterns (Avoid) |
|---|----------|------------|------------------------|------------------------|
| 1 | **Accessibility** | CRITICAL | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Bỏ focus rings, Icon-only button không label |
| 2 | **Touch & Interaction** | CRITICAL | Min size 44×44px, spacing 8px+, loading feedback | Chỉ dựa hover, state change tức thì (0ms) |
| 3 | **Performance** | HIGH | WebP/AVIF, Lazy loading, reserve space (CLS <0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | **Style Selection** | HIGH | Match product type, Consistency, SVG icons (no emoji) | Trộn flat & skeuomorphic ngẫu nhiên, Emoji làm icons |
| 5 | **Layout & Responsive** | HIGH | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Horizontal scroll, Fixed px container, Disable zoom |
| 6 | **Typography & Color** | MEDIUM | Base 16px, Line-height 1.5, Semantic color tokens | Text <12px body, Gray-on-gray, Raw hex trong components |
| 7 | **Animation** | MEDIUM | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | **Forms & Feedback** | MEDIUM | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors chỉ ở top, Overwhelm upfront |
| 9 | **Navigation Patterns** | HIGH | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back, No deep links |
| 10 | **Charts & Data** | LOW | Legends, Tooltips, Accessible colors | Chỉ dựa color để truyền đạt ý nghĩa |

---

## Workflow: Generate Design System

Khi tạo design cho page/project MỚI, chạy quy trình sau (thay cho tự bịa color/typography):

### Step 1: Analyze Requirements
Extract từ request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, entertainment, tool, productivity, hybrid
- **Target audience & context**: age group, usage context (commute, leisure, work)
- **Style keywords**: playful, vibrant, minimal, dark mode, content-first, immersive…
- **Stack**: detect từ project (react/next/vue/svelte/nuxt/@angular, flutter, swiftui, react-native, tailwind, shadcn…) — **never assume**, nếu không detect được thì hỏi hoặc default html-tailwind

### Step 2: Build Design System
Dựa trên product type + industry + keywords, generate:
- **Pattern** (layout pattern phù hợp product type)
- **Style** (visual style)
- **Colors** (palette có reasoning — semantic tokens, không raw hex)
- **Typography** (pairing + scale, base 16px, line-height 1.5)
- **Effects** (shadow, radius, elevation)
- **Anti-patterns to avoid** (cho product type này)

Đối chiếu với `skills/react-nodejs/design-tokens.md` để đảm bảo nhất quán.

### Step 3: Check Priority Categories
Áp dụng các category 1→5 (Accessibility, Touch, Performance, Style, Layout) làm **MUST**, 6→10 theo mức liên quan.

---

## Kết nối với template

- Phase 2 Design: chạy workflow trên để tạo `design-tokens.md` + `.context/design-spec.md`
- Kết hợp `.agent/references/taste-skill-v2.md` — taste-skill chống slop, ui-ux-pro-max đưa quyết định cụ thể. **Ưu tiên: taste-skill §4 Anti-Slop > ui-ux-pro-max defaults khi conflict.**
- Kết hợp `skills/impeccable/SKILL.md` — impeccable lo craft-floor ở phase Review
