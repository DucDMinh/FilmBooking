# Task 05: API vận hành rạp: phòng, sơ đồ ghế, suất chiếu (đơn lẻ + hàng loạt), đóng bán, khoá ghế, cấu hình rạp

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-47, R-48, R-49, R-50, R-51, R-54, R-55, R-56
- AC-xx: AC-14

## Description
CRUD phòng; lưu/sao chép sơ đồ ghế (validate sweetbox 2 ô, lối đi); tạo suất đơn lẻ + hàng loạt (nhiều ngày × khung giờ) tự tính ends_at = thời lượng + dọn phòng; xung đột trả danh sách suất trùng; đóng/mở bán suất; khoá/mở khoá ghế theo suất; cấu hình rạp (dọn phòng, mốc đóng bán online). Tất cả gắn CinemaScope.

## Dependencies
- layer-2-task-01 (Migration catalog: phim, phòng, sơ đồ ghế, suất chiếu (chống chồng giờ)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] AC-14 qua API: tạo 21:00 phòng 1 HN01 khi đã có 19:00–21:15 → 409 kèm suất trùng; HN02 → 201.
- [ ] Tạo hàng loạt: 1 suất trùng thì báo cụ thể, các suất hợp lệ tuỳ chọn 'bỏ qua trùng' (atomic khi không chọn).
- [ ] Sửa suất đã bán vé → 409 (R-54); đóng bán vẫn cho phép.
- [ ] Manager HN01 thao tác phòng HN02 → 403.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/cinema-ops/cinema-ops.module.ts`
- `apps/api/src/modules/cinema-ops/rooms.controller.ts`
- `apps/api/src/modules/cinema-ops/seat-layout.service.ts`
- `apps/api/src/modules/cinema-ops/showtimes.controller.ts`
- `apps/api/src/modules/cinema-ops/showtimes.service.ts`
- `packages/shared/src/schemas/cinema-ops.ts`
- `apps/api/test/cinema-ops.e2e-spec.ts`

## Notes
Đăng ký vào app.module ở layer-4-task-07.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
