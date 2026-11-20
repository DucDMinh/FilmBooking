# Review: bug-public-cinema-online-cutoff / phase-1-task-01 / round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** đổi `CinemaDto` công khai (shared interface, nhiều client: `/`, `/rap`, `/rap/[code]`, `/lich-chieu`, `/phim/[slug]`, admin), shared service helper (`chain-defaults.ts` dùng chung với `showtimes.service.ts`), dữ liệu cấu hình rạp ra endpoint anon.
- **Blast radius:** API `GET /cinemas`, `GET /cinemas/:code`, `GET /movies/:slug` (`schedule[].cinema`), `GET/POST/PATCH /admin/cinemas*`, `GET /cinemas/:id/settings` (refactor); web `ShowtimeSchedule` (R-44), `QuickBookBar`/`lib/quick-book.ts` (R-138), `/lich-chieu`, `/phim/[slug]`; mock `e2e/scrub/mock-api.mjs`; 5 fixture test web.

## Verify commands + result (chạy độc lập)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared/api/web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: shared 31, api 663 (29 file), web 662 (53 file), scripts 31 |
| `pnpm build` | không chạy lại (tin báo cáo builder) |
| Playwright scrub 21/21 | không chạy được trong vai reviewer; tin báo cáo builder |
| `pnpm db:test` (integration DB thật) | không chạy (Docker/DB không khởi động trong phiên review) → residual risk, xem dưới |
| oxlint | skip, oxlint not configured (không có `.oxlintrc.json` ở repo) |
| aislop | skip, `aislop` not installed (exit 127) |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A (không đổi trang/route công khai mới, không đụng robots/sitemap) |

## Đối chiếu chéo DB (evidence, không phải finding)

- Quyền cột: `supabase/migrations/20261111010000_core_identity_chain.sql:407` `grant select on public.cinemas to anon, authenticated` (table-level), không có `revoke select` sau đó → anon chọn `online_cutoff_minutes` không gặp 42501. `20261118100000_cinema_status_schedule.sql:43` chỉ thêm grant cột `scheduled_*`.
- `app_settings`: `core_identity_chain.sql:447-449` anon/authenticated SELECT + policy `using (true)` → `readChainDefaults(publicClient())` chạy được bằng anon key; seed `'15'::jsonb` (:346) → supabase-js trả number 15, khớp mock `value: 20/25`.
- Server giữ ghế: `20261112140000_hold_seats_hardening.sql:151-157` `coalesce(c.online_cutoff_minutes, app_settings, 15)` và `now() >= starts_at - cutoff` → cùng thứ tự ưu tiên và cùng biên `>=` với `isShowtimeOnlineClosed` (`showtime-schedule.tsx:77`). Đây là định nghĩa `hold_seats` mới nhất (không migration nào sau định nghĩa lại).

## Trả lời 7 câu hỏi kiểm

