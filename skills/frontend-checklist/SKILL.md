---
name: frontend-checklist
description: "Frontend quality gate cho web template (opencode-project-template). Dùng trong Phase 5 Review cho mọi task UI/public-facing: HTML semantics, Accessibility (WCAG), SEO, Performance/Core Web Vitals, Images, Frontend Security, Privacy, CSS, JS, Testing. Curate từ Front-End-Checklist (thedaviddias) — chỉ giữ critical + high priority."
---

# Front-End Checklist — Quality Gate (Curated)

> Curated từ [thedaviddias/Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist) (390 rules, 11 categories) — chọn **critical + high priority** phù hợp với React + Node.js stack của template. Không copy nguyên xi; rút gọn thành **GATE** cho Phase 5 Review. Nguồn đầy đủ: https://frontendchecklist.io (mỗi rule có hướng dẫn Check/Fix/Explain chi tiết).

## Dùng khi nào

Reviewer Agent duyệt **mọi task có giao diện hoặc public-facing output** (page, component, API trả HTML, metadata, assets) — trước khi PASS. Bổ sung cho:
- `impeccable` — lo **visual craft** (contrast, depth, type, motion, states)
- `responsive-web` — lo **breakpoint/layout** (375/768/1280px)
- `security/` — lo **backend/API** (OWASP, BOLA, JWT)
- Skill này — lo **frontend quality chuẩn web**: semantics, a11y, SEO, perf, images, frontend security, privacy

> ⚠️ **GATE** — Task KHÔNG được PASS nếu còn mục **CRITICAL** FAIL. Mục HIGH là điều kiện mặc định, trừ khi có lý do kỹ thuật hợp lệ (ghi vào review report).

## FRONTEND CHECKLIST GATE (BẮT BUỘC — trước khi PASS review)

### 1. HTML & Semantics (CRITICAL)
- [ ] `<!DOCTYPE html>` (HTML5 doctype) — không dùng quirks mode
- [ ] `<html lang="...">` khai báo đúng ngôn ngữ trang
- [ ] `<meta charset="UTF-8">` là phần tử đầu tiên trong `<head>`
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1">` (không `user-scalable=no`)
- [ ] Dùng semantic elements (`header/nav/main/article/section/footer`) thay div-spaghetti
- [ ] KHÔNG duplicate `id` trong document
- [ ] Mọi button/link có accessible name (không icon-only không label, không `title` làm name duy nhất)
- [ ] Form control có label liên kết đúng (`<label for>` hoặc aria-labelledby)
- [ ] Custom 404 page (nếu app có routing)

### 2. Accessibility — WCAG (CRITICAL)
- [ ] Mọi ảnh có `alt` — ảnh decorative dùng `alt=""`, ảnh thông tin mô tả đúng nội dung (không `alt="image"`, không filename)
- [ ] Keyboard: mọi interactive element reachable + operable bằng keyboard (Tab order hợp lý, không focus trap trừ modal)
- [ ] Focus visible: focus indicator rõ ràng (không `outline: none` thiếu replacement)
- [ ] Heading hierarchy logic (h1 → h2 → h3, không nhảy cóc, không dùng heading làm style)
- [ ] Color contrast: text ≥ 4.5:1, large text ≥ 3:1 (không gray-on-gray)
- [ ] `prefers-reduced-motion` — tắt/giảm animation khi user yêu cầu
- [ ] KHÔNG `aria-hidden="true"` trên body
- [ ] Link text mô tả đích đến (không "click here" / "read more" chung chung)
- [ ] Skip navigation link (cho trang có nav lặp lại)
- [ ] Modal: focus vào modal khi mở, focus trap, Esc đóng, restore focus khi đóng
- [ ] ARIA attributes hợp lệ (không role không tồn tại, không aria-* trên element không hỗ trợ)
- [ ] Dynamic content dùng `aria-live` (toast, loading, notification)
- [ ] KHÔNG content flash >3 lần/giây (seizure risk)
- [ ] Form validation message accessible (không chỉ đổi màu border)

### 3. SEO (MANDATORY cho public page)
- [ ] `<title>` duy nhất, mô tả, ≤ 60 chars, có keyword chính
- [ ] Meta description duy nhất mỗi trang (120–160 chars, CTA)
- [ ] Canonical URL (`<link rel="canonical">`) — self-referencing, absolute URL
- [ ] Open Graph (`og:title`, `og:description`, `og:type`, `og:image`) + Twitter Card cho page chia sẻ
- [ ] Structured data JSON-LD (Article/Product/FAQ/LocalBusiness theo content) — validate bằng Rich Results Test
- [ ] `robots.txt` hợp lệ (HTTP 200, có `Sitemap:` directive, không chặn CSS/JS)
- [ ] XML sitemap hợp lệ (không chứa noindex/4XX pages, submit Search Console)
- [ ] Redirect chain ≤ 1 hop (không redirect → redirect → redirect)
- [ ] Internal links không broken (kiểm tra 404)
- [ ] Không meta tags trong `<body>` (Next.js: dùng `metadata` API / Head component)
- [ ] SPA: `robots` meta cho page noindex đúng chỗ, không conflict schema+noindex

