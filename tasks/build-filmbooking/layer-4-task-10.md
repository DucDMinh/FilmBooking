# Task 10: Web trang chủ + danh sách/tìm phim + chọn tỉnh/thành

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-31, R-35, R-40, R-43, R-45
- AC-xx: —

## Description
Màn 01/30 + B1 + B10: hero/banner, Đang chiếu/Sắp chiếu theo khu vực, khu 'Rạp yêu thích' hoặc 'Rạp tại {tỉnh}' (D9, không xin định vị), tìm & lọc phim (từ khoá, thể loại, nhãn tuổi, trạng thái) với query string; ProvincePickerDialog lần đầu, lưu cookie (+ profile nếu đăng nhập).

## Dependencies
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)
- layer-2-task-05 (Web shell công khai + component chung + trang pháp lý)
- layer-3-task-04 (API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ,)

## Acceptance Criteria
- [ ] SSR trang chủ và /phim (NFR-13); lọc phản ánh lên URL, back/forward hoạt động.
- [ ] Lần đầu không có cookie tỉnh → dialog chọn tỉnh; chọn xong lưu cookie, không hỏi lại.
- [ ] Empty state khi không có phim khớp; skeleton khi tải.
- [ ] Responsive 360px; card có alt poster + AgeBadge.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/page.tsx`
- `apps/web/src/app/(public)/phim/page.tsx`
- `apps/web/src/components/catalog/movie-card.tsx`
- `apps/web/src/components/catalog/movie-filters.tsx`
- `apps/web/src/components/catalog/province-picker-dialog.tsx`
- `apps/web/src/components/catalog/__tests__/home.test.tsx`

## Notes
Không xin geolocation (R-36 GĐ2).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
