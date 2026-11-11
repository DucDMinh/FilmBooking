# Review độc lập (adversarial) — Layer 3+4: WEB + SEED + CI + QUY TRÌNH

- **Agent:** reviewer
- **Nhánh / HEAD:** `staging` @ `cece676` (tag `layer-4-done`)
- **Review level:** STRICT
- **Reason:** web công khai SEO + XSS; seed tạo tài khoản Admin/khoá POS (security, data); CI gate DB; tài liệu/tiến độ là source of truth.
- **Blast radius:** mọi trang khách công khai (`/`, `/phim`, `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`, sitemap/robots), DB local/CI (seed tự nạp), CI `db-test`, các tài liệu as-built.
- **Phương pháp:** tự đọc code trước, kết luận, sau đó mới đọc báo cáo cũ để đối chiếu (mục 6).

## 1. Phạm vi đã đọc

- Web (`git diff 218679a..HEAD -- apps/web`, 20 file): `(public)/page.tsx`, `phim/page.tsx`, `phim/[slug]/page.tsx`, `lich-chieu/page.tsx`, `rap/page.tsx`, `rap/[code]/page.tsx`, `robots.ts`, `sitemap.ts`, `components/catalog/*` (cinema-map, favorite-button, movie-card, movie-filters, province-picker-dialog, showtime-schedule), `booking/booking-stepper.tsx`, `lib/seo/*`, 3 file test catalog; đọc thêm `lib/api/client.ts`, `app/layout.tsx`, `next.config.ts`, `components/shell/site-header.tsx` (grep).
- Hợp đồng API thật: `apps/api/src/modules/catalog/{movies,cinemas}.service.ts`, `profile/profile.controller.ts` + `profile.service.ts` (favorite), `packages/shared/src/schemas/catalog.ts`.
- DB: `supabase/migrations/20261111010000_core_identity_chain.sql` (provinces, cinemas guard, consents, app_settings), `20261111020000_catalog.sql` (enum, seats exclusion), `20261111020100_security_ops.sql` (pos_api_keys), `supabase/tests/*.test.sql` (grep mã tỉnh/rạp).
- Seed: `supabase/seed.sql` (toàn bộ 1119 dòng), `supabase/seed/README.md`, `supabase/config.toml` (`[db.seed]`, `env(...)`).
- CI: `.github/workflows/ci.yml`, `package.json`, `pnpm-workspace.yaml`.
- Quy trình/tài liệu: `.context/progress.json`, `tasks/build-filmbooking/PLAN.md` (Follow-ups + G1–G9 + JWKS), `tasks/build-filmbooking/layer-4-task-{10,11,12}.md`, `docs/ERD.md`, `docs/dev-setup.md`, `.env.example`, `apps/api/src/config/env.ts`, `packages/shared/src/database.types.ts`, `SPECIFICATIONS.md` (R-34..R-46, NFR-08/13), `.context/design-spec.md` (màn 01–05, B10, ProvinceSelect, MapView, states).

## 2. Verify commands (cwd = repo root, từng lệnh riêng)

| Lệnh | Kết quả |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — shared 14, api 209 (14 file), web 89 (7 file) |
| `pnpm build` | PASS — mọi trang công khai đều `ƒ` (dynamic), sitemap revalidate 1h |
| DB (`db:start`/`db:test`) | không chạy (theo brief). Lỗi seed trùng tỉnh là lỗi đã biết |
| aislop | skip, chưa cài/không có trong allowlist |
| oxlint | skip, oxlint not configured |
| ocr | skip, ocr not installed |

Xanh ở đây **không** chứng minh hành vi: không có test nào cho `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`, thanh chọn ngày hay popup bản đồ. Đó đúng là những chỗ có lỗi bên dưới.

## 3. Findings — A. WEB

### CRITICAL

