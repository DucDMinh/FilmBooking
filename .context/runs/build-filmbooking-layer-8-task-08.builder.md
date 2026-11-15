# builder layer-8 task-08 (redo, attempt 1) — BLOCKED một phần: Docker daemon tắt

Đã làm (trên đĩa, chưa commit):
- Migration 20261114190000_showtimes_cinema_fk.sql: giữ nguyên (FK showtimes_cinema_id_fkey, RESTRICT, header HIGH_RISK, notify pgrst).
- pgTAP 062: test 1 thêm điều kiện FK 1 cột; ghi chú test 2 (FK ghép cũng 23503). Chưa chạy.
- movies.service.ts: 2 embed showtimes->cinemas thêm hint `cinemas!showtimes_cinema_id_fkey!inner(...)` (orders/showtime_seat_locks tạo đường M2M -> nguy cơ PGRST201). cinemas.service.ts: `rooms!rooms_cinema_id_fkey(count)` (đường M2M cinemas<->rooms qua showtimes). CHƯA kiểm chứng trên PostgREST thật.
- catalog-public.int-spec.ts viết lại: 10 test, assert chặt (body/số phần tử), ngày VN lấy theo suất +48h, có rạp B, suất CANCELLED, tỉnh rỗng, admin /admin/cinemas roomCount. Đang skip vì Docker tắt.

Verify đã chạy: api typecheck OK, eslint catalog + int-spec sạch, api unit 480/480, int catalog-public = 10 skipped.
CHƯA chạy: supabase migration up, pnpm db:test (062), test:int thật, kiểm chứng đỏ khi bỏ FK. Lý do: Docker Desktop daemon không chạy; khởi động Docker bị chặn quyền.
Next: bật Docker, `pnpm exec supabase start`, `pnpm exec supabase migration up --local`, `pnpm db:test`, `pnpm test:int` (catalog-public x2). Nếu GET /movies còn lỗi PGRST201 -> xem hint; nếu hint sai cú pháp -> đổi sang `cinemas!cinema_id`.
