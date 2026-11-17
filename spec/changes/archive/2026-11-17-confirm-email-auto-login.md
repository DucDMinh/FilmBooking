---
id: confirm-email-auto-login
type: feature
status: done
created: 2026-11-17
---

# Bấm link xác nhận email → đăng nhập luôn, không phải gõ lại tài khoản mật khẩu

## Yêu cầu
User (2026-11-17): "khi click vào link xác nhận để chuyển về web thì đăng nhập luôn, không cần gõ lại tài khoản mật khẩu nữa".
- Hiện trạng (root cause đã chứng minh): email xác nhận do Nest gửi bằng `anon.auth.resend()` (server, không có `code_verifier` PKCE) nên GoTrue redirect dạng implicit `#access_token=…` (fragment). `/auth/callback` chỉ đọc `?code=` → không có phiên → user phải đăng nhập lại.
- Hướng: link trong mail trỏ thẳng web `/auth/confirm?token_hash=…&type=signup&next=…`; server gọi `verifyOtp({type, token_hash})` và đặt cookie phiên (cách Supabase SSR khuyến nghị; chạy được cả khi mở link ở thiết bị khác).

## Acceptance (bắt buộc)
- [x] Bấm link hợp lệ → `email_confirmed_at` được set, có cookie phiên, redirect về `/xac-nhan-email?status=success` (đã đăng nhập; nút "Tiếp tục đặt vé" dùng được ngay). Nhân sự (admin/manager/staff) nếu có xác nhận qua đường này thì về khu vực vai trò (`resolvePostLoginTarget`).
- [x] Link đã dùng / hết hạn / `token_hash` sai / `type` ngoài `signup` → KHÔNG có phiên, redirect `/xac-nhan-email?status=expired`.
- [x] `next` luôn qua `sanitizeNext` (chống open redirect); thiếu → `/`.
- [x] Phiên mặc định hết khi đóng trình duyệt, giống đăng nhập không "Ghi nhớ" (R-15).
- [x] Template Auth `confirmation.html` dùng link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/` (không còn `{{ .ConfirmationURL }}`); `recovery`/`magic_link`/`email_change`/`invite` KHÔNG đổi.
- [x] Test: route handler (thành công, token lỗi, type sai, next độc hại) + test template; lint/typecheck/test PASS; verify thật trên stack local (token_hash từ `auth.users.confirmation_token`).

## Ghi chú
Sửa R-04 (intent) — đây là change request được user duyệt. Rủi ro đã biết: scanner email (SafeLinks…) có thể mở link trước và dùng mất token → user thấy "hết hạn" dù email đã xác nhận (đăng nhập thường vẫn được). Chấp nhận cho demo; cách giảm: trang trung gian bấm nút xác nhận (POST).
Template Auth qua config.toml chỉ áp dụng local; staging/prod dán vào Dashboard và đặt `site_url` đúng domain web.