1. **Mọi nơi dựng CinemaDto / `group.cinema`:** `cinemaToDto` là điểm dựng duy nhất (listPublic, detailPublic cả nhánh không-OPEN, listAdmin/getAdmin qua `adminCinemaToDto`, create, update cả nhánh `onlyStatusGiven`); `groupByCinema` ở `movies.service.ts:339-347`. Thứ tự ưu tiên đúng (`??`: rạp → app_settings → 15). Không còn nơi nào khác trong `apps/api/src` trả rạp cho client công khai (profile chỉ trả `cinema_id`). Cache: `PUBLIC_CACHE = { next: { revalidate: 60 } }` → sau khi Manager đổi mốc, web có thể dùng mốc cũ tối đa ~60s; server giữ ghế vẫn chặn đúng → chấp nhận, ghi nhận.
2. **Lộ dữ liệu:** DTO chỉ trả `effectiveOnlineCutoffMinutes`, không có `onlineCutoffMinutes`/`online_cutoff_minutes`/`cleaning*`. Test "không lộ cấu hình" đổi từ "không select `online_cutoff_minutes`" sang "không select `cleaning_minutes` + DTO không có thuộc tính thô": không làm yếu bảo đảm thực tế vì cột này vốn anon đọc trực tiếp được qua PostgREST (grant table-level), giá trị hiệu lực cũng suy ra được từ `app_settings` công khai.
3. **Refactor `chain-defaults.ts`:** di chuyển nguyên văn (hằng 15/15, `asMinutes`, query `in("key", …)`, `throwDbError`); `effectiveOnlineCutoff(a, b) = a ?? b` giống hệt biểu thức cũ ở `showtimes.service.ts:300`. `effectiveCleaningMinutes` không đổi. Hành vi admin settings giữ nguyên.
4. **Web:** `showtime-schedule.tsx:230` `group.cinema.effectiveOnlineCutoffMinutes ?? onlineCutoffMinutes(15)`; `quick-book.ts:75` `showtime.onlineCutoffMinutes ?? 15`, gán từ `detail.cinema.effectiveOnlineCutoffMinutes` mỗi rạp (`:165-168`). Mốc 0 giữ 0 (dùng `??` không phải `||`). Biên: đúng bằng mốc → đóng (`>=`), khớp SQL. Thiếu dữ liệu → 15.
5. **Test đỏ khi bỏ fix:** có. API: list/detail kỳ vọng 30/20/15/45 và schedule `[["HN01",30],["HN02",25]]` → `undefined` nếu bỏ field. Web: schedule test rạp mốc 30 kỳ vọng không có link → đỏ nếu còn đọc `onlineCutoffMinutes`; quick-book test `st-30` bị loại và `loaded[0].onlineCutoffMinutes === 30` → đỏ nếu còn hardcode 15. Không tautology.
6. **Schema shared:** `CinemaDto` là TS interface, không có Zod schema parse response → field required chỉ ảnh hưởng fixture (đã cập nhật 5 file + mock-api), typecheck xanh. `AdminCinemaDto extends CinemaDto` được điền qua `adminCinemaToDto`. Integration spec `catalog-public.int-spec.ts:260` dùng `toMatchObject` → không vỡ vì thêm key.
7. **docs/API_SPEC.md:** CÓ cần reconcile: `:84` (`GET /cinemas` liệt kê trường thêm của `CinemaDto`), `:85` (`GET /cinemas/:code`, câu "chỉ chọn cột công khai" giờ có thêm `online_cutoff_minutes` nhưng chỉ trả mốc hiệu lực), `:88` (`GET /movies/:slug` nên ghi `schedule[].cinema.effectiveOnlineCutoffMinutes`). Việc close-out, không chặn review.

## Findings

### F1 — MAJOR (blocking): `/rap/[code]` vẫn liệt kê và cho bấm suất đã quá mốc đóng bán
- `apps/web/src/app/(public)/rap/[code]/page.tsx:400-412`: mọi suất không `CANCELLED` render `ShowtimeLinkChip href=/dat-ve/<id>`, không gọi `isShowtimeOnlineClosed`, không dùng `cinema.effectiveOnlineCutoffMinutes` (kể cả suất `CLOSED` hay đã quá mốc).
- Change doc `spec/changes/2026-11-19-public-cinema-online-cutoff.md:16-18` nêu `/rap/[code]` là route bị lỗi, Expected "suất đó không còn được liệt kê/bấm được"; task file blast radius cũng liệt kê `/rap/[code]`. R-67 (`SPECIFICATIONS.md:179`) yêu cầu sau mốc hiển thị "Ngừng bán online — vui lòng mua tại quầy". Phát lại repro trên route này sau fix vẫn FAIL.
- Sửa: trong page rạp, dùng `isShowtimeOnlineClosed(st.startsAt, st.status, cinema.effectiveOnlineCutoffMinutes ?? 15, now)` cho từng chip: đóng → hiện trạng thái không bấm được (giống `ShowtimeSchedule`, "Mua tại quầy"), còn bán → link. Thêm test `rap/[code]/__tests__/page.test.tsx`: rạp mốc 30, suất còn 20 phút → không có link `/dat-ve/...`; rạp mốc 15 → có link. Lưu ý trang dùng ISR 60s nên trạng thái đóng có thể trễ tới ~60s (chấp nhận, server chặn đúng); nếu cần chính xác hơn có thể tách phần chip thành client component tính `now` ở client, nhưng không bắt buộc.

