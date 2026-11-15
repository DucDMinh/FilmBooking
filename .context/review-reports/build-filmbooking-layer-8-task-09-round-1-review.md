# Review — build-filmbooking layer-8 task-09 — round 1

Agent: reviewer

- **Review level:** STRICT
- **Reason:** sửa shared component `components/common/states.tsx` (35 file import, cả server page lẫn client component) + đổi ranh giới server/client của module dùng chung.
- **Blast radius:** mọi trang dùng `EmptyState`/`ErrorState`/`LoadingState` (public + admin + account); `/lich-chieu`; caller của `getVnDateString`.
- **Worktree:** `E:/FilmBooking/.worktrees/layer-8__task-09`, base `19de8d3`, diff chưa commit (3 file sửa, 2 file mới + journal builder).

## Verify commands + result (reviewer tự chạy lại)
| Lệnh | Kết quả |
|---|---|
| `pnpm lint` (root) | PASS |
| `pnpm typecheck` (root) | PASS |
| `pnpm test` (apps/web) | PASS — 32 file, 446 test |
| `pnpm build` (apps/web) | PASS — Next 16.4.6, 40 trang |
| oxlint | skip, oxlint not configured |
| aislop / ocr | skip, chưa cài |
| Stack thật (DB rỗng) | không chạy lại (ngoài allowlist); dựa vào evidence builder: `/`, `/phim`, `/rap`, `/lich-chieu` 200 |

## Kiểm tra theo trọng tâm
1. **Bỏ `"use client"` khỏi `states.tsx`** — an toàn. File không dùng hook/state/context/effect. `Button` (`components/ui/button.tsx`) và `Skeleton` (`components/ui/skeleton.tsx`) không có `"use client"`, không dùng hook (Radix `Slot` server-safe), `cn` thuần, icon lucide server-safe. `ErrorState` với `onRetry`: mọi caller truyền `onRetry` đều là client component (vd `app/admin/rap/page.tsx:70`, có `"use client"`), nên module được bundle vào client của caller và `onClick` chạy bình thường. Caller server duy nhất của `ErrorState` là `app/(public)/dat-ve/[showtimeId]/page.tsx:65`, không truyền `onRetry` → không lỗi serialize. Caller server của `EmptyState` (`(public)/page.tsx:175,253`, `phim/page.tsx:85`, `rap/page.tsx:122`, `rap/[code]/page.tsx:330`, `lich-chieu/page.tsx:175,242`, `ve/page.tsx:42`, `dat-ve/[showtimeId]/page.tsx:54`) giờ render trên server, truyền `icon` function hợp lệ.
2. **Import hàm từ module `"use client"` vào server file** — rà các import value từ `@/components|@/lib` trong `app/**`: `nav-config`, `ticket-data`, `room-access`, `lib/api/client`, `lib/supabase/server`, `buttonVariants` đều không phải module client. Server page import từ module client chỉ là component với props serialize được: `PageHeader` (`admin/page.tsx:11`, `don-hang/*`, `don-can-xu-ly`: chỉ string), `ShowtimeSchedule` (`lich-chieu/page.tsx:204,235`, `phim/[slug]/page.tsx:223`: không truyền function), `PaymentResult`, `SeatPicker` (props primitive/data). Không tìm thấy trường hợp cùng họ lỗi khác.
3. **`lib/vn-date.ts`** — thân hàm bê nguyên (dùng `toVnParts` của `@filmbooking/shared`, giữ nguyên múi giờ VN). Re-export ở `showtime-schedule.tsx:48` giữ tương thích `components/catalog/__tests__/schedule.test.tsx:9,136`. `toVnParts` vẫn được dùng trong `showtime-schedule.tsx:53` → không có import thừa (lint PASS).
4. **Test** — xem MINOR-1/2.

## Findings
Không có CRITICAL/MAJOR.

- **MINOR-1 (độ tin cậy test)** `apps/web/src/components/common/__tests__/states-server-boundary.test.tsx:22-26`: ca 2 render `EmptyState` trong jsdom vẫn PASS cả trước fix (jsdom không có ranh giới RSC) → ca này không chứng minh gì về bug; chỉ ca 1 (regex source, dòng 17-20) là regression guard thật. Ca 1 là test cấu trúc, hơi giòn nhưng chấp nhận được: regex `^\s*["']use client["']` có cờ `m` không bị match nhầm comment dòng 1-3 (`"use client"` nằm giữa dòng). Chấp nhận cho demo; cách chắc hơn là e2e/smoke gọi `/` với API rỗng.
- **MINOR-2 (thiếu guard cho lỗi thứ 2)** Không có test chặn việc server page import lại hàm từ `showtime-schedule` (module client). `getVnDateString` được test gián tiếp qua re-export (`schedule.test.tsx:136`), nên hành vi được giữ; nhưng regression "server import value từ module client" của `/lich-chieu` không có guard tự động.
- **MINOR-3 (bẫy còn lại)** `apps/web/src/components/catalog/showtime-schedule.tsx:48` `export { getVnDateString }` giữ lại đường import từ module client; server file mới nào import từ đây sẽ lặp lại lỗi 500. Ngoài ra `formatVnTime`/`isShowtimeOnlineClosed`/`generateNext7Days` (dòng 51-80) cũng là hàm thuần nằm trong module client, cùng rủi ro này. Có thể chuyển test sang import từ `@/lib/vn-date` rồi bỏ re-export. Không chặn PASS vì hiện không có server caller nào.
- **MINOR-4 (rủi ro tiềm ẩn)** `apps/web/src/components/common/states.tsx:43-66`: giờ là module dùng chung không có directive; nếu sau này server page truyền `onRetry={fn}` cho `ErrorState` thì `<Button onClick>` render trên server sẽ lỗi "Event handlers cannot be passed…". Comment dòng 1-3 giải thích lý do bỏ `"use client"` nhưng không cảnh báo hạn chế `onRetry` chỉ dùng từ client. Hiện không có caller vi phạm.

## Residual risk
- `/ve` (cần đăng nhập) chưa xác minh trên stack thật; cùng root cause đã fix (`ve/page.tsx:42` là server page dùng `EmptyState` + icon) nên rủi ro thấp.
- `/rap/[code]`, `/phim/[slug]`, `/dat-ve/[showtimeId]` chỉ hiện `EmptyState` khi có dữ liệu cha (rạp/phim/suất tồn tại) nên không kiểm được với DB rỗng; cùng cơ chế đã fix. Chưa kiểm hành vi khi DB CÓ dữ liệu (đường render `ShowtimeSchedule` thật trên `/lich-chieu`).
- Stack thật không được reviewer chạy lại (ngoài allowlist); dựa vào evidence của builder.

## Verdict
**STRICT PASS** — root cause đúng, fix tận gốc và gọn (surgical), không đổi API/giao diện, tất cả verify command PASS. 4 MINOR không chặn; khuyến nghị xử lý MINOR-3 (bỏ re-export/tách hàm thuần khỏi module client) trong một task dọn dẹp sau.
