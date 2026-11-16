# Bug admin-ux · phase-1-task-01 — API từ chối ID không đúng chuẩn RFC (danh sách phòng / sơ đồ ghế trả 400)

- Classification / Risk: BUG · severity=high · scope=packages/shared (schema param/body) · root cause category=validation không nhất quán (z.uuid chặt vs z.guid lỏng) · expected review level=STRICT (đổi schema dùng chung nhiều endpoint admin/checkin/profile) · blast radius: mọi endpoint dùng `uuidSchema`/`cinemaIdParamSchema` trong cinema-ops, admin, checkin, profile · doc impact: no doc impact (API_SPEC không nêu "UUID chặt"); kiểm lại · decision impact: nới validation id thành GUID (khớp `catalog.ts:145,150`).
- Root cause: `packages/shared/src/schemas/{cinema-ops.ts:7, admin.ts:8, checkin.ts:12, profile.ts:49,51}` dùng `z.uuid()` (zod v4: đòi version 1-8 + variant RFC). `catalog.ts:145,150` dùng `z.guid()` (lỏng). ID trong `supabase/seed.sql` (vd `20000000-0000-0000-0000-000000000002`) không đúng chuẩn RFC → `GET /cinemas/:id/rooms` và `/rooms/:roomId/seats` trả 400 `VALIDATION_ERROR "Invalid UUID"` với admin.
- Files to Modify:
  - `packages/shared/src/schemas/cinema-ops.ts`, `admin.ts`, `checkin.ts`, `profile.ts` (đổi mọi `z.uuid()` → `z.guid()`; grep toàn `packages/shared` + `apps/api/src` cho `z.uuid()`/`.uuid()` còn sót)
  - test: thêm case vào test schema/controller hiện có (ID `20000000-0000-0000-0000-000000000002` phải parse OK ở `uuidSchema` và `cinemaIdParamSchema`; chuỗi rác `abc` vẫn bị từ chối)
  - int test (nếu có chỗ phù hợp) gọi thật `GET /cinemas/:id/rooms` + `/seats` bằng admin trên ID kiểu seed
- Acceptance:
  - Admin (token từ GoTrue local) gọi `GET /cinemas/20000000-0000-0000-0000-000000000002/rooms` → 200 + có phòng; `/rooms/<roomId seed>/seats` → 200 + có ghế.
  - ID không phải GUID (vd `abc`) vẫn 400.
  - Test fail trước fix, pass sau fix. lint/typecheck/test PASS.
- Status: done (reviewer STRICT PASS round 2)

## Repro Verification
- Original repro: đăng nhập admin@filmbooking.local → `GET http://localhost:3001/cinemas/20000000-0000-0000-0000-000000000002/rooms` với Bearer token
- Expected: 200, danh sách phòng; `/seats` 200 sơ đồ ghế
- Actual before fix: 400 `{"error":{"code":"VALIDATION_ERROR","details":{"issues":[{"path":"","message":"Invalid UUID"}]}}}` (cả `/rooms` và `/seats`)
- Actual after fix: `GET /cinemas/<id kiểu seed 20000000-…>/rooms` -> 200 + có phòng; `/rooms/<roomId kiểu seed 30000000-…>/seats` -> 200 `{room, cells}` đủ ghế; `GET /showtimes/<id kiểu seed 50000000-…>/seatmap` (public) -> 200; `/cinemas/abc/rooms` vẫn 400 VALIDATION_ERROR. Int test chạy thật (app boot + admin GoTrue local + Supabase local); rạp/phòng/suất id kiểu seed tạo riêng theo run và dọn bằng `cleanupScope`, không đụng dữ liệu seed demo.
- Evidence: (1) `packages/shared/src/__tests__/id-schemas.test.ts` — vòng 1: 11/11 FAIL trước fix; vòng 2 (showtime `50000000-0000-0000-0000-000000000001`): 5 case FAIL trước fix (booking uuidSchema, holdSeats, preview/cancel, listAffected+listPriceRules, createPriceRule+quoteSeats), sau fix shared 31/31 PASS. (2) `apps/api/test/integration/cinema-ops-seed-ids.int-spec.ts` (4 test) — revert tạm `cinema-ops` uuidSchema: rooms+seats FAIL "expected 400 to be 200"; revert tạm `booking.ts` uuidSchema: seatmap FAIL "expected 400 to be 200"; sau khôi phục 4/4 PASS. (3) shared + api lint, typecheck PASS; api `pnpm test` 483/483.
- Phạm vi sửa: ngoài 4 file gốc còn `orders.ts` (uuidSchema, kéo theo `report.ts`), `booking.ts` (uuidSchema toàn cục: showtimeId, seatIds, `:id` seatmap/order — chọn đổi toàn cục có chủ đích để không lệch giữa các schema cùng một ID; chỉ nới nên vô hại), `cancellation.ts` (`uuid` const: showtimeIds/showtimeId/cinemaId) + `cancellation.controller.ts` (pipe `cinemaIdParam` cho `:cinemaId` x2), `pricing.ts` (cinemaId, showtimeId, seatIds).
- Còn `.uuid()` chặt — đã kiểm bằng dữ liệu thật (`docker exec supabase_db_filmbooking psql`, đếm ID có ký tự thứ 15 trong 1-8 và ký tự thứ 20 trong 89ab):
  - `payment.ts:16 bookingIdParamSchema` + `cancellation.controller.ts:47 uuidParam` (`:orderId`): `orders` 0 dòng trong demo DB nên không có mẫu thật; cột `orders.id` mặc định `gen_random_uuid()` (UUIDv4, RFC) -> giữ chặt. Cột id không có đường tạo ID tay trong code API.
  - `identity.ts:57 authenticatedUserId`: service bỏ qua giá trị này (`identity.service.ts:233`) và web không gửi (grep apps/web không thấy). LƯU Ý: `auth.users` demo 6/6 là non-RFC; nếu sau này client gửi trường này bằng id user seed thì sẽ 400. Chưa đổi vì ngoài phạm vi (trường vô hiệu).
  - Số liệu thật: seats 1056/1056 RFC; showtimes 294/298 RFC (4 suất demo Live non-RFC) -> đã chuyển guid; rooms 0/16, cinemas 0/5, movies 0/12, vouchers 0/3, provinces 0/3, auth.users 0/6 RFC -> mọi nơi nhận các ID này đã là guid.
  - Câu cũ "showtime/seat dùng UUIDv5 nên RFC" là SAI cho 4 suất demo Live (`seed.sql:715-749`, ID tay `50000000-…`); chỉ mục 8.2 dùng `uuid_generate_v5`. Đã sửa.
- Residual (F3, ngoài scope, KHÔNG sửa): `cancellation.controller.ts` `@Param("cinemaId")` ở 4 route khác (dòng ~102,123,165,187) chưa có pipe validate; `pricing.controller.ts` `:id`/`:showtimeId` (dòng ~123,134,142,150) chưa validate. Cần triage riêng.
- Status: PASS
