# Task 01: Test đồng thời giữ ghế web↔web↔POS + hết hạn + tải ≥20 hold/giây

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-62, R-63, R-122, R-123, R-124
- AC-xx: AC-06, AC-07, AC-21, AC-22

## Description
Integration trên Supabase local qua API thật: N client web + POS bắn cùng ghế/cùng lúc; kiểm không bao giờ có 2 bản ghi giữ/bán cho 1 ghế; hết hạn hold web/POS; tải 20 hold/s trong 30s (NFR-02) đo p95 giữ ghế ≤ 1s (NFR-01).

## Dependencies
- layer-6-task-07 (Harness integration test API ↔ Supabase local (helpers tạo user/role/r)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)

## Acceptance Criteria
- [ ] AC-06: 2 khách cùng E5 đồng thời → đúng 1 thành công (lặp 50 lần).
- [ ] AC-21: web giữ F8, POS hold F8 → 409; web + POS cùng F9 đồng thời → đúng 1 thắng (lặp 50 lần).
- [ ] AC-07 / AC-22: hold web 10' (cấu hình rút ngắn trong test) và POS 5' hết hạn → ghế đọc là trống, đơn expired sau cron.
- [ ] 100 client × ghế ngẫu nhiên: 0 ghế bán trùng; p95 hold ≤ 1s trên local (ghi số đo vào task).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/test/integration/concurrency.int-spec.ts`
- `apps/api/test/integration/hold-expiry.int-spec.ts`

## Notes
NFR-17 bắt buộc. Reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
