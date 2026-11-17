# Spec Update — 2026-11-17 confirm-email-auto-login
**spec_version:** 3.1.0 → 3.2.0 (MINOR — thêm hành vi cho R-04)
**Trigger:** feature-update · `tasks/feature-confirm-email-auto-login/phase-1-task-01.md` (review STRICT PASS round 2) · change doc `spec/changes/2026-11-17-confirm-email-auto-login.md`

## Requirements
- SỬA: **R-04** (Email xác nhận tài khoản) — trước: bấm link hợp lệ → tài khoản "đã xác nhận" (user phải đăng nhập lại bằng email/mật khẩu). Sau: bấm link hợp lệ → tài khoản đã xác nhận **và được đăng nhập luôn** trên trình duyệt vừa bấm link (không phải nhập lại email/mật khẩu; kể cả khi mở link ở thiết bị khác với nơi đăng ký), rồi chuyển về web; phiên mặc định **hết khi đóng trình duyệt** (R-15). Link đã dùng/hết hạn/sai → không xác nhận cũng không đăng nhập, chuyển tới màn "Liên kết hết hạn" kèm nút gửi lại.
- Không THÊM / XOÁ requirement nào. R-05, R-06, R-12, R-15, R-135 không đổi chữ nhưng chịu ảnh hưởng (xem dưới).
- Nguồn: user (2026-11-17) "khi click vào link xác nhận để chuyển về web thì đăng nhập luôn, không cần gõ lại tài khoản mật khẩu nữa" — change request được user duyệt, sửa intent R-04 qua đúng quy trình.

## Lý do
Root cause đã chứng minh: email xác nhận do Nest gửi bằng `anon.auth.resend()` ở server (không có `code_verifier` PKCE) nên GoTrue redirect dạng implicit `#access_token=…` (fragment); `/auth/callback` chỉ đọc `?code=` → không có phiên → user phải đăng nhập lại. Hướng chọn: link trong mail trỏ thẳng web `/auth/confirm?token_hash=…&type=signup&next=…`, server gọi `verifyOtp({type, token_hash})` và đặt cookie phiên (cách Supabase SSR khuyến nghị; chạy được khi mở link ở thiết bị khác). Quyết định ghi ở `.context/decisions.md`.

## Thay đổi hiện thực
1. Route mới `GET /auth/confirm` (`apps/web/src/app/auth/confirm/route.ts`): chỉ nhận `type=signup`; `verifyOtp` thành công → `fetchMeOrNull` → `resolvePostLoginTarget` (khách → `/xac-nhan-email?status=success`, nhân sự → khu vực vai trò); thất bại/throw → `/xac-nhan-email?status=expired`, không Set-Cookie, không lộ lỗi. `next` luôn qua `sanitizeNext`.
2. Cookie phiên là phiên trình duyệt (không Max-Age/Expires, HttpOnly, SameSite=Lax); `fb-remember` được ghim `0` và mọi cookie `*-auth-token*` ghi lại không Max-Age, kể cả khi trình duyệt từng bật "Ghi nhớ" (sửa từ review round 1).
3. Template Auth `supabase/templates/confirmation.html`: `{{ .ConfirmationURL }}` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/` (nút, link dự phòng, text). 5 template còn lại KHÔNG đổi (recovery/magic_link/email_change/invite vẫn ConfirmationURL; reauthentication dùng `.Token`).
4. Test: `apps/web/src/app/auth/confirm/__tests__/route.test.ts` (thành công khách/nhân sự, token lỗi, type sai, next độc hại, throw, cookie phiên) + cập nhật `apps/api/test/auth-email-templates.spec.ts`. Docs: `docs/dev-setup.md` (site_url), `.context/decisions.md`.
5. `/auth/callback` (OAuth `?code=`), `auth-ext.service.ts` (emailRedirectTo), `proxy.ts`, `supabase/config.toml` KHÔNG sửa.

## Ảnh hưởng
- Module: `web-auth-confirm` (mới), `web-xac-nhan-email` (đích redirect, không đổi code), `supabase-auth-email-templates` (riêng `confirmation`).
- Test lại: **R-04** (cùng thiết bị + khác thiết bị, dùng một lần, hết hạn 24 giờ, link sai/type sai), **R-05** (chưa xác nhận không đặt vé; sau xác nhận đặt vé được ngay), **R-06** (gửi lại, 60 giây/5 lần mỗi giờ), **R-12** (màn expired không lộ thông tin), **R-15** (phiên hết khi đóng trình duyệt dù từng bật "Ghi nhớ"), **R-135** (nhân sự xác nhận → khu vực vai trò, chống open-redirect), route `/auth/confirm`, `/xac-nhan-email?status=success|expired`, template `confirmation`.
- Regression: recovery / magic_link / email_change / invite vẫn dùng ConfirmationURL; OAuth `/auth/callback` không đổi; đăng nhập mật khẩu 4 vai trò + "Ghi nhớ".

## Residual
- **Login-CSRF / tráo phiên:** kẻ tấn công đưa link xác nhận do mình kiểm soát → trình duyệt nạn nhân đăng nhập vào tài khoản của kẻ tấn công; bấm link thành công còn thay phiên đang đăng nhập khác trên trình duyệt đó và hạ "Ghi nhớ" về 0. Chấp nhận cho demo; hướng sửa sau: trang trung gian bấm nút (POST).
- **Scanner email** (SafeLinks, antivirus) mở link GET trước và dùng mất `token_hash` → user thấy "Liên kết hết hạn" dù email đã xác nhận (đăng nhập thường vẫn được; có nút gửi lại).
- **Template Auth qua `supabase/config.toml` chỉ áp dụng local**; staging/prod phải dán template `confirmation` vào Supabase Dashboard và đặt Site URL đúng domain web, **không có `/` ở cuối** (nếu không link thành `//auth/confirm`).
- LOW: có thể ghi lại cookie chunk đã xoá thành giá trị rỗng không Max-Age (không ảnh hưởng đọc phiên); chưa có test tự động trên GoTrue thật (chỉ live verify thủ công trên stack local).

## Scope sinh
`spec/test-scope/current.json` — scopeVersion 23, specVersion 3.2.0, trigger `feature-update`, risk **high** (tạo phiên đăng nhập từ link email: auth/session, cookie, redirect).
