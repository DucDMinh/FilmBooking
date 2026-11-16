Agent: reviewer

# Review — bug-admin-ux phase-1-task-01 · round 1

- Review level: STRICT
- Reason: đổi schema validation dùng chung (`packages/shared/src/schemas/*`) cho nhiều endpoint admin/checkin/profile/orders/report/pricing/cancellation; API contract (400 vs 200) đổi.
- Blast radius: mọi route dùng `uuidSchema` của cinema-ops/orders, `cinemaIdParamSchema`/`userIdParamSchema`/`voucherIdParamSchema` (admin), `cinemaIdParamSchema` (profile), `scanTicketSchema`, filter `cinemaId` của pricing/cancellation/report, pipe `:cinemaId` của `cancellation.controller.ts` (set status). Web dùng chung shared schema (web không có `.uuid(` riêng).

## Verify commands + result

| Lệnh (allowlist project-config) | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (shared, api, web) |
| `pnpm lint` | PASS (shared, api, web) |
| `pnpm test` | PASS — shared 25/25, api 483/483 (25 files), web 446/446, scripts 16/16 |
| Int test `apps/api/test/integration/cinema-ops-seed-ids.int-spec.ts` | **không thử** — runner là `pnpm test:int` (`apps/api/package.json:9`), không có trong allowlist; `db:test` trong allowlist là `supabase test db` (pgTAP), không chạy int-spec. Dựa vào evidence builder |
| `docker exec supabase_db_filmbooking psql ...` (đọc ID thật) | **không chạy được** — agent-guard chặn (ngoài allowlist). Thay bằng đọc `supabase/seed.sql` |
| aislop / oxlint / ocr | skip — không có trong allowlist / oxlint chưa cấu hình / ocr chưa cài |

## Findings

### F1 — MAJOR (FAIL): sót cùng root cause cho showtime ID seed; suy luận "showtime dùng UUIDv5" SAI
- `supabase/seed.sql:715,726,738,749` — 4 suất **demo Live** (mục 8.1) dùng ID đặt tay `50000000-0000-0000-0000-00000000000{1..4}` (version nibble `0`, variant nibble `0` → không đúng RFC). Chỉ mục 8.2 (`seed.sql:767`) dùng `uuid_generate_v5`.
- Bằng chứng `z.string().uuid()` chặt trên zod của repo (^4.6.7): chính `id-schemas.test.ts` của builder có case `orders uuidSchema` — trước fix là `z.string().uuid("UUID không hợp lệ")` — và task file ghi "trước fix 11/11 FAIL" với `20000000-0000-0000-0000-000000000002`. ID `50000000-…` có cùng version/variant `0` → bị từ chối y hệt.
- Repro Verification ghi "Giữ nguyên `z.string().uuid()` cho showtime/... (seed dùng UUIDv5...)" — sai với 4 suất trên.
- Hệ quả:
  - `packages/shared/src/schemas/booking.ts:7` `uuidSchema` → `apps/api/src/modules/booking/booking.controller.ts:31` `GET /showtimes/:id/seatmap` (public) trả **400** cho suất demo live; `holdSeatsSchema.showtimeId` (`booking.ts:11`) → `POST /bookings/holds` **400**. Đây là luồng khách đặt vé chính trên suất demo (suất trong 2 giờ tới).
  - `packages/shared/src/schemas/cancellation.ts:10,19,46` — admin preview/huỷ suất (`showtimeIds`) và filter `showtimeId` của affected orders → 400 với suất demo.
  - `packages/shared/src/schemas/pricing.ts:55,176` — price rule scope SHOWTIME / filter `showtimeId` → 400 với suất demo.