### 4. Performance & Core Web Vitals (CRITICAL)
- [ ] **LCP < 2.5s** — preload hero/critical image, TTFB thấp, không render-blocking resources
- [ ] **CLS < 0.1** — image/video/iframe có explicit `width`/`height` hoặc aspect-ratio; không chèn content trên đầu content khác
- [ ] **INP < 200ms** — event handler nhẹ, không long task trên main thread
- [ ] **Tấn công: FCP < 1.8s** — critical CSS inline, loại bỏ CSS/JS render-blocking
- [ ] Code splitting: không bundle 1 file khổng lồ (route-level + dynamic import cho heavy lib)
- [ ] Lazy loading cho image/component dưới fold (`loading="lazy"`, `import()` on interaction/visibility)
- [ ] Font: `font-display: swap`, preload font chính, subset; không `font-display: block` (FOIT)
- [ ] Third-party scripts (analytics, chat, ads): load muộn/async, không block render, audit cần thiết
- [ ] HTTP cache hợp lý (immutable cho hashed assets, revalidate cho HTML)
- [ ] Compression (gzip/brotli) + HTTP/2/3 enabled (server/DevOps)
- [ ] Page weight ≤ 1500KB (không count bundle chứa ảnh base64 khổng lồ)
- [ ] Back/forward cache không bị phá (không `beforeunload` vô cớ, không cache-control bất lợi)

### 5. Images (HIGH)
- [ ] Format hiện đại: WebP/AVIF (fallback hợp lý)
- [ ] Compressed đúng mức (không quality loss không đáng)
- [ ] Responsive: `srcset` + `sizes` (hoặc `next/image`/`picture` với fallback)
- [ ] Serve đúng display size (không 2000px ảnh hiển thị 300px)
- [ ] `alt` đầy đủ (xem mục 2), ảnh decorative `alt=""`
- [ ] Ưu tiên: critical images (hero, LCP) không lazy — `fetchpriority="high"` thay vì lazy

### 6. Frontend Security (HIGH)
- [ ] HTTPS everywhere — form submit qua HTTPS, không mixed content
- [ ] `Content-Security-Policy` header (hoặc Report-Only trước): `default-src 'self'`, hạn chế inline/unsafe-eval
- [ ] Subresource Integrity (SRI) cho script/style từ CDN bên thứ ba
- [ ] `X-Content-Type-Options: nosniff` + `X-Frame-Options` (hoặc frame-ancestors CSP)
- [ ] Session cookie: `Secure` + `HttpOnly` + `SameSite=Lax/Strict` — KHÔNG lưu JWT/token trong localStorage
- [ ] `target="_blank"` links có `rel="noopener noreferrer"`
- [ ] KHÔNG dùng `eval()` / `new Function()` / innerHTML với untrusted input
- [ ] Password input: `type="password"`, có `autocomplete` hợp lý (current-password/new-password), không log password
- [ ] KHÔNG leak stack trace/env vars ra production UI
- [ ] Dependency audit quét (npm audit) trong CI

### 7. Privacy (HIGH)
- [ ] Cookie consent (nếu dùng analytics/ads/tracking) — non-essential cookies chặn tới khi consent, withdraw dễ như give
- [ ] Privacy policy link trong footer (nếu collect data)
- [ ] KHÔNG log PII (email, phone, địa chỉ) vào console/error tracking

### 8. CSS & JavaScript (HIGH)
- [ ] Dùng CSS custom properties cho design tokens (theme/color/spacing) — không hardcode hex rải rác
- [ ] Relative units (`rem`/`%`/`clamp`) — không fixed px cho font/layout chính
- [ ] Specificity thấp phẳng (tránh `!important`, id selectors, deep nesting)
- [ ] Không inline CSS/JS trong markup (trừ critical CSS hợp lý)
- [ ] JS: `const`/`let` (không `var`), ES modules, strict mode TypeScript bật
- [ ] Event handlers debounce/throttle (scroll/resize/input)
- [ ] Error handling: try/catch async, global error boundary (React), không nuốt lỗi
- [ ] Không memory leak: cleanup listeners/intervals/timers trên unmount
- [ ] Validate dữ liệu runtime từ external (schema: zod/yup) — không tin API response

### 9. Testing (HIGH — theo mức độ task)
- [ ] Unit tests cho logic chính (đã có trong superpowers TDD)
- [ ] Integration tests cho key workflows (auth flow, checkout, form submit)
- [ ] Accessibility testing (jest-axe / axe-core scan)
- [ ] Cross-browser + mobile viewport test (đã có responsive-web gate)
- [ ] Error monitoring production (đã có trong monitoring skill) — báo cáo exception thật, không nuốt

---

## Audit Workflow (khi cần review toàn diện hơn — theo frontend-checklist-global)

1. **review_code** — dán code/component cần review, ưu tiên finding có bằng chứng từ code
2. **audit_url** — nếu có URL public, audit trực tiếp (Lighthouse, axe, WebPageTest)
3. Giữ **conservative stance**: chỉ report issue khi code/markup hỗ trợ trực tiếp — không phán bừa
4. Với component/page nhỏ: ưu tiên **1-2 finding mạnh nhất** thay vì liệt kê mọi thứ
5. Không coi `alt=""` là bug nếu ảnh decorative; không coi `autocomplete="off"` là defect nếu không có lý do

## Tra cứu sâu hơn

- Full rule index + link: `references/rule-index.md`
- Website browse/filter: https://frontendchecklist.io/rules
- MCP server (agent workflow đầy đủ): https://mcp.frontendchecklist.io — có thể dùng khi cần audit sâu và có network

## Kết nối với template

- **Phase 5 Review (5a)**: Reviewer chạy gate này cho **mọi task UI/public-facing** trước khi PASS — cùng lúc với Responsive Checklist Gate + UI Craft-Floor
- **Phase 2.5 Design**: Design Agent tham khảo mục SEO/Images/Perf khi viết screen specs (metadata, structured data, image strategy)
- **Phase 6 DevOps**: kiểm tra header security (CSP/HSTS/nosniff), compression, HTTP/2, sitemap/robots trên production
- Không thay thế `impeccable` (visual craft) / `responsive-web` (breakpoint) / `security/` (backend API) — bổ sung cho nhau