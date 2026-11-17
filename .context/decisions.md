# Architecture Decisions Log

## Format

```markdown
### Decision {N}: {Title}
- **Date:** YYYY-MM-DD
- **Context:** {Why this decision was needed}
- **Decision:** {What was decided}
- **Alternatives Considered:** {Other options}
- **Rationale:** {Why this option was chosen}
- **Consequences:** {Trade-offs, follow-up needed}
```

## Decisions

### Decision 1: Điều hướng theo vai trò sau đăng nhập (R-135)
- **Date:** 2026-11-16
- **Context:** Admin/Manager/Staff đăng nhập xong vẫn về trang khách (`/`), vào được mọi trang khách (không đặt vé được, vô nghĩa) và không có đường tự quay lại khu vực của mình. Task `bug-admin-ux/phase-1-task-03`, user duyệt 2026-11-16.
- **Decision:**
  1. Vai trò → đích sau đăng nhập (mật khẩu + OAuth callback): ADMIN và MANAGER → `/admin`; STAFF → `/staff/chon-rap`; CUSTOMER giữ nguyên (`next` hoặc `/`). Nhiều vai trò: ADMIN > MANAGER > STAFF (dùng đúng `resolveAdminRole`, `components/admin/nav-config.ts`).
  2. Nhân sự mở trang `(public)` (`/`, `/phim`, `/rap`, `/dat-ve/...`) → chuyển về khu vực vai trò, TRỪ `/tai-khoan/*`. `/dang-nhap` khi đã đăng nhập là nhân sự → khu vực vai trò.
  3. `next` trỏ vào `/admin*`, `/staff*`, `/tai-khoan*` được tôn trọng (nhân sự vẫn quay lại được trang tài khoản qua `next`); `next` trỏ trang khách của nhân sự bị bỏ qua. `sanitizeNext` chạy trước mọi redirect (chống open-redirect).
  4. Cơ chế: guard ở server layout `(public)` + guard client `StaffAreaGuard`, đọc đường dẫn qua header `x-pathname` do `proxy.ts` đặt (ghi đè giá trị client gửi); KHÔNG gọi `/me` ở mọi request trong proxy. Fail-open khi `/me` lỗi/401: hạ cánh ở trang khách (chỉ UX; API `/admin`, `/staff` tự kiểm quyền theo vai trò + RLS nên không phải lỗ hổng).
- **Alternatives Considered:** STAFF → `/staff` (loại: `app/staff/page.tsx` không tồn tại, sẽ 404); chặn nhân sự ở proxy bằng `/me` mỗi request (loại: tốn 1 request/lần, tăng độ trễ mọi trang); chặn cứng cả `/tai-khoan/*` (loại: nhân sự cần đổi mật khẩu/đăng xuất/liên kết); fail-closed khi `/me` lỗi (loại: nhân sự bị khoá khỏi cả trang khách khi API chập chờn, không thêm bảo mật vì API tự kiểm quyền).
- **Rationale:** Đích STAFF `/staff/chon-rap` là màn vào thực của khu vực nhân viên (chọn rạp rồi soát vé, R-97). Giữ `/tai-khoan/*` và `next` hợp lệ để không mất chức năng hiện có. Guard ở layout tránh chi phí proxy.
- **Consequences:** Customer đã đăng nhập tốn thêm 1 `getSession` + 1 `/me` mỗi lần tải cứng trang khách (chấp nhận). Đường dẫn khớp đuôi ảnh bị matcher proxy bỏ qua → `x-pathname` giả của chính nhân sự đó chỉ ảnh hưởng UX của họ. Helper `isStaffAllowedPath` giả định input đã qua `sanitizeNext` (nếu dùng lại phải guard đầu vào). Spec: R-135, bump 3.1.0 (`spec/updates/2026-11-16-admin-ux.md`).

