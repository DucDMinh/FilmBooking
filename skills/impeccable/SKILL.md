---
name: impeccable
description: "Use when reviewing or polishing UI screens, components, visual craft, accessibility contrast, responsive states, motion, copy, or AI-slop visual defaults before approving frontend work."
---

# Impeccable — UI Review & Polish (Curated)

> Curated from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) — chọn phần hay nhất (craft-floor + audit/polish gate) khớp với Phase 5 Review của template. Không copy nguyên xi; đã Việt hóa + rút gọn.

## Dùng khi nào

Reviewer Agent duyệt **task có giao diện (UI/component/screen)** — trước khi PASS. Bổ sung cho checklist hiện tại: craft-floor (chất lượng tối thiểu) + polish (tinh chỉnh cuối).

## ⚠️ MANDATORY: Craft Floor (chất lượng sàn)

Chạy các check này trên **kết quả đã build** (không phải ý định). Batch lại trong 1 round inspection, không tách rời từng screenshot.

### Verify (check trên sản phẩm thật)

- **Contrast:** body + placeholder text ≥4.5:1, large text ≥3:1. Trên surface màu → tint secondary text từ hue đó hoặc foreground; **không bao giờ gray**
- **Depth:** shadow có offset + soft blur. Halo màu không offset = decoration, không phải depth
- **Spacing:** nhóm tight, khoảng cách giữa các nhóm rộng, **nhiều space trên heading hơn dưới** nó. Đọc computed values
- **Type:** body measure 65–75ch, display max 6rem, tracking floor -0.04em, heading cân đối, scale + weight rõ ràng. Chạy real copy mọi breakpoint, fix chỗ overflow
- **Motion:** 1 authored moment, không effect rải rác, không 1 entrance giống nhau mọi section. Exponential ease-out từ default đã visible. Vượt qua transform/opacity (blur, backdrop-filter, clip-path, mask, shadow)
- **States:** hover, disabled, loading, error, empty. + real content, working controls, responsive composition, keyboard focus
- **Browser surfaces:** text selection, caret, custom scrollbar, focus ring, underline offset, numerals trong tabular data — đều phải theme từ palette (phần này models hay bỏ sót nhất)
- **Copy:** ngôn ngữ của sản phẩm. Controls nêu action; errors nêu problem + recovery
- **Coverage:** mọi brief requirement present + tìm thấy trong vài giây

### Refuse (đừng làm — AI slop defaults)

**Page scaffolds (lười biếng):**
- Cards cùng kích cỡ icon + heading + text làm cấu trúc trang. Cards là lazy container; nested cards luôn sai
- Hero-metric template: số to, label nhỏ, stats hỗ trợ, accent
- Kicker/eyebrow trên heading — **ban tuyệt đối**, không brief nào giành lại được. Heading tự gánh weight
- Section numbers (01/02/03) khi sequence không mang thông tin cần thiết
- Modal cho task không cần interruption/protected focus

**Surface habits:**
- Gradient text (emphasis từ weight hoặc size)
- Glass/blur làm decoration thuần
- `border-left`/`border-right` màu >1px trên cards/list/callout/alert
- Hard offset shadow (`4px 4px 0`) ngoài world thực sự neobrutalist
- Sparklines, progress rings, rounded-rectangle mềm thay content thật
- Monospace "làm màu" cho technical (chỉ dùng cho code/data/measurement)
- System display face (Impact, Arial Black) làm display voice của own-world page → source + self-host face khớp approved lettering
- Unicode glyph/emoji thay icon system. Icons phải drawn (library hoặc authored SVG), 1 stroke + weight nhất quán
- Light/dark chọn theo category → chọn theo use scene (ai, ở đâu, ánh sáng nào)

---

## Polish Gate (trước khi ship UI task)

Trước khi Reviewer PASS task UI, xác nhận:
- [ ] Craft floor ở trên đều xanh
- [ ] Không AI tells (em-dash spam, tên chung chung, screenshot giả)
- [ ] Run real copy mọi breakpoint, fix overflow
- [ ] Keyboard focus + reduced-motion handle
- [ ] Contrast đạt (không gray-on-gray)
- [ ] Không section fade giống nhau, không gradient text

---

## Kết nối với template

- Phase 5 Review: áp dụng craft-floor + refuse list cho **mọi task UI** trước khi duyệt PASS
- Kết hợp `skills/responsive-web/SKILL.md` (responsive checklist) — impeccable lo craft/quality, responsive lo breakpoint/touch