**A-C1. Stored XSS qua popup Leaflet, Manager rạp cũng cài được payload**
- `apps/web/src/components/catalog/cinema-map.tsx:115-132`: `cinemaName` và `address` được nội suy thô vào chuỗi HTML, rồi `marker.bindPopup(popupContent)`. Leaflet gán chuỗi này bằng `innerHTML`.
- Ai ghi được: `name`/`address` không nằm trong `CINEMA_ADMIN_ONLY_FIELDS` (`packages/shared/src/schemas/catalog.ts:80-86`). Trigger DB `cinemas_guard_manager_columns` chỉ chặn `code`/`status` (`20261111010000_core_identity_chain.sql:328`). Zod chỉ kiểm `trim().max(300)`. Kết quả: **Manager** của một rạp (không cần Admin) lưu được `address = "<img src=x onerror=...>"`.
- Kịch bản: khách mở `/rap/HN01` (hoặc `/rap` khi rạp đó là "featured") rồi bấm marker → JS chạy trên origin web. Cookie phiên là HttpOnly nhưng script vẫn gọi được `/api/proxy/*` bằng phiên của nạn nhân (đổi email/hồ sơ, xoá rạp yêu thích…). Nếu nạn nhân là Admin đang đăng nhập trên cùng origin thì nâng quyền.
- Đề xuất: không dựng HTML bằng chuỗi. Tạo node DOM (`document.createElement` + `textContent`), hoặc escape HTML cho `cinemaName`/`address`, hoặc dùng `bindPopup(() => el)`. Thêm test với payload `<img onerror>` và khẳng định không có phần tử `img` trong popup. (`directionsUrl` đã có `encodeURIComponent`/số nên an toàn.)
- Ghi chú: hai serializer JSON-LD (`movie-jsonld.ts:108`, `cinema-jsonld.ts:54`) escape `<` → **đủ** cho `application/ld+json`, không phải lỗ hổng. Chỉ trùng lặp code (A-m9).

### MAJOR

**A-M1. Lịch chiếu 7 ngày (R-44, R-37 trên trang phim) không hoạt động**
- API `detail()` chỉ trả **một ngày** (`movies.service.ts:255` `vnDayRange(options.date)`).
- `/phim/[slug]` (`page.tsx:222-226`) truyền `selectedDate={date}`:
  - Không có `?date`: thanh ngày đổi state nội bộ và lọc trên dữ liệu **của hôm nay** (`showtime-schedule.tsx:147-159`) → mọi ngày khác luôn "Không có suất chiếu", dù thực tế có suất.
  - Có `?date=X`: `activeDate = propSelectedDate ?? internalDate` (`showtime-schedule.tsx:115`) bị khoá theo prop và không có `onDateChange` → nút ngày **không làm gì**.
- `/lich-chieu` luôn truyền `selectedDate={activeDate}` (`lich-chieu/page.tsx:210,237`) → nút ngày chết hoàn toàn.
- Đề xuất: thanh ngày phải là `<Link href="?date=YYYY-MM-DD">` (giống `/rap/[code]`) để SSR fetch đúng ngày, hoặc API trả đủ 7 ngày. Thêm test tích hợp cho page (mock apiFetch theo `date`).

**A-M2. Bộ lọc `/lich-chieu` là UI chết**
- `lich-chieu/page.tsx:110-160`: ba `<select>` chỉ có `defaultValue`, không `onChange`, không `<form>`/submit, nằm trong Server Component. Đổi khu vực/phim/rạp **không có tác dụng gì**.
- Đề xuất: bọc trong `<form method="get">` có nút "Xem lịch" (chạy được không cần JS), hoặc tạo client component đẩy query.

