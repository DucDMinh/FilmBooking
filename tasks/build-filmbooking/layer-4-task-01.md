# Task 01: RPC giữ/nhả/gia hạn ghế nguyên tử (web + POS) + dọn hold hết hạn

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-55, R-61, R-62, R-63, R-64, R-65, R-66, R-67, R-72, R-122, R-123, R-124
- AC-xx: AC-06, AC-07, AC-21, AC-22

## Description
`hold_seats(showtime_id, seat_ids[], channel, request_id, actor)` SECURITY DEFINER, 1 transaction: suất ON_SALE (web: trước mốc đóng bán online; POS: chưa huỷ/đóng bán), ghế không bị Manager khoá, web: huỷ đơn giữ cũ của khách (1 đơn giữ/khách — R-64), ≤ 8 ghế (sweetbox tính 2), quy tắc không để ghế lẻ, insert showtime_seat_states — hold có expires_at quá hạn coi như trống và bị thay; trùng ⇒ rollback toàn bộ + trả danh sách ghế trùng; chốt giá qua price_quote; expires_at = web theo app_settings (10') / POS 5'. `release_seats`, `extend_pos_hold`. pg_cron mỗi phút: đơn holding quá hạn → expired, xoá hold.

## Dependencies
- layer-3-task-01 (Migration bảng giá 2 cấp + ngày lễ + hàm price_quote)
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )

## Acceptance Criteria
- [ ] pgTAP: giữ ghế đã HELD còn hạn → lỗi SEAT_TAKEN kèm seat; hold hết hạn → giữ được (AC-07 nền).
- [ ] Ghế lẻ: chọn để trống 1 ghế giữa → ORPHAN_SEAT; 9 ghế (hoặc 7 + 1 sweetbox) → HOLD_LIMIT.
- [ ] Web sau mốc đóng bán online → SALES_CLOSED; POS cùng thời điểm vẫn giữ được (R-67 chỉ chặn web).
- [ ] POS hold expires_at = now()+5' (AC-22); extend_pos_hold gia hạn; web hold đọc thời gian từ app_settings.
- [ ] Giá chốt lưu order_seats khớp price_quote tại thời điểm giữ (R-72).
- [ ] Test đồng thời thực (2 kết nối) để ở layer-8-task-01; ở đây kiểm unique + rollback toàn bộ.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111040000_rpc_hold.sql`
- `supabase/tests/040_hold.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod. Đây là bất biến #1 (không bán trùng) — reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
