# Task 04: Test huỷ suất + email hàng loạt + luồng auth (xác nhận email, khoá, liên kết)

> **Scope change: bỏ POS (CR remove-pos, spec 2.0.0, 2026-11-12).** Bỏ ca đơn POS khi huỷ suất.

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-04, R-05, R-06, R-11, R-20, R-21, R-108, R-109, R-110
- AC-xx: AC-01, AC-02, AC-03, AC-04, AC-05, AC-24, AC-25, AC-26

## Description
Integration: huỷ suất 10 đơn paid → affected, email outbox → job gửi (Resend mock) → trạng thái hiển thị; hoàn thủ công; đóng rạp bị chặn. Auth: chưa xác nhận bị chặn giữ ghế, resend cooldown, lockout 5 lần + email cảnh báo, OAuth trùng email không tự gộp (theo cơ chế chốt ở layer-4-task-06), huỷ liên kết phương thức cuối bị từ chối.

## Dependencies
- layer-6-task-07 (Harness integration test API ↔ Supabase local (helpers tạo user/role/r)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, admin, ord)

## Acceptance Criteria
- [x] AC-24, AC-25, AC-26 PASS end-to-end qua API.
- [x] AC-01, AC-02, AC-03 PASS.
- [x] AC-04, AC-05 PASS (hoặc ghi rõ phần không tự động hoá được do OAuth thật → kiểm tay, có checklist).

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/test/integration/cancel-showtime.int-spec.ts`
- `apps/api/test/integration/auth-flows.int-spec.ts`

## Notes
NFR-17. Reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.

## Kết quả builder
- `cancel-showtime.int-spec.ts` (15 test) + `auth-flows.int-spec.ts` (15 test) + helper mới `helpers/app-harness.ts` (boot app với Resend/Turnstile mock, drain outbox, psql qua `docker exec`, đếm Mailpit). Resend mock ở biên provider; không sửa source/migration.
- AC-04 được kiểm bằng guard DB (`guard_identity_insert`) mô phỏng bước GoTrue chèn identity OAuth; link-intent + `/me/identities` qua API thật.

### Checklist kiểm tay (OAuth thật, không tự động hoá được)
- [ ] Có tài khoản email/mật khẩu `a@x.com`; bấm "Đăng nhập Google" bằng Google `a@x.com` → không tạo user mới, không tự liên kết, giao diện yêu cầu đăng nhập mật khẩu (AC-04).
- [ ] Đăng nhập mật khẩu → Hồ sơ → "Liên kết Google" → thành công, nhận email thông báo liên kết (R-24).
- [ ] Tài khoản chỉ còn Facebook (đăng ký bằng Facebook, chưa đặt mật khẩu) → Huỷ liên kết Facebook → bị từ chối kèm hướng dẫn thêm mật khẩu/phương thức khác (AC-05).
- [ ] Facebook không trả email → nhập email trùng tài khoản có sẵn → thông báo chung "kiểm tra email", không lộ email tồn tại.
