---
name: ai-friendly-web
description: "Checklist và quy trình làm web AI-ready sau khi deploy — llms.txt, robots.txt cho AI crawlers, sitemap, JSON-LD structured data, semantic HTML, OpenAPI. Web không chỉ người đọc mà AI agent đọc/dùng được ngay. Hook Phase DevOps (sau deploy) + reviewer gate. Trigger: chuẩn bị deploy, review web public."
---

# AI-Friendly Web — Web cho AI Agent Đọc & Dùng (Curated)

> Chuẩn "AI-ready web" 2025-26: sau khi code xong + deploy, web không chỉ phục vụ người đọc mà **AI agent (GPTBot, ClaudeBot, PerplexityBot, agent tự động) đọc hiểu + dùng được ngay** — không crawl mù, không đoán ngữ nghĩa.

## Nguyên tắc cốt lõi

Agent đọc web như người đọc sách: cần **mục lục (llms.txt), bản đồ trang (sitemap), ngữ nghĩa rõ (JSON-LD + semantic HTML), và cửa ra vào (robots.txt không chặn)**. Nếu web không có mấy thứ này, agent phải đoán — đoán là sai.

## Checklist AI-Readiness (chạy ở Phase DevOps — SAU deploy, trước khi bàn giao)

### 1️⃣ `llms.txt` + `llms-full.txt` (mục lục cho LLM — bắt buộc)

File markdown đặt ở root web (chuẩn llms.txt):
- `llms.txt` — ngắn gọn: web là gì, 1-2 dòng mô tả, link các trang/API **quan trọng nhất** (tối đa ~20 link, mỗi link kèm 1 dòng mô tả)
- `llms-full.txt` — bản đầy đủ: toàn bộ nội dung chính, đủ để agent không cần vào web
- SINH TỪ NỘI DUNG THẬT — không bịa tên trang/link không tồn tại

```
# <Tên web>

> <1-2 câu: web làm gì, cho ai>

## Useful links
- [Home](/): mô tả
- [Pricing](/pricing): mô tả
- [API](/api): mô tả
```

### 2️⃣ `robots.txt` — CHO PHÉP AI crawlers (bắt buộc)

- KHÔNG chặn GPTBot / ClaudeBot / PerplexityBot / Google-Extended / CCBot / anthropic-ai
- Có `Sitemap:` chỉ tới sitemap.xml
- Chặn đúng thứ cần chặn (admin, private paths) nhưng public content để mở

```
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: *
Allow: /
Disallow: /admin/
Sitemap: https://domain.com/sitemap.xml
```

### 3️⃣ `sitemap.xml` — bản đồ trang đúng (bắt buộc)

- Liệt kê đủ các trang public, `lastmod` cập nhật khi đổi
- Có sitemap index nếu site lớn (sitemap chính + sitemap con theo section)

### 4️⃣ JSON-LD structured data (khuyến nghị cho trang public)

- Trang public chính khai báo schema.org: `Organization`, `WebSite`, `Product`/`Service`, `FAQPage`, `Article`...
- Giúp agent (và Google) hiểu ngữ nghĩa: web này là công ty gì, bán gì, FAQ gì — không cần đoán từ text

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "...",
  "url": "https://...",
  "description": "..."
}
</script>
```

### 5️⃣ Semantic HTML + ARIA + meta đầy đủ

- Thẻ ngữ nghĩa: `<nav> <main> <article> <section> <aside> <footer>` — không div soup
- Heading đúng cấp (1 h1/trang, không nhảy cấp), `aria-label` cho control icon-only
- Meta: title, description, canonical, OG tags, viewport
- (Tái dùng checklist `frontend-checklist` mục a11y/SEO — skill này chỉ nêu phần AI-relevant)

### 6️⃣ OpenAPI spec (nếu web có API public)

- Xuất bản `openapi.json` (hoặc `/openapi.json`) — agent gọi API đúng contract, không mò
- Có tài liệu API tối thiểu (dù private cũng nên có spec nội bộ)

### 7️⃣ `.well-known/` (tùy chọn, khi cần discovery chuẩn)

- `/.well-known/ai-plugin.json` (OpenAI plugin manifest) nếu muốn agent plug-in hóa
- `/.well-known/llms.txt` (redirect 301 về /llms.txt)

## Verify nhanh (script/chạy tay sau deploy)

```bash
# Mọi file chuẩn phải trả 200
curl -s -o /dev/null -w "%{http_code}\n" https://domain.com/llms.txt
curl -s -o /dev/null -w "%{http_code}\n" https://domain.com/robots.txt
curl -s -o /dev/null -w "%{http_code}\n" https://domain.com/sitemap.xml
# robots.txt phải cho phép AI bots
curl -s https://domain.com/robots.txt | grep -i "GPTBot\|ClaudeBot\|PerplexityBot"
# JSON-LD hợp lệ (nếu có)
curl -s https://domain.com | grep -c "application/ld+json"
# llms.txt có link thật (mỗi link curl test 200)
```

## Hook vào template

- **Phase DevOps (sau deploy)**: chạy checklist trước khi bàn giao — mỗi mục đều verify bằng curl, không "tin là có".
- **Reviewer gate (task web/public)**: check web AI-readiness cùng frontend-checklist — thiếu llms.txt / chặn AI crawlers → MAJOR → sửa trước PASS.
- Bổ trợ `frontend-checklist` (đã cover semantic HTML/SEO/a11y) + `ai-readable-codebase` (code cho AI đọc — skill này là bản "deployed" của cùng tư tưởng).

## Lưu ý

- `llms.txt` SINH TỪ THẬT, không bịa — nội dung thay đổi thì update (thêm vào convention: đổi public page chính → update llms.txt).
- Không chặn AI crawlers trên public content — chặn chỉ cho private/admin/API internal.
- Web SPA (React) render client-side → đảm bảo server serve sẵn meta tags cơ bản (SSR/SSG cho trang public chính hoặc index.html có meta đủ).
- Checklist này là "đủ dùng", không phải tối đa — ưu tiên mục 1-2-3 (llms.txt, robots, sitemap) bắt buộc, còn lại khuyến nghị.

## Output

Trả về: từng file chuẩn (llms.txt/robots/sitemap/JSON-LD) kèm trạng thái (tạo mới/sửa + nội dung), kết quả verify curl từng mục, liệt kê thiếu sót + mức (bắt buộc/khuyến nghị).