### F2 — MAJOR (blocking, unverifiable): task file thiếu `Repro Verification`
- `tasks/bug-public-cinema-online-cutoff/phase-1-task-01.md` không có mục `Repro Verification` (bắt buộc với bug task theo `.agent/workflows/state-commit.md:82`); Status vẫn `in_progress`; journal builder chỉ ghi "test do->xanh".
- Sửa: thêm `Repro Verification` với status PASS, liệt kê test chứng minh repro (tên test API `catalog.e2e-spec.ts` "rạp có mốc riêng 30…", "movie schedule per-cinema online cutoff", web `schedule.test.tsx` "rạp mốc 30 phút…", `quick-book.test.ts` "mốc đóng bán online riêng của rạp…", và test mới cho `/rap/[code]` ở F1) + lệnh verify và kết quả; ghi rõ acceptance 3 (server giữ ghế) xác nhận bằng đọc `hold_seats_hardening.sql:151-157`.

### F3 — MINOR: thêm một round trip tuần tự trên trang chi tiết rạp
- `apps/api/src/modules/catalog/cinemas.service.ts:161`: `await this.chainOnlineCutoff(db)` chạy trước `Promise.all([rooms, showtimes])`, thêm 1 truy vấn nối tiếp cho trang thuộc NFR-01 (API p95 ≤ 500ms). Có thể gộp vào `Promise.all`. Tương tự `movies.service.ts:273` gọi `readChainDefaults` sau các truy vấn khác. Không chặn.

### F4 — NOTE (có từ trước, không phải hồi quy): lệch nhỏ giữa TS và SQL khi `app_settings.value` là JSON `null`
- `chain-defaults.ts:15-17`: `Number(null) = 0` → mốc mặc định 0; SQL `coalesce((value #>> '{}')::integer, 15)` → 15. Code chuyển nguyên văn từ `showtimes.service.ts`, không đổi hành vi. Ghi nhận để xử lý riêng nếu muốn (vd coi `null` là thiếu).

### F5 — NOTE: doc impact
- `docs/API_SPEC.md:84,85,88` cần thêm `effectiveOnlineCutoffMinutes` (xem mục 7). SPECIFICATIONS R-138 PATCH 3.5.1 như task ghi (dispatcher làm ở close-out).

## Residual risk
- Integration DB thật (`pnpm db:test`) chưa chạy trong review: đã đối chiếu grant/RLS bằng đọc migration nên rủi ro 42501 thấp, nhưng chưa có bằng chứng chạy thật cho truy vấn anon `online_cutoff_minutes` + `app_settings`. Khuyến nghị chạy `pnpm db:test` trước commit nếu môi trường cho phép.
- Playwright scrub và `pnpm build` tin theo báo cáo builder.

## Code quality / AI-readable
- Diff hẹp, đúng scope, không drive-by refactor (refactor `chain-defaults.ts` là yêu cầu "không nhân bản logic" của task). Tên rõ, không magic number mới (15 nằm trong hằng có tên). Không có hàm > 50 dòng mới. AI-chaos indicators: 0.

## Verdict: FAIL

Lý do: F1 (route `/rap/[code]` nằm trong repro của bug vẫn cho bấm suất đã quá mốc) và F2 (thiếu `Repro Verification`). Phần API/shared/refactor/`ShowtimeSchedule`/quick-book đạt yêu cầu; round 2 chỉ cần sửa F1 + F2 (F3 tuỳ chọn) và cập nhật doc ở close-out.
