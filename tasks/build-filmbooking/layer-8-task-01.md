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
- [x] AC-06: 2 khách cùng E5 đồng thời → đúng 1 thành công (lặp 50 lần).
- [x] AC-07: hold web 10' (cấu hình rút ngắn trong test) hết hạn → ghế đọc là trống, đơn expired sau cron.
- [x] 100 client × ghế ngẫu nhiên: 0 ghế bán trùng; p95 hold ≤ 1s trên local (ghi số đo vào task).

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/test/integration/concurrency.int-spec.ts`
- `apps/api/test/integration/hold-expiry.int-spec.ts`

## Notes
NFR-17 bắt buộc. Reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.

## Kết quả đo (builder, Supabase local, máy chạy song song 4 builder)
- Spec: `concurrency.int-spec.ts` (AC-06 x50, 100 client, tải 20/s x 30s), `hold-expiry.int-spec.ts` (AC-07). Helper mới: `helpers/api-app.ts`, `helpers/booking-fixtures.ts`.
- 100 client đến theo nhịp 20/s, 40 ghế ngẫu nhiên: 0 ghế trùng, p95 = 37-46ms.
- Tải 600 hold / 30s (~20/s): p95 = 42ms, 58ms, 371ms, 590ms qua 4 lần chạy (nhiễu do máy tải); max 1042ms. Ngưỡng p95 <= 1000ms đạt cả 4 lần.
- Burst 100 request CÙNG LÚC (ngoài NFR-02): p95 = 1.6-2.9s; chỉ kiểm tính đúng (0 trùng, mọi thua là 409 SEAT_TAKEN), không chặn p95.
- Hết hạn: backdate `hold_expires_at`/`expires_at` (không đổi app_settings dùng chung); seatmap đọc FREE, cron `expire_overdue_holds` -> đơn `expired`, ghế được dọn.
