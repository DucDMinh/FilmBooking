Agent: reviewer

# Review: feature-cyberplex-reskin · phase-3-task-07 · round 1

- **Review level:** STRICT
- **Reason:** gate cuối CR-010; đụng component dùng chung (Button qua `.staff-static`, SiteFooter mọi trang public, SeatMap, QuickBookBar, MovieGrid), a11y/focus (NFR-12), bằng chứng AC-32/NFR-19, cấu hình build (`next.config.ts`) và cấu hình e2e (`playwright.config.ts`).
- **Blast radius:** mọi trang public (footer có scrub mới), trang chủ (lưới phim, lưới rạp, hero), `/dat-ve` (SeatMap/SeatLegend), `/staff/*` (nút tắt hiệu ứng, CheckinResult), `/tai-khoan` (avatar, import), `/admin/audit-log` (sentinel), form đăng ký/đặt lại mật khẩu (chuỗi "8-72"), build web (distDir theo env), e2e cũ (`testIgnore`).
- **Không xét:** `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `package.json` (gốc), `apps/api/package.json`, `supabase/config.toml` (thay đổi có sẵn của user).

## Verify commands + kết quả (chạy độc lập, mỗi lệnh 1 lần)

agent-guard chỉ cho reviewer chạy lệnh trong allowlist cấp repo (chặn `cd apps/web && ...`, `pnpm -C`), nên dùng lệnh gốc tương đương (`pnpm -r`, có bao gồm apps/web):

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` (repo, gồm `apps/web eslint src`) | PASS, 0 lỗi |
| `pnpm typecheck` (repo, gồm `apps/web tsc --noEmit`) | PASS. Không chạy biến thể `tsconfig.verify.json` (cần `cd`, bị chặn); `tsc --noEmit` của web dùng tsconfig đầy đủ, đã bao quát src |
| `pnpm test` (repo) | PASS: shared 31/31, web 52 file / 650 test, api 29 file / 658 test, scripts 31/31 |
| `pnpm build` (repo, web `next build` vào `.next` mặc định) | PASS (Next 16.4.6, 41 trang tĩnh, đủ route). `git status` sau build không phát sinh file mới; `apps/web/tsconfig.json` không đổi |
| `pnpm exec playwright test -c playwright.scrub.config.ts` | **Blocked** bởi agent-guard (không nằm trong allowlist). Không đổi biến thể. Reviewer không khởi tiến trình nào ở 3105/4010. Số 20/20 PASS là của builder; reviewer đã đọc kỹ mã test (mục 2) |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, không nằm trong allowlist / ocr not installed |

## Kiểm bắt buộc

### 1. 07a an toàn

