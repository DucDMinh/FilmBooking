# Bug layer34-review · phase-1-task-08 — Test phân quyền theo role cho mọi SECURITY DEFINER

- Classification / Risk: BUG · severity=high · review level expected=STRICT · nguồn: .context/review-reports/independent-review-layer-3-4-SUMMARY.md + .context/review-reports/independent-review-layer-3-4-db.md
- Root cause: xem báo cáo chi tiết (có file:dòng + kịch bản). Builder PHẢI đọc báo cáo trước khi sửa.
- Yêu cầu: test pgTAP liệt kê mọi hàm SECURITY DEFINER và kiểm has_function_privilege cho anon/authenticated theo bảng quyền mong đợi; chạy sau 02-06.
- Quy tắc: test-first (test tái hiện fail trước fix, pass sau fix); migration chỉ additive MỚI, không sửa migration đã apply; không đụng phạm vi task khác.
- Doc impact: ghi rõ sau khi xong.
- Status: pending

## Gộp K7 (user duyệt 2026-11-12) — CRITICAL, chạy ngay sau P0-06
- Phát hiện khi review P0-05: migration chỉ `revoke ... from public, anon`, nhưng Supabase default privileges cấp EXECUTE cho `authenticated` → 25 hàm SECURITY DEFINER ở schema public đang gọi được bởi mọi user đăng nhập (xác minh `has_function_privilege` trên DB local).
- Không kiểm người gọi (khai thác được qua `/rest/v1/rpc/...`): `confirm_paid` (đã revoke trong P0-05), `record_payment_event`, `mark_payment_cancelled`; cần soát `confirm_pos_sale` và các hàm còn lại.
- Danh sách lúc phát hiện: apply_voucher, can_view_order, cancel_showtimes, checkin_ticket, confirm_paid, confirm_pos_sale, confirm_zero_amount, extend_pos_hold, generate_booking_code, guard_identity_insert (cả anon), has_cinema_role, has_cinema_scope, hold_seats, is_admin, mark_payment_cancelled, on_identity_change (cả anon), preview_cancel_showtimes, record_payment_event, release_seats, remove_voucher, report_by_movie_showtime, report_cancelled_showtimes, report_payos_reconciliation, report_revenue, set_cinema_status.
- Yêu cầu: lập bảng quyền mong đợi (role nào gọi, ai là caller thật theo API/web), migration mới revoke `authenticated` (và PUBLIC/anon) cho hàm chỉ dành service_role/trigger; hàm dành cho authenticated phải kiểm quyền bên trong (auth.uid() not null + scope); cân nhắc `alter default privileges` để hàm mới không tự cấp EXECUTE; pgTAP liệt kê MỌI hàm SECURITY DEFINER và so với bảng quyền (hàm mới không có trong bảng → test fail).
- Follow-up từ P0-02: test quyền helper `assert_identity_rpc_caller` + case A->B cho unlink/mark_password_set.