**A-M3. R-35 (khu vực) chỉ làm được một phần**
- Không có `ProvinceSelect` trong header (`site-header.tsx` không có gì về province; design-spec §SiteHeader/`ProvinceSelect`). Sau khi cookie đã được đặt, người dùng **không có cách đổi tỉnh** ngoài việc tự gõ `?province=`.
- Không lưu vào hồ sơ khi đăng nhập: `province-picker-dialog.tsx:75-84` chỉ ghi cookie, không gọi `PUT /me/province`. Đây là AC của task-10 ("+ profile nếu đăng nhập") nhưng vẫn bị đánh `[x]`.
- "Lọc mọi lịch chiếu theo khu vực": `/phim/[slug]` (`page.tsx:73`), `/lich-chieu` (`page.tsx:48`) và `/rap` (`page.tsx:27`) **không đọc cookie `fb_province`**, chỉ đọc query. Trang chi tiết phim vì vậy hiện suất của cả nước.
- Dialog lệch B10 (design-spec:545): đóng được bằng click ngoài, không có nút "Để sau", tiêu đề khác, không hiển thị số rạp. Khi `/provinces` lỗi, dialog hiện mãi "Đang tải danh sách tỉnh thành..." (`:127-129`).

**A-M4. Phim đã hết chiếu (`availability: null`) hiển thị "Đang chiếu" kèm nút "Đặt vé"**
- `movie-card.tsx:28,66,127,149` và `phim/[slug]/page.tsx:82,133,199-205` đều làm `isComingSoon ? … : "Đang chiếu"`.
- `/phim` lấy mọi phim PUBLISHED (`movies.service.ts:232-242`), gồm cả phim `null`. Seed có nhiều phim như vậy (Dune, Oppenheimer, Exhuma, Joker… không có suất).
- Vi phạm quyết định #13 và gây hiểu nhầm. Đề xuất: xử lý nhánh `null` riêng ("Đã ngừng chiếu", không CTA).

**A-M5. Nuốt lỗi API: 500/timeout biến thành 404 hoặc trạng thái rỗng**
- `phim/[slug]/page.tsx:31-39` và `rap/[code]/page.tsx:75-84` trả `null` cho **mọi** lỗi, nên `notFound()` chạy khi API sập. Search engine nhận 404 cho trang có thật → de-index. `?date=abc` trên `/phim/[slug]` (không validate, API 400) cũng ra 404.
- Trang chủ, `/phim`, `/rap`, `/lich-chieu` dùng `.catch(() => [])`, nên outage hiển thị như "Chưa có phim" thay vì `ErrorState` theo section (design-spec:264).
- Đề xuất: chỉ trả `notFound()` khi `ApiError.status === 404`; lỗi khác thì `throw` (để `error.tsx` xử lý) hoặc render `ErrorState`.

**A-M6. `/rap/[code]` hiện suất đã qua giờ / `CLOSED` thành link đặt vé**
- `rap/[code]/page.tsx:378-399` chỉ ẩn `CANCELLED`, không áp mốc đóng bán online. API trả suất từ 00:00 hôm nay (`cinemas.service.ts:134-144`). Kết quả: suất 09:30 đã qua lúc 20:00 vẫn là `<Link href="/dat-ve/...">`, và `CLOSED` cũng vậy.
- Khác với `ShowtimeSchedule` (có "Mua tại quầy"). `languageMode` ở đây hiện thô kiểu "SUBTITLED" thay vì nhãn tiếng Việt.
- Đề xuất: tái dùng `isShowtimeOnlineClosed` + `LANGUAGE_MODE_LABELS`.

**A-M7. AC đánh `[x]` sai và yêu cầu UI bị bỏ**
- Task-10 AC "skeleton khi tải": không có `loading.tsx` nào trong `apps/web/src/app`.
- `/rap` (R-34, design-spec:132,281) yêu cầu nhóm theo tỉnh + `MapView` có marker mọi rạp. Hiện tại là danh sách phẳng và bản đồ chỉ cho **một** rạp "featured" (`rap/page.tsx:53-55,238-255`).
- `/phim` (R-43, design-spec:269) thiếu lọc Rạp, Ngày, Định dạng 2D/3D và tabs. Thể loại là danh sách cứng `COMMON_GENRES` (`movie-filters.tsx:11-22`) không khớp seed ("Chính kịch", "Trinh thám", "Lịch sử", "Tội phạm"… không chọn được).
- Trang chủ (D9, design-spec:53,130) thiếu khu "Rạp yêu thích" khi đăng nhập.

