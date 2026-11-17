# Feature confirm-email-auto-login · phase-1-task-01 — Link xác nhận email đăng nhập luôn (token_hash + verifyOtp)

- Classification / Risk: MODIFY (đổi hành vi R-04; spec delta đã sửa trong `SPECIFICATIONS.md`). Severity trung bình; **risk đỏ: tạo phiên đăng nhập từ link email** → expected review level **STRICT**; scope web route + template Auth + test; blast radius: luồng đăng ký/xác nhận email, phiên đăng nhập; doc impact: `docs/` as-built nếu có nhắc luồng xác nhận (grep `xac-nhan-email`, `auth/callback`), nếu không → `no doc impact`; decision impact: ghi `.context/decisions.md` (chọn token_hash/verifyOtp thay vì PKCE/implicit, lý do).
- Yêu cầu + acceptance: `spec/changes/2026-11-17-confirm-email-auto-login.md`.

## Root cause (đã chứng minh)
`apps/api/src/modules/auth-ext/auth-ext.service.ts:299-304` gửi mail bằng `anon.auth.resend({type:'signup'})` ở server → không có `code_verifier` → GoTrue redirect `#access_token=…` (fragment) → `apps/web/src/app/auth/callback/route.ts` chỉ xử lý `?code=` (dòng ~118-145) → không phiên.

## Thiết kế
1. **Route mới** `apps/web/src/app/auth/confirm/route.ts` (GET): đọc `token_hash`, `type`, `next`.
   - Chỉ chấp nhận `type === "signup"` (và `"email"` nếu GoTrue dùng cho trường hợp cùng loại — builder xác minh bằng GoTrue local; ngoài ra từ chối). Thiếu `token_hash`/`type` → coi như lỗi.
   - `createServerSupabase()` → `supabase.auth.verifyOtp({ type, token_hash })`. Thành công: lấy `data.session?.access_token` → `fetchMeOrNull` (như callback) → đích = `resolvePostLoginTarget({ next: "/xac-nhan-email?status=success&next=<sanitizeNext(next)??/>", me })`. Nhân sự về khu vực vai trò, khách về trang success.
   - Thất bại (kể cả throw) → redirect `/xac-nhan-email?status=expired` (không lộ chi tiết lỗi, không set cookie). `next` luôn qua `sanitizeNext`.
   - Cookie phiên: dùng đúng cơ chế `createServerSupabase` hiện có (phiên mặc định hết khi đóng trình duyệt, như đăng nhập không "Ghi nhớ" — xem `apps/web/src/app/auth/actions.ts`, nếu "ghi nhớ" cấu hình ở đây thì mirror mặc định KHÔNG nhớ).
   - Không log token. Đảm bảo `apps/web/src/proxy.ts` (và mọi guard) cho phép `/auth/confirm` cho khách chưa đăng nhập (giống `/auth/callback`); thêm vào danh sách public nếu cần.
2. **Template** `supabase/templates/confirmation.html`: thay `{{ .ConfirmationURL }}` bằng `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/` ở mọi chỗ (nút, link dự phòng, text hiển thị). Thêm `.TokenHash` vào danh sách biến cho phép. Giữ nguyên "24 giờ", giao diện CINEMO. KHÔNG đổi 5 template còn lại. (`next=/`: trang success tự có nút Tiếp tục; không dùng `&` chưa escape sai trong HTML — dùng `&amp;` trong thuộc tính href nếu cần, kiểm tra Go template không escape sai.)
3. **Test**:
   - `apps/web/src/app/auth/confirm/__tests__/route.test.ts` (mẫu: `auth/callback/__tests__/route.test.ts`): thành công khách → `/xac-nhan-email?status=success…`; thành công nhân sự → role home; `verifyOtp` lỗi → `?status=expired` và KHÔNG gọi `/me`; `type` ≠ signup → expired và KHÔNG gọi `verifyOtp`; thiếu token_hash → expired; `next=//evil.com`, `next=https://evil.com` → bị loại (về `/`); `verifyOtp` throw → expired.
   - Cập nhật `apps/api/test/auth-email-templates.spec.ts`: `.TokenHash` được phép; confirmation phải chứa `/auth/confirm?token_hash={{ .TokenHash }}` và `type=signup`, không còn `.ConfirmationURL`; mục "link dự phòng ≥3" áp dụng đúng cho confirmation với biểu thức mới; 4 template còn lại vẫn dùng `.ConfirmationURL`.
4. **Docs / decisions**: grep `docs/` và `README.md` tìm mô tả luồng xác nhận email → cập nhật as-built (không sửa intent docs). Append `.context/decisions.md` quyết định token_hash. `docs/dev-setup.md`: 1-2 dòng: link xác nhận trỏ `{{ .SiteURL }}/auth/confirm` nên `site_url` phải đúng domain web (local `http://localhost:3000`), staging/prod dán template vào Dashboard.

## Files to Modify
`apps/web/src/app/auth/confirm/route.ts` (mới) + test, `apps/web/src/proxy.ts` (nếu cần), `supabase/templates/confirmation.html`, `apps/api/test/auth-email-templates.spec.ts`, `docs/dev-setup.md`, `.context/decisions.md`, docs as-built liên quan (nếu có).

## KHÔNG làm
Không đụng `supabase/config.toml` (có thay đổi cục bộ của user), `.env*`, `supabase/.env`, `apps/api/package.json`, `auth-ext.service.ts` (emailRedirectTo giữ nguyên), 5 template Auth khác, `/auth/callback` (vẫn phục vụ OAuth).

## Repro Verification
- Original repro: đăng ký email+mật khẩu → mở mail → bấm "Xác nhận email".
- Expected: về web đã đăng nhập.
- Actual before fix: về web nhưng chưa đăng nhập (token ở fragment, `/auth/callback` không đọc được).
- Actual after fix: bấm link → về `/xac-nhan-email?status=success` đã đăng nhập (cookie phiên), không phải nhập lại.
- Evidence (live trên stack local, 2026-11-17, user test `live-confirm-test@example.com`, đã xoá sau khi verify; token thật từ `auth/v1/admin/generate_link`):
  - `GET /auth/confirm?token_hash=<thật>&type=signup&next=/` → `307 Location: /xac-nhan-email?status=success`, `Set-Cookie: sb-127-auth-token=…; Path=/; HttpOnly; SameSite=lax` (không Max-Age/Expires), `auth.users.email_confirmed_at` được set.
  - Kèm `Cookie: fb-remember=1` cũ → `Set-Cookie: fb-remember=0` và `sb-127-auth-token` đều không Max-Age (sau fix reviewer round 1).
  - Gọi lại cùng token / `type=recovery` / token sai → `307 ?status=expired`, không Set-Cookie.
  - GoTrue `/auth/v1/verify` chấp nhận `type=signup` với `token_hash` thật (56 ký tự); token chèn tay 22 ký tự bị từ chối `otp_expired`.
  - Test tự động: web 594, api 574, shared 31, scripts 31 PASS; lint + typecheck sạch.
- Status: PASS (reviewer STRICT PASS round 2)
