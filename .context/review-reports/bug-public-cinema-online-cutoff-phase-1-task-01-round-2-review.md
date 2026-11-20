# Review: bug-public-cinema-online-cutoff / phase-1-task-01 / round 2

Agent: reviewer

- **Review level:** STRICT
- **Reason:** giữ nguyên lý do round 1: đổi `CinemaDto` công khai dùng ở nhiều client, helper dùng chung (`chain-defaults.ts`, `isShowtimeOnlineClosed` dùng ở 3 nơi), dữ liệu cấu hình rạp ra endpoint anon. Round này thêm thay đổi trên trang server `/rap/[code]` và chuyển helper sang module mới.
- **Blast radius (phần đổi ở round 2):** `apps/web/src/lib/showtime-closing.ts` (mới), `apps/web/src/components/catalog/showtime-schedule.tsx` (import và re-export), `apps/web/src/app/(public)/rap/[code]/page.tsx` + test, `apps/api/src/modules/catalog/cinemas.service.ts` (`detailPublic`), `docs/API_SPEC.md`. Người dùng gián tiếp của helper: `lib/quick-book.ts` → `quick-book-bar.tsx` (client), `ShowtimeSchedule` (`/lich-chieu`, `/phim/[slug]`).

## Verify commands + result (chạy độc lập)

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared/api/web) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: shared 31, api 663 (29 file), web 664 (53 file, +2 so với round 1), scripts 31 |
| `pnpm build` | không chạy (tin báo cáo builder) |
| Playwright scrub 21/21 | không chạy được trong vai reviewer (tin báo cáo builder) |
| `pnpm db:test` | không chạy (residual risk giữ nguyên round 1) |
| oxlint | skip, oxlint not configured |
| aislop | skip, aislop not installed |
| ocr | skip, ocr not installed |
| AI-friendly web gate | N/A |

## Kiểm từng finding round 1

### F1 (MAJOR): đã xử lý
- `rap/[code]/page.tsx:150-151`: `now = new Date()`, `cutoffMinutes = cinema.effectiveOnlineCutoffMinutes ?? 15` (dùng `??`, nên mốc 0 vẫn là 0; thiếu field thì 15, khớp `hold_seats` `coalesce(..., 15)`).
- `page.tsx:405-416`: `CANCELLED` → `return null` (vẫn ẩn như trước); sau đó `isShowtimeOnlineClosed(st.startsAt, st.status, cutoffMinutes, now)` → `ShowtimeClosedChip` (không phải link, `aria-disabled`, chữ "Mua tại quầy", title "Đã đóng bán online, vui lòng mua tại quầy", đúng R-67). `CLOSED` → helper trả `true` → chip đóng. Quá mốc (biên `>=`, khớp SQL) → chip đóng. Còn bán → `ShowtimeLinkChip` như cũ.
- Chỉ áp dụng ở nhánh rạp `OPEN` (nhánh không-OPEN trả notice trước đó, không có lịch), đúng R-137.
- `now` tính trên server lúc render. Trang gọi `getServerAccessToken()` (đọc cookie) nên thực tế render động; dữ liệu `apiFetch` có `PUBLIC_CACHE` revalidate 60s, nên mốc đổi có thể trễ tối đa ~60s. Server `hold_seats` vẫn chặn đúng → chấp nhận như round 1 đã nêu.

### F3 (MINOR): đã xử lý
- `cinemas.service.ts:166-167`: `chainOnlineCutoff(db)` nằm trong `Promise.all` cùng rooms/showtimes ở nhánh OPEN. Nhánh không-OPEN (`:161-162`) vẫn gọi tuần tự 1 truy vấn, nhưng nhánh này không có truy vấn khác để gộp nên không thêm round trip so với tối thiểu. OK.

### F5 (NOTE): đã xử lý, nội dung chính xác
- `docs/API_SPEC.md:84-85`: thêm `effectiveOnlineCutoffMinutes` cho `GET /cinemas` và `GET /cinemas/:code`, ghi đúng thứ tự ưu tiên (mốc rạp → `app_settings.default_online_cutoff_minutes` → 15), khớp `effectiveOnlineCutoff(a, b) = a ?? b` + `readChainDefaults` (mặc định 15).
- `:88`: `GET /movies/:slug` `schedule[].cinema` gồm `code`, `name`, `effectiveOnlineCutoffMinutes`, khớp `MovieScheduleDto` (`movies.service.ts:191`) và `groupByCinema` (`:343-347`).