**A-M8. AI-friendly web gate: thiếu `llms.txt`**
- Không có `apps/web/public/` và không có route `llms.txt`. Theo gate ai-friendly-web của reviewer, web công khai thiếu `llms.txt` là MAJOR.
- (`robots.txt` và `sitemap.xml` có, và không chặn AI crawler.)

**A-M9. File quá 300 dòng**
- `rap/[code]/page.tsx` dài **414 dòng** (giới hạn 300). Báo cáo round-2 của task-12 chỉ đếm `rap/page.tsx`.
- Có thể tách `CinemaHeader`, `DateStrip`, `MovieShowtimeGroup` (DateStrip đang trùng với `generateNext7Days` của `showtime-schedule.tsx`).

**A-M10. `NEXT_PUBLIC_SITE_URL` thiếu trong `.env.example`, fallback là `https://filmbooking.local`**
- Dùng ở `sitemap.ts:13`, `robots.ts:9`, `rap/[code]/page.tsx:40`. Deploy mà quên biến này thì sitemap/robots/JSON-LD trỏ tới domain `.local` → SEO hỏng mà không có lỗi nào báo.
- Đề xuất: thêm vào `.env.example`, và fail build ở production nếu thiếu.

### MINOR

- **A-m1.** Mọi page title bị lặp brand: layout có template `"%s | CINEMO"` (`layout.tsx:17`) mà page title đã chứa "| CINEMO" → "Hệ thống rạp chiếu phim | CINEMO | CINEMO" (`rap/page.tsx:17`, `rap/[code]/page.tsx:100`, `phim/[slug]/page.tsx:54`, `lich-chieu/page.tsx:11`, `phim/page.tsx:14`, `page.tsx:26`). Thiếu OG cho `/rap/[code]`, `/rap`, `/phim`, trang chủ, và thiếu `alternates.canonical`.
- **A-m2.** Trang chủ chỉ có `<h1>` khi có banner (`page.tsx:104`). Không banner thì trang không có h1, và các section phim không có heading.
- **A-m3.** `/lich-chieu` nội suy `selectedCinemaCode`, `targetMovieSlug` vào path không encode (`:71,83`) và `province` vào query không encode (`:55`). `/phim/[slug]` cũng nội suy `slug` thô (`:32`). Tác động thấp vì gọi không token, nhưng là path/query injection tới API. Trang chủ nối `currentProvinceCode` không encode vào href tab (`page.tsx:132,144`).
- **A-m4.** Badge "Mở cửa" / "Đang hoạt động" cứng (`page.tsx:221-223`, `rap/[code]/page.tsx:191-193`) và fallback `"2D • 3D"` khi không có tiện ích (`page.tsx:242`) là thông tin bịa. Hotline mặc định "1900 8888" trong meta description (`rap/[code]/page.tsx:101`) cũng là số bịa.
- **A-m5.** Hiệu năng:
  - `<img>` thô không width/height/`sizes` (ảnh Unsplash full-size) → nguy cơ CLS/LCP (NFR-01).
  - `fetch` không cache/revalidate, mọi trang dynamic.
  - `/rap` gọi tuần tự (`provinces` → `cinemas` → token → profile).
  - `generateMetadata` và page fetch trùng (`rap/[code]` metadata luôn fetch ngày hôm nay, khác ngày của page).