- (i) Dấu gạch: chỉ đổi chuỗi hiển thị. `audit-log-view.tsx:42` `ABSENT = "(không có)"` chỉ dùng trong `formatValue` (dòng 45) và hiển thị `recordId` (dòng 271); `diffAuditData` lọc bằng `JSON.stringify(b[field]) !== JSON.stringify(a[field])` trên giá trị thô (dòng 60) trước khi format, nên sentinel không đổi logic. "(không có)" ít khả năng trùng giá trị thật hơn "-" cũ. `auth-ui.tsx:108,148` "8-72" khớp test `auth-forms.test.tsx:311,316`. OK.
- (ii) SeatMap: `seat-map.tsx:44` hover chỉ gắn khi `state === "free" && !typeClass && !orphan`; VIP/SWEETBOX giữ vạch, ghế lẻ giữ khung danger (dòng 47). Diff `5204c59..549c003` của `seat-map.tsx`/`seat-legend.tsx` chỉ đổi class (hex `#12697A` -> `var(--color-info-line)`, `globals.css:44` có token đúng giá trị) và thêm mark "Hỏng"; không đụng aria-label, aria-pressed, aria-disabled, roving tabindex, aria-live, SeatMark. OK.
- (iii) Trang chủ: `MovieCard` dùng `key` + `movie` như cũ; bỏ được lớp `<Scrub kind="beam">` bọc ngoài (trước đây lồng 2 lớp `data-scrub="beam"`); `MovieCard` tự là `[data-scrub=beam]` với pha cột trong `movie-card.module.css:18-32` (4/3/1; mobile 2 cột nhưng `--n:1, --i:0` là chủ ý "mobile i=0"). Lưới rạp `.home-cinema-grid` (`home-hero.css` cuối file) pha 1/2/3 cột ở 0/768/1024 khớp `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` của `page.tsx:194`; `<Scrub>` rạp không truyền `i/n` nên không có inline đè. OK.
- (iv) Footer: `ScrubGroup n=4 className="scrub-inset-0 ..."`; `--scrub-inset` đặt trên chính phần tử có `view-timeline-inset` (`globals.css:366`) nên có hiệu lực. Tính tay: phần tử i=3 kết thúc ở `entry 84.5%`; vì đoạn chữ bản quyền nằm SAU nhóm, ở cuối trang hoặc nhóm đã vào hết (nhóm thấp hơn viewport) hoặc đỉnh nhóm đã vượt đỉnh viewport (nhóm cao hơn viewport, vd 375x667), nên tiến độ entry >= 100%: không kẹt ở mọi cỡ. `overflow-x-clip` không tạo scroll container nên view-timeline vẫn chạy, và chặn scroll ngang do `left/right`. Vẫn đủ 3 link pháp lý (`LEGAL_LINKS` không đổi). Link footer nhận focus được `[data-scrub]:focus-within` cứu. **Đường render đã kiểm qua import:** `SiteFooter` chỉ được render ở `app/(public)/layout.tsx`; các component mang scrub (`motion/scrub`, `SectionHeading`, `MovieCard/MovieGrid`, `showtime-schedule`, `movie-showtime-schedule`, `schedule-filters`, `seat-picker`) chỉ được import từ trang `(public)`; `app/admin/lich-chieu/page.tsx:37` khớp tên `ShowtimeSchedule` nhưng là hàm cục bộ, không import component catalog. Footer/scrub không lọt vào `/admin` hay `/staff`. OK.
- (v) `.staff-static :is(button, a, [role=button]) { transition:none; transform:none }` (`globals.css:410`): vòng focus của Button là `focus-visible:shadow-[inset...]` (box-shadow) và disabled là `opacity`/`pointer-events`, đều không bị ảnh hưởng; Tailwind v4 `translate-*`/`scale-*` là thuộc tính riêng nên `transform:none` không phá layout. `/staff` không dùng Dialog/Select/Popover (portal ra ngoài wrapper). `CheckinResult` vẫn đủ màu + icon (ô `chamfer-md`) + `h2` HEADLINE + message + "Mã: ..." + Details + HINT + nút; `role="alert"`, focus nút "Quét vé khác/Nhập lại mã" giữ nguyên. OK.
- (vi) `avatar-upload.tsx:156-159` span overlay `pointer-events-none absolute inset-0` nằm trong khung ảnh; nút chọn/xoá ảnh ở cột bên cạnh, không bị che. OK.
- (vii) `QuickBookBar`: cleanup chỉ huỷ timer/rAF khi unmount, luồng trả focus khi còn mount không đổi (vẫn `setTimeout(..., 0)`); `aria-label` chuyển lên `<form>` (form có tên = landmark hợp lệ). OK.

### 2. 07b

