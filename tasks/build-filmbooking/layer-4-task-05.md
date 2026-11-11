# Task 05: RPC check-in vé + view báo cáo MVP (doanh thu, theo phim/suất/rạp, đối soát PayOS, suất bị huỷ)

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-97, R-98, R-99, R-101, R-102, R-112, R-113, R-116, R-132
- AC-xx: AC-12, AC-13

## Description
`checkin_ticket(token_or_code, cinema_id)`: **kiểm rạp trước** — sai rạp chỉ trả tên + địa chỉ rạp đúng (không tên khách/ghế), không check-in; vé đã dùng → thời điểm + người soát lần đầu; suất huỷ/affected → từ chối; cửa sổ hợp lệ tới giờ bắt đầu + thời lượng phim (#11); ghi checkin_logs mọi lượt. Report RPC/view lọc theo rạp được gán: doanh thu theo kỳ, theo phim/suất/rạp, đối soát PayOS (lệch tiền, pending quá hạn), báo cáo suất bị huỷ (lát MVP của R-119: số đơn affected, đã xử lý, hoàn thủ công).

## Dependencies
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )

## Acceptance Criteria
- [x] AC-12: quét lại vé đã check-in → USED kèm checked_in_at + tên người soát lần đầu.
- [x] AC-13: vé HN01, Staff ở HN02 quét → WRONG_CINEMA chỉ có tên + địa chỉ HN01; vé không bị check-in; có log.
- [x] Quét sau giờ bắt đầu + thời lượng phim → EXPIRED.
- [x] Manager HN01 gọi báo cáo HN02 → rỗng/lỗi (RLS); Admin xem toàn chuỗi.

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111040400_rpc_checkin_reports.sql`
- `supabase/tests/044_checkin_reports.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
