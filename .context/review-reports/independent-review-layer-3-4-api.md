# Review độc lập (adversarial): Layer 3+4, vùng API NestJS + packages/shared

- **Agent:** reviewer
- **Nhánh / HEAD:** `staging` @ `cece676`
- **Phạm vi:** `git diff --name-only 218679a..HEAD -- apps/api packages/shared` (47 file). Đối chiếu chéo với `supabase/migrations/*.sql` (core_identity_chain, catalog, security_ops(+hardening), pricing, booking_tables, identity_hooks, rpc_*), `supabase/config.toml`, `SPECIFICATIONS.md` (R-11..R-33, R-52..R-56, AC-03/04/05/15), `tasks/build-filmbooking/PLAN.md` (G5, G6, kế hoạch wiring), `.context/project-config.md`.
- **Review level:** `STRICT`
- **Lý do:** auth/JWT/JWKS, OAuth và liên kết tài khoản, xoá tài khoản (PII), RBAC/phạm vi rạp, migration RPC SECURITY DEFINER, service role, API contract dùng chung.
- **Blast radius:** toàn bộ luồng đăng nhập/đăng ký/khôi phục, mọi tài khoản khách (chiếm tài khoản), audit trail của giá, catalog công khai.
- **Verdict cho vùng này:** **FAIL**

---

## 1. Phạm vi tôi đã đọc

| Nhóm | File |
|---|---|
| Auth chung | `common/auth/{auth.guard,access.service,roles.guard,cinema-scope.guard,decorators,auth.module}.ts`, `config/{env,configure-app}.ts`, `common/errors/all-exceptions.filter.ts`, `common/supabase/supabase.service.ts`, `app.module.ts`, `health/health.controller.ts` |
| auth-ext | `auth-ext.{controller,service,module}.ts`, `turnstile.service.ts`, `shared/schemas/auth.ts`, `shared/password-policy.ts` |
| identity | `identity.{controller,service,module}.ts`, `shared/schemas/identity.ts`, migration `20261111040500_identity_hooks.sql`, pgTAP `045_identity_hooks.test.sql` (chỉ grep) |
| profile / me | `profile.{controller,service}.ts`, `me.controller.ts`, `shared/schemas/profile.ts` |
| catalog | `cinemas.{controller,service}.ts`, `movies.{controller,service}.ts`, `shared/schemas/catalog.ts` |
| cinema-ops | `rooms.controller.ts`, `seat-layout.service.ts`, `showtimes.{controller,service}.ts`, `shared/schemas/cinema-ops.ts` |
| pricing | `pricing.{controller,service,module}.ts`, `shared/schemas/pricing.ts`, migration `20261111030000_pricing.sql` |
| test | mock của `auth-ext.e2e-spec.ts`; danh sách case của `auth-jwks.spec.ts`, `identity.e2e-spec.ts`, `pricing.e2e-spec.ts` |

## 2. Verify (allowlist trong `.context/project-config.md`)

| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: shared 14, api 209 (14 file), web 89. Log của test in ra `[AllExceptionsFilter] [object Object]` (xem m-07) |
| `pnpm build` | Lần 1 FAIL do môi trường ("Another next build process is already running", có một tiến trình build khác chạy song song). Lần 2 PASS (api: "Built 56 files -> apps\api\dist"; web build xong) |
| Nạp `apps/api/dist` bằng node | **Không chạy được**: agent-guard chặn mọi lệnh ngoài allowlist (kể cả `ls`). Runtime bootstrap chưa được tôi xác minh |
| aislop / oxlint / ocr | skip: không có trong allowlist verify của `project-config.md`. Tôi không xác minh được oxlint đã được cấu hình hay ocr đã được cài |

Bộ test xanh nhưng **không chứng minh** được các bất biến bảo mật quan trọng nhất (mục 5). Theo luật adversarial, chỉ test xanh thì không đủ để PASS.

---

## 3. Findings

### CRITICAL

