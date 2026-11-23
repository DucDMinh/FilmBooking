# Review: feature-nav-skeleton-first-row / phase-2 / task-02, round 1

Agent: reviewer

- Worktree: `E:\FilmBooking\.worktrees\feature-nav-skeleton-first-row__phase-2__task-02` (branch `wt/feature-nav-skeleton-first-row__phase-2__task-02`, commit `9ff8886`, base `a698ad6`)
- Spec: NFR-19 (câu cuối về dòng dữ liệu đầu), AC-35 ý 2, AC-32, design-spec §16.4

## Review level
**STRICT**

## Reason
Diff sửa `globals.css` (chuyển động theo cuộn dùng chung cho mọi trang khách) và component `Scrub`/`SectionHeading`/`ShowtimeSchedule`/`MovieGrid` dùng chung. Dễ hồi quy AC-32 (phần tử kẹt ẩn), reduced-motion, trình duyệt không hỗ trợ scroll-driven và `:focus-within`.

## Blast radius
Mọi trang khách có `[data-scrub]`: `/`, `/phim`, `/phim/[slug]`, `/lich-chieu`, `/rap`, `/rap/[code]`. Các phần không bị đụng: hero, `QuickBookBar`, `/dat-ve/*`, footer, admin/staff. Đã đối chiếu diff, không có thay đổi nào ở các phần này.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm --filter ./apps/web typecheck/lint/test` | Hook allowlist chặn. Thay bằng lệnh có trong allowlist bên dưới |
| `pnpm lint` (root worktree) | PASS (shared, api, web) |
| `pnpm typecheck` (root worktree) | FAIL chỉ ở `apps/api`: thiếu module `@nestjs/*`, `@filmbooking/shared`. Nguyên nhân là worktree chỉ có junction node_modules cho web. Diff không đụng `apps/api` nên đây là lỗi môi trường, không phải defect |
| `pnpm typecheck` (trong `apps/web`) | PASS (`tsc --noEmit` sạch) |
| `pnpm test` (trong `apps/web`) | PASS: 53 file, 691 test |
| `SCRUB_SKIP_BUILD=1 pnpm exec playwright test -c playwright.scrub.config.ts` | Hook allowlist chặn. Reviewer **chưa tự kiểm** con số 25/25; chỉ có evidence của builder |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, không có trong allowlist / chưa cài |

## Kết quả kiểm theo từng điểm

1. **CSS: thứ tự, độ ưu tiên và cổng điều kiện. OK.**
   - Các quy tắc mới nằm trong `@media (prefers-reduced-motion: no-preference)` + `@supports (animation-timeline: view())` (`globals.css:428-499`) và đứng sau mọi `animation-name` (`:444-455`).
   - Độ ưu tiên đủ thắng:
     - `[data-scrub][data-scrub-first]` (0,2,0) thắng `[data-scrub]` (0,1,0).
     - Quy tắc cho con (0,3,0) thắng `[data-scrub="beam"] [data-scrub-media]` (0,2,0).
     - Quy tắc lưới `> [data-scrub]:nth-child()` là (0,3,0), phần con (0,4,0).
   - Khi `animation: none`, các phần tử con về kiểu gốc:
     - wipe/media không có `clip-path` gốc.
     - rule (`@utility rule-brand`) không có `transform` gốc.
     - beam (`@utility scrub-beam`) có opacity gốc = 0, nên không còn tia quét.
   - Trình duyệt không hỗ trợ scroll-driven, và chế độ reduced-motion: các quy tắc không có hiệu lực, nội dung vẫn tĩnh và đủ như trước.
   - Không có `<Scrub>` lồng bên trong các khối `first`, nên không có phần tử con nào còn chạy animation.

2. **Số cột: lưới phim khớp đúng, lưới rạp đúng ở cỡ chữ mặc định.**
   - Lưới phim: module dùng `max-width: 1023px` → 3 cột, `559px` → 2 cột; khớp bảng 2/3/4 cột của builder.
   - Lưới rạp: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` khớp 1/2/3 cột ở `/` và `/rap`. Các thẻ `<Scrub>` là con trực tiếp của lưới.
   - `--i`/`--n` tính theo CỘT (`movie-card.module.css:18-32`, `home-hero.css:338-350`), nên bỏ hàng đầu không làm lệch pha hàng 2.
   - Lệch đơn vị px/rem: xem m-3.

3. **Phạm vi: đúng các trang trong mô tả. Riêng `/lich-chieu` có lỗi (M-1).**

4. **API của `first`: sạch.**
   - `first` không truyền hoặc `false` thì không ghi `data-scrub-first`; hành vi mặc định không đổi.
   - `SectionHeading` chỉ chuyển tiếp prop này xuống `Scrub`.

5. **Test.**
   - 7 test unit mới có kiểm thật: prop `first`, thứ tự quy tắc, bảng cột đối chiếu với `movie-card.module.css`.
   - e2e (b)(c)(e) chỉ đổi đối tượng kiểm sang thẻ hàng 2. (c) còn được thêm phần kiểm hàng 1 luôn hiện đủ.
   - (a) cuộn hết trang, (d) reduced-motion, (perf), (a11y) giữ nguyên, không bị làm yếu.
   - Test (i) có điểm yếu: xem M-2.

## Findings

### CRITICAL
Không có.

### MAJOR

**M-1. `/lich-chieu`: hàng thứ hai trở đi không còn chuyển động theo cuộn, trái AC-35 ("các hàng sau vẫn hiện dần theo cuộn").**

- Vị trí:
  - `apps/web/src/components/catalog/showtime-schedule.tsx:223`: `first={groupIndex === 0}`
  - `apps/web/src/app/(public)/lich-chieu/page.tsx:149-153` và `:176`
- Nguyên nhân: cờ `first` được xét theo từng instance `ShowtimeSchedule`, không theo cả mục dữ liệu của trang.
- Chế độ lọc theo rạp (`/lich-chieu?cinema=X`): `CinemaResults` tạo một `ShowtimeSchedule` cho mỗi phim, mỗi cái chỉ có `schedule=[{ cinema, showtimes }]` (1 phần tử). Vì vậy **mọi** khối suất đều có `groupIndex === 0` và nhận `data-scrub-first`. Cả danh sách kết quả không còn scrub ở hàng nào.
- Chế độ mặc định (`MovieResults`): mỗi `MovieBlock` dùng một `ShowtimeSchedule` riêng, nên khối rạp đầu của **mọi** phim đều đứng yên. Danh sách dài thì phần lớn khối mất chuyển động.
- Task file ghi lý do "mỗi khối phim ở /lich-chieu là một mục riêng". Lý do này không đứng được ở chế độ lọc theo rạp: mọi hàng đều thành "hàng đầu", không còn "hàng sau" nào để hiện dần.
- Hướng sửa gợi ý: chuyển `first` thành prop của `ShowtimeSchedule` (vd `firstRow?: boolean`).
  - `/phim/[slug]` (qua `MovieShowtimeSchedule`) truyền `true`.
  - Ở `/lich-chieu`, chỉ `MovieBlock` đầu tiên, hoặc phim đầu trong `CinemaResults`, truyền `true`.
  - Các khối còn lại không truyền.

**M-2. False-confidence test: tên test e2e (i) hứa kiểm hàng sau nhưng thân test không kiểm.**

- Vị trí: `e2e/scrub/scrub.spec.ts` (test `(i) hàng đầu không scrub ...`).
- Tên test ghi "hàng sau vẫn có phần tử scrub", nhưng thân test chỉ gom lỗi trên các phần tử `[data-e2e-first]`. Không có assertion nào khẳng định một phần tử không phải hàng đầu vẫn còn animation.
- Đó là lý do M-1 vẫn lọt qua dù bộ test báo 25/25 PASS.
- Cần thêm assertion: trên mỗi route có từ 2 hàng dữ liệu trở lên, ít nhất một `[data-scrub]` không mang `data-e2e-first` có `animation-name != none`, hoặc có opacity < 1 khi vừa vào vùng inset đáy. Phải gồm `/lich-chieu` ở chế độ lọc theo rạp nếu fixture có dữ liệu.

### MINOR

- **m-1.** Test (i) chạy ở 390/1280/1440/1920 nên khoảng 560-1023px chưa được kiểm trên trình duyệt (lưới phim 3 cột, lưới rạp 2 cột ở 768-1023). Khoảng này hiện chỉ có unit test so khớp chuỗi CSS. Nên thêm 1 cỡ như 820×1180.
- **m-2.** Test (i) chỉ báo lỗi `clip-path` khi chuỗi chứa `"100%"`, tức trạng thái đầu. Clip đang chạy giữa chừng (vd `inset(-8px 40% ...)`) sẽ không bị bắt. Hiện vô hại vì quy tắc dùng `animation: none`, nhưng điều kiện nên chặt hơn: `clip !== "none" && !/^inset\(-/...` hoặc so với giá trị cuối.
- **m-3.** Lệch đơn vị breakpoint của lưới rạp: Tailwind v4 dùng `md`/`lg` = `width >= 48rem/64rem`, còn `globals.css:483,489` dùng `min-width: 768px/1024px`.
  - Ở cỡ chữ mặc định 16px thì hai bên trùng nhau.
  - Nếu người dùng đổi cỡ chữ mặc định của trình duyệt, lưới đổi số cột ở mốc khác với quy tắc CSS. Khi đó thẻ cuối của hàng 1 vẫn scrub. Thẻ vẫn hiện đủ khi cuộn qua nên không vi phạm AC-32.
  - Nên dùng `48rem`/`64rem` cho khớp. Lưới phim dùng px ở cả hai phía nên không bị ảnh hưởng.
  - Ngoài ra có khe nhỏ ở bề rộng viewport lẻ (1023.5px, 559.5px) giữa `max-width: 1023px` và `min-width: 1024px`.
- **m-4.** Builder ghi lệch so với design-spec §16.4: thêm cơ chế `data-scrub-grid` ở container. Cơ chế này hợp lý, nhưng cần bổ sung vào design-spec ở bước doc reconcile.

## AI-readable gate
Đạt. Tên rõ, comment giải thích lý do (WHY), không có hàm dài, không có indirection quá 3 bước. Bảng số cột được ghi chú đồng bộ ở `movie-card.tsx` và `globals.css`.

## Verdict
**FAIL**. Có 2 MAJOR (M-1 lệch AC-35 ở `/lich-chieu`; M-2 test e2e (i) cho độ tin cậy giả). Builder cần sửa M-1 và M-2. Các MINOR nên sửa cùng lúc.
