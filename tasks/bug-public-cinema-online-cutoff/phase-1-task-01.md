# Bug public-cinema-online-cutoff · phase-1-task-01 — CinemaDto công khai thiếu mốc đóng bán hiệu lực (CR-011)

- Classification / Risk: BUG · severity=medium · scope=packages/shared (CinemaDto), apps/api catalog (cinemas.service.ts), apps/web (showtime-schedule.tsx, lib/quick-book.ts, QuickBookBar, trang gọi) · expected review level=NORMAL (DTO công khai dùng nhiều client → có thể STRICT) · blast radius: `/`, `/phim/[slug]`, `/rap/[code]`, `/lich-chieu`, mock API `e2e/scrub/mock-api.mjs`, bộ Playwright cuộn · doc impact: R-138 trong SPECIFICATIONS.md đang ghi "mốc mặc định 15 phút ... xem CR-011" → cần PATCH bump 3.5.1 (dispatcher làm ở close-out); `docs/API_SPEC.md` nếu có mô tả CinemaDto.
- Root cause (đã xác minh): 
  1. `apps/api/src/modules/catalog/cinemas.service.ts` (`CINEMA_COLUMNS`, `cinemaToDto`) không chọn/không trả `online_cutoff_minutes` nên `group.cinema.onlineCutoffMinutes` ở `apps/web/src/components/catalog/showtime-schedule.tsx` (R-44, hàm `isShowtimeOnlineClosed` ~:65) luôn rỗng → rơi về 15.
  2. `apps/web/src/lib/quick-book.ts:49` `DEFAULT_ONLINE_CUTOFF_MINUTES = 15` dùng cứng ở :69.
  3. Server ĐÃ áp đúng mốc: `supabase/migrations/20261112140000_hold_seats_hardening.sql:96,152-153` (`coalesce(c.online_cutoff_minutes, default_online_cutoff_minutes)`) → không cần sửa phía giữ ghế (acceptance 3 đã xác nhận bằng đọc code; thêm test nếu rẻ).
  4. Mặc định chuỗi: `app_settings.default_online_cutoff_minutes` (seed 15); loader mẫu `apps/api/src/modules/cinema-ops/showtimes.service.ts:~533-542` (`asMinutes`, fallback `FALLBACK_ONLINE_CUTOFF_MINUTES`) và `effectiveOnlineCutoffMinutes: row.online_cutoff_minutes ?? defaults.onlineCutoff` (:301) → tái dùng/chia sẻ cách tính, không nhân bản logic.
- Hướng sửa: `CinemaDto` công khai (schema shared `packages/shared/src/schemas/catalog.ts`) thêm `effectiveOnlineCutoffMinutes: number` (= mốc riêng của rạp, hoặc mặc định cấu hình chuỗi, hoặc 15 nếu thiếu). API tính và trả ở mọi chỗ dựng CinemaDto công khai (danh sách rạp, chi tiết rạp, lịch chiếu theo phim/rạp — kiểm mọi nơi `cinemaToDto`/dựng group.cinema). Web: `showtime-schedule.tsx` và `quick-book.ts`/QuickBookBar dùng giá trị này (mỗi suất theo rạp của nó), bỏ DEFAULT cứng trừ khi là fallback khi dữ liệu thiếu. Rạp không cấu hình mốc riêng: hành vi cũ (mặc định chuỗi).
- Acceptance: (từ `spec/changes/2026-11-19-public-cinema-online-cutoff.md`)
  - `CinemaDto` công khai có `effectiveOnlineCutoffMinutes`; schema shared + API + test.
  - `showtime-schedule.tsx` (R-44) và `quick-book.ts` (R-138) dùng mốc đó; test: rạp mốc 30 phút thì suất còn 20 phút không được liệt kê/không bấm được; rạp không cấu hình → vẫn 15.
  - Server giữ ghế áp đúng mốc rạp (đã xác nhận ở migration trên).
  - lint / typecheck / test / build PASS; bộ Playwright cuộn (`pnpm exec playwright test -c playwright.scrub.config.ts` ở gốc repo) vẫn xanh; cập nhật `e2e/scrub/mock-api.mjs` nếu schema đổi.
- Status: done (reviewer STRICT PASS round 2)

## Repro Verification
- Original repro: Cinema Manager đặt `online_cutoff_minutes` = 30 cho rạp; khách mở lịch chiếu (`/lich-chieu`, `/phim/[slug]`), `/rap/[code]` hoặc thanh Đặt vé nhanh ở `/` khi suất còn 20 phút.
- Expected: suất không còn bấm được / không được liệt kê (R-67, R-44, R-138); rạp không cấu hình mốc riêng vẫn theo mặc định chuỗi.
- Actual before fix: `CinemaDto` công khai không có mốc hiệu lực nên web luôn dùng 15 → suất còn 20 phút vẫn bấm được; `/rap/[code]` còn chưa kiểm mốc nào (mọi suất không huỷ đều là link).
- Actual after fix: DTO trả `effectiveOnlineCutoffMinutes` (mốc rạp ?? `app_settings.default_online_cutoff_minutes` ?? 15); `showtime-schedule.tsx`, `lib/quick-book.ts` và `/rap/[code]` dùng mốc đó theo từng rạp.
- Acceptance 3 (server giữ ghế áp đúng mốc rạp): xác nhận bằng đọc `supabase/migrations/20261112140000_hold_seats_hardening.sql:96,151-157` (`coalesce(c.online_cutoff_minutes, default_online_cutoff_minutes)`, so `now() >= starts_at - cutoff`); không đổi server.
- Evidence:
  - Test đỏ trước fix → xanh sau: API `apps/api/test/catalog.e2e-spec.ts` (6 test: mốc riêng 30, mặc định chuỗi 20, fallback 15, rạp đóng cửa vẫn trả mốc, nhóm rạp trong lịch phim); web `quick-book.test.ts` (3), `schedule.test.tsx` (1), `rap/[code]/__tests__/page.test.tsx` (mốc 30 + suất còn 20 phút → không link `/dat-ve/`, hiện "Mua tại quầy"; mốc 15 → vẫn link; đỏ khi bỏ fix).
  - lint, typecheck, test (shared 31, api 663, web 664, scripts 31), build: PASS; bộ Playwright cuộn 21/21 PASS (builder, trên cây trước sửa N1 một dòng import; dispatcher chạy lại lint/typecheck/test sau N1).
  - Reports: `.context/review-reports/bug-public-cinema-online-cutoff-phase-1-task-01-round-{1,2}-review.md` (round 1 FAIL: `/rap/[code]` còn bấm được, thiếu Repro Verification; round 2 STRICT PASS).
- Residual: `pnpm db:test` chưa chạy trên DB thật (quyền đọc `anon`/RLS đã đối chiếu migration); mốc đổi có thể trễ ~60s do ISR/cache; F4 (có từ trước): `app_settings.value` là JSON `null` thì TS ra 0, SQL `coalesce` ra 15; mỗi lần đọc rạp/lịch phim thêm 1 truy vấn `app_settings`.
- Doc impact: `docs/API_SPEC.md` (đã reconcile), `SPECIFICATIONS.md` R-138 (spec-publisher, PATCH 3.5.1).
- Status: PASS
