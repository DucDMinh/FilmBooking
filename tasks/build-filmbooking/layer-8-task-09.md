# Task 09: Fix 500 trên các trang public khi danh sách rỗng — `EmptyState` (client) nhận `icon` là function từ server page

## Layer
8

## Type
bug fix (phát hiện bởi builder task-06 khi chạy stack thật với DB local rỗng; chưa kiểm hết các trang)

## Requirements
- R-xx: R-38 (khách xem phim/rạp/lịch chiếu)
- AC-xx: AC-19 (rạp mới/khu vực chưa có dữ liệu vẫn hiển thị trạng thái rỗng, không lỗi)

## Root cause (builder task-06 báo, dispatcher đã đọc code)
- `apps/web/src/components/common/states.tsx` khai báo `"use client"` và `EmptyState` nhận prop `icon?: LucideIcon` (một function component).
- Các **server component** (không `"use client"`) truyền `icon={Film}` / `icon={MapPin}`... trực tiếp → Next.js báo "Functions cannot be passed directly to Client Components" → `/` và `/phim` trả 500 khi danh sách rỗng (`apps/web/src/app/(public)/page.tsx:175,253`; `phim/page.tsx:85`).
- Cùng mẫu có thể nằm ở: `rap/page.tsx:122`, `rap/[code]/page.tsx:330`, `lich-chieu/page.tsx:174,241`, `ve/page.tsx:42`, `dat-ve/[showtimeId]/page.tsx:54`, `dat-ve/don/[id]/xac-nhan/page.tsx:99`, `tai-khoan/rap-yeu-thich/page.tsx:197` (kiểm trang nào là server component).
- `ErrorState` trong cùng file có `onRetry` (onClick) nên file vẫn cần ranh giới client.

## Description
1. Sửa tận gốc để mọi trang (server hay client) dùng `EmptyState` với icon mà không lỗi serialization. Gợi ý (builder chọn cách gọn nhất, nêu lý do): tách `EmptyState` ra module không `"use client"` (nó không dùng hook/handler) và để `ErrorState`/`LoadingState` ở module client; HOẶC đổi prop thành tên icon (string) map trong client. Giữ nguyên API/giao diện cho các caller client hiện có, không đổi design.
2. Rà tất cả caller `EmptyState` (grep) và xác nhận không còn trang server nào truyền function qua ranh giới client.
3. Test: unit/render test chứng minh `EmptyState` render với `icon` từ một server component (hoặc test cấu trúc module không có `"use client"`), + kiểm trên stack thật: với DB rỗng (hiện DB local rỗng), `GET /`, `/phim`, `/rap`, `/lich-chieu`, `/ve` trả 200 và hiện trạng thái rỗng (Next dev/prod local; cổng riêng 3300/3301 tránh đụng task khác).

## Acceptance Criteria
- [x] `/` và `/phim` (và các trang liệt kê ở Root cause nếu bị) trả 200 với DB rỗng, có text trạng thái rỗng.
- [x] Không còn caller nào truyền function component từ server page vào component client.
- [x] lint/typecheck/test web PASS; build web PASS.

## Files to Create/Modify
- `apps/web/src/components/common/states.tsx` (+ file mới nếu tách)
- các page caller nếu cần đổi import
- test mới/cập nhật trong `apps/web`

## Notes
Reviewer NORMAL (UI, shared component dùng nhiều trang → blast radius rộng, cân nhắc STRICT nếu đổi API). Retry tối đa 3 attempt.
