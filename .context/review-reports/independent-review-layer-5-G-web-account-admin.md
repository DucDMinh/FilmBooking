# Independent Review: build-filmbooking layer-5, nhóm G: task-11 (Web tài khoản) + task-13 (Web admin shell)

Agent: reviewer (review lại độc lập, chỉ đọc). Ngày 2026-11-13. Branch `staging`, commit `8004d09` (task-11), `8305618` (task-13).
Report cũ `build-filmbooking-layer-5-task-11/13-*-review.md` KHÔNG được dùng làm căn cứ.

## Review level: STRICT

## Reason
- task-11 có luồng auth/session/password (đổi mật khẩu, xoá tài khoản, đăng xuất), thao tác phá huỷ dữ liệu (xoá tài khoản), upload file (avatar) và sửa file layout dùng chung `(public)/layout.tsx`.
- task-13 đụng RBAC (sidebar theo vai trò, chặn /admin, phạm vi rạp) và shell dùng chung cho mọi màn quản trị của layer sau.

## Blast radius
- `apps/web/src/app/(public)/layout.tsx`: mọi trang công khai (trang chủ, /phim, /rap, /lich-chieu, pháp lý, /tai-khoan/*).
- `apps/web/src/app/admin/layout.tsx` + `components/admin/*`: mọi route `/admin/*` của layer 6-7 sẽ kế thừa shell, nav và scope `?cinema=`.
- `components/account/*`: /tai-khoan, /tai-khoan/rap-yeu-thich, /tai-khoan/thong-bao.
- API chạm tới: `GET/PATCH /me/profile`, `POST /me/email`, `POST /me/avatar`, `PUT /me/preferences`, `PUT|DELETE /me/favorites/:id`, `DELETE /me`, `GET /me`, `GET /cinemas`, `POST /auth/resend-confirmation`. Ngoài ra có lệnh gọi trực tiếp GoTrue từ trình duyệt (`signInWithPassword`, `updateUser`, `signOut`, `getUser`).

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `git -C E:/FilmBooking show --stat 8004d09 8305618` | Chạy được. Task-11: 12 file, +2202. Task-13: 7 file, +735. |
| `git -C E:/FilmBooking show 8004d09 -- "apps/web/src/app/(public)/layout.tsx"` | Chạy được (đã xem diff). |
| `pnpm --filter @filmbooking/web exec vitest run src/components/account/__tests__/account.test.tsx src/components/admin/__tests__/shell.test.tsx` | **Blocked**: hook `agent-guard` trả "không nằm trong allowlist". Không thử biến thể khác. **Test của nhóm KHÔNG được chạy trong review này.** |
| `pnpm typecheck / lint / test / build` | Không chạy (session chính tự chạy). |
| `aislop scan`, `npx oxlint`, `semgrep`, `ocr` | Không chạy: ngoài allowlist của reviewer. Không xác minh được có config oxlint hay không (Glob bị timeout). Ghi `skip/Blocked`. |

## Verdict
- **task-11: FAIL**
- **task-13: FAIL**

## Summary
- **Task-11:** cả trang tài khoản dựa vào một giả định sai, cho rằng client Supabase phía trình duyệt có phiên. Thực tế phiên nằm trong cookie HttpOnly, như `lib/supabase/browser.ts` đã ghi rõ. Hệ quả:
  - Phát hiện "có mật khẩu" luôn trả `true`.
  - Đăng xuất sau khi xoá tài khoản là no-op.
  - Đổi mật khẩu đi vòng qua GoTrue, bỏ qua các kiểm soát của API.
  - Lỗi 403 khi xoá tài khoản chỉ hiện câu chung chung.
- **Task-13:** chặn truy cập phía server đúng. Phần còn lại có 3 lỗi chức năng/phân quyền: phạm vi rạp mất sau mỗi lần bấm sidebar, danh sách rạp lấy từ endpoint công khai chỉ trả rạp OPEN, và nav lệch ma trận §5.3 / design-spec (Manager không thấy Voucher xem-chỉ-đọc).

---

## Findings: task-11

### MAJOR

**M11-1. Phát hiện "tài khoản có mật khẩu" luôn sai (luôn `true`).** Đã xác minh bằng đọc code.
- Vị trí: `apps/web/src/app/(public)/tai-khoan/page.tsx:14` (`useState(true)`) và `:26-34`.
- Bằng chứng:
  - Code gọi `createBrowserSupabase().auth.getUser()`.
  - `lib/supabase/browser.ts:4-12` tạo client với `persistSession:false` và ghi chú: "Phiên nằm trong cookie HttpOnly … client này KHÔNG giữ/đọc phiên".
  - `@supabase/ssr` `createBrowserClient.js:47` tôn trọng `persistSession` do người gọi truyền vào.
  - Vì vậy `userData.user` là `null` và `setHasPassword` không bao giờ được gọi.
- Hậu quả với tài khoản chỉ đăng nhập bằng Google/Facebook:
  - (a) Vẫn thấy `ChangePasswordForm` (`page.tsx:87`), dù không có mật khẩu.
  - (b) `DeleteAccountDialog` bắt nhập "mật khẩu" (`delete-account-dialog.tsx:231-235`, nút bị khoá khi để trống). Người dùng phải gõ đại một chuỗi; API bỏ qua giá trị này với tài khoản OAuth (`profile.service.ts:207-220`).
- Tái hiện: đăng nhập bằng Google, chưa từng đặt mật khẩu, vào `/tai-khoan`, rồi mở "Xoá tài khoản" bước 2. Ô mật khẩu là bắt buộc.
- Đề xuất: lấy danh sách phương thức từ `GET /me/identities` (`identity.controller.ts:25`, đã có sẵn), hoặc đọc phía server (Server Component hoặc server action như `bao-mat/page.tsx`).

**M11-2. "Đăng xuất" sau khi xoá tài khoản là no-op; cookie phiên vẫn còn.** Code path đã xác minh; tác động lên phiên là nghi ngờ.
- Vị trí: `apps/web/src/components/account/delete-account-dialog.tsx:93-98`.
- Bằng chứng:
  - Code gọi `createBrowserSupabase().auth.signOut()` trên client không có phiên.
  - JS không xoá được cookie HttpOnly (`lib/supabase/cookie-options.ts:10`).
  - Lỗi bị nuốt bằng `catch {}`.
  - Toàn bộ web không có route hay action đăng xuất nào khác (grep `signOut`: chỉ có `signOutOthers` ở `bao-mat/page.tsx:30`).
- Tác động: AC "xong → đăng xuất về trang chủ" chỉ đạt về mặt chuyển trang. Cookie `sb-*` còn nguyên. API xác thực JWT cục bộ (`auth.guard.ts:76-84`, `jwtVerify`), nên access token cũ còn dùng được với Nest tới khi hết hạn (≤ 1h). Đây là residual risk.
- Đề xuất: thêm server action hoặc route handler `signOut()` dùng `createServerSupabase()` (cùng pattern `signOutOthers`) để xoá cookie, gọi nó sau khi `DELETE /me` thành công, rồi mới `location.href = "/"`.

**M11-3. Xoá tài khoản bị 403 chỉ hiện câu chung "Bạn không có quyền thực hiện thao tác này.", không hướng dẫn đăng nhập lại.** Đã xác minh.
- API trả `FORBIDDEN` cho 3 trường hợp khác nhau:
  - thiếu mật khẩu (`profile.service.ts:209`);
  - sai mật khẩu (`:212`);
  - OAuth đăng nhập đã quá 5 phút (`:219`).
- Web hiện `error.message` (`delete-account-dialog.tsx:104-109`), map từ `error-messages.ts:10`.
- Hậu quả: người dùng OAuth không biết phải đăng nhập lại; người dùng nhập sai mật khẩu không biết là sai mật khẩu. Không đạt yêu cầu brief mục 1.
- Cross-boundary:
  - API nên dùng mã riêng, ví dụ `REAUTH_REQUIRED` cho ca OAuth.
  - Thông điệp hiện tại của `REAUTH_REQUIRED` (`error-messages.ts:21`) lại nói "để liên kết tài khoản", không dùng lại được.
- Đề xuất:
  - Web: với `ApiError.status===403`, hiện thông điệp theo `hasPassword`. Có mật khẩu: "Mật khẩu không đúng". OAuth: "Vui lòng đăng nhập lại (dưới 5 phút) rồi thử lại" kèm nút tới `/dang-nhap?next=/tai-khoan`.
  - API: tách mã lỗi và sửa câu của `REAUTH_REQUIRED` cho trung tính.

**M11-4. Đổi mật khẩu đi thẳng GoTrue từ trình duyệt.**
- Vị trí: `apps/web/src/components/account/change-password-form.tsx`.
- Các lỗi:
  - (a) **Đã xác minh.** Dòng 71 dùng `signInWithPassword` làm "kiểm mật khẩu cũ", bỏ qua lockout/captcha/rate limit của `POST /auth/login` (R-07, R-08; `auth-ext.service.ts:106`). Từ một phiên bị chiếm, kẻ tấn công có thể dò mật khẩu hiện tại mà không bị Turnstile hay khoá 15 phút chặn.
  - (b) **Nghi ngờ.** Có thể mỗi lần đổi tạo thêm một phiên GoTrue mới (refresh token) không bao giờ thu hồi. Chưa đọc được `auth-js` để xác nhận cách nó lưu phiên khi `persistSession:false`.
  - (c) **Đã xác minh trên config local.** Không có kiểm "mật khẩu hiện tại" ở server: `supabase/config.toml:242` để `secure_password_change = false` và `require_current_password` bị comment. Bước kiểm chỉ nằm ở client. Staging/prod cấu hình ở Supabase Dashboard (`config.toml:256-258`), chưa kiểm được.
  - (d) **Đã xác minh.** R-02 chỉ kiểm `length < 8` (dòng 42-44). Không dùng `checkPasswordPolicy` của `packages/shared/src/password-policy.ts:22`, không chặn > 72 ký tự, không có thanh độ mạnh, trong khi mô tả UI dòng 114 hứa "chữ hoa, chữ thường, chữ số".
  - (e) **Đã xác minh.** Dòng 91 và 101 hiện thẳng `updateError.message` / `error.message` của GoTrue (tiếng Anh, mã thô).
  - (f) **Đã xác minh trên config local.** Dòng 95 toast "Chúng tôi đã gửi email thông báo." nhưng `config.toml:273-277` (`[auth.email.notification.password_changed]`) đang bị comment, và API không có luồng gửi. R-14 ("sau khi đổi gửi email thông báo") chưa đạt, và UI đang báo sai.
- Đề xuất: chuyển sang server action (pattern `bao-mat/page.tsx`) hoặc endpoint Nest `POST /me/password/change`:
  - xác minh mật khẩu cũ qua cơ chế có lockout;
  - kiểm `checkPasswordPolicy`;
  - `updateUser` bằng phiên server;
  - bật notification `password_changed` (hoặc gửi qua outbox);
  - map lỗi sang tiếng Việt.

**M11-5. Thiếu test cho các nhánh quan trọng; mock che kiến trúc thật (false confidence).** Đã xác minh.
- Vị trí: `apps/web/src/components/account/__tests__/account.test.tsx`.
- Phần chưa có test:
  - submit `DELETE /me` (thành công, 403, sau khi xoá thì đăng xuất/chuyển trang);
  - upload avatar (luồng `POST /me/avatar` → PUT signedUrl → `PATCH /me/profile`, và lỗi giữa chừng);
  - đổi email (`POST /me/email`, lỗi `CONFLICT` / `DISPOSABLE_EMAIL`);
  - lưu `ProfileForm`;
  - trang rạp yêu thích và trang tuỳ chọn email;
  - đổi mật khẩu thành công.
- Mock sai thực tế: test mock `createBrowserSupabase` trả `signInWithPassword` như thể client có phiên (dòng 169-173), nên không bao giờ lộ ra M11-1 và M11-2.
- AC "Xoá tài khoản … xong → đăng xuất về trang chủ" không có test nào.

### MINOR (task-11)
- **m11-1. Hàm vượt 50 dòng** (vi phạm `project-config.md` `max_function_lines: 50`; tính vào AI-readable gate):
  - `ProfileForm` (~250 dòng, `profile-form.tsx:38-291`);
  - `DeleteAccountDialog` (~215);
  - `ChangePasswordForm` (~225);
  - `AvatarUpload` (~195);
  - `FavoriteCinemasPage` (~215);
  - `AccountLayout` (~155);
  - `AccountNotificationsPage` (~125);
  - `AccountProfilePage` (~80);
  - `UnverifiedEmailBanner` (~75).
- **m11-2. Layout công khai luôn render động.** `(public)/layout.tsx:14-15` gọi `createServerSupabase()` (đọc `cookies()`) và `getUser()` (một round-trip GoTrue) ở **mọi** trang công khai, cộng thêm một lần `getUser()` trong `proxy.ts:31`. Hiện chưa có trang công khai nào dùng ISR nên không vỡ, nhưng là chi phí mạng gấp đôi mỗi request. Nên dùng `getClaims()` / thông tin user mà proxy đã xác thực, hoặc tách banner/header-user thành phần render động riêng.
- **m11-3. Nguồn trạng thái của banner.** Banner lấy `email_confirmed_at` từ `supabase.auth.getUser()`, không lấy `emailConfirmed` của `GET /me` như mô tả AC-01. Về chức năng thì tương đương (`access.service.ts:53-57` cũng đọc `email_confirmed_at`).
- **m11-4. Đếm ngược 60s của banner chỉ nằm ở state client.** Tải lại trang là mất đếm ngược. Server vẫn chặn đúng (`auth-ext.service.ts:141-142`: 60s/lần, 5 lần/giờ) và trả `RATE_LIMITED`, nhưng UI không khởi động lại đếm ngược theo `Retry-After`. Phần đếm ngược cũng không có `aria-live`.
- **m11-5. `CONFLICT` từ `POST /me/email` hiện câu không hợp ngữ cảnh.** Lỗi này dùng cho "email trùng email hiện tại" và "email đã được dùng" (`profile.service.ts:97,113`), nhưng hiện "Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại." (`change-email-dialog.tsx:72`). Nên map riêng theo ngữ cảnh.
- **m11-6. So sánh cụm "XOÁ TÀI KHOẢN" không chuẩn hoá Unicode** (`delete-account-dialog.tsx:71,233`):
  - không `normalize("NFC")`, nên bộ gõ tiếng Việt kiểu tổ hợp (NFD) sẽ không khớp;
  - "XÓA" (dấu đặt kiểu mới) cũng không khớp.
- **m11-7. Rạp yêu thích lấy danh sách từ `GET /cinemas`, mà endpoint này chỉ trả rạp OPEN** (`cinemas.service.ts:121`). Rạp đã yêu thích nhưng chuyển sang tạm đóng/ngừng sẽ biến mất khỏi danh sách và không gỡ được (`rap-yeu-thich/page.tsx:115`).
- **m11-8. R-28 "ảnh được tự resize"** không có ở client lẫn server (requirement đang đánh dấu `[cần xác nhận]`). Upload ảnh mới không xoá ảnh cũ trong bucket. Nếu `PATCH` lỗi sau khi upload thì để lại file mồ côi.
- **m11-9. Lệch design-spec §15:**
  - route `/tai-khoan/thong-bao` thay vì `/tai-khoan/email`;
  - dùng Checkbox thay Switch;
  - ngày sinh dùng `input type=date` thay DatePicker dd/MM/yyyy;
  - layout tài khoản và header không cập nhật tên/avatar sau khi lưu (`onAvatarUpdated` chỉ cập nhật form).
- **m11-10. Các trang tài khoản là client component, không có `metadata robots noindex`** (chỉ `bao-mat` có).
- **m11-11. `change-email-dialog.tsx` nằm ngoài "Files to Create/Modify"** của task file. Tách component là hợp lý, nhưng là lệch scope chưa ghi nhận.
- **m11-12. DRY:** `profile-form.tsx:33` chép lại regex `VN_PHONE` thay vì dùng `updateProfileSchema` của `packages/shared/src/schemas/profile.ts:10`. `avatar-upload.tsx:17-18` chép lại `AVATAR_CONTENT_TYPES` / `AVATAR_MAX_BYTES`, dù hiện tại giá trị vẫn khớp.
- **m11-13. `/me/profile` bị gọi 2 lần** trên `/tai-khoan` (layout + page). Thừa, không sai.

### Điểm đạt (task-11)
- Avatar:
  - kiểm loại JPG/PNG/WebP và kích thước ≤ 2 MB phía client, khớp schema chung và bucket (`20261111020000_catalog.sql:363`);
  - xem trước bằng blob URL và có thu hồi URL;
  - lấy signed upload URL từ `POST /me/avatar`;
  - gửi `publicUrl` do API cấp; API kiểm origin và thư mục `<uid>/` (`profile.service.ts:188-202`). Người dùng không tự nhập được URL tuỳ ý.
- Đổi email đúng endpoint `POST /me/email {newEmail}`. Thông điệp "chỉ đổi sau khi xác nhận" đúng R-27.
- Banner ẩn khi đã xác nhận hoặc không có email. Nút gửi lại bị khoá trong lúc gửi và đếm ngược sau khi gửi thành công.
- `/tai-khoan/*` được `proxy.ts:7,34-43` chặn ở server khi chưa đăng nhập (redirect `/dang-nhap?next=`).
- Dialog dùng Radix (có focus trap và Esc). Nav có `aria-current`. Lỗi field có `role="alert"`. Màu đều qua token có trong `globals.css`. Không có `dangerouslySetInnerHTML`.

---

## Findings: task-13

### MAJOR

**M13-1. Phạm vi rạp (`?cinema=`) mất sau mỗi lần điều hướng sidebar.** Đã xác minh.
- Vị trí: `apps/web/src/components/admin/admin-sidebar.tsx:29-31` dùng `<Link href={item.href}>` trần (cả Sheet mobile, qua cùng `NavList`).
- Bằng chứng: scope chỉ lưu trong query (`use-admin-scope.ts:33-39`). Bấm bất kỳ mục nào là query bị bỏ: Admin quay về "Toàn chuỗi", Manager/Staff nhiều rạp quay về rạp đầu tiên.
- Tái hiện: Admin chọn "CINEMO Cầu Giấy" (URL `/admin/don-hang?cinema=<id>`), bấm "Lịch chiếu", URL thành `/admin/lich-chieu` và bộ chọn nhảy về "Toàn chuỗi".
- Đề xuất: `NavList` đọc `useSearchParams().get("cinema")` và nối vào `href` các mục nội bộ (bỏ qua mục `external`, hoặc truyền sang `/staff/soat-ve`).

**M13-2. Danh sách rạp cho bộ chọn phạm vi lấy từ `GET /cinemas` công khai, mà endpoint này chỉ trả rạp `OPEN`.** Đã xác minh.
- Vị trí: `apps/web/src/app/admin/layout.tsx:40-45`; `apps/api/src/modules/catalog/cinemas.service.ts:121` (`.eq("status","OPEN")`).
- Hậu quả:
  - Admin không chọn được rạp "Sắp khai trương / Tạm đóng / Ngừng hoạt động" làm phạm vi. Đây chính là các rạp cần xử lý "Đơn bị ảnh hưởng" và mở lại rạp.
  - Manager/Staff được gán vào rạp không OPEN chỉ thấy nhãn `Rạp 1a2b3c4d` (dòng 45).
  - Lỗi mạng bị nuốt thành `[]` (dòng 40). Khi đó Admin chỉ còn danh sách rạp mình được gán.
- Đề xuất: dùng endpoint quản trị trả mọi rạp theo quyền. API hiện không có `GET /admin/cinemas`, nên cần bổ sung, hoặc để `GET /me` trả kèm `code/name/status` của rạp được gán. Ghi nhận đây là phụ thuộc cross-boundary.

**M13-3. Nav lệch ma trận quyền SPEC §5.3 và design-spec §3.** Đã xác minh.
- Vị trí: `apps/web/src/components/admin/nav-config.ts:21-36`.
- Lệch 1: Voucher chỉ `["ADMIN"]` (dòng 30), trong khi SPEC §5.3 (`SPECIFICATIONS.md:462`, "Quản lý voucher: Cinema Manager 👁 xem"), R-90 và design-spec `:114` / `:156` ("Manager chỉ xem") đều cho Manager xem.
- Lệch 2: Cấu hình chỉ `["ADMIN"]` (dòng 34), trong khi design-spec `:118` ghi "Manager ✅ cấu hình rạp". API có sẵn `GET/PATCH cinemas/:cinemaId/settings`.
- Lệch 3: thiếu mục "Phòng & sơ đồ ghế" (design-spec `:108`, Admin + Manager). Task description yêu cầu nav-config khai **toàn bộ** mục MVP.
- Đề xuất: Voucher → `ADMIN_MANAGER` (trang layer sau tự ẩn nút ghi); Cấu hình → `ADMIN_MANAGER`; thêm mục Phòng (hoặc ghi rõ quyết định gộp vào "Rạp chiếu"). Cập nhật test tương ứng.

### MINOR (task-13)
- **m13-1. Breakpoint Sheet lệch design-spec.** Code chuyển sidebar sang Sheet ở `< md` (768px) (`admin-sidebar.tsx:59`, `:72`), còn design-spec `:190` / `:421` yêu cầu `< 1024px`. Ở 768-1023 sidebar 250px cố định chiếm nhiều chỗ.
- **m13-2. Thiếu chi tiết shell theo design-spec `:190`:**
  - pill vai trò;
  - footer avatar + tên + email;
  - breadcrumb "Quản trị hệ thống / {trang}";
  - chuông thông báo;
  - nhãn rạp dạng `HN01 • Long Biên`;
  - `?cinema=` dùng UUID thay mã rạp (design `:191` ghi `?cinema=HN01`).
  - Ghi chú "Dữ liệu chỉ giới hạn…" bị `sr-only` dưới `lg` (`cinema-scope-switcher.tsx:45`).
- **m13-3. Vai trò hiệu lực là vai trò cao nhất trên mọi rạp** (`nav-config.ts:39-45`). Ví dụ người là Manager ở A nhưng Staff ở B vẫn thấy menu Manager khi scope = B. Chỉ ảnh hưởng UX vì quyền thật ở API/RLS, nhưng nên tính vai trò theo rạp đang chọn.
- **m13-4. Test (false confidence nhẹ):**
  - Mock `ApiError` đảo chữ ký: `(status, message)` (`shell.test.tsx:47-51`) so với thật `(code, message, status, details)` (`client.ts:4-15`).
  - Không có test nhánh `/me` trả 401/403 (`admin/layout.tsx:21-22`).
  - Test Sheet mobile bấm link nhưng không assert Sheet đã đóng (`:317-322`).
  - Test "cho phép nhân sự" chỉ assert `result` defined (`:392-394`); không kiểm role/cinemas truyền vào shell, không kiểm Admin thấy toàn bộ rạp.
- **m13-5. Redirect đăng nhập mất deep link.** `redirect("/dang-nhap?next=/admin")` cố định (`layout.tsx:21,33`), nên deep link `/admin/don-hang/...` không được giữ. Proxy đã xử lý ca chưa đăng nhập có giữ path, nên chỉ ảnh hưởng ca token hết hạn giữa chừng.
- **m13-6. Kích thước tuỳ ý `w-[250px]`, `border-l-[3px]`.** Nên thành token, không phải màu.

### Điểm đạt (task-13)
- Chặn ở server, hai lớp:
  - `proxy.ts:7` bảo vệ `/admin` khi chưa đăng nhập;
  - `admin/layout.tsx:32-37` (Server Component) gọi `GET /me` bằng token server, Customer (không admin, không rạp) bị `redirect("/khong-co-quyen")`. Trang `app/khong-co-quyen/page.tsx` có tồn tại.
  - Không tin dữ liệu vai trò từ client.
- Staff không thấy Báo cáo: `nav-config.ts:32` gán `ADMIN_MANAGER`, có test (`shell.test.tsx:123`).
- "Đóng/mở rạp chỉ Admin" không tách được ở mức nav, vì "Rạp chiếu" dùng chung cho Admin và Manager. Nút đóng/mở phải ẩn trên trang rạp ở layer sau. API đã chặn route trạng thái (`cancellation.controller.ts:132,141`). Ghi residual cho layer sau, không phải lỗi của task-13.
- `resolveScope` bỏ qua `?cinema=` không thuộc danh sách cho phép và `all` với non-admin. Ghi chú rõ đây không phải bằng chứng quyền.
- Không còn mục POS. Không có route group `(admin)` / `(staff)` cũ (Glob `apps/web/src/app/**`), nên không có layout chồng hoặc route trùng.
- Sheet mobile dùng Radix (focus trap, Esc). Nav có `aria-label` và `aria-current`. Vùng chạm `min-h-11`.
- Mục trỏ tới route chưa có (`/admin` page ở layer-7-task-05, `/staff/soat-ve` ở layer-6-task-06, các `/admin/*` khác ở layer sau) là đúng kế hoạch, không phải lỗi. Nhưng hiện `/admin` trả 404 với mọi người, nên AC "Customer → 403" chỉ kiểm được bằng unit test layout, chưa kiểm end-to-end (residual).

---

## Bảng đối chiếu lệnh gọi API web ↔ API thật

| Web (file:line) | Method + path | Body | API thật | Khớp? |
|---|---|---|---|---|
| `tai-khoan/layout.tsx:43`, `tai-khoan/page.tsx:22`, `rap-yeu-thich/page.tsx:43`, `thong-bao/page.tsx:33` | GET `/me/profile` | — | `profile.controller.ts:38`. Trả cột snake_case + `favorite_cinema_ids` (`profile.service.ts:11-12,38`) | Khớp. Type web viết tay, không dùng type chung. |
| `profile-form.tsx:81` | PATCH `/me/profile` | `{fullName, phone\|null, dateOfBirth\|null, gender\|null}` | `:43`, `updateProfileSchema` strict partial | Khớp |
| `avatar-upload.tsx:114` | PATCH `/me/profile` | `{avatarUrl: publicUrl}` | `assertOwnAvatarUrl` | Khớp |
| `avatar-upload.tsx:94` | POST `/me/avatar` | `{contentType, sizeBytes}` | `:53`, `avatarUploadSchema`. Trả `{path, token, signedUrl, publicUrl}` | Khớp |
| `avatar-upload.tsx:103` | PUT `signedUrl` (Storage) | file thô | Storage signed upload | Khớp (nghi ngờ nếu `SUPABASE_URL` của API là host nội bộ mà trình duyệt không truy cập được: residual env) |
| `change-email-dialog.tsx:64` | POST `/me/email` | `{newEmail}` | `:48`, `changeEmailSchema` | Khớp. Map lỗi CONFLICT chưa hợp (m11-5) |
| `thong-bao/page.tsx:49` | PUT `/me/preferences` | `{marketingOptIn}` | `:58` | Khớp |
| `rap-yeu-thich/page.tsx:62,78` | PUT/DELETE `/me/favorites/:cinemaId` | — | `:66,71` | Khớp |
| `rap-yeu-thich/page.tsx:42`, `admin/layout.tsx:40` | GET `/cinemas` | — | `cinemas.controller.ts:33`. **Chỉ rạp OPEN** | Khớp đường dẫn, **sai nguồn dữ liệu** cho admin (M13-2) |
| `delete-account-dialog.tsx:84` | DELETE `/me` | `{acknowledgeTicketLoss:true, password?}` | `profile.controller.ts:84`, `deleteAccountSchema` | Khớp shape. Xử lý 403 sai (M11-3) |
| `unverified-email-banner.tsx:44` | POST `/auth/resend-confirmation` | `{email}` | `auth-ext.controller.ts:50`, `resendConfirmationSchema`. 202 `{status:"CHECK_EMAIL"}` | Khớp (generic type web ghi `{status:string}`) |
| `admin/layout.tsx:19` | GET `/me` (server, Bearer) | — | `me.controller.ts:22`, `MeResponse` | Khớp |
| `change-password-form.tsx:71,86` | GoTrue `signInWithPassword` + `updateUser` (trình duyệt) | — | **Không qua API.** Bỏ qua lockout/captcha/policy (M11-4) | Lệch kiến trúc |
| `tai-khoan/page.tsx:28` | GoTrue `getUser` (trình duyệt) | — | Client không có phiên, luôn null (M11-1). Nên dùng `GET /me/identities` | Sai |
| `delete-account-dialog.tsx:95` | GoTrue `signOut` (trình duyệt) | — | No-op (M11-2) | Sai |

Không có endpoint nào web gọi mà API không có.

## Acceptance criteria

### task-11
| AC | Trạng thái | Ghi chú |
|---|---|---|
| Banner hiện khi emailConfirmed=false, ẩn khi đã xác nhận (AC-01 UI) | Đạt (một phần) | Có render và unit test. Nguồn là `getUser()` thay `/me` (m11-3). Residual cross-cutting: `enable_confirmations=true` nên tài khoản chưa xác nhận có thể không đăng nhập được, vậy banner có thể hiếm khi xuất hiện. Thuộc nhóm auth, không chấm cho task này. |
| Xoá tài khoản yêu cầu gõ xác nhận + mật khẩu; xong → đăng xuất về trang chủ | **Thiếu** | Có gõ cụm từ và mật khẩu, nhưng: OAuth bị đòi mật khẩu giả (M11-1); không đăng xuất thật (M11-2); 403 không hướng dẫn (M11-3); không có test submit (M11-5). |
| Avatar sai định dạng hiển thị lỗi; xem trước trước khi lưu | Đạt | Có test. Không resize (m11-8). |
| Đổi mật khẩu sai mật khẩu cũ → lỗi rõ ràng | Đạt (UI) / lỗi kiến trúc | Thông điệp rõ, nhưng cơ chế bỏ qua lockout/policy, báo sai đã gửi email (M11-4). |
| R-14 email thông báo sau khi đổi | **Thiếu** | Notification bị comment trong config local; UI báo sai. |
| R-26/27/30/31 | Đạt | Rạp không OPEN bị ẩn khỏi danh sách yêu thích (m11-7). |

### task-13
| AC | Trạng thái | Ghi chú |
|---|---|---|
| Staff chỉ thấy: Việc cần làm, Đơn hàng, Đơn bị ảnh hưởng, Soát vé; Manager thêm rạp/phòng/lịch/giá/báo cáo/nhân sự; Admin đủ | **Thiếu** | Staff đúng. Manager thiếu Voucher (xem) theo §5.3, thiếu Cấu hình rạp theo design, thiếu mục Phòng (M13-3). |
| Customer truy cập /admin → trang 403 | Đạt (server) | Có unit test layout. Chưa kiểm end-to-end vì `/admin/page.tsx` thuộc layer-7. |
| Scope switcher chỉ liệt kê rạp được gán; đổi scope cập nhật query | Đạt một phần | Đạt cho Manager/Staff. Admin thiếu rạp không OPEN (M13-2). Scope mất khi điều hướng (M13-1). |
| Sidebar điều hướng bàn phím; responsive Sheet trên mobile | Đạt (lệch breakpoint) | Sheet dưới 768 thay vì 1024 (m13-1). |

## Verdict Reasoning
- **task-11 FAIL:** 5 MAJOR. M11-1, M11-2, M11-3, M11-5 và các phần (a), (d), (e) của M11-4 đã xác minh bằng code.
  - M11-1, M11-2, M11-3 làm hỏng AC xoá tài khoản.
  - M11-4 bỏ qua kiểm soát bảo mật và báo sai R-14.
  - M11-5 thiếu test cho luồng phá huỷ dữ liệu.
  - Thêm vi phạm `max_function_lines`.
- **task-13 FAIL:** 3 MAJOR (M13-1, M13-2, M13-3). Theo decision flow, ≥ 3 MAJOR là FAIL. M13-3 còn lệch trực tiếp ma trận §5.3.
- Lưu ý: test của nhóm KHÔNG được chạy trong review này (hook chặn). Mọi kết luận dựa trên đọc code và đối chiếu API/config/SPEC.