**C-01. Anon gọi được các RPC identity SECURITY DEFINER, dẫn đến chiếm tài khoản bất kỳ**
- Vị trí: `supabase/migrations/20261111040500_identity_hooks.sql:287-477` (`get_user_identities`, `unlink_user_identity`, `link_user_identity`, `mark_password_set`). API gọi tới tại `apps/api/src/modules/identity/identity.service.ts:53,79,106,157`.
- Nguyên nhân:
  1. Đây là migration Layer 4 **duy nhất** không có `revoke all on function ... from public, anon`. Mọi `rpc_*` khác đều có, ví dụ `040000:564`, `040100:147`, `040300:404`. Postgres mặc định cấp EXECUTE cho `PUBLIC`, và default privileges của Supabase cấp thêm cho `anon`. Câu `grant ... to authenticated` không thu hồi quyền của anon.
  2. Guard sở hữu viết là `if auth.uid() is not null and auth.uid() <> p_user_id ...` (dòng 301, 361, 410, 453). Dưới vai trò anon, `auth.uid()` là NULL nên guard bị **bỏ qua hoàn toàn**.
- Kịch bản khai thác: UUID người dùng không phải bí mật (có thể lộ qua URL avatar trong bucket public, log, link chia sẻ...). Kẻ tấn công có UUID nạn nhân gọi bằng anon key công khai: `POST /rest/v1/rpc/link_user_identity {"p_user_id":"<victim>","p_provider":"google","p_provider_id":"<google sub của kẻ tấn công>"}`. RPC tự `set_config('app.allow_identity_link','true')` nên trigger guard cho qua. Sau đó kẻ tấn công "Đăng nhập bằng Google", GoTrue thấy identity (google, sub) và cấp phiên của **tài khoản nạn nhân**. Các biến thể khác: `unlink_user_identity` xoá phương thức đăng nhập của người khác; `get_user_identities` đọc email và provider_id của bất kỳ user nào. Biến thể đã đăng nhập (C-02) thậm chí không cần UUID của người khác.
- **Khai thác được NGAY BÂY GIỜ qua PostgREST**, bất kể `IdentityModule` đã được wiring hay chưa.
- pgTAP `045` không chuyển vai trò (không có `set role` / `set local role` / `request.jwt.claims`), tức chạy bằng role của test runner. Vì vậy nó không phát hiện được.
- Đề xuất: viết **migration mới** (không sửa migration đã apply) gồm `revoke all on function ... from public, anon;`. Đổi guard thành fail-closed: `if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) and not is_admin() then raise 42501`. Nên chỉ grant cho `service_role` vì Nest đã gọi qua admin. Thêm pgTAP chạy `set local role anon` / `authenticated` (với user khác).

**C-02. `POST /me/identities/link` liên kết MXH mà không cần bằng chứng sở hữu OAuth (R-21/R-23)**
- Vị trí: `identity.service.ts:77-97`, `shared/schemas/identity.ts:34-38`. RPC `link_user_identity` (`040500:396-441`) được grant cho `authenticated`.
- `providerId` và `identityData` do client tự khai. Không có id_token, không có code exchange, không đi qua `linkIdentity()` của GoTrue. Kể cả sau khi vá C-01, khách đã đăng nhập vẫn có thể:
  - (a) Chiếm trước `(google, sub)` của người khác. Nạn nhân đăng nhập Google sẽ vào tài khoản của kẻ tấn công (pre-hijack).
  - (b) Squat một identity để R-23 từ chối người thật vĩnh viễn.
  Gọi thẳng PostgREST cũng làm được, không cần qua Nest.
- Đề xuất: bỏ RPC liên kết dạng tự khai. Dùng `supabase.auth.linkIdentity()` (manual linking đã bật ở `config.toml:184`). Hoặc Nest phải xác minh id_token của provider (chữ ký, aud, sub) rồi mới gọi bằng service role. Thu hồi grant `authenticated`.

