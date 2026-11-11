# Task 11: Web chi tiết phim + lịch chiếu `/lich-chieu` + stepper đặt vé + SEO phim

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-42, R-44, R-45, R-46
- AC-xx: —

## Description
Màn 02 + 05: thông tin phim, trailer, nhãn tuổi, lịch chiếu theo ngày × rạp (khu vực đã chọn), suất đã qua mốc đóng bán online hiển thị 'Mua tại quầy'; phim sắp chiếu chưa có suất → thông báo. Stepper 4 bước (D2). metadata + Open Graph + JSON-LD `Movie`/`ScreeningEvent`.

## Dependencies
- layer-2-task-04 (Web data layer: API client REST, map mã lỗi → tiếng Việt, Supabase SSR)
- layer-2-task-05 (Web shell công khai + component chung + trang pháp lý)
- layer-3-task-04 (API catalog công khai + quản lý rạp: rạp, tỉnh/thành, phim, trang chủ,)

## Acceptance Criteria
- [x] SSR + generateMetadata; JSON-LD hợp lệ (test parse schema).
- [x] Giờ hiển thị Asia/Ho_Chi_Minh; chọn suất → `/dat-ve/[showtimeId]`.
- [x] Stepper hiển thị đúng bước hiện tại, aria-current.
- [x] Phim chưa có suất → empty state 'Sắp chiếu' (R-45).

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/phim/[slug]/page.tsx`
- `apps/web/src/app/(public)/lich-chieu/page.tsx`
- `apps/web/src/components/catalog/showtime-schedule.tsx`
- `apps/web/src/components/booking/booking-stepper.tsx`
- `apps/web/src/lib/seo/movie-jsonld.ts`
- `apps/web/src/components/catalog/__tests__/schedule.test.tsx`

## Notes
Stepper dùng lại ở layer 6.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
