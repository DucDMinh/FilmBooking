# Brainstorm Log — FilmBooking (/start bước 2, 2026-11-10)

Nguồn: `docs/BRD.md` v0.3 (Q1–Q9 đã chốt, không hỏi lại) · `SPECIFICATIONS.md` § Điểm cần xác nhận #1–#19.

## Config dự án
| Nhóm | Câu hỏi | Trả lời |
|---|---|---|
| Git | Branch / auto-push | `staging`, cấm push `main`, **không auto-push**. Repo chưa git init → init ở checkpoint sau khi duyệt |
| Stack | Package manager | **pnpm** (monorepo) |
| Deploy | Deploy & CI | Web: **Vercel**; API Nest: **Render free**; CI: **GitHub Actions** |
| Models | Model theo vai | "Tiết kiệm": builder `sonnet`, reviewer `opus`, spec-validator `haiku` (builder-strong giữ `opus`) |
| DB | Test DB | **Supabase local (Docker)**; migrations bằng Supabase CLI |
| Monitoring | | Sentry free, bật ở layer cuối |

## Kiến trúc
| Câu hỏi | Trả lời |
|---|---|
| Kiến trúc tổng thể | Ban đầu chọn monolith Next.js + SQL function → **user đổi: Next.js + NestJS + Supabase** |
| Nest ↔ DB | **supabase-js mang JWT user** (giữ RLS) + **Postgres function** cho thao tác nguyên tử; service role chỉ cho webhook/job/POS |
| Host Nest | **Render free** (ngủ sau 15' → pg_cron cho job SQL, pg_net gọi Nest /jobs cho job HTTP) |
| Next lấy data | **Mọi dữ liệu qua Nest**; Supabase Auth + Realtime trực tiếp ở client |
| Repo | **pnpm monorepo**: apps/web, apps/api, packages/shared, supabase/ |

## Quyết định nghiệp vụ (giải quyết § Điểm cần xác nhận)
| # | Quyết định |
|---|---|
| 1, 2, 4, 5 | Theo spec đã gán: voucher lõi toàn chuỗi, đơn 0đ, avatar, báo cáo RPT-01/02/06, CSV đơn bị ảnh hưởng = MVP; voucher theo phạm vi rạp = GĐ2; AC-18 nghiệm thu ở GĐ2 |
| 3 | Báo cáo suất bị huỷ (phần BR-RPT-09 cần cho AC-25) đưa lên MVP |
| 6 | Staff **được ghi** kết quả xử lý đơn `affected` của rạp mình; vẫn chỉ đọc đơn thường |
| 7 | POS giả lập: Staff đăng nhập → server dùng **khoá API của rạp** gọi đúng đường API POS (khoá không ra client) |
| 8 | Đơn POS dùng cùng vòng đời (paid → checked_in / affected → exchanged / refunded_manual); huỷ suất → `affected`, không email, đánh dấu "liên hệ tại quầy", tính vào báo cáo hoàn tiền |
| 9, 10, 17 | Tiền về cho đơn `expired`/`cancelled` (kể cả đơn cũ bị thay): tự chốt chỉ khi suất chưa huỷ/đóng bán, chưa qua mốc đóng bán online và ghế còn trống; ngược lại `needs_manual_review`. Đơn mới thay đơn `pending_payment` cũ → cũ `cancelled` + huỷ payment link. Huỷ suất → đơn holding/pending_payment → `cancelled` |
| 11 | Check-in tới giờ bắt đầu + thời lượng phim (không tính dọn phòng) |
| 12 | Giữ ghế 10' là mặc định, Admin cấu hình được |
| 13 | "Sắp chiếu" = ngày khởi chiếu tương lai và chưa có suất trong khu vực; có suất chiếu sớm → "Đang chiếu" |
| 14 | Tự xoá 7 ngày KHÔNG áp cho tài khoản Facebook chưa xác nhận email bổ sung |
| 16 | Hosting như trên; bản đồ **OpenStreetMap/Leaflet**; giám sát **Sentry**; email **Resend** |
| 18 | Facebook không email + email trùng: thông báo chung "kiểm tra email", gửi mail cho chủ tài khoản hướng dẫn đăng nhập phương thức cũ để liên kết; không tạo tài khoản trùng |
| 19 | Sweetbox giá theo cặp (tính 2 ghế); khung giờ theo giờ bắt đầu suất, 17:00 thuộc "sau 17h"; cuối tuần = T7 + CN; ngày lễ ưu tiên hơn cuối tuần |

## Rủi ro ghi nhận
- Render free cold start → lệch NFR-01 lượt đầu (chấp nhận cho demo).
- BRD §10 (công nghệ) cần cập nhật Next + Nest — chờ user duyệt ở checkpoint.
- Docker daemon có vẻ chưa chạy lúc brainstorm (`docker info` rỗng) — cần bật trước layer 0.

## Design (bước 3, 2026-11-10)
| Câu hỏi | Trả lời |
|---|---|
| Design reference | Không — agent tự design |
| Phong cách trang khách | Rạp chiếu tối, poster làm chủ, 1 màu nhấn cho CTA; có chế độ sáng |
| UI library | Tailwind + shadcn/ui (Radix) |
| Admin UI | Cùng token, bố cục riêng: admin nền sáng mật độ cao; soát vé tối ưu mobile |

### Design — thay thế (2026-11-11)
User: **bỏ toàn bộ design cũ** (tông vàng hổ phách, Be Vietnam Pro, admin nền sáng). Dùng bộ handoff **CINEMO** (`docs/design/cinemo/`, 40 SVG + `tokens/design-tokens.json` + prototype): dark-cinema cho mọi bề mặt (kể cả admin), màu nhấn coral `#F06D5B`, Inter, desktop 1440 / mobile 390. Giữ: Tailwind + shadcn/ui. Các quyết định D1–D12 cũ huỷ, design agent đề xuất lại theo handoff.

### Phạm vi mobile (2026-11-11)
User: **vẫn làm giao diện web responsive cho mobile** (mobile-first ≥ 360px theo NFR-11), **không làm app native** (đã ngoài phạm vi BRD §4.2). 3 màn mobile của handoff (30–32) là tham chiếu cho layout mobile.

### Cookie phiên HttpOnly (2026-11-11, review layer-2/task-04)
User chọn: **cookie HttpOnly + proxy qua Next** (đúng BRD NFR-06) thay vì cookie đọc được bằng JS. Hệ quả: đăng nhập/OAuth callback/logout ở Route Handler server Next; browser gọi API qua `/api/proxy/*`; Supabase browser client chỉ dùng anon key (Realtime công khai). Đổi `middleware.ts` → `proxy.ts` (Next 16.4.6).

### Quyết định auth trước Layer 3 (2026-11-11)
- **G5 (R-04 24h vs R-13 1h) → chọn C:** giữ `otp_expiry=86400` (link xác nhận 24h đúng R-04); luồng đặt lại mật khẩu do server kiểm `recovery_sent_at` ≤ 1 giờ (đúng R-13), từ chối nếu quá hạn.
- **G6 (đăng nhập/recover gọi thẳng GoTrue bỏ qua lockout R-11, rate limit R-08, Turnstile R-07) → chấp nhận rủi ro cho bản demo** (BRD: dự án demo, không khách thật). Phải cân nhắc lại (password verification hook / captcha GoTrue) trước khi có khách thật. Ghi nhận là lệch có chủ đích so với R-07/R-08/R-11 trên đường gọi trực tiếp; đường đăng nhập chuẩn qua Nest vẫn áp dụng đủ quy tắc.
- Email: Nest gửi qua cấu hình SMTP chung (đổi Gmail/Resend bằng biến môi trường) — chờ user cho biết có domain riêng chưa (không chặn Layer 3).