- Lệch nội bộ sau fix: `cinema-ops` showtimes controller (`showtimes.controller.ts:61..155`, dùng `uuidSchema` cinema-ops nay là `z.guid()`) **nhận** `50000000-…` nhưng booking/cancellation/pricing **từ chối** cùng ID → chính kiểu "validation không nhất quán" mà task định sửa.
- Task file yêu cầu rõ "grep toàn `packages/shared` + `apps/api/src` cho `z.uuid()`/`.uuid()` còn sót" — builder đã grep nhưng loại showtime bằng giả định không kiểm chứng.
- Sửa đề xuất: đổi các trường showtime sang `z.guid()`: `booking.ts:11` (showtimeId), `booking.ts:7` dùng cho `:id` seatmap (`booking.controller.ts:31`), `cancellation.ts:10/19/46`, `pricing.ts:55,176`. Lưu ý: nếu đổi luôn `booking.ts:7` `uuidSchema` toàn cục thì cũng nới `seatIds` + `:id` order/booking (vô hại vì chỉ nới, các ID đó đã RFC) — builder chọn có chủ đích (đổi toàn cục hoặc tách `showtimeIdSchema`). Thêm test với `50000000-0000-0000-0000-000000000001` cho seatmap/hold/cancel/pricing; sửa câu justification trong Repro Verification.

### Các ID còn `.uuid(` chặt — đã kiểm (chấp nhận được)
- `payment.ts:16` `bookingIdParamSchema`, booking/orders order id, `cancellation.controller.ts:47` `uuidParam` cho `:orderId` — orders do DB `gen_random_uuid()` sinh → RFC v4, OK.
- `pricing.ts:196`, `booking.ts:13` `seatIds` — seats seed bằng `uuid_generate_v5` (`seed.sql:192-195`) và seat tạo qua API dùng DB default → OK.
- `identity.ts:57` `authenticatedUserId` — service bỏ qua giá trị client (`identity.service.ts:233`), không ảnh hưởng.
- User seed `70000000-…` (non-RFC): admin `userIdParamSchema` + `assignStaffSchema` đã sang guid — OK. Voucher `60000000-…`: `voucherIdParamSchema` guid — OK. Province `10000000-…`: `updateProvinceSchema` guid — OK. Room `30000000-…`/movie `40000000-…`: cinema-ops/catalog/report guid — OK.

### F2 — MINOR: int test không phủ roomId non-RFC
- `cinema-ops-seed-ids.int-spec.ts:38` — phòng tạo qua factory (ID RFC), nên `/rooms/:roomId/seats` chưa chứng minh với roomId kiểu seed `30000000-…` (đúng ID gây bug gốc). Logic vẫn đúng vì cùng `uuidSchema`, unit test shared đã phủ schema → không chặn riêng.

### F3 — INFO (ngoài scope, pre-existing)
- `cancellation.controller.ts:102,123,165,187` `@Param("cinemaId")` không có pipe; `pricing.controller.ts:123,134,142,150` `:id`/`:showtimeId` không validate. Không do diff này; ghi để triage riêng.

## Câu hỏi được giao
1. Grep còn sót: liệt kê ở F1 + mục "đã kiểm". Suy luận của builder đúng cho seat/order/booking/user (admin đã guid), **sai cho showtime** (4 suất demo live).
2. An toàn đầu vào: `z.guid()` vẫn chỉ nhận hex `8-4-4-4-12`; không có `.or()`/`.filter()` thô với ID (chỉ `.eq/.in/.rpc` tham số hoá). Postgres `uuid` chấp nhận mọi hex. Không thấy rủi ro injection. OK.
3. Test: `id-schemas.test.ts` dùng `SEED_ID` non-RFC + rác `abc`/rỗng/thiếu ký tự → với `.uuid()` cũ đỏ (builder ghi 11/11 FAIL), không xanh giả. Int test: rạp id `20000000-0000-0000-ffff-<runId hex>` có code prefix `scope.cinemaCodeBase` nên `cleanupScope` (`helpers/supabase-test.ts:138-152`) dọn được rạp/phòng/suất; không đụng seed.
4. Mở rộng orders/pricing/cancellation cho `cinemaId`/`movieId`: hợp lý, cùng root cause, có test. Nhưng mở rộng **chưa đủ** (F1).

## Surgical diff / code quality
- Diff nhỏ, trace về task; comment ở `cancellation.controller.ts:48` giải thích WHY — OK. Không drive-by refactor.
- Doc impact: no doc impact (API_SPEC không nêu RFC chặt) — đồng ý.

## Verdict: FAIL
Lý do: F1 (MAJOR) — cùng root cause còn sót ở showtime ID của 4 suất demo live (seatmap/hold/cancel/pricing trả 400), và evidence/justification trong task file sai sự thật. Sửa F1 + test tương ứng rồi review round 2.