### Decision 2: Nới validate ID `z.uuid()` → `z.guid()`
- **Date:** 2026-11-16
- **Context:** ID trong `supabase/seed.sql` (rạp `20000000-…`, phòng `30000000-…`, suất tay `50000000-…`, phim, voucher, user `auth.users`…) không đúng chuẩn RFC (zod v4 `z.uuid()` đòi version 1-8 + variant). Admin gọi `GET /cinemas/:id/rooms`, `/seats` nhận 400 `Invalid UUID`. `catalog.ts` đã dùng `z.guid()` nên API lệch nhau. Task `bug-admin-ux/phase-1-task-01`.
- **Decision:** Đổi `z.uuid()` → `z.guid()` trong `packages/shared/src/schemas/{cinema-ops,admin,checkin,profile,orders,report,booking,cancellation,pricing}.ts` (+ pipe `cinemaIdParam` cho `:cinemaId` ở `cancellation.controller.ts`), khớp `catalog.ts:145,150`. GIỮ `.uuid()` chặt ở: `payment.ts:16` (`bookingIdParamSchema`), `cancellation.controller.ts` `:orderId` (`uuidParam`), `identity.ts:57` (`authenticatedUserId`).
- **Alternatives Considered:** Sửa seed thành UUID chuẩn RFC (loại: đổi toàn bộ ID demo, ảnh hưởng dữ liệu/FK/test đang dùng, không giải quyết schema lệch nhau); nới đúng 4 file ghi trong task (loại: review round 1 thấy showtime/booking/pricing/cancellation vẫn lệch cùng một ID → 400 ở chỗ khác).
- **Rationale:** RFC ⊂ GUID nên chỉ nới, không chặn thêm client cũ. `orders.id` mặc định `gen_random_uuid()` (UUIDv4, RFC) và không có đường tạo ID tay trong code API → giữ chặt vô hại. `identity.ts:57` là trường service bỏ qua (`identity.service.ts:233`), web không gửi.
- **Consequences:** `auth.users` demo 6/6 non-RFC — nếu sau này client gửi `authenticatedUserId` bằng ID user seed sẽ 400 (chưa đổi vì ngoài phạm vi). Residual ngoài scope cần triage riêng: `cancellation.controller` `@Param("cinemaId")` ở 4 route và `pricing.controller` `:id`/`:showtimeId` chưa có pipe validate id. Không đổi requirement (không bump riêng; nằm trong scope v17).

---

- **Date:** 2026-11-17
- **Context:** Bản đồ vị trí rạp (`CinemaMap`, Leaflet) hiển thị nền xám: `*.openstreetmap.org` bị DNS nhà mạng VN (VNPT) trả NXDOMAIN nên 0/12 tile tải được; link "Chỉ đường" tới `www.openstreetmap.org` cũng chết. Task `bug-cinema-map/phase-1-task-01`.
- **Decision:** (1) Tile layer đổi sang OSM France `https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png` (`subdomains: "abc"`, `maxZoom: 20`), attribution "OpenStreetMap contributors, tiles by OpenStreetMap France". (2) Link chỉ đường/tìm địa chỉ đổi sang Google Maps URL API (`maps/dir/?api=1&destination=lat,lng`, `maps/search/?api=1&query=`), gộp vào `apps/web/src/lib/map-links.ts` (`buildDirectionsUrl`).
- **Alternatives Considered:** CARTO `rastertiles/voyager|light_all|dark_all` (loại: tile tải được nhưng bị đóng dấu "API KEY REQUIRED" — phát hiện nhờ screenshot, `onload` không bắt được); Esri World_Street_Map và `tile.openstreetmap.de` (đều hiện tile thật trên mạng VNPT, để dành làm phương án thay thế); giữ `tile.openstreetmap.org` (loại: bị chặn DNS); tự host tile / provider có key (loại: quá nặng cho demo).
- **Rationale:** OSM France là dữ liệu OSM, cùng kiểu bản đồ, không cần key, tải được qua DNS VNPT và có hỗ trợ zoom 20. Google Maps URL API là link chuẩn không cần key. Không đổi requirement (R-34/R-37), dữ liệu bản đồ vẫn là OSM nên `docs/BRD.md` ghi "OpenStreetMap (Leaflet)" vẫn đúng → no doc impact.
- **Consequences:** Phụ thuộc OSM France tile server (chính sách fair-use, không SLA — đủ cho demo, không dành cho production có tải lớn; production nên dùng provider có key/tự host). Domain `openstreetmap.fr` chưa bị chặn trên mạng VNPT tại 2026-11-17; nếu bị chặn thì đổi sang Esri/osm.de. Không có retina tile (`{r}`). Mạng chặn Google Maps: chưa có bằng chứng. Còn mở từ scan (ngoài task): #1 `/rap` chỉ vẽ 1 rạp, #2 z-index Leaflet có thể đè header, #3 CSS Leaflet nạp động.

---

