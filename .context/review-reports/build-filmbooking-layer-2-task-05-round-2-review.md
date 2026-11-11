Agent: reviewer

# Review — build-filmbooking layer-2 task-05 — round 2

- Worktree: `E:\FilmBooking\.worktrees\layer-2__task-05` (chưa commit)
- **Review level: STRICT** (giữ như round 1: component dùng chung + navigation + nội dung pháp lý công khai)
- **Blast radius:** layout `(public)`/`(auth)`, SiteHeader/SiteFooter, component chung, 3 URL pháp lý công khai, hằng mới `apps/web/src/lib/legal.ts`.
- Scope: 11 file theo danh sách + `apps/web/src/lib/legal.ts` (ngoài danh sách, dispatcher đã chấp nhận; chỉ chứa hằng version/ngày/notice, không xung đột task song song). `next-env.d.ts` ` M` auto-gen — không tính.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 14, api 20, web 30 |
| `pnpm build` | PASS — 3 trang pháp lý prerender `○ (Static)` |

## Đóng finding round 1
| Round 1 | Trạng thái | Bằng chứng |
|---|---|---|
| MAJOR-1 điều khoản lệch R-134/R-109 | ĐÓNG | `dieu-khoan/page.tsx:83-86` ngoại lệ duy nhất "rạp huỷ suất chiếu hoặc rạp đóng cửa", hoàn tiền thủ công ngoài hệ thống; mục 6 (`:98-109`) đúng R-109 (đổi suất tại quầy / hoàn tiền thủ công nếu đồng ý; đóng cửa → rạp liên hệ hoàn tiền) + R-134 (sai số tiền → không xác nhận, vào đối soát). Không còn "sự cố". Test khẳng định. |
| MAJOR-2 "72 giờ" | ĐÓNG | `huong-dan-xoa-du-lieu/page.tsx:45` placeholder "[Thời hạn xử lý sẽ được công bố trước go-live.]"; test `not.toContain("72")`. |
| MAJOR-3 AgeBadge tên accessible | ĐÓNG | `age-badge.tsx:29` `role="img"` + `aria-label`; test `getByRole("img", { name })` cho 5 nhãn. |
| MINOR-1 cảnh báo R-29 | ĐÓNG | `huong-dan-xoa-du-lieu/page.tsx:28-31`. |
| MINOR-2 NFR-08 toạ độ | ĐÓNG | `chinh-sach-bao-mat/page.tsx:32` "không lưu toạ độ". |
| MINOR-3 giá trị arbitrary | ĐÓNG (chấp nhận) | `max-w-7xl` (1280 vs 1300), `max-w-3xl` (768 vs 760), `max-w-md` (448 vs 440), `text-2xl` (24 vs 22), `text-base`. Lệch ≤ 20px so với handoff, không ảnh hưởng responsive/khả dụng → chấp nhận; follow-up token `--layout-content-max` như builder đề xuất. Còn `leading-[1.7]` (unitless, không phải px) — chấp nhận. |
| MINOR-4 test header/pháp lý | ĐÓNG | +7 test: nav 3 mục, không có "Khuyến mãi", `aria-current`, `aria-expanded` + mở dialog, link tài khoản; 3 trang metadata + nội dung. |
| MINOR-5 skip link | ĐÓNG | `(public)/layout.tsx:10-15` `sr-only focus:not-sr-only` → `#main`, chữ `fg-on-brand` trên `brand` (6.52:1). |
| MINOR-6 active-state Sheet | ĐÓNG | `site-header.tsx:37,113-118` `accountHref` + `aria-current`. |
| MINOR-7 DateTime invalid | ĐÓNG | `money.tsx:17` fallback "—"; có test. |
| MINOR-8 version hardcode | ĐÓNG | `lib/legal.ts` hằng dùng chung. |
| MINOR-9 cỡ chữ AgeBadge 10px | CÒN (không chặn) | vẫn `text-caption`; follow-up rà với handoff. |

## Findings mới (round 2)
- [MINOR] `site-header.tsx:38` `isActive =(href` thiếu khoảng trắng — nit format (lint không bắt; nên chạy prettier).
- [MINOR] Thứ tự import ở 3 trang pháp lý: `@/lib/legal` chen giữa `next` và `next/link` (`dieu-khoan/page.tsx:1-3` và tương tự) — lệch quy ước nhóm import của repo.
- [MINOR] Skip link chỉ có ở `(public)`; `(auth)` layout chưa có (header auth chỉ 1 link nên ảnh hưởng thấp).
- [MINOR] Follow-up tài liệu: `skills/react-nodejs/design-tokens.md:123` nên ghi `role="img"` cùng `aria-label` cho khớp code.

Không có CRITICAL/MAJOR.

## Responsive Checklist Gate (360 / 768 / 1280 — đọc CSS, không có browser)
| Mục | Kết quả | Bằng chứng |
|---|---|---|
| Không cuộn ngang | OK | Header 360: logo `text-2xl` (~110px) + hamburger 44px; nav desktop `hidden md:flex`; footer `flex-wrap`; prose `w-full max-w-3xl`; Sheet `w-72` (288 < 360); skip link `fixed` chỉ khi focus. |
| Mobile-first `min-width` | OK | Chỉ prefix `md:`. |
| Grid auto-fit/minmax | N/A | Không có grid. |
| Container không fixed px | OK | `w-full` + `max-w-*` rem. |
| Font-size rem | OK | `text-base`/`text-2xl` (rem); scale token px của layer-1 ngoài scope (đề xuất task riêng). |
| Heading fluid | OK | Token h1/h2/h3 đổi theo media query mobile (layer-1). |
| Media | N/A | Không có ảnh/video. |
| Touch target ≥44px | OK | `min-h-11` cho link nav/footer/mục lục/logo; hamburger `size="icon"`; skip link `py-3` + text. |
| Nav mobile | OK | Sheet left, title/description, đóng khi chọn link, `aria-current`. |
| Table | N/A | — |
| `100vh` | OK | `min-h-dvh`. |
| reduced-motion | OK | `globals.css:154`. |
| overflow:hidden che lỗi | OK | Không có. |
| Focus visible / aria | OK | `:focus-visible` toàn cục; skip link; landmark header/nav(aria-label)/main/footer; `aria-expanded`; `role=alert/status/img`. |
| Tương phản | OK | Như round 1 (bảng design-tokens ≥ 6:1 cho badge; footer muted ≈ 5.0:1). |

## Skill gates
| Gate | Kết quả |
|---|---|
| aislop | skip — `aislop: command not found` (round 1) |
| oxlint | skip, oxlint not configured (eslint PASS) |
| ocr | skip, ocr not installed |
| AI-readable | OK — < 3 indicator |
| ai-friendly-web | N/A (task shell/pháp lý; robots/sitemap/llms.txt thuộc task devops/SEO) |
| blitzstrike | N/A — không có input/API/auth |
| Security | OK — trang tĩnh, không `dangerouslySetInnerHTML`, không secret |

## Residual risk
- Chưa xem trình duyệt thật ở 360/768/1280.
- Nội dung pháp lý vẫn là bản nháp (có banner); email/hotline + thời hạn xử lý xoá dữ liệu phải chốt trước khi nộp Facebook App Review (R-25).
- Kích thước layout lệch nhẹ so với handoff (1280 vs 1300…) — follow-up token.

## Verdict: PASS
