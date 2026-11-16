Agent: reviewer

# Review — bug lich-chieu · phase-1-task-01 · round 2

- **Review level:** NORMAL
- **Reason:** UI public, không đụng auth/DB/schema. Sửa component dùng chung `ShowtimeSchedule` (+ `ONE_DAY_MS` lấy từ `lib/vn-date`). Round này kiểm lại F1 và F2 của round 1.
- **Blast radius:** `/lich-chieu`; `/phim/[slug]` (qua `ShowtimeSchedule`, chỉ đổi nguồn hằng `ONE_DAY_MS`); `lib/vn-date.ts`.
- **Đã đọc:** `apps/web/src/app/(public)/lich-chieu/page.tsx` (bản hiện tại), `.../__tests__/page.test.tsx`, `apps/web/src/lib/vn-date.ts`, `apps/web/src/lib/__tests__/vn-date.test.ts`, `showtime-schedule.tsx` (import `ONE_DAY_MS`), `packages/shared/src/schemas/catalog.ts:14-15,25,41,94,151-152`, `supabase/seed.sql` (dữ liệu seed thật).

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS toàn bộ: shared 31/31, api 483/483, web **553/553** (42 file), `node --test scripts/*.test.mjs` 16/16 |
| `pnpm build` | Không chạy lại, để tránh đụng `.next` của dev server. Rủi ro thấp: web đã import runtime schema từ `@filmbooking/shared/schemas/*` ở nhiều nơi khác (vd `cinema-form.tsx:17`, `bo-sung-email/page.tsx:3`). Dispatcher cũng đã xác nhận server thật trả 200 cho `?movie=.` và `?cinema=.`. |
| aislop / oxlint / ocr | skip: chưa cấu hình (oxlint not configured, ocr not installed) |

## Kiểm lại F1 (crash 500 với `?movie=.` / `?cinema=.`): ĐÃ ĐÓNG

- `page.tsx:65-67` `parseParam` nhận một giá trị chỉ khi nó là `string` và qua `schema.safeParse`. Nhờ đó tham số lặp (mảng ở runtime) cũng bị loại.
- `page.tsx:206-208` dùng đúng schema cho từng tham số. Đây đều là schema mà chính API dùng cho param/query tương ứng, nên web không thể chặt hơn API:
  - `province` → `listCinemasQuerySchema.shape.province` = `provinceCode` `/^[A-Z0-9_]{2,20}$/`. Seed `HA_NOI` hợp lệ.
  - `movie` → `slugParamSchema` = `/^[a-z0-9]+(-[a-z0-9]+)*$/` max 120, cùng schema với `@Param("slug")` ở `movies.controller.ts:37`. Seed `doraemon-nobita-va-ban-giao-huong-dia-cau` (41 ký tự) hợp lệ.
  - `cinema` → `codeParamSchema` = `/^[A-Z0-9]{2,10}$/`, cùng schema với `cinemas.controller.ts:42`. Seed `HN01` hợp lệ.
  - `.`, `..`, `%2e`, `../../x` đều không khớp các regex trên, nên không còn dot-segment nào đi tới `fetch`.
- Lớp phòng thủ thứ hai:
  - `fetchMovieSchedule` (`page.tsx:81-86`) ném lỗi khi payload không có shape `{movie: object, schedule: array}`. `allSettled` bỏ khối đó.
  - `fetchCinemaDetail` (`page.tsx:91-93`) trả `null` khi payload sai shape, và trang hiện EmptyState.
  - `settledList` (`page.tsx:74-76`) bảo vệ 3 danh sách danh mục.
- Ghi chú: giá trị không hợp lệ bị bỏ qua trong im lặng, tức là trang hiện như chưa chọn bộ lọc. Hành vi này hợp lý cho demo.

## Kiểm lại F2 (mock xanh giả): ĐÃ ĐÓNG

