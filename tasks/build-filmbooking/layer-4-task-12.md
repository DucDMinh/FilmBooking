# Task 12: Web hệ thống rạp + chi tiết rạp (bản đồ Leaflet) + nút rạp yêu thích + sitemap/robots

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-31, R-34, R-37, R-46
- AC-xx: —

## Description
Màn 03 + 04: danh sách rạp theo tỉnh, chi tiết rạp (địa chỉ, bản đồ OSM/Leaflet tải lazy chỉ client, lịch chiếu theo ngày), nút yêu thích (đăng nhập), JSON-LD `MovieTheater`; sitemap gồm phim/rạp/trang pháp lý.

## Dependencies
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)
- layer-2-task-05 (Web shell công khai + component chung + trang pháp lý)
- layer-3-task-04 (API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ,)
- layer-3-task-07 (API hồ sơ khách: xem/sửa, đổi email, ảnh đại diện, xoá tài khoản, tuỳ )

## Acceptance Criteria
- [x] SSR trang rạp; bản đồ không chặn LCP (dynamic import, ssr:false).
- [x] Chưa đăng nhập bấm yêu thích → chuyển `/dang-nhap?next=` (R-16).
- [x] `/sitemap.xml` liệt kê rạp OPEN + phim; `/robots.txt` chặn /admin, /staff, /pos, /tai-khoan.
- [x] Không lưu toạ độ người dùng (NFR-08).

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/rap/page.tsx`
- `apps/web/src/app/(public)/rap/[code]/page.tsx`
- `apps/web/src/components/catalog/cinema-map.tsx`
- `apps/web/src/components/catalog/favorite-button.tsx`
- `apps/web/src/lib/seo/cinema-jsonld.ts`
- `apps/web/src/app/sitemap.ts`
- `apps/web/src/app/robots.ts`

## Notes
sitemap.ts/robots.ts chỉ task này tạo.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
