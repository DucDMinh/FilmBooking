# Review — bug phim-detail · phase-1-task-01 · round 1

Agent: reviewer

## Review level
NORMAL. Diff chỉ ở apps/web: 1 server page, 1 client wrapper mới, 2 file test. Không đụng schema/DB/auth/payment/API contract. `ShowtimeSchedule` là component dùng chung nhưng không bị sửa (chữ ký giữ nguyên, file không đổi).

## Reason
Bug luồng đặt vé chính (chọn suất). Rủi ro chính: hồi quy `/lich-chieu` và trang 500 với input rác. Không có rủi ro đỏ nào buộc phải STRICT.

## Blast radius
- `/phim/[slug]` (page.tsx): luôn fetch `/movies/:slug?date=<resolved>[&province=]`.
- `MovieShowtimeSchedule` mới: chỉ trang chi tiết phim dùng.
- `ShowtimeSchedule` / `ScheduleDateStrip`: không đổi (git status không có showtime-schedule.tsx) nên `/lich-chieu` không bị ảnh hưởng.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm test` | PASS: shared 31/31, api 483/483 (25 file), web 565/565 (44 file), scripts 31/31 |
| `pnpm build` | không chạy (theo brief: build ghi đè .next khi dev server đang chạy) |
| `curl` SSR `/phim/<slug>?date=…` (17..22/11, abc, 2030-01-01, date[]=, date=a&date=b) | **BLOCKED**: agent-guard chặn vì `curl` không nằm trong allowlist (`.context/project-config.md` không khai báo). Tôi không lách bằng `node -e`/fetch. |

## Cross-boundary check
- API `movieDetailQuerySchema` (packages/shared/src/schemas/catalog.ts:35-38): `date: localDate.optional()`, `province: provinceCode.optional()`. Page giờ chỉ gửi `date` đã qua `resolveScheduleDate`, nên API luôn nhận YYYY-MM-DD hợp lệ trong 7 ngày. Giá trị rác (`abc`, `2030-01-01`, mảng) không tới được API, nên không còn đường 400 → null → 404 do `date`.
- `resolveScheduleDate` (apps/web/src/lib/vn-date.ts:18-25) chỉ trả `date` khi trùng một trong 7 ngày VN tính từ `now`, ngoài ra trả hôm nay. Page dùng y hệt `/lich-chieu` (`typeof date === "string" ? date : undefined`, lich-chieu/page.tsx:209), nên hai trang nhất quán.

## Kiểm tra test có xanh giả không
- Mock `apiFetch` trong page.test.tsx:68-76 parse path bằng `new URL`, chỉ trả suất đúng ngày VN của `?date` (mặc định hôm nay). Như vậy nó mô phỏng đúng hợp đồng 1 ngày của `movies.service`, và từ chối path lạ. Test assert chuỗi path chính xác (`/movies/spider-man?date=2026-11-16`, `...?date=2026-11-17&province=HN`).
- Nếu bỏ `resolveScheduleDate` (truyền `date` thô): test "không có ?date=" đỏ vì path thành `/movies/spider-man` không có `?date=`. Các test `abc` và `2030` cũng đỏ vì path chứa `abc`/`2030` và kỳ vọng `?date=2026-11-16` không được thoả.
- Nếu bỏ `onDateChange` (quay về `ShowtimeSchedule` không handler): test D2 ở page (page.test.tsx:135-144) và cả 4 test của wrapper đỏ vì `push` không được gọi.
- Hạn chế: mock bỏ qua tham số thứ 2 `PUBLIC_CACHE` và không mô phỏng lỗi 400 của zod. Điều này chấp nhận được vì page không còn gửi date rác.

## Findings

### MAJOR
1. **Repro Verification chưa được đóng, nên bug không kiểm chứng được.** `tasks/bug-phim-detail/phase-1-task-01.md:27-29` vẫn ghi `Actual after fix: (chưa)`, `Evidence: (chưa)`, `Status: BLOCKED (chưa sửa)`, và `Status: in_progress` ở dòng 21. Theo gate "Bug repro closure", Repro Verification phải `PASS` và có evidence chứng minh repro gốc (bấm 17..22/11 thấy ~11 suất/ngày; `?date=2026-11-18` bấm 19/11 thì chuyển) đã hết. Builder summary (`.context/runs/bug-phim-detail-phase-1-task-01.builder.md`) chỉ có một câu "Test đỏ -> xanh; lint/typecheck/test/build PASS", không có số liệu, không có output test-đỏ-trước-fix, không chạy lại `tasks/bug-phim-detail/repro-phim-detail.mjs`. Reviewer cũng không tự repro được vì `curl` bị guard chặn. Như vậy là FAIL (unverifiable).
   - Cần sửa: chạy lại `node tasks/bug-phim-detail/repro-phim-detail.mjs` (hoặc lệnh repro tương đương) trên dev server sau fix. Ghi `Actual after fix` (số link `/dat-ve/` và ngày `aria-pressed` cho 16..22/11, `?date=abc`, `?date=2030-01-01`, `?date=a&date=b`), ghi `Evidence` (lệnh + output + test đỏ trước fix), rồi đặt `Status: PASS`. Nếu muốn reviewer tự chạy được SSR repro thì thêm lệnh repro/curl GET local vào allowlist trong project-config.

### MINOR
2. **Mỗi lần render không cache phát sinh thêm 1 lần gọi API.** `generateMetadata` (page.tsx:46) vẫn gọi `fetchMovieData(slug)` không có date, còn page (page.tsx:79) giờ luôn gọi kèm `?date=<hôm nay>`. Trước đây, với URL không tham số thì hai fetch trùng URL và Next dedupe được; giờ là 2 URL khác nhau. Có `PUBLIC_CACHE` revalidate 60s nên ảnh hưởng nhỏ. Task ghi "generateMetadata không đổi" nên có thể chấp nhận; chỉ ghi lại để biết.
3. **Không có phản hồi pending khi đổi ngày.** `router.push` (movie-showtime-schedule.tsx:23) chờ RSC của ngày mới. Trong lúc đó nút cũ vẫn `aria-pressed` và danh sách suất cũ vẫn hiển thị, không có `useTransition`/loading. Đây là UX nhỏ; nếu `/lich-chieu` cũng làm như vậy thì giữ nhất quán là được.

### INFO
4. `province` vẫn được type `string` (page.tsx:24) dù `?province=a&province=b` cho ra mảng. Khi đó `URLSearchParams.set` ghép thành `"a,b"`, API trả 400 và trang thành 404. Lỗi này có từ trước, thuộc nhóm D3 nằm ngoài phạm vi, builder không đụng tới là đúng.
5. Dựng href an toàn: `pathname` lấy từ `usePathname`, query dựng bằng `URLSearchParams`, `date` lấy từ `generateNext7Days` (không phải input người dùng). Không có injection. Neo `#lich-chieu` khớp `section id="lich-chieu"` (page.tsx:215). `scroll: false` đã được test assert.
6. Residual đã biết: server dùng `now` của server để resolve, client dùng `new Date()` cho dải ngày, nên có thể lệch trong khoảng ngắn sát nửa đêm VN. Task đã ghi nhận, không sửa.
7. Phạm vi: diff bám đúng task (D1+D2), không sửa D3, không refactor ngoài lề. File ngắn, tên rõ, comment giải thích WHY, không có AI-chaos indicator.
8. aislop / oxlint / ocr: không chạy vì không nằm trong allowlist của guard (skip). eslint trong `pnpm lint` PASS.

## Verdict
**FAIL**. Code và test đạt yêu cầu: logic đúng, test bám hợp đồng thật và sẽ đỏ nếu bỏ fix, không hồi quy `/lich-chieu`. Tuy vậy, Repro Verification của bug task vẫn `BLOCKED`/`(chưa)` và không có evidence sau fix (MAJOR #1), mà reviewer không tự chạy được SSR repro vì guard chặn `curl`. Builder chỉ cần điền Repro Verification với evidence thật rồi gửi lại round 2. Không cần sửa code.
