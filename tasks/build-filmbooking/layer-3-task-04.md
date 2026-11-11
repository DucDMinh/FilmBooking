# Task 04: API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ, tìm kiếm

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-32, R-34, R-35, R-37, R-38, R-40, R-41, R-42, R-43, R-44, R-45
- AC-xx: AC-19

## Description
Public: `GET /provinces`, `GET /cinemas?province=`, `GET /cinemas/:code` (phòng, tiện ích, suất theo ngày), `GET /home` (banner, đang chiếu/sắp chiếu theo khu vực), `GET /movies?q=&genre=&age=&status=&province=`, `GET /movies/:slug` (+ lịch chiếu theo rạp/ngày). Quy tắc 'Sắp chiếu' (#13). Admin: CRUD phim (+nhãn tuổi), CRUD rạp (Admin tạo; Manager chỉ sửa thông tin rạp mình). Đổi trạng thái rạp sang tạm đóng chỉ là PATCH khi không còn suất tương lai đã bán (luồng huỷ hàng loạt ở layer-5-task-08).

## Dependencies
- layer-2-task-01 (Migration catalog: phim, phòng, sơ đồ ghế, suất chiếu (chống chồng giờ)
- layer-2-task-03 (Nest guards: AuthGuard (JWT Supabase), RolesGuard, CinemaScopeGuard, J)

## Acceptance Criteria
- [ ] Rạp CLOSED không xuất hiện ở danh sách công khai; rạp mới INSERT xuất hiện ngay (AC-19 phần API).
- [ ] Phim có ngày khởi chiếu tương lai và chưa có suất ở tỉnh → 'Sắp chiếu'; có suất chiếu sớm → 'Đang chiếu' (#13).
- [ ] Manager HN01 PATCH rạp HN02 → 403; Manager tạo rạp → 403; Admin tạo được.
- [ ] Giờ trả về UTC ISO, tiền VND int; zod schema trong shared dùng chung web.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/src/modules/catalog/catalog.module.ts`
- `apps/api/src/modules/catalog/cinemas.controller.ts`
- `apps/api/src/modules/catalog/cinemas.service.ts`
- `apps/api/src/modules/catalog/movies.controller.ts`
- `apps/api/src/modules/catalog/movies.service.ts`
- `packages/shared/src/schemas/catalog.ts`
- `apps/api/test/catalog.e2e-spec.ts`

## Notes
Module tự test bằng TestingModule; đăng ký vào app.module ở layer-4-task-07.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
- Test bằng mock SupabaseService (không cần DB). Lọc rạp theo trạng thái OPEN cho khách ở tầng API cũng áp dụng (R-33) kể cả khi RLS (layer-3-task-01) đã lọc. KHÔNG sửa `app.module.ts`: module đăng ký ở task wiring layer 4.