**C-03. Oracle dò email công khai (vi phạm R-12): `check_oauth_collision` và `POST /auth/oauth/callback-check`**
- Vị trí: `040500:228-284` (`grant ... to anon, authenticated`), `identity.controller.ts:69-76` (`@Public`), `identity.service.ts:260-286`.
- Ai cũng có thể gửi `{provider:"google", providerId:"x", email:"a@b.com"}`. Email đã có tài khoản thì nhận 409 `OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED`, chưa có thì nhận 200. Ngoài throttler chung 100/phút/IP thì không có rate limit hay captcha nào. Gọi thẳng `/rest/v1/rpc/check_oauth_collision` bằng anon key thì **không có giới hạn gì** (khai thác được ngay). `authenticatedUserId` cũng do client tự khai.
- Đề xuất: bỏ endpoint public và bỏ grant anon. Việc kiểm va chạm phải chạy ở server sau khi đã có identity từ GoTrue và trả về thông báo chung. Nếu vẫn giữ thì chỉ cho service role dùng, và input phải lấy từ token đã xác minh.

### MAJOR

**M-01. `mark_password_set` lách được AC-05 / R-21 (huỷ phương thức đăng nhập cuối cùng)**
- `040500:444-477` grant cho `authenticated`, gọi được ngay qua PostgREST. Kịch bản: khách chỉ có Facebook gọi `rpc/mark_password_set(<uid mình>)`. Hàm chèn identity `email` nhưng **không đặt mật khẩu**, khiến `hasPassword` và `canUnlink` thành true. Tiếp theo `DELETE /me/identities/facebook` thành công và tài khoản không còn cách nào để đăng nhập.
- Đề xuất: chỉ service role được gọi. `hasPassword` phải dựa trên `auth.users.encrypted_password`, không dựa trên identity `email`.

**M-02. Race khi huỷ liên kết: hai DELETE đồng thời xoá hết phương thức đăng nhập**
- `unlink_user_identity` (`040500:371-381`) đọc `canUnlink` rồi mới xoá, không khoá dòng nào. Với tài khoản Google + Facebook không có mật khẩu, gửi song song DELETE google và DELETE facebook: cả hai đều thấy `totalMethods=2` và cả hai đều xoá thành công.
- Đề xuất: `select ... from auth.users where id = p_user_id for update`, hoặc đếm lại sau khi xoá trong cùng transaction rồi raise nếu còn 0.

**M-03. `resetPassword` không xác minh phiên khôi phục; link dùng lại được (R-13); đổi được mật khẩu mà không cần mật khẩu cũ (R-14)**
- `auth-ext.service.ts:157-189`. `auth.getUser(accessToken)` nhận **bất kỳ** access token hợp lệ nào: không kiểm `amr` có `recovery`, không kiểm `iat >= recovery_sent_at`. `recovery_sent_at` không được xoá sau khi đặt lại, nên trong 1 giờ có thể đặt lại nhiều lần.
- Kịch bản: kẻ tấn công có access token bị lộ (XSS, máy dùng chung). Họ gọi `POST /auth/forgot-password` cho email nạn nhân (route public, chỉ cần Turnstile hợp lệ), rồi `POST /auth/reset-password {accessToken, newPassword}`. Mật khẩu bị đổi, các phiên khác (của nạn nhân) bị đăng xuất, nạn nhân mất tài khoản.
- Mock `getUser` (`auth-ext.e2e-spec.ts:108-111`) không mô hình `amr`. Vì vậy test "rejects a session that never had a recovery link" thực chất chỉ kiểm `recovery_sent_at = null`.
- Liên quan G5: `config.toml:241` đặt `secure_password_change = false`, nên phiên khôi phục có thể gọi thẳng `PUT /auth/v1/user {password}` của GoTrue trong suốt 24 giờ (`otp_expiry=86400`). Giới hạn 1 giờ của G5 chỉ có hiệu lực trên đường đi qua Nest. G6 không bao phủ trường hợp này, vì G6 chỉ nói về login/recover.
- Đề xuất:
  - Lấy `amr` từ JWT đã xác minh. Yêu cầu có `method: "recovery"` với timestamp ≥ `recovery_sent_at` và cách hiện tại không quá 1 giờ.
  - Vô hiệu hoá token sau khi dùng: lưu `session_id` đã dùng, hoặc `signOut(token,'global')`.
  - Ghi rủi ro `updateUser` trực tiếp vào gap register, hoặc bật `secure_password_change`.

