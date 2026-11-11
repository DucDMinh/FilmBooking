# Task 06: Giám sát Sentry (gắn cinema_id) + cảnh báo + a11y + hiệu năng (LCP/ISR)

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-60, R-74
- AC-xx: —

## Description
Sentry web + api (DSN từ env, tắt khi thiếu), tag `cinema_id`, cảnh báo: webhook sai chữ ký, tỷ lệ lỗi giữ ghế tăng, email FAILED (NFR-14). Hiệu năng: ISR/revalidate cho trang phim/rạp, ảnh next/image, preconnect API; Lighthouse CI budget LCP ≤ 2,5s trang chủ/phim/rạp (NFR-01). a11y: vitest-axe cho SeatMap + form chính, kiểm tương phản (NFR-12).

## Dependencies
- layer-7-task-09 (Web POS giả lập `/pos` (Staff) — giữ/nhả/gia hạn/xác nhận bán qua API )
- layer-6-task-03 (Web chọn ghế `/dat-ve/[showtimeId]`: SeatMap a11y + realtime + giữ ghế)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, pos, admi)

## Acceptance Criteria
- [ ] Lỗi thử ở API/web xuất hiện trong Sentry (hoặc transport mock) kèm tag cinema_id; không gửi PII (email/SĐT bị scrub).
- [ ] Lighthouse CI (mobile) trang chủ/phim/rạp: LCP ≤ 2,5s trên build production local (ghi số đo; cold start Render là rủi ro đã chấp nhận).
- [ ] axe: 0 vi phạm serious/critical cho SeatMap, đăng nhập, xác nhận đơn.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/web/src/instrumentation.ts`
- `apps/web/src/instrumentation-client.ts`
- `apps/web/next.config.ts`
- `apps/api/src/instrument.ts`
- `apps/api/src/main.ts`
- `lighthouserc.json`
- `apps/web/src/components/booking/__tests__/seat-map.a11y.test.tsx`

## Notes
Task duy nhất sửa next.config.ts + apps/api/src/main.ts ở layer 8.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
