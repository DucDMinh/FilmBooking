---
id: real-oauth-google-facebook
type: feature
status: pending
created: 2026-11-20
---

# Chạy thật luồng đăng nhập, liên kết Google và Facebook (key thật)

## Yêu cầu
User (2026-11-20): "làm luồng đăng nhập, liên kết google, facebook thật. Cần key thì báo tôi". Hiện code đã có sẵn nút đăng nhập MXH (`components/auth/oauth-buttons.tsx`), `/auth/callback`, trang liên kết `/tai-khoan/bao-mat` (`linked-accounts.tsx`) và module identity phía API, nhưng chưa chạy được với Google/Facebook thật (mới kiểm bằng test/mock). Cần cấu hình và xác minh end-to-end với provider thật trên môi trường local.

## Bối cảnh / hiện trạng (đã kiểm, chưa sửa)
- `supabase/config.toml` bật `[auth.external.google]` (`skip_nonce_check = true`) và `[auth.external.facebook]` (`email_optional = true`), đọc key từ biến `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/SECRET` và `SUPABASE_AUTH_EXTERNAL_FACEBOOK_CLIENT_ID/SECRET`; `enable_manual_linking = true`; `site_url = http://localhost:3000`.
- `.env.local` (gốc repo) đã có giá trị cho `GOOGLE_CLIENT_ID/SECRET` và `FACEBOOK_APP_ID/SECRET` nhưng dưới TÊN KHÁC (kiểu template cũ), nên Supabase local không đọc được → nhiều khả năng provider đang nhận giá trị rỗng. Chưa xác minh key còn hợp lệ.
- Cần xác minh/cấu hình phía provider (user làm trên console): Google: OAuth client loại Web, Authorized redirect URI `http://127.0.0.1:54321/auth/v1/callback` (và domain deploy nếu có); Facebook: Valid OAuth Redirect URI cùng URL đó, quyền `email` + `public_profile`, app ở chế độ Development thì chỉ tài khoản test/admin của app đăng nhập được.
- Spec liên quan: R-12, R-19, R-21..R-24 (liên kết/huỷ liên kết, không lộ email trùng), quyết định #18 (Facebook không email → bổ sung email xác nhận), CR-004 (Admin Facebook không email được tính là Admin hoạt động).

## Acceptance (bắt buộc)
- [ ] Đăng nhập bằng Google thật thành công ở local (lần đầu tạo tài khoản khách; lần sau vào đúng tài khoản), về đúng trang `next`.
- [ ] Đăng nhập bằng Facebook thật thành công; tài khoản Facebook không trả email đi đúng luồng bổ sung email (quyết định #18, R-21).
- [ ] Liên kết và huỷ liên kết Google/Facebook ở `/tai-khoan/bao-mat` chạy thật (kể cả chặn huỷ phương thức đăng nhập cuối AC-05, email thông báo R-24).
- [ ] Email trùng với tài khoản có sẵn không bị chiếm/không lộ thông tin (R-12, #18); lỗi OAuth hiển thị thông báo tiếng Việt rõ ràng.
- [ ] Biến môi trường thống nhất một tên (config.toml ↔ `.env.local`/`.env.example`), có hướng dẫn cấu hình redirect URI trong README/docs; KHÔNG commit secret.
- [ ] Có kiểm chứng end-to-end bằng trình duyệt thật (Playwright/Chrome) cho ít nhất đăng nhập Google; Facebook nếu key và tài khoản test cho phép.

## Ghi chú
Cần user cung cấp/xác nhận: (1) key Google và Facebook trong `.env.local` còn hợp lệ hay cần tạo mới; (2) redirect URI đã đăng ký trên console; (3) tài khoản Google/Facebook dùng để thử; (4) Facebook app đang Development hay Live. Không bịa key; không đưa secret vào repo hay vào bất kỳ dịch vụ ngoài nào.
