# Review — feature-confirm-email-auto-login · phase-1-task-01 · round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** risk đỏ: tạo phiên đăng nhập (cookie session) từ link trong email; đụng auth/session, redirect (open redirect), template Auth, sửa intent R-04.
- **Blast radius:** luồng đăng ký → xác nhận email → phiên đăng nhập; route mới `apps/web/src/app/auth/confirm/route.ts`; template `supabase/templates/confirmation.html` (local qua config.toml, staging/prod qua Dashboard); dùng chung `createServerSupabase` / `sessionCookieOptions` / `proxy.ts` refresh. `/auth/callback` (OAuth) và 5 template khác không đổi.

## Verify commands + result (chạy ở root)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 31/31, api 574/574 (28 files), web 590/590 (47 files), scripts 31/31 |
| aislop / oxlint / ocr | skip (không thuộc allowlist / chưa cấu hình) |
| Verify thật trên stack local | **CHƯA CÓ** (builder ghi "Còn dở: primary verify"); Repro Verification trong task file còn trống |

## Đối chiếu đã kiểm

- `type !== "signup"` bị từ chối TRƯỚC khi gọi `verifyOtp` (route.ts:29); `verifyOtp` luôn gọi với hằng `ALLOWED_TYPE` chứ không phải giá trị từ URL (route.ts:34). GoTrue tra token signup theo `confirmation_token`, nên token_hash của recovery/magiclink/email_change/invite không dùng được qua route này. Không leo thang.
- Lỗi / throw / thiếu tham số → cùng đích `/xac-nhan-email?status=expired`, không phản chiếu message lỗi, không log token (route.ts:27-39). Không có nhánh nào `verifyOtp` lỗi mà vẫn có phiên mới.
- `next` qua `sanitizeNext` (route.ts:26), rồi đặt bằng `URLSearchParams` (encode `?`, `&`, `#` đúng), sau đó `resolvePostLoginTarget` sanitize lại lần nữa. Không chèn được tham số hay mở redirect ra ngoài.
- Redirect dựng từ `request.url`, giống `/auth/callback` (callback/route.ts:140). Không có hồi quy mới sau reverse proxy.
- Nhân sự: `/xac-nhan-email` không thuộc `isStaffAllowedPath` nên ADMIN/MANAGER về `/admin`, STAFF về `/staff/chon-rap` (role-home.ts:39-50). Hành vi giống callback, không bypass. `fetchMeOrNull` fail-open về trang khách: chấp nhận được vì layout (public) vẫn chuyển nhân sự đi, và đây cũng là hành vi của callback.
- `proxy.ts`: `/auth/confirm` không thuộc `PROTECTED_PREFIXES`, khách chưa đăng nhập vào được.
- Template: 3 chỗ (href nút, href link dự phòng, text hiển thị) dùng `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup&amp;next=/`. `&amp;` hợp lệ trong href và hiển thị thành `&`. Chuỗi "24 giờ" giữ nguyên (config `otp_expiry = 86400`). 4 template có link còn lại vẫn dùng `.ConfirmationURL` (có test riêng); reauthentication không đổi.
- Spec R-04 sửa đúng ngữ nghĩa (đăng nhập luôn, dùng được ở thiết bị khác, phiên hết khi đóng trình duyệt, link lỗi về màn hết hạn kèm nút gửi lại). Không mâu thuẫn R-05/R-13/R-15. `spec_version` chưa bump là có chủ đích (spec-publisher sẽ bump), không tính lỗi.
- Test route: mock `verifyOtp({type, token_hash})` đúng chữ ký supabase-js (`{data:{session}, error}`). Có đủ ca: thành công khách, ADMIN/MANAGER/STAFF, /me null, session null, next độc hại (`//evil.com`, `https://evil.com`, `/\evil.com`), verifyOtp lỗi, verifyOtp throw, 7 type sai (gồm `email`, `SIGNUP`, rỗng), thiếu type, thiếu/rỗng token_hash. Không phải tautology.

## Findings

