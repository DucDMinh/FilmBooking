# Bug layer34-review · phase-1-task-08 — Test phân quyền theo role cho mọi SECURITY DEFINER

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: test pgTAP liệt kê mọi hàm SECURITY DEFINER và kiểm has_function_privilege cho anon/authenticated theo bảng quyền mong đợi; chạy sau 02-06.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: done (builder PASS, chờ reviewer STRICT)

## Gộp K7 (user duyệt 2026-11-12) — CRITICAL, chạy ngay sau P0-06
- Phát hiện khi review P0-05: migration chỉ `revoke ... from public, anon`, nhưng Supabase default privileges cấp EXECUTE cho `authenticated` → 25 hàm SECURITY DEFINER ở schema public đang gọi được bởi mọi user đăng nhập (xác minh `has_function_privilege` trên DB local).
- Không kiểm người gọi (khai thác được qua `/rest/v1/rpc/...`): `confirm_paid` (đã revoke trong P0-05), `record_payment_event`, `mark_payment_cancelled`; cần soát `confirm_pos_sale` và các hàm còn lại.
- Danh sách lúc phát hiện: apply_voucher, can_view_order, cancel_showtimes, checkin_ticket, confirm_paid, confirm_pos_sale, confirm_zero_amount, extend_pos_hold, generate_booking_code, guard_identity_insert (cả anon), has_cinema_role, has_cinema_scope, hold_seats, is_admin, mark_payment_cancelled, on_identity_change (cả anon), preview_cancel_showtimes, record_payment_event, release_seats, remove_voucher, report_by_movie_showtime, report_cancelled_showtimes, report_payos_reconciliation, report_revenue, set_cinema_status.
- Yêu cầu: lập bảng quyền mong đợi (role nào gọi, ai là caller thật theo API/web), migration mới revoke `authenticated` (và PUBLIC/anon) cho hàm chỉ dành service_role/trigger; hàm dành cho authenticated phải kiểm quyền bên trong (auth.uid() not null + scope); cân nhắc `alter default privileges` để hàm mới không tự cấp EXECUTE; pgTAP liệt kê MỌI hàm SECURITY DEFINER và so với bảng quyền (hàm mới không có trong bảng → test fail).
- Follow-up từ P0-02: test quyền helper `assert_identity_rpc_caller` + case A->B cho unlink/mark_password_set.

## Kết quả (builder)

### Root cause
Migration cũ chỉ revoke from public, anon; Supabase default privileges (pg_default_acl: postgres, schema public, objtype f) cấp EXECUTE cho anon/authenticated/service_role -> mọi user đăng nhập gọi được qua /rest/v1/rpc. Hàm không kiểm người gọi (record_payment_event, mark_payment_cancelled, confirm_pos_sale) bị khai thác trực tiếp; trigger function guard_identity_insert/on_identity_change còn mở cho anon qua PUBLIC. Thêm 3 lỗ thân hàm: apply_voucher_core/remove_voucher bỏ qua đơn user_id null; cancel_showtimes cho manager giả mạo p_actor_id (cancelled_by). Đã xác minh bằng thực nghiệm: alter default privileges IN SCHEMA public revoke from public KHÔNG có tác dụng; phải revoke global (không IN SCHEMA) cho PUBLIC.

