# Task 01: Migration catalog: phim, phòng, sơ đồ ghế, suất chiếu (chống chồng giờ), khoá ghế, storage

## Layer
2

## Type
build (initial)

## Requirements
- R-xx: R-41, R-42, R-45, R-47, R-48, R-49, R-50, R-51, R-54, R-55
- AC-xx: AC-14

## Description
movies (slug, nhãn tuổi P/K/T13/T16/T18, ngày khởi chiếu, thời lượng, trạng thái), rooms (thuộc 1 rạp, định dạng hỗ trợ), seats (hàng×cột, loại NORMAL/VIP/SWEETBOX chiếm 2 ô/AISLE/BROKEN, nhãn ghế), showtimes (cinema, room, movie, starts_at UTC, ends_at gồm dọn phòng, format, ngôn ngữ, trạng thái ON_SALE/CLOSED/CANCELLED) + **exclusion constraint** (room_id, tstzrange) chống chồng giờ, showtime_seat_locks (Manager khoá ghế theo suất). Bucket storage posters/banners/cinema-images/avatars + policy. RLS: public đọc; Manager/Admin ghi theo rạp; movies chỉ Admin ghi.

## Dependencies
- layer-1-task-03 (Migration lõi: profiles, vai trò & gán rạp, rạp, cấu hình, consent, yê)

## Acceptance Criteria
- [ ] pgTAP AC-14: suất 19:00–21:15 phòng 1 HN01 tồn tại → insert 21:00 phòng 1 HN01 lỗi exclusion; 21:00 phòng 1 HN02 thành công.
- [ ] Manager HN01 không insert được showtime/room của HN02 (RLS).
- [ ] Sweetbox lưu 1 seat chiếm 2 ô; không thể đặt seat trùng ô trong 1 phòng (unique).
- [ ] Storage: anon đọc poster; chỉ Admin upload poster; user chỉ ghi avatar thư mục của mình.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111020000_catalog.sql`
- `supabase/tests/020_catalog.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod. Trigger bảo vệ suất đã bán vé (R-54) làm ở layer-3-task-02 vì cần bảng đơn.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
