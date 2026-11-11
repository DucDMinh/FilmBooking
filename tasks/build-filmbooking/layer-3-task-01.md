# Task 01: Migration bảng giá 2 cấp + ngày lễ + hàm price_quote

## Layer
3

## Type
build (initial)

## Requirements
- R-xx: R-52, R-53, R-57, R-72
- AC-xx: AC-15

## Description
price_rules (scope CHAIN/CINEMA/SHOWTIME, seat_type, format 2D/3D, day_type NORMAL/WEEKEND/HOLIDAY, time_band BEFORE_17/AFTER_17, amount VND int), holidays (ngày, tên). Hàm STABLE `price_quote(showtime_id, seat_ids[])`: ưu tiên suất › rạp › chuỗi; loại ngày lễ › cuối tuần (T7+CN) › thường; khung giờ theo **giờ bắt đầu suất giờ VN**, 17:00 thuộc 'sau 17h'; Sweetbox giá theo cặp (#19). RLS: đọc public, Manager ghi rule CINEMA/SHOWTIME rạp mình, Admin ghi CHAIN + holidays.

## Dependencies
- layer-2-task-01 (Migration catalog: phim, phòng, sơ đồ ghế, suất chiếu (chống chồng giờ)

## Acceptance Criteria
- [ ] pgTAP AC-15: chuỗi VIP 2D tối cuối tuần 120.000, HN02 override 100.000 → suất 2D T7 19:00 tại HN02 = 100.000; HN01 = 120.000.
- [ ] Suất bắt đầu đúng 17:00 VN tính 'sau 17h'; 16:59 tính 'trước 17h'.
- [ ] Ngày lễ rơi vào Chủ nhật → áp giá HOLIDAY (ưu tiên hơn WEEKEND).
- [ ] Sweetbox trả 1 dòng giá cặp; tổng tiền là số nguyên VND.
- [ ] (follow-up L2) Migration RIÊNG `supabase/migrations/20261111030010_security_ops_hardening.sql`: `is_disposable_email` khớp cả subdomain (lấy phần sau `@` CUỐI, so sánh suffix) và không mất index; `hit_rate_limit` validate `p_window` null và `p_max <= 0` (raise lỗi rõ); purge định kỳ (cron) cho `rate_limit_buckets`, `login_attempts`, `pos_api_logs` quá hạn; sửa test "không gia hạn" cũ (đặt `locked_until=now()+5m` trước rồi assert không đổi) trong file test MỚI `supabase/tests/032_security_ops_hardening.test.sql` (không sửa file test cũ); test quyền: hook + `delete_unconfirmed_users` + `supabase_auth_admin` execute; anon/authenticated KHÔNG execute các hàm service_role.
- [ ] (follow-up L2, G1) Migration RIÊNG `supabase/migrations/20261111030020_catalog_fixes.sql`: trigger tính lại `ends_at` của các suất tương lai (chưa bán vé) khi đổi thời lượng phim (`movies.duration_minutes` hoặc tên cột thật) hoặc thời gian dọn phòng của rạp; chốt MỘT nguồn override dọn phòng (`cinemas.cleaning_minutes` hoặc `cinema_settings` — ghi quyết định vào comment migration + ERD note) và dùng nó trong `showtimes_derive_end`; nếu tính lại gây chồng giờ → lỗi rõ (không bỏ qua im lặng). Test trong `supabase/tests/033_catalog_fixes.test.sql`.
- [ ] (follow-up L2, G2) Trong `20261111030020_catalog_fixes.sql`: `showtimes_select` cho anon/khách CHỈ thấy suất của rạp trạng thái OPEN (R-33: rạp TEMP_CLOSED/CLOSED không hiển thị suất mới); nhân sự/Admin vẫn thấy theo quyền. Test.

## DoD (Definition of Done)
- [ ] Code written (chỉ trong scope, đúng Files to Create/Modify)
- [ ] Tests added + pass
- [ ] Migration local apply sạch (`pnpm db:migrate`) + pgTAP `pnpm db:test` PASS; inspect artifact: destructive op → gắn `HIGH_RISK_MIGRATION`
- [ ] Check commands pass (theo `.context/project-config.md`: `pnpm -w lint`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build`)
- [ ] Reviewer độc lập PASS
- [ ] committed (1 task = 1 commit)

## Files to Create/Modify
- `supabase/migrations/20261111030000_pricing.sql`
- `supabase/tests/030_pricing.test.sql`
- `supabase/migrations/20261111030010_security_ops_hardening.sql`
- `supabase/migrations/20261111030020_catalog_fixes.sql`
- `supabase/tests/032_security_ops_hardening.test.sql`
- `supabase/tests/033_catalog_fixes.test.sql`

## Notes
Migration versioned, KHÔNG sửa migration đã apply; chạy local `pnpm db:migrate` (= `supabase migration up`) + `pnpm db:test` PASS. Cấm `db push`/`db reset` cho staging/prod.
- Nguồn: `SPECIFICATIONS.md` 1.1.0, `docs/specs/2026-11-10-filmbooking-mvp-design.md`, `.context/design-spec.md` (UI), `skills/react-nodejs/design-tokens.md`.
- Chỉ sửa file trong danh sách trên (dispatcher song song dựa vào đây). Cần file ngoài danh sách → ghi `Blocked`/báo dispatcher, không tự mở rộng.
- Task này gồm 3 migration độc lập (pricing + 2 file follow-up từ review layer 2); mỗi migration một file, timestamp như trên. Dùng lại helper RLS/audit đã có; RPC SECURITY DEFINER tự kiểm quyền. DB dùng chung: xem khoá `.worktrees/.dblock` trong brief.
