# Task 09: Seed demo: 5 rạp, phòng, sơ đồ ghế, phim, bảng giá, ngày lễ, suất 7 ngày, tài khoản mẫu

## Layer
4

## Type
build (initial)

## Requirements
- R-xx: R-38
- AC-xx: —

## Description
Seed idempotent cho local/dev (NFR-09): 5 rạp (HN01, HN02, HN03, HCM01, DN01) mỗi rạp 3–5 phòng, sơ đồ có VIP/Sweetbox/lối đi, ~12 phim (đủ nhãn tuổi, có phim sắp chiếu), bảng giá chuỗi + override HN02 (AC-15), ngày lễ, suất 7 ngày tới không chồng giờ, tài khoản admin/manager HN01/staff HN02/khách (mật khẩu chỉ cho local), 1 khoá API POS mỗi rạp (lưu hash; plaintext chỉ in README local).

## Dependencies
- layer-3-task-01 (Migration bảng giá 2 cấp + ngày lễ + hàm price_quote)
- layer-3-task-02 (Migration bảng đơn hàng, trạng thái ghế, vé, thanh toán, voucher, đơn )

## Acceptance Criteria
- [ ] Seed apply sạch trên DB local mới (`pnpm db:stop` + `pnpm db:start` trên volume mới, hoặc `psql -f supabase/seed.sql` vào DB local) — chỉ local, cấm staging/prod; KHÔNG dùng lệnh reset bị agent-guard chặn.
- [ ] Mọi suất seed hợp lệ với exclusion constraint; có ít nhất 1 suất đang bán trong 2 giờ tới để demo.
- [ ] Không chứa secret thật; README ghi rõ chỉ dùng local.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/seed.sql`
- `supabase/seed/README.md`

## Notes
seed.sql chỉ task này sửa.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
