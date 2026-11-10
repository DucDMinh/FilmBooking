# Spec Update — 2026-11-10 brainstorm-decisions
**spec_version:** 1.0.0 → 1.1.0 (MINOR)
**Requirements:**
- KHÔNG thêm/xoá R-xx. Làm rõ hành vi cho các điểm cần xác nhận #1–#19 (bảng "Quyết định brainstorm" trong SPECIFICATIONS.md): ảnh hưởng R-78 (tiền về muộn mở rộng cho đơn `cancelled`), R-52 + R-72 (quy tắc giá, Sweetbox), R-99 (quy tắc check-in), quyền Staff đơn `affected`, POS giả lập, vòng đời đơn POS, "Sắp chiếu", tự xoá tài khoản.
- SỬA Tech Stack: Next.js (UI) + **NestJS** (API) + Supabase; pnpm monorepo; Vercel + Render free + GitHub Actions; OpenStreetMap; Sentry; Resend.
**Lý do:** brainstorm /start bước 2 (`.context/brainstorm-log.md`), user chọn.
**Ảnh hưởng:** toàn bộ thiết kế backend (docs/specs/2026-11-10-filmbooking-mvp-design.md). BRD §10 cần cập nhật phần công nghệ (chờ user duyệt).
**Scope sinh:** spec/test-scope/current.json (specVersion 1.1.0, scopeVersion 2)