### F2: ngoài phạm vi round này (dispatcher viết ở close-out), theo brief. Ghi nhắc: trước commit task file phải có `Repro Verification` status PASS; nên thêm test `/rap/[code]` mới vào danh sách evidence.

### F4: NOTE từ trước, không đổi.

## Kiểm việc chuyển helper sang `lib/showtime-closing.ts`
- So `git diff showtime-schedule.tsx`: thân hàm (CLOSED/CANCELLED → true; `startTime - cutoffMinutes*60000`; `now >= cutoff`; mặc định `cutoffMinutes = 15`, `now = new Date()`) giống từng dòng với bản cũ. Chỉ thêm 1 dòng JSDoc giải thích lý do tách.
- `showtime-schedule.tsx:10` import + `:62` `export { isShowtimeOnlineClosed }`: import cũ vẫn chạy (`schedule.test.tsx:10`, `lib/quick-book.ts:2`), test các ca biên 20/14 phút và CLOSED vẫn xanh.
- Server component `/rap/[code]` import thẳng từ `@/lib/showtime-closing` (module không có `"use client"`), không còn gọi hàm từ client module ở server. `lib/quick-book.ts` vẫn import qua client module, nhưng chỉ dùng trong `quick-book-bar.tsx` (client) nên không vi phạm ranh giới (xem N1).

## Kiểm test mới (`rap/[code]/__tests__/page.test.tsx:180-223`)
- Fake timer `toFake: ["Date"]` (không fake timer/promise nên render async không treo), `NOW = 2026-11-18T03:00Z` = 10:00 VN; suất `03:20Z` còn đúng 20 phút. Mốc truyền vào là UTC epoch, so sánh không phụ thuộc múi giờ, và chuỗi ngày VN của trang là 2026-11-18 nên suất nằm trong ngày được chọn.
- Ca mốc 30: kỳ vọng không có `a[href^="/dat-ve/"]` và có "Mua tại quầy". Bỏ fix (render link cho mọi suất không CANCELLED) → có link → đỏ. Ca mốc 15: kỳ vọng có `a[href="/dat-ve/st-20"]` và không có "Mua tại quầy" → chặn trường hợp sửa sai kiểu "đóng hết" hoặc hardcode 30. Hai ca chỉ khác `effectiveOnlineCutoffMinutes`, nên test phân biệt đúng nguồn mốc theo rạp. Không tautology.
- Không có test riêng cho `CLOSED`/`CANCELLED`/mốc 0 trên trang rạp; logic này nằm trong helper đã có test và trong nhánh `CANCELLED` không đổi hành vi → chấp nhận, không chặn.

## Findings

### N1 — NOTE (không chặn): `lib/quick-book.ts:2` vẫn import `isShowtimeOnlineClosed` qua module `"use client"` `showtime-schedule.tsx`
- Hiện chỉ dùng từ client component nên chạy đúng. Nếu sau này `lib/quick-book.ts` được gọi từ server component thì sẽ dính ranh giới client. Có thể đổi sang `@/lib/showtime-closing` khi tiện, không bắt buộc cho task này.

Không có finding BLOCKER/MAJOR/MINOR mới. Diff round 2 hẹp, đúng các finding, không có refactor ngoài phạm vi. AI-chaos indicators: 0 (tên rõ, không magic number mới ngoài fallback 15 giống các chỗ khác, không hàm mới > 50 dòng).

## Residual risk
- `pnpm db:test` (anon đọc `online_cutoff_minutes` + `app_settings` trên DB thật) chưa chạy; đã đối chiếu grant/RLS ở round 1 nên rủi ro thấp.
- `pnpm build` / Playwright tin theo builder.
- Trễ ~60s do cache dữ liệu trang rạp (server giữ ghế vẫn chặn đúng).

## Verdict: STRICT PASS

F1, F3, F5 đã xử lý đúng; verify lint/typecheck/test độc lập xanh. Điều kiện close-out: dispatcher phải bổ sung `Repro Verification` (F2) vào task file trước khi commit.
