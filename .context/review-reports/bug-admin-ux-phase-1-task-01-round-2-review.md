Agent: reviewer

# Review — bug-admin-ux phase-1-task-01 · round 2

- Review level: STRICT
- Reason: schema validation dùng chung (`packages/shared/src/schemas/*`) cho nhiều endpoint (cinema-ops, admin, checkin, profile, orders/report, booking, pricing, cancellation); API contract 400→200 đổi.
- Blast radius: round 1 + `booking.ts` `uuidSchema` toàn cục (showtimeId, seatIds, `:id` seatmap/hold/booking), `cancellation.ts` `uuid` (showtimeIds/showtimeId), `pricing.ts` showtimeId/seatIds/cinemaId. Chỉ nới (RFC ⊂ GUID) nên client cũ không bị chặn thêm.

## Verify commands + result

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 31/31, api 483/483, web 446/446, scripts 16/16 |
| `pnpm test:int` (cinema-ops-seed-ids.int-spec.ts) | reviewer không chạy (theo chỉ đạo dispatcher; ngoài allowlist). **Verdict phụ thuộc kết quả dispatcher**: phải 4/4 PASS |
| aislop / oxlint / ocr | skip — ngoài allowlist / oxlint chưa cấu hình / ocr chưa cài |

## Kiểm lại F1 (round 1, MAJOR) — ĐÃ ĐÓNG
- Grep lại `\.uuid\(|z\.uuid\(|ParseUUIDPipe`:
  - `packages/shared/src`: chỉ còn `identity.ts:57` (`authenticatedUserId`) và `payment.ts:16` (`bookingIdParamSchema`).
  - `apps/api/src`: chỉ còn `cancellation.controller.ts:47` (`uuidParam` cho `:orderId`).
- `booking.ts:7` → `z.guid("Invalid UUID")`: phủ `GET /showtimes/:id/seatmap`, `holdSeatsSchema.showtimeId/seatIds`, `:id` booking. Đổi toàn cục có chủ đích (task file dòng 21 ghi rõ).
- `cancellation.ts:10` → `z.guid()`: phủ `showtimeIds` preview/cancel + filter `showtimeId`.
- `pricing.ts:54-55,175-176,196` → guid.
- Lệch nội bộ cinema-ops vs booking/cancellation/pricing cho showtime `50000000-…` đã hết.
- 3 chỗ còn chặt hợp lý:
  - `payment.ts:16` + `cancellation.controller.ts:47`: `orders.id` mặc định `gen_random_uuid()`, seed không chèn orders → luôn RFC v4.
  - `identity.ts:57`: service bỏ qua giá trị (`identity.service.ts:233`), web không gửi. Builder ghi rõ residual (user seed 6/6 non-RFC). Chấp nhận.

## Bảng số liệu builder vs seed.sql
- showtimes 294/298 RFC: khớp — 4 suất tay (`seed.sql:715-749`) + 14 phòng tiêu chuẩn × 7 ngày × 3 slot = 294 bằng `uuid_generate_v5` (`seed.sql:767-805`, loại 2 phòng demo).
- rooms 0/16, cinemas 0/5, movies 0/12, vouchers 0/3, provinces 0/3, auth.users 0/6: khớp với ID tay `10000000-…`, `20000000-…`, `30000000-…`, `40000000-…`, `60000000-…`, `70000000-…` trong seed.
- seats 1056/1056 RFC: khớp với lập luận (`seed.sql:192-195` dùng v5). Con số tuyệt đối do builder đọc từ DB, reviewer không kiểm được (docker bị agent-guard chặn).
- Justification sai của round 1 đã được sửa (task file dòng 26).

## Test đỏ trước fix
- `id-schemas.test.ts:73-101`: các case với `SHOWTIME_SEED_ID` (`50000000-…`) qua `holdSeatsSchema`, preview/cancel, listAffected/listPriceRules, createPriceRule SHOWTIME, quoteSeats. Schema cũ `z.string().uuid()` chặt RFC (đã chứng minh ở round 1: `orders uuidSchema` cũ đỏ với ID seed) → các case này đỏ trước fix, khớp "5 case FAIL" builder ghi. Có case rác `abc` → không xanh giả.
- `searchOrders showtimeId` (dòng 98) đã xanh từ round 1, chỉ là regression guard, không sao.

## Kiểm lại F2 (round 1, MINOR) — ĐÃ ĐÓNG
- Int test giờ tạo phòng id `30000000-0000-0000-ffff-<runId>` (`int-spec.ts:40-48`) và suất `50000000-…` (`:51-54`); có test seatmap public (`:75-78`).
- Dọn dữ liệu: rạp có code prefix `cinemaCodeBase` → `cleanupScope` xoá showtimes theo `cinema_id` rồi xoá cinemas (`helpers/supabase-test.ts:138-152`). Không đụng seed demo.

## Findings round 2
- N1 — INFO: `int-spec.ts:53` đổi PK `showtimes.id` bằng UPDATE. Các FK tới `showtimes(id)` (`20261111020000_catalog.sql:139`, `pricing.sql:34`, `booking_tables.sql:69,159,247`, `rpc_cancel.sql:20`) không có `ON UPDATE CASCADE`. Nếu trigger tạo dòng con khi insert suất, UPDATE sẽ ném 23503 trong `beforeAll`. Builder báo 4/4 PASS nên hiện không xảy ra; kết quả `pnpm test:int` của dispatcher sẽ xác nhận. Fixture giòn nếu sau này thêm trigger — không chặn.
- N2 — INFO: test seatmap chỉ assert 200, không assert nội dung; chấp nhận cho mục tiêu validation.
- F3 (round 1, ngoài scope, có từ trước): giữ nguyên, cần triage riêng.

## Surgical diff
- Diff round 2 chỉ thêm đúng các trường showtime/seat theo F1, kèm comment WHY ở `booking.ts:7`. Không drive-by. Doc impact: no doc impact — đồng ý.

## Verdict: STRICT PASS
Điều kiện: `pnpm test:int` cho `cinema-ops-seed-ids.int-spec.ts` do dispatcher chạy phải 4/4 PASS. Nếu FAIL → coi verdict là FAIL.