### Bảng quyền (anon / authenticated / service_role)
Caller: API = Nest. forUser(jwt) là mặc định (layer-5-task-01); admin() chỉ cho webhook PayOS, job, POS API key, tác vụ admin đã kiểm.
| Hàm | Caller dự kiến | Kiểm quyền trong thân | Quyết định |
|---|---|---|---|
| price_quote (INVOKER) | anon/auth/API | RLS catalog công khai | giữ anon+auth+svc |
| hold_seats, release_seats, extend_pos_hold, confirm_zero_amount | auth qua forUser; POS/svc qua admin | có: uid/p_user_id spoof 42501, chủ đơn/Admin/Staff rạp | giữ authenticated |
| apply_voucher (wrapper), remove_voucher, apply_voucher_core(không grant) | auth qua forUser | có; SỬA: fail-closed đơn user_id null | giữ auth (core: không ai) |
| preview_cancel_showtimes, cancel_showtimes, set_cinema_status | Manager/Admin qua forUser | có: Manager đúng rạp/Admin; SỬA actor spoof | giữ auth |
| checkin_ticket, report_revenue/by_movie_showtime/payos_reconciliation/cancelled_showtimes | Staff/Manager/Admin qua forUser | có: has_cinema_scope (+chống staff spoof) | giữ auth (không đẩy sang svc để giữ scope theo rạp) |
| is_admin, has_cinema_role, has_cinema_scope, can_view_order | helper RLS (67 policy, đều TO authenticated; 0 policy anon dùng) + view report | chỉ theo auth.uid() | giữ auth, không anon |
| record_payment_event, mark_payment_cancelled, confirm_paid, confirm_pos_sale | webhook PayOS / POS API key (admin) | KHÔNG | revoke authenticated -> service_role only. Layer 5: staff mô phỏng POS phải qua admin() sau guard Nest, hoặc thêm kiểm quyền thân + grant ở migration mới |
| generate_booking_code | nội bộ (definer gọi) | không | service_role only |
| expire_overdue_holds, purge_expired_ops_data, hit_rate_limit, is_*_email/login, register/clear_login_*, identity RPC (5), assert_identity_rpc_caller, showtime_has_sales, recompute_future_showtime_ends, delete_unconfirmed_users, sell_order_seats, apply_voucher_core | job/API admin/nội bộ | — | đã/giữ không client |
| guard_identity_insert, on_identity_change, set_updated_at + mọi trigger fn | trigger | — | revoke public/anon/authenticated |
| hook_before_user_created | Auth hook | — | giữ supabase_auth_admin |
Sequence internal_payment_order_code_seq: revoke authenticated (chỉ dùng trong hàm definer), giữ service_role.
Default privileges: global revoke execute on functions from public (for role postgres) + in schema public revoke from anon, authenticated.

### Repro Verification
- Original repro: authenticated gọi record_payment_event / mark_payment_cancelled / confirm_pos_sale / generate_booking_code; anon thấy guard_identity_insert; A áp/gỡ voucher đơn user_id null; manager truyền p_actor_id khác.
- Actual before fix (048 chạy TRƯỚC khi áp migration): ĐỎ 15/41 (test 1-5,7,11,13-15,17,22,24,26,37; record_payment_event/mark_payment_cancelled/generate_booking_code thực thi không lỗi).
- Actual after fix: 048 41/41 xanh. Toàn bộ npx supabase test db: 17 file, 669 test PASS. pnpm test (16), pnpm lint, pnpm typecheck PASS.
- Test cũ phải sửa theo hợp đồng mới: các helper tap_* (scaffolding trong transaction rollback) cần grant EXECUTE cho anon/authenticated (khối DO thêm vào 010,020,030,031,033,040,041,042,043,044,046); KHÔNG nới grant production.
- API: mọi .rpc() trong apps/api dùng admin() (service_role) -> không hàm nào bị revoke mà API gọi bằng user-JWT. Web không gọi .rpc.
- Status: PASS

### Doc impact
docs/ERD.md mục 'Hàm RLS & RPC nghiệp vụ dùng chung' đã bổ sung đoạn bảo mật EXECUTE (migration 20261112080000, allowlist test 048). DESIGN.md: không đổi.

### Residual risk
- Hàm giữ authenticated có thể bị gọi thẳng PostgREST, bỏ qua guard/rate limit/consent của Nest (Turnstile, v.v.); an toàn dựa vào kiểm quyền trong thân hàm. hold_seats/release_seats vẫn có nhánh auth.uid() null (chỉ khi JWT không sub, Supabase không phát hành) – không đổi thân.
- extend_pos_hold giữ authenticated (nhất quán hold_seats POS, thân fail-closed); có thể hạ xuống service_role nếu Layer 5 chỉ dùng POS API.
- Global default revoke PUBLIC ảnh hưởng mọi hàm do postgres tạo sau này (kể cả create extension mới): cần GRANT tường minh. Default ACL của supabase_admin (hàm do supabase_admin tạo) và default ACL của bảng/sequence khác chưa đổi.
- confirm_pos_sale body vẫn không tự kiểm quyền (chỉ service_role truy cập được).