- **A-m6.** `ShowtimeSchedule` là client component với `now = new Date()` mặc định (`showtime-schedule.tsx:108`) → có thể hydration mismatch quanh mốc cutoff hoặc nửa đêm. Cutoff cứng 15' phía client, trong khi rạp có `online_cutoff_minutes` riêng nhưng DTO công khai không trả.
- **A-m7.** JSON-LD `ScreeningEvent.subtitleLanguage = "SUBTITLED"` (`movie-jsonld.ts:75`) sai ngữ nghĩa schema.org (cần mã ngôn ngữ). Thiếu `workPresented`/`url`/địa chỉ location. `/rap/[code]` không có `ScreeningEvent` (R-46). `addressRegion` là mã nội bộ `HA_NOI`.
- **A-m8.** Ngày khởi chiếu trên `/phim/[slug]` hiện dạng `YYYY-MM-DD` (`:159,196`) và trong `showtime-schedule.tsx:137`, không theo dd/MM/yyyy.
- **A-m9.** DRY: hai serializer JSON-LD giống nhau; ba bản sao logic "7 ngày VN" và `formatVnTime`.
- **A-m10.** Link tới `/dat-ve/[id]` và `/dang-nhap` chưa có route (layer 5/6). Hiện là 404, chấp nhận tạm, cần theo dõi.

**Không phát hiện vấn đề:** token không rò ra client (SSR chỉ dùng `getServerAccessToken` + `accessToken` server-side, browser đi qua `/api/proxy`); Leaflet tải lazy chỉ ở client và **không** gọi `navigator.geolocation` (NFR-08 đạt); `robots.txt` chặn đủ `/admin`, `/staff`, `/pos`, `/tai-khoan`, `/dat-ve`, `/api`; sitemap có phim, rạp OPEN và trang pháp lý.

## 4. Findings — B. SEED

### MAJOR

**B-M1. Không có guard môi trường**
- `seed.sql` chỉ có comment cảnh báo, không có `do $$ … raise exception` nào. Với `[db.seed] enabled = true` (`config.toml:68-73`), một lần `supabase db reset --linked` (hoặc ai đó chạy psql tới staging) sẽ tạo **Admin `admin@filmbooking.local` với mật khẩu công khai `LocalDev@123!`** cùng 5 khoá POS đã biết plaintext.
- Đề xuất: đầu file thêm guard, ví dụ yêu cầu `current_setting('app.allow_demo_seed', true) = 'on'` (script local tự `set`). Hoặc kiểm `inet_server_addr()` là loopback/mạng docker, kèm `raise exception` cho các trường hợp khác.

**B-M2. Seed tự nạp làm hỏng pgTAP; đổi tên tỉnh trong test là không đủ**
- Test pgTAP insert cả `provinces 'Hà Nội'` lẫn `cinemas.code 'HN01'/'HN02'` (vd `supabase/tests/020_catalog.test.sql:42-45`; 10 file có 29 lần dùng). `cinemas.code` cũng unique, nên chỉ đổi tên tỉnh vẫn xung đột.
- **Đề xuất tốt nhất:**
  1. `[db.seed] enabled = false`. Ưu: pgTAP/CI chạy trên DB sạch, xác định được; bỏ luôn rủi ro `db reset --linked` seed lên remote. Nhược: dev phải chạy thêm một lệnh.
  2. Thêm `pnpm db:seed:demo`, chạy psql tới **cứng** `postgresql://postgres:postgres@127.0.0.1:54322/postgres` với `-v ON_ERROR_STOP=1` (kết hợp guard B-M1).
  3. CI: thêm bước nạp seed **hai lần** trên DB sạch sau `db:test`, để chứng minh idempotent.
  4. Cập nhật `docs/dev-setup.md:13` và `supabase/seed/README.md:58-63` (hiện ghi rằng `db:start` tự nạp seed).
- Phương án "test dùng tên/mã riêng" (ví dụ `TST_`) vẫn nên làm về lâu dài (test độc lập dữ liệu), nhưng phải sửa 10 file test và vẫn giữ rủi ro remote. Tắt auto-seed là cách đúng trước.

