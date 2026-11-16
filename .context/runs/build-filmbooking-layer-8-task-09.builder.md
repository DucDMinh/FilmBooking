# builder layer-8 task-09
- Root cause: states.tsx "use client" -> server page truyền icon function => 500. Fix: bỏ "use client" (module không hook/handler; Button/Skeleton cũng server-safe).
- Phát hiện thêm: /lich-chieu page (server) import getVnDateString từ module "use client" -> 500 độc lập dữ liệu. Tách sang apps/web/src/lib/vn-date.ts; showtime-schedule re-export.
- Test mới: components/common/__tests__/states-server-boundary.test.tsx (đỏ trước fix).
- Verify: lint, typecheck, web test 446, build PASS. Stack thật (web 3300 + stub API rỗng 3302): / /phim /rap /lich-chieu 200.
