# Review — bug phim-detail · phase-1-task-01 · round 2

Agent: reviewer

## Review level
NORMAL, giữ như round 1. Diff chỉ ở apps/web và không đụng schema/auth/API contract.

## Reason
Round 1 FAIL chỉ vì Repro Verification chưa điền. Round 2 xác nhận phần đó đã đủ và code không đổi so với round 1.

## Blast radius
Không đổi so với round 1: `/phim/[slug]` cộng component mới `MovieShowtimeSchedule`. `ShowtimeSchedule` và `/lich-chieu` không bị sửa.

## Verify commands + result
| Lệnh | Kết quả |
|---|---|
| `git status --short` | Vẫn đúng tập file như round 1, chỉ thêm report round 1 |
| `git diff --stat -- apps/web` | page.tsx 9+/5-, khớp diff đã soát ở round 1, nên code không đổi |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Không chạy lại vì code không đổi. Dùng kết quả round 1: PASS, shared 31, api 483, web 565, scripts 31 |
| SSR `curl` | Reviewer vẫn bị guard chặn. Evidence do dispatcher chạy và ghi trong task file |

## Repro Verification (tasks/bug-phim-detail/phase-1-task-01.md:23-30)
| Mục | Có | Nhận xét |
|---|---|---|
| Original repro | dòng 24 | Đủ cho cả D1 (bấm 17..22/11) và D2 (`?date=2026-11-18` rồi bấm 19/11) |
| Expected | dòng 25 | ~11 suất/ngày, có `?date=` vẫn chuyển ngày |
| Actual before | dòng 26 | 0 suất cho 6 ngày; prop che `activeDate` |
| Actual after | dòng 27 | `?date=17..22` → 200, 11 link `/dat-ve/` mỗi ngày, `aria-pressed` đúng ngày. Input rác (`abc`, `2030-01-01`, `a&date=b`, `date[]=`) → 200 và rơi về hôm nay. D2 kiểm trên Chrome thật: URL đổi đúng, giữ province và `#lich-chieu` |
| Evidence | dòng 28 | Có lệnh repro. Test đỏ trước fix: 5 fail / 3 pass; xanh sau fix: 12 test mới. Có kết quả lint/typecheck/test |
| Status | dòng 30 | PASS |

Đối chiếu với code và test đã soát ở round 1:
- 11 link/ngày khớp số suất API trả cho từng ngày. Đây chính là hành vi `fetchMovieData(slug, activeDate, province)` (page.tsx:79).
- Input rác rơi về hôm nay khớp với `resolveScheduleDate` (vn-date.ts:18-25) và với guard `typeof date === "string"` (page.tsx:77).
- D2 khớp với `onDateChange` → `router.push(?date=&province=#lich-chieu, {scroll:false})` (movie-showtime-schedule.tsx:20-24).
- Kết quả "test đỏ trước fix" trùng với phân tích của tôi ở round 1: test sẽ đỏ nếu bỏ `resolveScheduleDate` hoặc bỏ `onDateChange`.

## Findings
### MAJOR
Không còn. MAJOR #1 của round 1 đã đóng.

### MINOR (đã ghi residual ở task:29, không chặn)
- `generateMetadata` (page.tsx:46) gọi API không kèm date, nên mỗi lần render không có cache phát sinh thêm 1 lần gọi API. Có cache 60s nên ảnh hưởng nhỏ.
- Không có trạng thái loading khi đổi ngày (movie-showtime-schedule.tsx:23).

### INFO
- Với ngày hôm nay (16/11) không có ngày nào hiện link đặt vé: cả 12 suất đều hiện "Mua tại quầy" vì evidence chạy lúc khoảng 17h giờ VN. Kết quả này do `isShowtimeOnlineClosed`, phần code không đổi trong task. Tôi không kiểm chứng độc lập giờ chiếu của từng suất. Nếu dữ liệu demo có suất sau 17h15 mà vẫn hiện "Mua tại quầy" thì đó là bug riêng, không thuộc task này.
- `?province=` lặp tham số → 404 thuộc D3, ngoài phạm vi.
- Ngày phía client lấy từ `new Date()` nên có thể lệch trong khoảng ngắn sát nửa đêm VN. Đã ghi residual.

## Verdict
**NORMAL PASS**
