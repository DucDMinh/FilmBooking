# Task 08: Web admin báo cáo MVP: doanh thu, theo phim/suất/rạp, đối soát PayOS, suất bị huỷ

## Layer
7

## Type
build (initial)

## Requirements
- R-xx: R-112, R-113, R-116
- AC-xx: AC-25

## Description
Màn 27 (phần MVP), biểu đồ bằng SVG/CSS thuần (không thêm thư viện chart): chọn kỳ + phạm vi rạp; doanh thu theo kỳ (biểu đồ cột đơn giản), bảng theo phim/suất/rạp, đối soát PayOS (lệch tiền, pending quá hạn), báo cáo suất bị huỷ (lát MVP của R-119, cần cho AC-25). Không có CSV báo cáo/so sánh rạp/lấp đầy (GĐ2).

## Dependencies
- layer-5-task-13 (Web admin shell: layout `/admin`, sidebar theo vai trò, bộ chọn phạm v)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)
- layer-5-task-07 (API đơn hàng & báo cáo: tra cứu đơn, đơn cần xử lý thủ công, báo cáo M)

## Acceptance Criteria
- [ ] Manager chỉ thấy rạp được gán; Admin có 'Toàn chuỗi'.
- [ ] Đơn refunded_manual xuất hiện trong báo cáo suất bị huỷ (AC-25).
- [ ] Số tiền định dạng VND; empty state khi không có dữ liệu.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/app/admin/bao-cao/page.tsx`
- `apps/web/src/components/admin/revenue-report.tsx`
- `apps/web/src/components/admin/payos-reconcile-table.tsx`
- `apps/web/src/components/admin/cancelled-showtimes-report.tsx`

## Notes
—
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
