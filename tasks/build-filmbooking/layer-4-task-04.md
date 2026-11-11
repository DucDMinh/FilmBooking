# Task 04: RPC huỷ suất hàng loạt + chặn đóng rạp còn suất đã bán

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-33, R-108, R-109, R-110, R-127, R-134
- AC-xx: AC-24, AC-26

## Description
`preview_cancel_showtimes(ids)` (số đơn paid, holding). `cancel_showtimes(ids, reason, actor)`: suất CANCELLED, nhả hold, đơn holding/pending_payment → cancelled, đơn paid WEB **và** POS → affected, vé vô hiệu check-in; enqueue email cho đơn có email, đơn POS đánh dấu 'liên hệ tại quầy' (#8); ghi audit. `set_cinema_status(cinema, status)`: chặn TEMP_CLOSED/CLOSED nếu còn suất tương lai đã bán chưa huỷ (AC-26).

## Dependencies
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )
- layer-2-task-02 (Migration bảo mật & vận hành: login attempts, rate limit, email dùng m)

## Acceptance Criteria
- [ ] AC-24 DB: suất có 10 đơn paid → 10 affected, 10 email PENDING trong outbox, hold_seats/POS trả SHOWTIME_CANCELLED (R-127).
- [ ] Đơn POS paid → affected + cờ counter_contact, không có email.
- [ ] AC-26: rạp còn 3 suất tương lai đã bán → set_cinema_status lỗi kèm danh sách 3 suất; sau khi huỷ 3 suất → đổi được.
- [ ] Chỉ Manager rạp đó/Admin gọi được (kiểm trong hàm theo auth.uid()).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111040300_rpc_cancel.sql`
- `supabase/tests/043_cancel.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod. Reviewer STRICT (bulk update, email hàng loạt).
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