**M-04. Bước xác nhận lại khi xoá tài khoản OAuth dựa trên `iat`, lách được bằng refresh (R-29)**
- `profile.service.ts:218-222`. Mỗi lần refresh ngầm, Supabase cấp access token mới với `iat` mới. Vì vậy "token vừa cấp" không chứng minh được người dùng vừa đăng nhập lại với nhà cung cấp. Ai đang giữ phiên (có refresh token) đều xoá được tài khoản.
- Đề xuất: dùng `amr[].timestamp` của phương thức OAuth (thời điểm xác thực thật), hoặc một luồng reauth riêng.

**M-05. AC-04 / R-20 "không tự gộp" chỉ chặn tài khoản có mật khẩu; tài khoản chỉ dùng OAuth vẫn bị GoTrue tự gộp**
- `guard_identity_insert` (`040500:98-123`):
  - Nhánh 2 chỉ chặn khi user đích có mật khẩu.
  - Nhánh 3 chỉ xét email trùng với một user **khác** (`id <> NEW.user_id`).
- Khi GoTrue auto-link Facebook (cùng email đã xác minh) vào một user chỉ có Google, `NEW.user_id` chính là user đó. Cả hai nhánh đều cho qua và tài khoản bị **tự gộp**, trái với R-20 ("OAuth có email trùng tài khoản đã có → không tự gộp").
- AC-04 mới chỉ được chứng minh bằng mock và bằng pgTAP chèn thẳng vào `auth.identities`. Chưa có e2e nào chạy với GoTrue thật. "Spike report" trong migration chỉ là văn bản, không kèm bằng chứng đã chạy.
- Đề xuất: chặn mọi INSERT identity OAuth vào user đã tồn tại khi không có cờ liên kết chủ động. Thêm smoke test với GoTrue local.

**M-06. Ghi bảng giá bằng service role làm mất actor trong audit (R-107) và bỏ qua lớp RLS**
- `pricing.service.ts:89-125, 144-281`: mọi insert/update/delete trên `holidays` và `price_rules` dùng `admin()`.
- Trigger `audit_row_change` ghi `actor_id = auth.uid()` (`core_identity_chain.sql:294`). Đi bằng service role thì mọi thay đổi giá và ngày lễ có **actor NULL**, nên không truy được ai đã đổi giá.
- Các policy RLS đã thiết kế (`pricing.sql:192-200`) cũng bị bỏ qua. Quyền chỉ còn dựa vào code Nest, trái quy ước `forUser(jwt)` mà catalog và cinema-ops đang tuân thủ.
- Đề xuất: dùng `forUser(user.jwt)` cho mọi thao tác ghi.

**M-07. Endpoint giá công khai chạy bằng service role, vượt thiết kế INVOKER của `price_quote`; lỗi bị nuốt; lộ message DB**
- Vị trí: `pricing.controller.ts:140-154`, `pricing.service.ts:307-404`.
- (a) `price_quote` cố ý là SECURITY INVOKER để RLS ẩn suất của rạp đóng và phim nháp (`pricing.sql:90-93`). Gọi bằng `admin()` thì khách báo giá được cả suất phim DRAFT, suất CANCELLED, rạp không OPEN.
- (b) `getShowtimePrices` bỏ qua `error` của cả 3 truy vấn rule (`:348-350`). Khi DB lỗi, hàm im lặng trả giá của cấp thấp hơn hoặc `null`, dẫn đến hiển thị sai giá (AC-15). Đây còn là bản cài đặt logic giá thứ hai (bằng TS) song song với bản SQL, nên dễ lệch nhau.
- (c) `quoteSeats` trả nguyên `error.message` của Postgres cho client (`:389-391`).
- (d) `seatIds` không có `max()` (`schemas/pricing.ts:195-197`). Các param `:showtimeId` và `:id` không được validate là uuid.
- Đề xuất: dùng client anon/forUser; kiểm `error`; map lỗi sang thông điệp cố định; thêm `seatIds.max(...)`; validate uuid cho param.

