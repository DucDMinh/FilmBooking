# Task 08: Fix `GET /movies` 500 trên DB thật — thiếu FK `showtimes.cinema_id → cinemas`

## Layer
8

## Type
bug fix (phát hiện trong layer 8 bởi builder task-06 khi chạy stack thật; dispatcher đã tái hiện)

## Requirements
- R-xx: R-38 (khách xem phim/lịch chiếu để đặt vé)
- AC-xx: AC-19 (rạp mới bán được — phụ thuộc danh sách phim/suất hoạt động)

## Root cause (đã chứng minh)
- `apps/api/src/modules/catalog/movies.service.ts:258` và `:326` truy vấn `from("showtimes").select("..., cinemas!inner(...)")`.
- Bảng `public.showtimes` (`supabase/migrations/20261111020000_catalog.sql:110-129`) có cột `cinema_id` nhưng KHÔNG có FK trực tiếp tới `cinemas`; chỉ có FK ghép `(room_id, cinema_id) → rooms (id, cinema_id)`.
- PostgREST vì vậy không tìm thấy quan hệ để embed. Tái hiện trên Supabase local:
  `GET /rest/v1/showtimes?select=id,cinemas!inner(code)` → `PGRST200 Could not find a relationship between 'showtimes' and 'cinemas' in the schema cache`.
- Unit/e2e test của catalog đều mock Supabase client nên không bắt được; chưa có integration test nào gọi `GET /movies` trên DB thật.

## Description
1. Migration MỚI (versioned, không sửa migration cũ): thêm FK `showtimes_cinema_id_fkey` `showtimes(cinema_id) → cinemas(id)`. Dữ liệu cũ luôn hợp lệ vì FK ghép qua `rooms` đã ép `cinema_id` là rạp của phòng. Kết thúc migration bằng `notify pgrst, 'reload schema';`.
   - Gắn `HIGH_RISK_MIGRATION` (thêm FK trên bảng đã có dữ liệu) trong header migration + báo cáo: bảng/cột, lý do an toàn, rollback (`alter table ... drop constraint`), cách verify. Dự án demo chỉ có DB local, không promote production.
   - Kiểm tra FK mới có làm PostgREST mơ hồ (PGRST201) ở các embed khác đang dùng giữa `showtimes`/`rooms`/`cinemas` không (grep mọi `.from("showtimes")`, `showtimes(`, `showtimes!` trong `apps/api/src` và `apps/web/src`); nếu mơ hồ → chỉ rõ tên constraint trong embed.
2. pgTAP mới `supabase/tests/062_showtimes_cinema_fk.test.sql`: FK tồn tại; chèn suất với `cinema_id` không tồn tại bị từ chối.
3. Integration test mới `apps/api/test/integration/catalog-public.int-spec.ts` (Nest app thật + Supabase local, theo harness sẵn có): `GET /movies` (danh sách đang chiếu), chi tiết phim kèm lịch chiếu theo rạp/tỉnh, và các route catalog public khác có embed (rạp chi tiết + suất) trả 200 với dữ liệu đúng theo RunScope. Rà mọi truy vấn embed PostgREST khác trong `apps/api/src/modules/catalog` — cái nào hỏng tương tự thì sửa trong task này và nêu rõ.

## Acceptance Criteria
- [x] `GET /movies` và chi tiết phim trả 200 trên Supabase local có dữ liệu (integration test, không mock).
- [x] pgTAP 062 PASS; `pnpm db:test` toàn bộ PASS (migration áp bằng `pnpm exec supabase migration up`, KHÔNG `db reset`).
- [x] Không còn embed PostgREST nào trong catalog hỏng vì thiếu quan hệ (liệt kê đã rà).

## Files to Create/Modify
- `supabase/migrations/<timestamp>_showtimes_cinema_fk.sql` (mới)
- `supabase/tests/062_showtimes_cinema_fk.test.sql` (mới)
- `apps/api/test/integration/catalog-public.int-spec.ts` (mới)
- `apps/api/src/modules/catalog/*.ts` (chỉ khi cần chỉ rõ constraint / sửa embed hỏng khác)
- `docs/ERD.md` — KHÔNG sửa ở task này (task-07 đang sửa); dispatcher reconcile sau merge.

## Notes
Reviewer STRICT (DB/schema/migration). Classification / Risk: BUG, risk đỏ schema. Retry tối đa 3 attempt → `architecture_review_needed`.