- `page.test.tsx:54-78`: mock parse path bằng `new URL(...)`, chuẩn hoá dot-segment giống `fetch`, nên `/movies/.` rơi vào route danh sách như API thật. `/movies/:slug` và `/cinemas/:code` chỉ trả suất của **đúng ngày VN** trong `date` (`onVnDate`), bám `vnDayRange` ở `movies.service.ts:257-265`.
- Các assertion gắn với đường dẫn API thật (`calledPaths()`), không chỉ dựa vào lọc lại phía client:
  - `/movies/phim-c?date=2026-11-15`: test chọn phim chỉ gọi đúng một phim (l.113).
  - `/movies/phim-{a,b,c}?date=2026-11-15` (l.118-124).
  - `/movies/phim-b?date=2026-11-16`: test đổi ngày (l.134). Vì mock lọc theo ngày, nếu page thôi chuyển `date` thì Phim B sẽ không xuất hiện và test đỏ.
  - `/movies/phim-a?date=2026-11-15&province=HN` và `/cinemas?province=HN` (l.141-143).
  - `/cinemas/HN01?date=2026-11-15` và `/cinemas/HN01?date=2026-11-16`, kèm kiểm suất đổi theo ngày (l.164, 172-174).
- Test bad-input (l.178-198) chạy cho `.`, `..`, `%2e`, `../../x`, `""`, `"A B"`, 200 ký tự, trên cả `movie`, `cinema` và `province`. Kiểm tra: không có call `/movies/.`, `/movies/?`, `/cinemas/<x>`, `province=`, và trang vẫn hiện Phim A/C.
  - Với mock mới, bản code round 1 sẽ đỏ thật: `movie=.` cho ra `/movies/` → mảng → TypeError. Đây là test hồi quy đúng nghĩa.
- Test wrong-shape (l.209-227) và test tham số lặp (l.200-207) có mặt.
- `lib/__tests__/vn-date.test.ts`: kiểm biên +6 (nhận), +7, ngày đã qua, `2026-13-45`, `2026-02-30`, chuỗi rác, và nửa đêm VN 16:59Z/17:00Z. Như vậy minor M1 của round 1 đã đóng.
- `ONE_DAY_MS` giờ được export từ `lib/vn-date.ts:12` và `showtime-schedule.tsx:9,84` dùng chung. Minor M4 của round 1 đã đóng.

## Không hồi quy so với round 1

- Hành vi acceptance giữ nguyên: mặc định hiện mọi phim có suất, chọn phim, chọn rạp (+ phim), đổi tỉnh xoá `cinema`, `date` rác rơi về hôm nay, chỉ một dải 7 ngày.
- Ranh giới client/server vẫn đúng. `page.tsx` import thêm `@filmbooking/shared/schemas/catalog` (zod thuần) phía server, không qua module `"use client"`.
- `/phim/[slug]` không đổi hành vi (`hideDateStrip` mặc định false, state nội bộ còn nguyên).
- `page.tsx` 261 dòng (≤300), mọi hàm <50 dòng. Docs: no doc impact (như round 1).

## Findings còn lại (không chặn)

- **INFO (ngoài phạm vi, nên đưa vào backlog):** F3 của round 1 vẫn còn. Dải ngày ở `/phim/[slug]` vốn đã hỏng, trước task này: không có `?date=` thì API chỉ trả suất hôm nay, có `?date=` thì `selectedDate` không kèm `onDateChange` (`phim/[slug]/page.tsx:26-28,223-227`).
- MINOR (giữ từ round 1, chấp nhận cho demo):
  - M2: lệch đồng hồ server/client sát nửa đêm trong `ScheduleDateNav`.
  - M3: fetch từng phim không có timeout.
  - M5: select controlled nhảy về giá trị cũ cho tới khi điều hướng xong.
- Nit: điều kiện `p.includes(encodeURIComponent(bad))` ở `page.test.tsx:185` hơi rộng: với `bad="."`, mọi path có dấu chấm đều làm test đỏ. Hiện không có path nào chứa dấu chấm nên không gây xanh giả. Không cần sửa.

## Verdict: **NORMAL PASS**

F1 và F2 đã đóng, có bằng chứng code và test gắn với hợp đồng API thật. Schema validate khớp đúng với validation của API và chấp nhận dữ liệu seed thật. Toàn bộ verify PASS (web 553/553).
