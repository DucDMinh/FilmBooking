# Task 02: Migration bảo mật & vận hành: login attempts, rate limit, email dùng một lần, outbox, khoá API POS, cron xoá tài khoản

## Layer
2

## Type
build (initial)

## Requirements
- R-xx: R-08, R-09, R-10, R-11, R-86, R-109, R-111, R-130
- AC-xx: AC-03

## Description
login_attempts + hàm `register_login_failure/clear` (khoá 15' sau 5 lần sai), rate_limit_buckets + `hit_rate_limit(key, window, max)` nguyên tử, disposable_email_domains (seed danh sách phổ biến), email_outbox (kind, to, payload, cinema_id, status PENDING/SENT/FAILED, attempts, next_attempt_at), pos_api_keys (cinema_id, key_hash, prefix, revoked_at), pos_api_logs. pg_cron hằng giờ: xoá tài khoản chưa xác nhận > 7 ngày, **trừ** tài khoản Facebook (#14). Tất cả bảng RLS (chỉ service role / Admin đọc).

## Dependencies
- layer-1-task-03 (Migration lõi: profiles, vai trò & gán rạp, rạp, cấu hình, consent, yê)

## Acceptance Criteria
- [ ] pgTAP: 5 lần `register_login_failure` → `is_locked` true trong 15'; sau 15' mở (AC-03 phần DB).
- [ ] `hit_rate_limit` trả false khi vượt ngưỡng trong cửa sổ; chạy 2 transaction không vượt tổng (dùng row lock).
- [ ] Cron job tồn tại trong `cron.job`; hàm xoá bỏ qua user có identity facebook (test bằng gọi trực tiếp hàm).
- [ ] anon/authenticated không SELECT được pos_api_keys, email_outbox (RLS).
- [ ] (bổ sung từ review layer-0/task-02 F3) Hook `before_user_created`: chặn tạo user **email/password** không đi qua Admin API của Nest (vd thiếu cờ `app_metadata.created_via = 'nest'`) → đăng ký/khôi phục trực tiếp qua GoTrue không bỏ qua được Turnstile (R-07), đồng ý điều khoản (R-03), blocklist (R-09); user OAuth (Google/Facebook) vẫn tạo được. Bật hook trong `supabase/config.toml` `[auth.hook.before_user_created]`. pgTAP test hàm hook: email không cờ → từ chối; OAuth → cho phép.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111020100_security_ops.sql`
- `supabase/tests/021_security_ops.test.sql`
- `supabase/config.toml`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