- `scrub.spec.ts` kiểm THẬT cho phần hiển thị/chuyển động: assert cụ thể trên `getComputedStyle` trong Chromium thật, không `expect(true)`, không `test.skip`/bỏ qua im lặng. (a) cuộn dần 0.4 màn/bước tới `scrollHeight - innerHeight`, chờ 2 frame mỗi bước và 2 frame cuối, gom lỗi opacity/clip/vạch/scroll ngang/console cho 14 route x 4 cỡ rồi `expect(problems).toEqual([])`. (b) `.qfield` -36px/.9 -> 0/1 -> trả đúng; thẻ phim thu về opacity 0. (c) đo khoảng cách bắt đầu/hoàn tất >= 200px. (d) reduced-motion 1/0/1 + hero không ghim. (e) focus trong vùng inset (assert opacity < 0.5 TRƯỚC focus rồi = 1 sau), Tab thật qua thẻ, Tab hết trang chủ qua QuickBookBar tới footer có chống kẹt. (f) `/dat-ve` phần tử trong khung nhìn opacity 1 + ghế không thu về. (g) hero 1366x657 và 1024x690. (h) kiểm mã nguồn admin/staff (chấp nhận, Residual).
- Ngoại lệ: phần "có vòng focus" của test (a11y) và cờ `ring` trong (e) gần như không thể đỏ (xem MINOR-2). Kết luận "không mất vòng focus" của reviewer dựa vào đọc mã (Button `focus-visible:shadow-[inset...]`, `.qfield select:focus-visible` outline 2px brand ở `home-hero.css:188-191`, `.staff-static` không đụng box-shadow), KHÔNG dựa vào test đó.
- `playwright.scrub.config.ts`: cổng 3105/4010 riêng, `reuseExistingServer:false` (cổng bận thì báo lỗi, không chiếm tiến trình khác), `NEXT_DIST_DIR=.next/scrub` cho cả build lẫn start, Supabase trỏ cổng chết 54399, khoá anon giả, Turnstile key test công khai. Không đụng 3000/3001 hay `.next/dev`.
- `next.config.ts`: `distDir` chỉ thêm khi có env `NEXT_DIST_DIR`; build thường đã PASS với `.next` mặc định.
- `playwright.config.ts`: `testIgnore: "scrub/**"` chỉ loại thư mục scrub; e2e cũ không có thư mục tên scrub.
- `mock-api.mjs`: không secret, không URL thật, chỉ dữ liệu giả; README đúng lệnh.
- Hero `.hs-title` `clamp(36px, min(7vw, 8.5svh), 112px)`: không vỡ layout; ở màn rộng cao cỡ chữ nhỏ hơn (MINOR-4), chấp nhận.

### 3. Rà tổng thể

- Em-dash/en-dash trong `apps/web/src` (trừ `__tests__`): còn 30 chỗ, **tất cả trong comment**; không còn trong chuỗi hiển thị.
- Hex thô ngoài `globals.css`: chỉ `layout.tsx:61` `themeColor` (meta, có chú thích = token) và `oauth-buttons.tsx` (màu logo Google/Facebook, chủ ý).
- `Inter`/`Rajdhani`: 0. `addEventListener('scroll'`: 0. glitch: chỉ trong comment "không glitch". `text-danger` làm chữ: 0 (dùng `text-danger-text`).
- `font-display` (Orbitron): chỉ wordmark "CINEMO", mã lỗi 404/500/403, tổng tiền (số), `DateChipText.subLabel` (dd/mm ASCII). Không áp lên chữ tiếng Việt có dấu.
- Residual phase 1-2 (task mục 7): đã xử lý hết các ý code. Giữ có chủ ý và đã ghi: `text-[27px]`, QR nền trắng. Chưa làm và đã ghi trong task: B5 reconcile docs as-built cũ, Lighthouse chính thức, axe, `UnverifiedEmailBanner` lệch hero (cần đăng nhập).

### 4. NFR-12 / NFR-19 / AC-32

Bằng chứng đủ để coi AC-32 **đạt cho phần khách không đăng nhập**: reduced-motion (CSS global `globals.css:218-220` + guard `no-preference` cho scrub/hero + test d), cuộn xuống/lên đảo ngược (b), cuộn tới cuối 4 cỡ màn không còn opacity < 1 và không scroll ngang (a), phần tử nhận focus luôn hiện (e, phần opacity), không hỗ trợ scroll-driven thì tĩnh (`@supports` guard), admin/staff không có scrub (h kiểm mã nguồn trực tiếp + reviewer kiểm đường import ở 1(iv)), CLS < 0.1 (PerformanceObserver), không animation tự lặp ngoài spinner loading. Chưa kiểm (Residual): chọn ghế khi đã đăng nhập, `/admin` và `/staff` runtime, Lighthouse chính thức, axe, vòng focus nhìn thấy bằng công cụ tự động (MINOR-2); bộ kiểm cuộn chưa được reviewer chạy lại (Blocked).

## Findings

### BLOCKER
Không có.

### MAJOR
Không có.

