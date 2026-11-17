---
id: custom-mail-templates
type: feature
status: done
created: 2026-11-17
---

# Tùy biến mail đi: giao diện thương hiệu CINEMO + tiếng Việt cho mail Auth và mail giao dịch

## Yêu cầu
User (2026-11-17): "custom mail đi" → phạm vi **cả hai kênh** (mail Supabase Auth + mail giao dịch của Nest), hướng **giao diện + tiếng Việt**, giữ nguyên nội dung nghiệp vụ.
- Mail Supabase Auth (xác nhận đăng ký, đặt lại mật khẩu, magic link, đổi email, mời, xác thực lại) hiện là bản mặc định tiếng Anh ("Confirm your email address") → viết lại tiếng Việt, đúng thương hiệu CINEMO, qua `supabase/templates/*.html`.
- Mail giao dịch của Nest (`apps/api/src/modules/mail/templates.ts`) đã là tiếng Việt nhưng giao diện dùng `<style>` + flex (Gmail/Outlook hiển thị kém) và mang tên "FilmBooking" → thiết kế lại theo thương hiệu CINEMO, email-safe (bảng + inline style).

## Acceptance (bắt buộc)
- [x] Mọi template Nest vẫn giữ đủ trường/câu bắt buộc: R-86/R-133 (vé: mã đặt vé, qr_token, tên + địa chỉ rạp, "chỉ dùng tại rạp ghi trên vé", "không huỷ/không hoàn", đến trước 15 phút), R-11, R-24, R-78, R-109, AC-26.
- [x] Template Nest dùng bố cục bảng + inline style (không dựa vào flex/`<style>` để giữ bố cục), có preheader, nút CTA màu accent `#F06D5B`, header thương hiệu CINEMO; mọi giá trị động vẫn qua `escapeHtml`.
- [x] Mail Auth có đủ 6 template (`confirmation`, `recovery`, `magic_link`, `email_change`, `invite`, `reauthentication`), tiếng Việt có dấu, giữ biến Go template (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`), nêu hạn link đúng spec: xác nhận 24 giờ (R-04), đặt lại mật khẩu 1 giờ (R-13).
- [x] Không bật `[auth.email.notification.*]` (tránh trùng mail "đã đổi mật khẩu" R-14 do Nest gửi).
- [x] Test/typecheck/lint PASS; có test bao phủ mọi `kind` của `renderTemplate` (không còn `<style>`/`display:flex`, có "CINEMO", có link/giá trị bắt buộc).

## Ghi chú
Không đổi requirement → không bump `spec_version`; Spec Publisher chỉ sinh `spec/test-scope/current.json`.
`supabase/config.toml` có thay đổi cục bộ của user (Gmail cá nhân) → KHÔNG commit hunk SMTP, chỉ commit hunk `[auth.email.template.*]`.
