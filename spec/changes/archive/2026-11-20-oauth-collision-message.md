---
id: oauth-collision-message
type: bug
status: done
created: 2026-11-20
---

# Đăng nhập Google/Facebook trùng email tài khoản có sẵn hiện thông báo chung thay vì "Email này đã có tài khoản…"

## Yêu cầu
Khi đăng nhập bằng Google/Facebook mà email trùng một tài khoản đã có (mật khẩu hoặc MXH khác), hệ thống chặn tự gộp (AC-04, R-20) và PHẢI báo đúng "Email này đã có tài khoản - hãy đăng nhập bằng phương thức cũ để liên kết." Hiện báo "Đăng nhập với Google/Facebook không thành công. Vui lòng thử lại." (user báo 2026-11-20, F12 không thấy lỗi vì lỗi nằm ở redirect phía server).

## Bối cảnh / tái hiện (bug)
- Màn: `/dang-nhap` → "Tiếp tục với Google" → chọn tài khoản Google có email trùng một tài khoản email+mật khẩu có sẵn.
- Expected (AC-04/R-20): về `/dang-nhap?error=email_exists` với message "Email này đã có tài khoản - hãy đăng nhập bằng phương thức cũ để liên kết."
- Actual: về `/dang-nhap?error=oauth` với message chung.
- Bằng chứng: log GoTrue (`docker logs supabase_auth_filmbooking`): `500: Error creating identity ... ERROR: OAUTH_AUTO_MERGE_BLOCKED (SQLSTATE 23514)` tại `/callback` (2 lần); trigger `guard_identity_insert` nhánh #2 (`supabase/migrations/20261113090000_identity_link_intent_hardening.sql:49-72`). GoTrue chỉ trả cho redirect thông điệp công khai `Error creating identity`, KHÔNG kèm chữ OAUTH_AUTO_MERGE_BLOCKED, nên `classifyOAuthError` (`apps/web/src/app/auth/callback/route.ts:13-57`) không khớp nhánh nào → `oauth`.

## Acceptance (bắt buộc)
- [x] Đăng nhập (không từ `/tai-khoan`) mà GoTrue trả lỗi che `error_code=unexpected_failure` / "Error creating identity" → chuyển `/dang-nhap?error=email_exists` (giữ `next`), hiện đúng message email_exists.
- [x] Ở luồng liên kết (`next` bắt đầu bằng `/tai-khoan`), lỗi che đó KHÔNG bị gán `email_exists` (mơ hồ giữa identity_taken/hết hạn intent): giữ hành vi hiện tại (`error=oauth` hoặc theo allowlist cũ).
- [x] Các nhánh cũ (identity_taken, email_exists khi có chữ thật, missing_email, oauth) không đổi; không phản chiếu `error_description` ra ngoài.
- [x] Server ghi log chẩn đoán gọn (không PII/không token) cho lần lỗi OAuth để lần sau không phải đoán (nếu lint/dự án cho phép).
- [x] Test route + classify; lint/typecheck/test/build web PASS.

## Ghi chú
Không đổi spec: AC-04/R-20 đã yêu cầu đúng message này; code chưa đạt. Workaround cho người dùng thật: đăng nhập tài khoản cũ rồi liên kết Google ở `/tai-khoan/bao-mat`.
