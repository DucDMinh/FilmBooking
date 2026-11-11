# Task 04: Test huỷ suất + email hàng loạt + luồng auth (xác nhận email, khoá, liên kết)

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-04, R-05, R-06, R-11, R-20, R-21, R-108, R-109, R-110
- AC-xx: AC-01, AC-02, AC-03, AC-04, AC-05, AC-24, AC-25, AC-26

## Description
Integration: huỷ suất 10 đơn paid (WEB + POS) → affected, email outbox → job gửi (Resend mock) → trạng thái hiển thị; hoàn thủ công; đóng rạp bị chặn. Auth: chưa xác nhận bị chặn giữ ghế, resend cooldown, lockout 5 lần + email cảnh báo, OAuth trùng email không tự gộp (theo cơ chế chốt ở layer-4-task-06), huỷ liên kết phương thức cuối bị từ chối.

## Dependencies
- layer-6-task-07 (Harness integration test API ↔ Supabase local (helpers tạo user/role/r)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)

## Acceptance Criteria
- [ ] AC-24, AC-25, AC-26 PASS end-to-end qua API.
- [ ] AC-01, AC-02, AC-03 PASS.
- [ ] AC-04, AC-05 PASS (hoặc ghi rõ phần không tự động hoá được do OAuth thật → kiểm tay, có checklist).
- [ ] Đơn POS bị huỷ suất: không có email, cờ liên hệ tại quầy.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/test/integration/cancel-showtime.int-spec.ts`
- `apps/api/test/integration/auth-flows.int-spec.ts`

## Notes
NFR-17. Reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
