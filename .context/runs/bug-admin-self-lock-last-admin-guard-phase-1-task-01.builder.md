# builder summary: bug admin-self-lock-last-admin-guard phase-1 task-01

- Migration 20261119100000_last_active_admin_guard.sql: advisory lock + trigger (user_roles delete/update, auth.users banned_until/raw_app_meta_data/deleted_at update + delete), SQLSTATE FB409, RPC is_last_active_admin (service_role). Không phá huỷ dữ liệu.
- API users.controller.ts: tự khoá / tự gỡ -> 409 CONFLICT; tra cứu sớm is_last_active_admin -> 409; map FB409 / lỗi GoTrue -> 409.
- Test: pgTAP 068 (26) + 069 dblink (10) PASS; e2e admin +6 PASS. database.types.ts thêm 2 hàm thủ công.
- Còn dở: pgTAP 010/020/.../090 lỗi môi trường (DB local có seed demo -> provinces_name_key), không do thay đổi này; web chưa kiểm tra hiển thị message 409 trong dialog xác nhận.
