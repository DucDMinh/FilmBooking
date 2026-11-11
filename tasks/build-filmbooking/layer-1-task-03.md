# Task 03: Migration lõi: profiles, vai trò & gán rạp, rạp, cấu hình, consent, yêu thích, audit + RLS helper

## Layer
1

## Type
build (initial)

## Requirements
- R-xx: R-03, R-17, R-26, R-30, R-31, R-32, R-35, R-38, R-39, R-56, R-106, R-107
- AC-xx: AC-16

## Description
Bảng: provinces, profiles (trigger tạo từ auth.users; họ tên, SĐT, ngày sinh, giới tính, avatar_url, marketing_opt_in, province_id), staff_assignments (user ↔ cinema ↔ role STAFF/MANAGER), user_roles (ADMIN), cinemas (code unique, trạng thái OPEN/TEMP_CLOSED/CLOSED, địa chỉ, toạ độ rạp, cleaning_minutes, online_cutoff_minutes), app_settings (giữ ghế web 10' mặc định — #12, nội dung cảnh báo, phiên bản điều khoản) + cinema_settings override, consents (user, loại, phiên bản, thời điểm), favorite_cinemas, audit_logs + hàm trigger audit chung (before/after, actor, cinema_id). Hàm `is_admin()`, `has_cinema_role(cinema_id, roles[])`. RLS bật cho mọi bảng.

## Dependencies
- layer-0-task-02 (Supabase init + extension + CI GitHub Actions)

## Acceptance Criteria
- [ ] Mọi bảng mới có RLS ENABLE (pgTAP kiểm `relrowsecurity`).
- [ ] pgTAP: Manager gán HN01 không đọc/sửa được cinema_settings/staff_assignments của HN02 (AC-16 phần lõi); khách chỉ đọc/sửa profile của mình.
- [ ] Tạo user auth → profile tự sinh; email so sánh không phân biệt hoa thường (citext).
- [ ] Sửa cinemas ghi 1 dòng audit_logs có before/after + actor + cinema_id (R-107).
- [ ] Thêm rạp mới chỉ bằng INSERT, không cần code (R-38).

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111010000_core_identity_chain.sql`
- `supabase/tests/010_core_rls.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
