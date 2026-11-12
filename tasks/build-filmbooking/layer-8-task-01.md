# Task 01: Test đồng thời giữ ghế web↔web + hết hạn + tải ≥20 hold/giây

> **Scope change: bỏ POS (CR remove-pos, spec 2.0.0, 2026-11-12).** Bỏ R-122/123/124, AC-21, AC-22 (tranh ghế web↔POS, hold POS 5'). Đồng thời web↔web (AC-06) giữ nguyên.

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-62, R-63
- AC-xx: AC-06, AC-07

## Description
Integration trên Supabase local qua API thật: N client web bắn cùng ghế/cùng lúc; kiểm không bao giờ có 2 bản ghi giữ/bán cho 1 ghế; hết hạn hold web; tải 20 hold/s trong 30s (NFR-02) đo p95 giữ ghế ≤ 1s (NFR-01).

## Dependencies
- layer-6-task-07 (Harness integration test API ↔ Supabase local (helpers tạo user/role/r)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, admin, ord)

## Acceptance Criteria
- [ ] AC-06: 2 khách cùng E5 đồng thời → đúng 1 thành công (lặp 50 lần).
- [ ] AC-07: hold web 10' (cấu hình rút ngắn trong test) hết hạn → ghế đọc là trống, đơn expired sau cron.
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
