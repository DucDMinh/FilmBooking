---
name: m3e-canvas
description: "Vẽ phác thảo màn hình Material 3 Expressive trong browser (lnkiai/m3e-canvas) → copy prompt chuẩn cho AI coding tool. Bổ trợ ui-ux-pro-max & Phase 2 design: sketch screen trước khi code để agent bám design chính xác. Trigger: design screen mới, cần mockup nhanh, M3 style."
---

# m3e-canvas — Sketch UI tạo vibe-coding prompt (Curated)

> Curated từ [lnkiai/m3e-canvas](https://github.com/lnkiai/m3e-canvas) (MIT, ~7.8k⭐) — giữ phần lõi: sketch screen M3 Expressive trong browser, link/navigation, theme, xuất prompt. KHÔNG bundle app vào repo — chỉ dùng web app + copy prompt.

## Dùng khi nào

- **Phase 2 Design** — khi cần phác thảo nhanh screen (đặc biệt mobile-first) trước khi viết screen specs.
- Bổ trợ `ui-ux-pro-max` (quyết định design system) + `impeccable` (craft-floor): m3e-canvas cho **hình ảnh cụ thể** để agent bám design chính xác, giảm "vẽ bừa".
- Khi user/im khó hình dung layout từ text → sketch nhanh rồi copy prompt vào design-spec.

## Cách dùng

1. Mở app: **https://lnkiai.github.io/m3e-canvas/** (web, không cần cài, lưu localStorage).
2. Sketch screens: kéo-thả Material 3 parts (app bar, buttons, FAB, cards, lists, chips, text fields, dialogs...), thêm nhiều screen phone (412×892) / desktop (1280×800).
3. **Magnetic connections**: đưa 2 phần lại gần → thành group (liên kết như thật). **Tap to navigate**: gán target screen + transition cho phần chạm được.
4. **Theme**: chỉnh màu (7 presets hoặc seed color → M3 scheme đầy đủ), shape, type, motion; light/dark + 3 contrast levels.
5. **Prompt output**: copy prompt (EN/JP/ZH/KR) — chọn target **Android** hoặc **web** theo project. Prompt mô tả overlaps, side-by-side rows, flow navigation.
6. Dán prompt vào design-spec (`.context/design-spec.md`) hoặc đưa thẳng vào task cho loop agent.

## Hook vào template (Phase 2 Design — web)

- Khi sketch được screen → lưu prompt vào `.context/design-spec.md` (mục tương ứng từng screen, dạng "Screen spec (m3e-canvas): ...").
- Đối chiếu prompt với `design-tokens.md` (thống nhất theme) trước khi loop code.
- KHÔNG bắt buộc chạy mỗi task — chỉ khi cần mockup/phác thảo hoặc user cung cấp ảnh thiết kế.

## Lưu ý

- App **không có backend** — dữ liệu chỉ ở localStorage browser, share qua link (mở lại trên canvas người khác).
- Optional AI helper: đem key riêng (OpenAI/Claude/Gemini/DeepSeek) — không bắt buộc, không dùng trong template để giữ offline.
- Prompt mặc định nhắm Android/web theo lựa chọn — dùng đúng target của project (template web → chọn "web").

## Output

Trả về: link/share (nếu có), prompt đã copy cho từng screen, đã đối chiếu design-tokens chưa, nơi lưu trong design-spec.