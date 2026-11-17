# Feature custom-mail-templates · phase-1-task-01 — Thiết kế lại template mail giao dịch Nest (CINEMO, email-safe)

- Classification / Risk: MODIFY (chỉ trình bày; không đổi nội dung nghiệp vụ/requirement). Severity thấp; scope `apps/api/src/modules/mail/templates.ts` + test; expected review level **NORMAL**; blast radius: mọi mail outbox (vé, khoá tài khoản, liên kết MXH, tiền về muộn, huỷ suất, đặt mật khẩu, OAuth); doc impact: no doc impact (as-built docs không mô tả giao diện mail); decision impact: không.
- Yêu cầu: xem `spec/changes/2026-11-17-custom-mail-templates.md`.

## Thiết kế
1. Viết lại `wrapLayout(title, bodyHtml, opts?)`: bảng 600px căn giữa, **mọi style inline** (+ `bgcolor`/`align` attr dự phòng), không flex, không phụ thuộc `<style>`. Header dải tối `#111620` với wordmark **CINEMO** màu `#F06D5B`; thân nền trắng chữ `#1B222E`; footer xám nhạt có hotline `DEFAULT_HOTLINE` + câu "email tự động, không trả lời". Preheader ẩn (opts.preheader) cho xem trước hộp thư. `lang="vi"`, `meta viewport`, `<title>`.
2. Thêm helper nội bộ: `button(label, url)` (nút bảng, nền `#F06D5B`, chữ `#0B0D12`, bo 8px, fallback link thuần trong text), `infoTable(rows)` thay các `.row` flex, `noteBox(kind, html)` thay `.alert-box/.danger-box` (inline).
3. Giữ NGUYÊN: chữ ký các hàm `render*`, `renderTemplate`, `RenderedEmail`, export hiện có (`DEFAULT_HOTLINE`, `DEFAULT_WEB_ORIGIN`, `resolveOrigin`, `formatCurrencyVND`, `formatDateTimeVN`), mọi trường dữ liệu và câu bắt buộc theo acceptance của change doc; phần `text` (plain) giữ nội dung, chỉ đổi tên thương hiệu.
4. Thương hiệu: thay "FilmBooking" → "CINEMO" trong header/footer/subject (`[FilmBooking]` → `[CINEMO]`). Cập nhật mọi test đang assert subject/chuỗi cũ.
5. Escape: mọi giá trị động vẫn qua `escapeHtml` (không thêm đường chèn HTML mới); URL trong `href` chỉ từ `resolveOrigin`/payload như cũ, escape attribute.

## Test (viết/điều chỉnh trước, `apps/api/test/mail-templates.spec.ts`)
- Với từng kind trong `renderTemplate` (TICKET_ISSUED, ACCOUNT_LOCKED_ALERT, IDENTITY_LINKED, IDENTITY_UNLINKED, LATE_PAYMENT_MANUAL_REVIEW, AMOUNT_MISMATCH_MANUAL_REVIEW, SHOWTIME_CANCELLED, PASSWORD_SET, OAUTH_MISSING_EMAIL_COLLISION, OAUTH_MISSING_EMAIL_VERIFY) dựng payload tối thiểu hợp lệ → `html` không chứa `<style`, `display:flex`; chứa "CINEMO", `lang="vi"`; `subject` bắt đầu `[CINEMO]`.
- Vé: html + text chứa booking_code, qr_token, tên rạp, địa chỉ rạp, "không huỷ", "15 phút", ghế, tổng tiền VND.
- XSS: payload chứa `<script>` / `"` trong tên phim/rạp → html không chứa `<script>` thô.
- Chạy lại toàn bộ test hiện có chạm mail (`mail-service.spec.ts`, `outbox-job.e2e-spec.ts`, int-spec nếu có assert subject).

## Files to Modify
`apps/api/src/modules/mail/templates.ts`, `apps/api/test/mail-templates.spec.ts` (mới), các test đang assert subject/chuỗi cũ.

## KHÔNG làm
Không đụng `supabase/**`, `.env*`, `package.json`, web; không đổi logic gửi (`mail.service.ts`, `jobs.controller.ts`).

## Repro Verification
- N/A (feature MODIFY). Evidence bằng test mới + `pnpm lint/typecheck/test`; builder in thử 1 mail vé ra file `.html` trong thư mục tạm để primary xem.