**M-08. Phân loại "Đang chiếu" sai khi số suất tương lai vượt 1000 (`max_rows`)**
- `movies.service.ts:323-333` (`showingMovieIds`) lấy **mọi** suất chưa kết thúc của cả chuỗi chỉ để lấy `movie_id`. PostgREST cắt im lặng ở `max_rows = 1000` (`config.toml:19`).
- Quy mô thực tế: 10 rạp × 8 phòng × 6 suất/ngày × 14 ngày ≈ 6.700 dòng. Phim nằm ngoài 1000 dòng đầu sẽ bị coi là `coming_soon`/`null` và biến mất khỏi trang chủ. Mỗi request vào trang chủ cũng phải kéo hàng nghìn dòng.
- `detail()` gọi cùng hàm này dù chỉ cần thông tin của một phim.
- Đề xuất: dùng RPC/view `distinct movie_id`, hoặc lọc theo danh sách phim đã lấy. Ở `detail` thì `eq("movie_id", id).limit(1)`.

**M-09. `replaceSeats` không atomic, có thể để phòng mất sạch ghế**
- `seat-layout.service.ts:289-304` xoá toàn bộ ghế rồi chèn lại. Nếu bước chèn lỗi thì "khôi phục" bằng một insert khác, nhưng **không kiểm tra lỗi** của insert khôi phục (`:301`). Insert khôi phục mà lỗi thì phòng còn 0 ghế. Hai Manager lưu cùng lúc thì các bước xen kẽ nhau.
- `order_seats.seat_id ON DELETE RESTRICT` (`booking_tables.sql:109`) khiến phòng đã từng bán vé không bao giờ sửa được sơ đồ, trong khi người dùng chỉ thấy lỗi 409 `REFERENCE` chung chung.
- Đề xuất: gói thao tác vào một RPC chạy trong một transaction, và trả thông điệp nghiệp vụ rõ ràng.

**M-10. Mọi rate limit theo IP sụp thành giới hạn chung toàn hệ thống khi đi sau proxy Next**
- `auth-ext.controller.ts:20-26` có ghi nhận vấn đề này. `apps/web/src/app/api/proxy/[...path]/route.ts:47-52` chỉ chuyển tiếp các header trong allowlist, **không có** `X-Forwarded-For`, nên `trust proxy` (`app.module.ts:49-52`) chỉ thấy IP của server Next.
- Hệ quả: `register:ip` 5/giờ, `login:ip` 10/phút, `forgot:ip` 10/giờ, `oauth:missing-email:ip` 10/giờ và Throttler 100/phút trở thành giới hạn **chung cho mọi khách**. Sáu người đăng ký trong một giờ là đủ khoá đăng ký cho toàn site.
- Mục này đang được ghi là follow-up ở layer 5 nhưng chưa có gate chặn deploy, nên tôi giữ ở mức MAJOR.
- Đề xuất: proxy chuyển IP của khách qua một header có ký, hoặc XFF kèm cấu hình hop đúng.

