# Task 06: Web Staff: chọn rạp làm việc + soát vé QR/nhập mã + kết quả màu

## Layer
6

## Type
build (initial)

## Requirements
- R-xx: R-97, R-98, R-99, R-101, R-102, R-132
- AC-xx: AC-12, AC-13

## Description
Màn 17 + B14/B15: chọn rạp làm việc (lưu phiên), camera quét QR (html5-qrcode) + nhập mã thủ công, kết quả toàn màn hình theo màu (xanh OK, đỏ USED/WRONG_CINEMA/CANCELLED/EXPIRED) kèm thông tin tối thiểu, lịch sử lượt quét gần nhất.

## Dependencies
- layer-5-task-04 (API soát vé: quét QR/nhập mã theo rạp làm việc)
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)

## Acceptance Criteria
- [ ] AC-12 (UI): USED hiển thị thời điểm + người soát lần đầu, nền đỏ.
- [ ] AC-13 (UI): WRONG_CINEMA hiển thị tên + địa chỉ rạp đúng, không tên khách/ghế.
- [ ] Không có quyền camera → fallback nhập mã.
- [ ] Kết quả có text + icon (không chỉ dựa màu — WCAG).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/staff/layout.tsx`
- `apps/web/src/app/staff/chon-rap/page.tsx`
- `apps/web/src/app/staff/soat-ve/page.tsx`
- `apps/web/src/components/staff/qr-scanner.tsx`
- `apps/web/src/components/staff/checkin-result.tsx`
- `apps/web/src/components/staff/__tests__/checkin-result.test.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