**B-M3. "Idempotent 100%" là sai**
- `consents` (`seed.sql:1076-1079`) dùng `on conflict do nothing` trong khi bảng không có unique (`20261111010000_core_identity_chain.sql:144-151`) → mỗi lần chạy lại nhân đôi bản ghi đồng ý.
- 8.1 (`seed.sql:698-750`) chạy lại sau vài giờ sẽ `update starts_at` hàng loạt suất demo. Nếu suất đã có đơn/vé thì làm dời giờ suất đã bán; khi update tuần tự, hai suất cùng phòng có thể chạm exclusion chống chồng giờ ở bước trung gian (cần kiểm trên DB).
- 8.2 và mục 4 lấy `from public.rooms r` (**mọi** phòng, không chỉ phòng seed) → chạy lại sau khi dev đã tạo phòng/suất qua UI sẽ chèn ghế/suất vào phòng lạ. Có thể nổ exclusion `23P01` hoặc tạo dữ liệu rác.
- Đề xuất: lọc `where r.id in (<16 id seed>)`; consents chèn `where not exists`; 8.1 chỉ insert khi chưa có.

**B-M4. Tài khoản seed có thể không đăng nhập được (cần kiểm bằng đăng nhập thật)**
- `auth.users` insert bỏ các cột `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new` (để NULL). GoTrue được biết là lỗi "converting NULL to string is unsupported" khi các cột này NULL → login 500. Hãy kiểm bằng cách đăng nhập `customer@filmbooking.local`. Nếu lỗi, set `''` cho các cột này.
- `staff.hn02` có `instance_id = '00000000-0000-0000-0000-000000000005'` (`seed.sql:928`), khác 5 user còn lại (`…0000`). Đây là lỗi gõ. Cần kiểm user này đăng nhập được không.

### MINOR

- **B-m1.** Timezone: `current_date` (`seed.sql:779`) là ngày theo **UTC** của session. Chạy seed lúc 00:00–06:59 giờ VN thì "day 0" là hôm qua: 3 suất ở quá khứ và chỉ còn 6 ngày tương lai. Dùng `(now() at time zone 'Asia/Ho_Chi_Minh')::date`.
- **B-m2.** Dữ liệu nghiệp vụ:
  - `title_vi` chứa "(Sắp Chiếu)" (`:506,527`), trong khi trạng thái phải tính theo quyết định #13.
  - DN01 ghi quận "Hải Châu" nhưng địa chỉ thuộc Sơn Trà (`:106-108`).
  - Tên rạp "FilmBooking …" lệch brand UI "CINEMO".
  - Mọi trailer là cùng một link YouTube placeholder.
  - Poster trùng nhau (phim 1 và 6).
- **B-m3.** Bí mật dev: plaintext `LocalDev@123!` và `pos_*_secret_dev_key_2026` chỉ có trong `supabase/seed.sql`, `supabase/seed/README.md` và một report review. Không có trong CI, `apps/`, `docs/`, `.env.example`, hay bundle web → **sạch**. Rủi ro còn lại chỉ là B-M1.

## 5. Findings — C. CI (`.github/workflows/ci.yml`)

### MAJOR

- **C-M1.** Job `db-test` (`ci.yml:56-57`) **đỏ chắc chắn** vì auto-seed (lỗi đã biết). Nhưng `layer-4-done` vẫn được tag và phase review ghi COMPLETE. Cách sửa: B-M2.
- **C-M2.** CI không có gate drift kiểu DB: không có bước `supabase gen types … ` rồi `git diff --exit-code packages/shared/src/database.types.ts`. Có thêm nguy cơ do `db:types` vẫn dùng redirect `>` (`package.json:20`) sẽ xoá trắng file khi gen lỗi. Follow-up L0-T01 MINOR 3 **vẫn mở**.

### MINOR

- **C-m1.** Không chạy `test:int`/e2e Nest trên DB thật. Unit test API dùng mock nên mất lớp kiểm cross-boundary trong CI.
- **C-m2.** `supabase start` kéo mọi service (studio, imgproxy, realtime, edge…), chậm và dễ chạm timeout 20'. Dùng `supabase start -x studio,imgproxy,vector,logflare,edge-runtime` và cache Docker nếu được.
- **C-m3.** Không có bước nạp seed (sau khi tắt auto-seed) để bắt lỗi seed sớm (xem B-M2.3).
- **OK:** pnpm lấy từ `packageManager` (10.28.0); `onlyBuiltDependencies` có `supabase` (`pnpm-workspace.yaml:6-10`) nên binary CLI cài được; các `env(...)` bắt buộc của config (Google, Facebook, Turnstile, Resend) đều có placeholder; `permissions: contents: read`; `concurrency` đúng; trigger push/PR vào `staging`.