**M-11. Facebook không email (#18 / R-19): luồng chưa hoàn chỉnh và có rủi ro**
- `identity.service.ts:181-254`:
  - Không có endpoint consume `verification_token`, nên R-19 không bao giờ hoàn tất được.
  - `provider_access_token` và `verification_token` được lưu **plaintext** (`040500:46-49`).
  - Kết quả insert không được kiểm tra (`:219, 235, 243`); lỗi vẫn trả `CHECK_EMAIL`.
  - Không gắn với một phiên Facebook đã xác minh, nên có thể bị dùng để gửi mail hàng loạt tới bất kỳ địa chỉ nào (5 mail/giờ/email).
- Đề xuất: yêu cầu JWT của phiên FB vừa tạo, lưu hash của token, kiểm tra lỗi insert, thêm endpoint verify.

### MINOR

- **m-01** `auth-ext.service.ts:207-221`: email cảnh báo khoá (R-11, "gửi chủ tài khoản") được enqueue cho **mọi** email gõ vào, kể cả email không có tài khoản, nên có thể bị dùng để gửi mail tới địa chỉ bất kỳ. Khi có nhiều request song song, alert bị gửi trùng.
- **m-02** `auth-ext.service.ts:105-117`: lockout và captcha theo kiểu check-then-act. Các lượt đoán song song đã qua bước `is_login_locked` vẫn được thử mật khẩu.
- **m-03** `auth-ext.service.ts:92-97, 147-154`: timing lệch nhau theo R-12. Đăng ký với email trùng không gọi `resend`; quên mật khẩu với email tồn tại thì gửi mail đồng bộ.
- **m-04** `auth-ext.service.ts:270`: `termsVersion` là tuỳ chọn. Client bỏ trống thì vẫn được coi là đồng ý phiên bản hiện hành.
- **m-05** `identity.service.ts:137-174`: `addPassword` không yêu cầu xác thực lại; trả 400 trong khi auth-ext trả 422; tài khoản FB không email vẫn đặt được mật khẩu; kết quả insert outbox không được kiểm tra.
- **m-06** `auth.guard.ts:58-81`: xác minh JWT hoàn toàn cục bộ. Sau `deleteUser(id,true)` hoặc `signOut(...,'others')`, token cũ vẫn dùng được tới tối đa 1 giờ (`jwt_expiry=3600`). Phần thuật toán (alg) đạt: alg cố định theo nhánh, `none` và HS256-khi-chỉ-có-JWKS bị từ chối, JWKS lỗi thì trả 401 (fail-closed), có kiểm iss/aud/exp, token anon/service_role bị loại nhờ `aud`. JWT không lọt vào log: guard không log, `AllExceptionsFilter` chỉ log `message`/`stack`, và không controller nào log `req.user`.
- **m-07** `common/errors/all-exceptions.filter.ts:82-85`: PostgrestError/AuthError không phải `instanceof Error`, nên log chỉ còn `[object Object]` (thấy ngay trong output của `pnpm test`). Lỗi 5xx thật sẽ không chẩn đoán được.
- **m-08** `seat-layout.service.ts:73-80`: lỗi `23514` trả nguyên `error.message` của trigger DB cho client.
- **m-09** Phân quyền không nhất quán: Manager đổi được `cleaning_minutes`/`online_cutoff_minutes` qua `PATCH /cinemas/:id/settings` (`showtimes.controller.ts:156-165`), nhưng lại bị chặn khi đổi qua `PATCH /admin/cinemas/:id` (`shared/schemas/catalog.ts:80-86`). Cần chốt theo R-56.
- **m-10** `showtimes.service.ts:353-376`: R-54 chỉ xét đơn đã thanh toán. Suất có đơn `holding`/`pending_payment` vẫn đổi giờ/phòng được, nên đơn thanh toán sau đó có snapshot lệch.
- **m-11** `profile.service.ts:105-118`: đổi email trả 409 khi email đã có chủ, tạo oracle dò email cho người đã đăng nhập. Thao tác gửi mail này cũng không có rate limit.
- **m-12** `profile.service.ts:206-217`: xác nhận mật khẩu khi xoá tài khoản gọi thẳng `signInWithPassword` của GoTrue (bỏ qua lockout) và sinh ra thêm một phiên/refresh token không bao giờ bị thu hồi.
- **m-13** `env.ts:43`: `TURNSTILE_SECRET_KEY` vẫn là tuỳ chọn ở production. Turnstile fail-closed nên thiếu khoá thì đăng ký và quên mật khẩu chết hẳn, nhưng app không fail-fast khi khởi động.
- **m-14** `showtimes.service.ts:130-139`: `bulkCreate` truy vấn từng phòng tuần tự (N+1, có chặn trên nhưng chậm).
- **m-15** `auth-ext.module.ts:14-21`: dùng chung một `SUPABASE_ANON_CLIENT` singleton cho `signInWithPassword` của mọi user, trong khi supabase-js lưu phiên trong bộ nhớ của client. Đây là bẫy rò phiên chéo user nếu sau này có ai dùng `this.anon.from(...)`.
- **m-16** R-28 avatar: path do server sinh (`<uid>/<uuid>.<ext>`), đạt. Nhưng `sizeBytes`/`contentType` chỉ mang tính khai báo: signed upload URL không ràng buộc hai giá trị này, và bucket kiểm MIME theo Content-Type do người upload gửi. Chưa có resize (R-28 đang đánh dấu "cần xác nhận").
- **m-17** Vượt giới hạn kích thước (`max_file_lines: 300`, `max_function_lines: 50` trong `project-config.md`):
  - File: `showtimes.service.ts` ~607 dòng, `pricing.service.ts` ~433, `movies.service.ts` ~347, `auth-ext.service.ts` ~310, `seat-layout.service.ts` ~305.
  - Hàm: `PricingService.getShowtimePrices` (`:307-379`, ~72 dòng), `createPriceRule` (`:144-216`, ~72 dòng).
  - AI-readable gate: có 2 indicator (file/hàm quá dài và logic giá bị nhân đôi giữa TS và SQL), chưa tới ngưỡng 3 nên không tự gây FAIL.

### Ghi chú (không phải defect)
- `IdentityModule` và `PricingModule` **chưa được import** vào `app.module.ts`. Việc này đúng kế hoạch (`layer-5-task-09.md:14`), nên endpoint Nest của hai module hiện trả 404. Tuy nhiên phần DB của identity (C-01, C-03, M-01, M-02) **đang mở thật** qua PostgREST.
- R-14 (đổi mật khẩu phải nhập mật khẩu cũ) và R-15 (đăng xuất mọi thiết bị) chưa có endpoint ở Nest. Tôi chưa xác định được task nào sở hữu hai mục này. Vì `secure_password_change=false`, nếu web gọi thẳng `updateUser` thì R-14 bị vi phạm.
- Thứ tự APP_GUARD Auth → Roles → CinemaScope → Throttler đúng như thiết kế. CORS chỉ cho phép `WEB_ORIGIN` và không bật credentials; có helmet. Tôi đã quét mọi controller: các route ghi đều có `@Roles`/`@CinemaScope` hoặc nằm dưới `/me` (AuthGuard toàn cục). Các route `@Public` đều có lý do, trừ `auth/oauth/callback-check` (C-03).
- `database.types.ts` có đủ các đối tượng của migration mới nhất (`oauth_missing_email_requests`, `check_oauth_collision`, `link_user_identity`, `price_quote`, `cancel_showtimes`). Tôi chỉ so tên, chưa so từng cột.
- Các điểm đã đạt:
  - Password policy 8–72 byte, có chữ hoa, chữ thường và số.
  - `emailSchema` trim + lower, khớp `lower(btrim())` trong SQL.
  - Có `created_via='nest'`; tài khoản nhân sự tạo với `email_confirm:true`; không dùng `inviteUserByEmail`/`generateLink(signup)`.
  - `emailConfirmed` lấy từ `auth.users.email_confirmed_at`.
  - Biên 59/61 phút dùng đúng nguồn `recovery_sent_at` (nhưng xem M-03).
  - Resend: 60 giây và 5 lần/giờ.
  - Xoá tài khoản theo thứ tự an toàn và idempotent. Riêng `voucher_redemptions.user_id` chỉ được scrub (qua trigger) khi profile có email, nên chưa xử lý trường hợp tài khoản FB không email.

---

## 4. Đối chiếu báo cáo cũ

| Báo cáo | Kết luận cũ | Đánh giá của tôi |
|---|---|---|
| `build-filmbooking-layer-4-task-06-round-2-review.md` (identity) | STRICT PASS. Mục 4.1 khẳng định guard `auth.uid() is not null and ...` "ngăn chặn IDOR ở tầng database" | **Sai**. Chính guard này là lỗ hổng (C-01). Báo cáo không kiểm grant/revoke, và bỏ sót C-02, C-03, M-01, M-02, M-05. Bất biến "không mất phương thức đăng nhập" được kết luận chỉ dựa trên test không đổi role |
| `build-filmbooking-layer-3-task-06-round-1-review.md` (auth-ext) | STRICT PASS | Bỏ sót M-03, M-10, m-01..m-03. Biên 59/61 phút chỉ được kiểm trên mock |
| `build-filmbooking-layer-3-task-07-round-1-review.md` (profile) | STRICT PASS | Bỏ sót M-04, m-11, m-12, m-16 |
| `build-filmbooking-layer-3-task-04-round-1-review.md` (catalog) | STRICT PASS | Không nhắc `max_rows`/limit (grep không thấy), tức bỏ sót M-08 |
| `build-filmbooking-layer-3-task-05-round-1-review.md` (cinema-ops) | STRICT PASS | Không nhắc `replaceSeats`/restore/transaction (grep không thấy), tức bỏ sót M-09 |
| `build-filmbooking-layer-4-task-08-round-1-review.md` (pricing) | STRICT PASS. Dòng 63 xác nhận việc gọi `admin().rpc('price_quote')` là đúng | Không nhắc audit/INVOKER/forUser, tức bỏ sót M-06 và M-07. Còn coi việc gọi bằng service role là hợp lệ |
| `build-filmbooking-layer-3/4-phase-review.md` | COMPLETE / STRICT PASS | Kết luận không còn đứng được do có CRITICAL |

---

## 5. Chất lượng test: các bất biến hiện chỉ được chứng minh bằng mock (cần e2e/pgTAP thật)

1. **Lockout R-11/AC-03**: mock `register_login_failure` (`auth-ext.e2e-spec.ts:64-72`) khác bản SQL. Mock không có nhánh "khoá đã hết hạn thì đếm lại" và "không gia hạn khi đang khoá".
2. **Hạn 1 giờ và dùng một lần của link khôi phục**: mock `getUser` chấp nhận bất kỳ chuỗi `token-<id>` nào và không có `amr`.
3. **Chặn auto-link (AC-04/R-20)**: chưa có test nào qua GoTrue.
4. **Không cho huỷ phương thức cuối (AC-05)**: e2e mô phỏng lại RPC bằng JS. pgTAP không đổi role và không test chạy đồng thời.
5. **Quyền của RPC identity**: không có test nào `set local role anon` (test này sẽ bắt được C-01).
6. **RLS trên các đường `forUser`**: mock không áp RLS, nên "UPDATE bị RLS chặn trả 0 dòng thì 404" chỉ là giả định.
7. **Ánh xạ mã lỗi `23505`/`23P01`/`23503`/`42501`**: mã lỗi do mock tự trả về.
8. **Phân loại phim khi có hơn 1000 suất (M-08)**: chưa có test.
9. **Bảng giá**: e2e chỉ kiểm logic TS, không đối chiếu với `price_quote` SQL.

---

## 6. Verdict

**FAIL**: 3 CRITICAL, 11 MAJOR, 17 MINOR.
- C-01, C-03 và M-01 **khai thác được ngay qua PostgREST**, không phụ thuộc vào việc wiring module.
- Cách sửa C-01, C-03, M-01, M-02 bắt buộc là một **migration mới** (revoke và siết guard; không sửa migration đã apply). Đây là thay đổi quyền, không phá dữ liệu, nên không thuộc `HIGH_RISK_MIGRATION`.
- Cần vá C-01..C-03 và M-01..M-05 trước khi coi Layer 4 là đã đóng.