### MINOR (Residual)
1. `e2e/scrub/scrub.spec.ts:263` test (d) reduced-motion thiếu `/lich-chieu`, trong khi AC-32 nêu đích danh "trang chủ, danh sách phim, lịch chiếu"; cơ chế CSS là global nên rủi ro thấp. Đề xuất: thêm `/lich-chieu` vào danh sách route của (d).
2. `e2e/scrub/scrub.spec.ts:565` (a11y) và cờ `ring` ở `:349` (e) gần như không thể đỏ với control chamfer: Tailwind v4 `outline-hidden` tính ra `2px solid transparent` (lọt nhánh "outline"), nút framed vốn có `inset 0 0 0 1px` lúc nghỉ (lọt nhánh "box-shadow inset"). Vì vậy dòng 55 của task ("mọi phần tử nhận focus có dấu hiệu") **không phải bằng chứng NFR-12**. Đề xuất: so computed style trước/sau focus và loại màu transparent.
3. `e2e/scrub/scrub.spec.ts:45` bộ lọc console bỏ qua mọi lỗi chứa "status of 404" trên mọi route, không chỉ `/khong-co-trang-nay`. Đề xuất: chỉ bỏ qua 404 khi route là trang không tồn tại.
4. `apps/web/src/components/home/home-hero.css:63` `8.5svh` làm tiêu đề hero nhỏ hơn ~15% ở màn cao rộng (1920x1080 ~92px thay vì ~108px). Đề xuất: chấp nhận, hoặc chỉ áp `8.5svh` trong media `max-height` thấp nếu muốn giữ cỡ cũ.
5. `e2e/scrub/scrub.spec.ts:91` (a) loại `.hs-lead` vô điều kiện và chỉ kiểm opacity (không kiểm translate/scale). Đề xuất: chỉ loại `.hs-lead` khi nằm ngoài viewport.
6. Phạm vi route (a) thiếu vài trang public chỉ có scrub ở footer (`/huong-dan-xoa-du-lieu`, `/khong-co-quyen`, `/ve`) và cỡ 360px nêu ở task mục 3; phân tích tay footer `scrub-inset-0` cho thấy không kẹt. Đề xuất: thêm vào `GUEST_ROUTES`/SIZES khi tiện.
7. Build với `distDir=.next/scrub` nhiều khả năng làm Next ghi lại `apps/web/next-env.d.ts` (gitignore) trỏ sang `.next/scrub/types`, và `next build` thường có thể dọn `.next/scrub` khiến `SCRUB_SKIP_BUILD=1` hỏng (chưa xác minh, reviewer không có trạng thái trước). Đề xuất: ghi chú khả năng này trong `e2e/scrub/README.md`.
8. `e2e/scrub/scrub.spec.ts` 577 dòng (> 300) và không nằm trong `pnpm lint`/`pnpm typecheck` của repo. Đề xuất: tách helper sang file riêng khi sửa lần sau.
9. Test (h) `scrub.spec.ts:486-508` chỉ grep file nằm TRỰC TIẾP trong `app/admin|staff`, `components/admin|staff|checkin`, không theo import; một shell dùng chung mang scrub (như `SiteFooter` vừa thêm) nếu bị render trong admin/staff sẽ lọt. Hiện tại reviewer đã kiểm tay: không lọt. Đề xuất: thêm kiểm runtime hoặc kiểm import (admin-shell/staff layout không import `shell/site-footer`, `motion/scrub`).
10. Chưa làm (đã ghi trong task): B5 reconcile docs as-built cũ, Lighthouse chính thức, axe, chọn ghế khi đăng nhập, `/admin` `/staff` runtime, `UnverifiedEmailBanner` lệch hero.
11. Bộ kiểm cuộn **chưa được reviewer chạy lại** (agent-guard chặn). Đề xuất: session chính chạy 1 lần trước commit 07b, ghi số pass/fail vào task và xác nhận không còn tiến trình ở 3105/4010.

## Verdict

**STRICT PASS** (kèm Residual 1-11; không có BLOCKER/MAJOR). Lint/typecheck/test/build xanh khi chạy độc lập; thay đổi 07a không làm hỏng logic, a11y SeatMap, focus hay trạng thái disabled; scrub không lọt vào admin/staff (đã kiểm đường import); bộ kiểm 07b kiểm thật phần chuyển động/hiển thị, không nới ngưỡng (riêng kiểm vòng focus yếu, MINOR-2); cấu hình build/e2e không ảnh hưởng dev server hay build production.