## 6. Findings — D. QUY TRÌNH / TÀI LIỆU

### MAJOR

- **D-M1.** `.context/progress.json:131-177`: 12 entry layer-4 **thiếu `review`/`round`/`report`** (layer 0–3 đều có). `currentLayer: 5` được đặt trong khi CI `db-test` đỏ và các defect ở mục A/B chưa xử lý.
- **D-M2.** `.env.example` lệch với code:
  - Thiếu `NEXT_PUBLIC_SITE_URL` (A-M10).
  - Thiếu `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `TRUST_PROXY_HOPS` (có trong `apps/api/src/config/env.ts:34-38`). Đây là biến **bắt buộc khi deploy Supabase cloud dùng JWKS**.
  - Ngược lại, có `RESEND_FROM_EMAIL` nhưng schema env không đọc biến này.
- **D-M3.** Task file `layer-4-task-10.md` đánh `[x]` cho AC chưa đạt (skeleton, lưu profile), và `layer-4-task-11/12` đánh `[x]` "Reviewer độc lập PASS" dựa trên các review đã bỏ sót A-C1/A-M1/A-M2.

### MINOR

- **D-m1.** `docs/dev-setup.md:13` và `supabase/seed/README.md:58-66` mô tả auto-seed và "Idempotent 100%" (sai, xem B-M3). `dev-setup` không nhắc `NEXT_PUBLIC_SITE_URL` / JWKS.
- **D-m2.** `packages/shared/src/database.types.ts` có định dạng bất thường (không qua prettier, dòng đầu trống). Đối chiếu tay: đủ bảng mới L3–4 (`affected_order_cases`, `pos_requests`, `oauth_missing_email_requests`, `seat_status_public`) và đủ RPC (`hold_seats`, `confirm_paid`, `apply_voucher`, `cancel_showtimes`, `report_*`, `set_cinema_status`, …). Chưa thấy drift, nhưng không có gate CI (C-M2).
- **D-m3.** `docs/ERD.md`: đã có đủ bảng mới (gồm `pos_requests`, `affected_order_cases`, `oauth_missing_email_requests`, `seat_status_public`, `login_attempts`, `email_outbox`) → **ĐẠT**.

### Trạng thái follow-up trong PLAN.md (chỉ ghi DONE khi có bằng chứng)

| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| JWKS (HIGH khi deploy) | DONE (code) / **mở ở tài liệu** | `auth.guard.ts:4,38,65-66` (`createRemoteJWKSet`), `env.ts:34`. Thiếu trong `.env.example` (D-M2) |
| L2-T03 n1 issuer | DONE | `env.ts:36`, `auth.guard.ts:39` |
| trust proxy | DONE | `app.module.ts:51`, `env.ts:38` |
| G1 recompute `ends_at` + một nguồn dọn phòng | DONE | `20261111030020_catalog_fixes.sql:5-107` |
| G5 reset 1h qua `recovery_sent_at` | DONE | `auth-ext.service.ts:166-169` |
| L0-T01 MINOR 1 `percentOfVnd` | DONE | `money.ts:32` (RangeError 0..100) |
| L0-T01 MINOR 2 Invalid Date | DONE | `time.ts:28,43` |
| L0-T01 MINOR 3 `db:types` redirect `>` | **MỞ** | `package.json:20` |
| L2-T02 M5/M6 hardening | DONE (có migration) | `20261111030010_security_ops_hardening.sql:14,37,73` (chưa kiểm sâu nội dung) |
| L2-T04 close-out `API_URL` | DONE | `.env.example` có `API_URL` |
| G2 RLS showtimes theo trạng thái rạp | chưa kiểm (API lọc `cinemas.status = OPEN` tại `movies.service.ts:261`; RLS chưa kiểm) | — |
| G3 AC-16 qua `/change` | chưa kiểm (không thấy file trong phạm vi đã đọc) | — |
| G4 LEGAL_VERSION | mở, giao layer-5-task-10 | — |
| G6 | user chấp nhận rủi ro | — |
| G8, G9 | mở (trước go-live / `/change`) | — |
| Hardening CSP/headers (layer 8) | mở. `next.config.ts` chưa có header bảo mật; A-C1 cho thấy CSP chặt là cần thiết | — |
| Các mục L1-T03 MINOR 1/2/4/5, L2-T04 MINOR 1–4, L2-T02 khác | chưa kiểm trong review này | — |

## 7. Đối chiếu báo cáo cũ (đọc sau khi đã kết luận)

- **Task-12 round-2 (STRICT PASS)** khẳng định nguy cơ Stored XSS đã bị "ngăn chặn triệt để", nhưng **bỏ sót popup Leaflet** (A-C1). Báo cáo ghi file "≤300 dòng" chỉ cho `rap/page.tsx`; `rap/[code]/page.tsx` dài 414 dòng. "Defect 5 đã sửa triệt để" thực chất chỉ là một bản đồ cho một rạp, chưa phải `MapView` nhóm theo tỉnh.
- **Task-11 (STRICT PASS)** mô tả `/lich-chieu` "gom nhóm và render" mà không phát hiện select chết (A-M2), thanh ngày chết hoặc sai dữ liệu (A-M1), và `?date` sai ra 404 (A-M5).
- **Task-10 (PASS)** chấp nhận AC "skeleton khi tải" chỉ dựa trên EmptyState, và coi `.catch(() => [])` là "graceful", trong khi chính điều đó che giấu sự cố (A-M5). Không phát hiện thiếu lưu profile và thiếu ProvinceSelect (A-M3), hay bug `availability: null` (A-M4).
- **Task-09 (NORMAL PASS)** khẳng định "Idempotent 100%", sai (B-M3). Không phát hiện auto-seed phá pgTAP, thiếu guard môi trường, lỗi `instance_id`, cột token NULL, hay timezone.
- **Phase review layer-4 (COMPLETE / STRICT PASS)** dẫn "385 pgTAP tests" như đã kiểm chứng, nhưng trên DB sạch có seed thì 10 file FAIL. Tức là bằng chứng được lấy trên môi trường khác CI. Phase review cũng không nhận ra `progress.json` thiếu trường review.

## 8. Verdict

| Mục | Verdict | Lý do chặn |
|---|---|---|
| **A. Web** | **FAIL** | A-C1 (XSS), A-M1, A-M2, A-M3, A-M4, A-M5, A-M6, A-M7, A-M8, A-M9, A-M10 |
| **B. Seed** | **FAIL** | B-M1 (không guard), B-M2 (phá pgTAP), B-M3 (không idempotent), B-M4 (cần xác minh đăng nhập) |
| **C. CI** | **FAIL** | C-M1 (`db-test` đỏ), C-M2 (không gate drift kiểu, `db:types` nguy hiểm) |
| **D. Quy trình/tài liệu** | **FAIL** | D-M1 (progress thiếu trường review, nâng layer khi CI đỏ), D-M2 (`.env.example` thiếu biến deploy bắt buộc), D-M3 (AC đánh dấu sai) |

**Tổng: FAIL.** Thứ tự sửa đề xuất:
1. A-C1
2. B-M1 + B-M2 (tắt auto-seed, thêm `db:seed:demo` có guard; CI xanh lại)
3. A-M1 + A-M2 + A-M5 + A-M6
4. A-M3 + A-M4
5. D-M1 + D-M2
6. Phần còn lại (A-M7…A-M10, MINOR)
