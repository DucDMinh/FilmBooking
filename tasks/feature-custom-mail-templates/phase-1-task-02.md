# Feature custom-mail-templates · phase-1-task-02 — Template mail Supabase Auth tiếng Việt, thương hiệu CINEMO

- Classification / Risk: MODIFY (trình bày + ngôn ngữ; requirement không đổi). Severity thấp; scope `supabase/templates/*.html` (mới); expected review level **NORMAL**; blast radius: mọi mail Auth local/staging/prod (xác nhận đăng ký, quên mật khẩu); doc impact: cập nhật `docs/dev-setup.md` (mục template Auth); decision impact: không.
- Yêu cầu: xem `spec/changes/2026-11-17-custom-mail-templates.md`.

## Thiết kế
Tạo 6 file HTML trong `supabase/templates/`, email-safe (bảng 600px, inline style, không flex/`<style>` bắt buộc, `lang="vi"`, preheader ẩn), header dải `#111620` + wordmark **CINEMO** `#F06D5B`, thân nền trắng, nút CTA nền `#F06D5B` chữ `#0B0D12`, link dự phòng dạng text bên dưới nút, footer nhỏ (không trả lời email này):
| File | Dùng khi | Biến | Nội dung bắt buộc |
|---|---|---|---|
| `confirmation.html` | Xác nhận đăng ký (R-04) | `{{ .ConfirmationURL }}` | link dùng một lần, **hết hạn sau 24 giờ**; chưa xác nhận không đặt vé được |
| `recovery.html` | Quên mật khẩu (R-13) | `{{ .ConfirmationURL }}` | link **hết hạn sau 1 giờ**, dùng một lần; không yêu cầu thì bỏ qua |
| `magic_link.html` | Đăng nhập bằng link | `{{ .ConfirmationURL }}` | ngắn gọn |
| `email_change.html` | Đổi email | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` | xác nhận đổi từ → sang |
| `invite.html` | Mời tham gia (nhân sự do Admin tạo) | `{{ .ConfirmationURL }}` | chấp nhận lời mời |
| `reauthentication.html` | Xác thực lại | `{{ .Token }}` | mã số nổi bật, không chia sẻ |
- Chỉ dùng biến Go template Supabase hỗ trợ; tiếng Việt có dấu đầy đủ; KHÔNG chèn URL cứng, KHÔNG đặt secret.
- `config.toml` do PRIMARY sửa (file có thay đổi cục bộ của user) — builder KHÔNG đụng `supabase/config.toml`. Primary sẽ thêm 6 khối `[auth.email.template.<tên>]` với `subject` + `content_path = "./supabase/templates/<tên>.html"` (subject: `[CINEMO] Xác nhận email của bạn`, `[CINEMO] Đặt lại mật khẩu`, `[CINEMO] Liên kết đăng nhập`, `[CINEMO] Xác nhận đổi email`, `[CINEMO] Lời mời tham gia`, `[CINEMO] Mã xác thực`).
- `docs/dev-setup.md`: thêm vài dòng ở mục SMTP cho Supabase Auth: template nằm ở `supabase/templates/`, xem trước trong Mailpit `:54324`, sửa xong `pnpm db:stop && pnpm db:start`.

## Test / verify
- Script/test kiểm tra tĩnh (vitest ở `packages/shared` hoặc `apps/api/test/auth-email-templates.spec.ts`): đủ 6 file; mỗi file chứa "CINEMO", `lang="vi"`, biến bắt buộc ở bảng trên; chỉ dùng các biến trong danh sách cho phép (`.ConfirmationURL|.Token|.Email|.NewEmail|.SiteURL`); không có `<script`; confirmation chứa "24 giờ", recovery chứa "1 giờ".
- Primary verify thật sau khi nạp config: restart supabase, tạo mail Auth, đọc Mailpit/Gmail.

## Files to Modify
`supabase/templates/{confirmation,recovery,magic_link,email_change,invite,reauthentication}.html` (mới), `docs/dev-setup.md`, test mới.

## KHÔNG làm
Không sửa `supabase/config.toml`, `.env*`, `supabase/.env`; không bật `[auth.email.notification.*]`.

## Repro Verification
- N/A (feature MODIFY). Evidence: test tĩnh + mail Auth thật hiển thị đúng template.
