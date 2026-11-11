# Task 13: Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm vi rạp

## Layer
5

## Type
build (initial)

## Requirements
- R-xx: R-39, R-105
- AC-xx: —

## Description
Shell chung Admin/Manager/Staff (D4): sidebar lọc theo vai trò (nav-config khai **toàn bộ** mục MVP, mục GĐ2 không có), topbar chọn phạm vi rạp (Admin: Toàn chuỗi + từng rạp; Manager/Staff: rạp được gán), lưu scope vào URL `?cinema=`. Lấy vai trò từ `GET /me`; CUSTOMER vào /admin → 403 page.

## Dependencies
- layer-3-task-03 (Wiring API #1: đăng ký AuthModule global + MeModule, sinh database.typ)
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)

## Acceptance Criteria
- [ ] Staff chỉ thấy: Việc cần làm, Đơn hàng, Đơn bị ảnh hưởng, Soát vé, POS; Manager thêm rạp/phòng/lịch/giá/báo cáo/nhân sự; Admin đủ.
- [ ] Customer truy cập /admin → trang 403.
- [ ] Scope switcher chỉ liệt kê rạp được gán; đổi scope cập nhật query.
- [ ] Sidebar điều hướng bàn phím được; responsive dạng Sheet trên mobile.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/layout.tsx`
- `apps/web/src/components/admin/admin-sidebar.tsx`
- `apps/web/src/components/admin/nav-config.ts`
- `apps/web/src/components/admin/cinema-scope-switcher.tsx`
- `apps/web/src/components/admin/use-admin-scope.ts`
- `apps/web/src/components/admin/__tests__/shell.test.tsx`

## Notes
Kiểm quyền thật nằm ở Nest/RLS; UI chỉ ẩn.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