- **Date:** 2026-11-17
- **Context:** User muốn gửi mail thật bằng SMTP Gmail cho đỡ cấu hình lằng nhằng; `MailService` chỉ hỗ trợ Resend SDK với from cứng `onboarding@resend.dev` và `RESEND_FROM_EMAIL` không được đọc. Task `feature-mail-smtp/phase-1-task-01`.
- **Decision:** `MailService` chuyển sang SMTP chung qua nodemailer: token `RESEND_CLIENT` -> `MAIL_TRANSPORT`, hàm thuần `createMailTransport(env)` (`mail.transport.ts`) trả `null` khi thiếu `SMTP_HOST`. Env mới `SMTP_HOST/PORT/USER/PASS/FROM` (optional), bỏ `RESEND_API_KEY`; gỡ dependency `resend`. Cổng 465 -> `secure: true`, cổng khác STARTTLS; timeout kết nối 10s / socket 20s. From: `options.from` > `SMTP_FROM` > `FilmBooking <SMTP_USER>` > mặc định.
- **Alternatives Considered:** Giữ Resend SDK và thêm nhánh SMTP (loại: hai đường gửi, không cần cho demo); thư viện SMTP khác (loại: nodemailer là chuẩn Node, có types).
- **Rationale:** Một transport SMTP dùng được cho Gmail, Resend (`smtp.resend.com`), SES chỉ đổi env. `SPECIFICATIONS.md` §Tech Stack + NFR-10 đã ghi "SMTP riêng (vd Resend/SES)" nên requirement không đổi, không bump `spec_version`.
- **Consequences:** Gmail ghi đè from thành chính tài khoản, giới hạn ~500 mail/ngày, chỉ dùng demo. Chưa ràng buộc `SMTP_*` ở production (scan `bug-register-email` #5 xử lý riêng). Gửi mail Gmail thật do user tự kiểm sau khi điền App Password. CI workflow còn đặt `RESEND_API_KEY: ci-placeholder` (biến thừa, vô hại, ngoài scope task).

---

- **Date:** 2026-11-17
- **Context:** Bấm link xác nhận email xong về web nhưng chưa đăng nhập. Mail do Nest gửi bằng `anon.auth.resend({type:"signup"})` ở server (không có `code_verifier` PKCE) nên GoTrue redirect dạng implicit `#access_token=...` (fragment); `/auth/callback` chỉ đọc `?code=` nên không tạo phiên. Task `feature-confirm-email-auto-login/phase-1-task-01`.
- **Decision:** Template Auth `confirmation.html` trỏ thẳng web `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup&amp;next=/`. Route mới `apps/web/src/app/auth/confirm/route.ts` (GET) gọi `supabase.auth.verifyOtp({ type: "signup", token_hash })` phía server, đặt cookie phiên qua `createServerSupabase` (không "Ghi nhớ" mặc định, R-15), rồi `resolvePostLoginTarget` (nhân sự về khu vực vai trò, khách về `/xac-nhan-email?status=success`). Chỉ chấp nhận `type=signup`; mọi lỗi/throw/thiếu tham số -> `/xac-nhan-email?status=expired`, không phiên, không lộ chi tiết; `next` luôn qua `sanitizeNext`. `/auth/callback` giữ nguyên cho OAuth. 5 template Auth còn lại không đổi.
- **Alternatives Considered:** Đọc fragment `#access_token` phía client rồi `setSession` (loại: token lộ ở URL/JS, route server không thấy fragment); đổi Nest sang `signInWithOtp`/PKCE (loại: server không giữ được `code_verifier` của trình duyệt khác); `type=email` (loại: spec chốt `signup`, template do ta kiểm soát).
- **Rationale:** `token_hash` + `verifyOtp` là cách Supabase SSR khuyến nghị, không phụ thuộc trình duyệt/thiết bị đã đăng ký nên mở link ở máy khác vẫn đăng nhập được. Sửa R-04 (intent) theo change request đã được user duyệt.
- **Consequences:** Scanner email (SafeLinks...) có thể mở link trước và dùng mất token -> user thấy "hết hạn" dù email đã xác nhận (đăng nhập thường vẫn được); chấp nhận cho demo, cách giảm sau này: trang trung gian bấm nút xác nhận (POST). Template qua `config.toml` chỉ áp dụng local; staging/prod phải dán vào Dashboard và đặt `site_url` đúng domain web. Phiên từ link luôn là phiên trình duyệt: route ghim `fb-remember=0` và ghi lại cookie `*-auth-token` không maxAge sau khi `verifyOtp` thành công (cờ `fb-remember=1` còn sót sau phiên hết hạn/thu hồi sẽ làm `createServerSupabase` + `proxy.ts` cấp phiên 30 ngày trái R-15); chọn ghi lại sau verify (mirror `dang-nhap/page.tsx`) thay vì ghim trước `verifyOtp` để verify lỗi không hạ cấp phiên "Ghi nhớ" đang có. **Rủi ro login-CSRF / tráo phiên (chấp nhận cho demo):** route là GET tạo phiên từ token trong URL, kẻ tấn công đăng ký tài khoản B, để chưa xác nhận rồi gửi link xác nhận của B cho nạn nhân thì nạn nhân bị đăng nhập vào B (đơn đặt vé, email/SĐT họ nhập sau đó nằm trong tài khoản của kẻ tấn công); người đang đăng nhập A bấm link của B cũng bị chuyển sang B mà không báo. Giảm nhẹ: mỗi link dùng một lần, hạn 24 giờ, gửi lại giới hạn 5 lần/giờ (R-06), cần social engineering. Cách giảm sau này (chưa làm ở task này, cùng hướng với vấn đề scanner SafeLinks): trang trung gian hiện email đã che một phần + nút "Xác nhận" gửi POST, hoặc hiện email tài khoản trên trang success. Site URL cấu hình không được có dấu `/` ở cuối (sinh `//auth/confirm`).
