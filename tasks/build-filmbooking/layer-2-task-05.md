# Task 05: Web shell công khai + component chung + trang pháp lý

## Layer
2

## Type
build (initial)

## Requirements
- R-xx: R-03, R-25, R-42, R-133
- AC-xx: —

## Description
Header (logo, nav Phim/Rạp/Lịch chiếu — ẩn 'Khuyến mãi' D8, nút đăng nhập/avatar), footer có link pháp lý, layout nhóm (auth). Component: Empty/Error/Loading states (§6 design-spec), `<Money>` VND, `<DateTime>` giờ VN, `<AgeBadge>` P/K/T13/T16/T18. Trang tĩnh: Điều khoản (có điều khoản không huỷ/không hoàn — lớp cảnh báo 1 của R-133), Chính sách bảo mật (NĐ 13/2023), Hướng dẫn xoá dữ liệu Facebook (R-25).

## Dependencies
- layer-1-task-01 (Scaffold Next.js (App Router) + Tailwind v4 tokens + shadcn/ui + trang)

## Acceptance Criteria
- [ ] Header responsive ≥360px, điều hướng bàn phím được, focus visible (NFR-11/12).
- [ ] 3 trang pháp lý render SSR, có title/meta; footer link tới cả 3.
- [ ] AgeBadge render đúng 5 nhãn kèm mô tả cho screen reader.
- [ ] Test snapshot/role cho states + Money (`120.000 ₫`).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/(public)/layout.tsx`
- `apps/web/src/app/(auth)/layout.tsx`
- `apps/web/src/components/shell/site-header.tsx`
- `apps/web/src/components/shell/site-footer.tsx`
- `apps/web/src/components/common/states.tsx`
- `apps/web/src/components/common/money.tsx`
- `apps/web/src/components/common/age-badge.tsx`
- `apps/web/src/app/(public)/dieu-khoan/page.tsx`
- `apps/web/src/app/(public)/chinh-sach-bao-mat/page.tsx`
- `apps/web/src/app/(public)/huong-dan-xoa-du-lieu/page.tsx`
- `apps/web/src/components/common/__tests__/common.test.tsx`

## Notes
(public)/layout.tsx: layer 5 thêm UnverifiedEmailBanner (layer-5-task-11).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