1. **MEDIUM (BLOCKING): phiên tạo từ link xác nhận có thể sống 30 ngày, trái acceptance "Phiên mặc định hết khi đóng trình duyệt (R-15)".**
   - `apps/web/src/app/auth/confirm/route.ts:33-34` gọi `verifyOtp` qua `createServerSupabase`. `setAll` ở `apps/web/src/lib/supabase/server.ts:15` đọc cờ `fb-remember` còn sót trên trình duyệt. Cờ `"1"` khiến `sessionCookieOptions` đặt `maxAge = 30 ngày` (`apps/web/src/lib/supabase/cookie-options.ts:34-36`).
   - Cờ chỉ bị xoá khi đăng xuất chủ động (`apps/web/src/app/auth/actions.ts:30`). Phiên hết hạn hoặc bị thu hồi, hay máy dùng chung mà người trước đã tick "Ghi nhớ", đều để lại `fb-remember=1` (tồn tại 30 ngày). Tài khoản mới xác nhận trên trình duyệt đó sẽ nhận phiên 30 ngày.
   - `apps/web/src/proxy.ts:29` đọc lại cờ ở mỗi lần refresh, nên chỉ sửa cookie trong route là chưa đủ: phải ghim cờ về `"0"`.
   - Đề xuất sửa:
     - Trong `/auth/confirm`, đặt `fb-remember=0` (session cookie, dùng `sessionCookieOptions(..., false)`) để route và mọi lần refresh sau đều giữ phiên đến khi đóng trình duyệt.
     - Có 2 cách:
       - (a) Set trước `verifyOtp`. Builder phải xác minh `cookies().get` thấy giá trị vừa `set` trong cùng request ở bản Next hiện dùng.
       - (b) Set sau khi thành công, rồi ghi lại các cookie `*-auth-token` với option không nhớ, như `apps/web/src/app/(auth)/dang-nhap/page.tsx:84-94`.
     - Thêm test xác nhận cờ được ghim `"0"` và không có `maxAge` 30 ngày.
     - Lý do không hạ cấp: acceptance ghi rõ, builder đã tự báo, cách sửa nhỏ. Việc `/auth/callback` cũng đọc cờ như vậy không miễn trừ được, vì callback không thuộc acceptance này.

2. **MEDIUM (cổng close-out, primary xử lý; không phải lỗi code): chưa có verify thật trên stack local.**
   - Acceptance bắt buộc "verify thật trên stack local (token_hash từ `auth.users.confirmation_token`)". Repro Verification trong `tasks/feature-confirm-email-auto-login/phase-1-task-01.md:32` còn trống.
   - Unit test mock toàn bộ `createServerSupabase`, nên 2 điều chưa được chứng minh:
     - (i) cookie phiên thực sự được gắn vào response redirect;
     - (ii) GoTrue local chấp nhận `type=signup` + `token_hash`. Ví dụ SSR chính thức của Supabase dùng `type=email`, còn route và test đang chặn cứng `email`. Nếu GoTrue từ chối `signup`, mọi lần xác nhận sẽ rơi vào màn "hết hạn".
   - Không được đóng task trước khi có evidence: `email_confirmed_at` được set, response có `Set-Cookie sb-*-auth-token` không kèm Max-Age, và `Location` đúng.

3. **LOW (rủi ro chấp nhận cho demo): login CSRF / tráo phiên.**
   - Route là GET, tạo phiên từ token có trong URL. Kẻ tấn công đăng ký tài khoản của chính họ, để chưa xác nhận, rồi gửi link xác nhận cho nạn nhân. Nạn nhân bấm và bị đăng nhập vào tài khoản kẻ tấn công. Sau đó đơn đặt vé, email hoặc số điện thoại liên hệ mà nạn nhân nhập sẽ nằm trong tài khoản kẻ tấn công, kẻ tấn công đăng nhập vào là đọc được.
   - Biến thể: người đang đăng nhập tài khoản A bấm link của B sẽ bị chuyển sang B mà không được báo.
   - Mức độ: mỗi link chỉ dùng một lần, hạn 24 giờ, gửi lại bị giới hạn 5 lần/giờ (R-06). Cần social engineering. Trang success có ghi "Email đã được xác nhận" nhưng không hiện email nào.
   - Cách giảm (làm sau, cùng hướng với vấn đề scanner SafeLinks đã ghi trong spec): trang trung gian hiển thị email đã che một phần + nút "Xác nhận" gửi POST; hoặc hiện email tài khoản trên trang success.
   - Chấp nhận cho demo. Nên ghi vào phần Consequences của `.context/decisions.md`.

4. **LOW: test template chấp nhận cả `&` thô.** `apps/api/test/auth-email-templates.spec.ts` (regex `(&amp;|&)`) không ghim dạng `&amp;` mà template thực sự dùng. Điều này làm kiểm tra yếu đi một chút; template hiện tại vẫn đúng.

5. **INFO: `site_url` có dấu `/` ở cuối sẽ sinh `//auth/confirm`.** Khi dán template vào Dashboard staging/prod, Site URL phải không có `/` cuối. Nên thêm nửa câu vào `docs/dev-setup.md`.

6. **INFO: nhánh `next` gần như không dùng tới.** Template luôn gửi `next=/`, nên nhánh `successParams.set("next", …)` (route.ts:44) chỉ chạy với link tự chế. Nhánh này vẫn được sanitize và encode an toàn. Không cần sửa.

7. **INFO: redirect dựng từ `request.url`.** Giống `/auth/callback`, phụ thuộc cách Next nhận Host sau reverse proxy. Không có hồi quy mới.

## Verdict

**FAIL.** Builder sửa Finding 1 (ghim `fb-remember=0` + test). Primary bổ sung Finding 2 (verify live, điền Repro Verification) trước close-out. Finding 3-7 không chặn.
