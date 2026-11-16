# Task 02: Test phân quyền theo rạp & dữ liệu khách (RLS + Nest guard)

> **Scope change: bỏ POS (CR remove-pos, spec 2.0.0, 2026-11-12).** Bỏ R-120, AC-23 (khoá API POS sai rạp).

## Layer
8

## Type
build (initial)

## Requirements
- R-xx: R-39, R-102, R-103
- AC-xx: AC-13, AC-16, AC-17

## Description
Ma trận quyền §5.3: Staff/Manager HN01 thử đọc/ghi suất, đơn, báo cáo, đơn affected, khoá ghế của HN02 qua API **và** truy vấn trực tiếp Supabase bằng JWT (bỏ qua Nest) → bị chặn; khách A đọc đơn/vé khách B → rỗng; pgTAP kiểm mọi bảng public có RLS.

## Dependencies
- layer-6-task-07 (Harness integration test API ↔ Supabase local (helpers tạo user/role/r)
- layer-6-task-01 (Wiring API #4: đăng ký booking, payment, mail/jobs, checkin, admin, ord)

## Acceptance Criteria
- [x] AC-16: Manager HN01 → không nhận/không sửa dữ liệu HN02 (API 403 + query trực tiếp trả 0 dòng).
- [x] AC-17: khách A truy vấn đơn khách B → 0 dòng.
- [x] AC-13: Staff HN02 quét vé HN01 → WRONG_CINEMA, không lộ PII.
- [x] pgTAP: không còn bảng public nào thiếu RLS.

## DoD (Definition of Done)
- [x] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [x] Tests added + pass
- [x] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [x] Reviewer độc lập PASS
- [x] committed (1 task = 1 commit)

## Files to Create/Modify
- `apps/api/test/integration/rls-scope.int-spec.ts`
- `supabase/tests/090_rls_matrix.test.sql`

## Notes
NFR-05/NFR-17. Reviewer STRICT.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
