-- Extensions nền cho FilmBooking (layer 0).
-- Chỉ thêm extension, không có DROP / đổi kiểu / backfill -> không phải HIGH_RISK_MIGRATION.
-- Idempotent (IF NOT EXISTS) để apply lại an toàn trên local / staging / prod.

-- Hash/UUID/mã ngẫu nhiên an toàn (mã vé, token).
create extension if not exists pgcrypto with schema extensions;

-- Email không phân biệt hoa thường (unique email, blocklist).
create extension if not exists citext with schema extensions;

-- Exclusion constraint kết hợp = và && (chống trùng giờ chiếu cùng phòng).
create extension if not exists btree_gist with schema extensions;

-- Job thuần SQL: nhả ghế hết hạn, xoá tài khoản chưa xác nhận. pg_cron tự cài vào pg_catalog.
create extension if not exists pg_cron;

-- Job HTTP: pg_cron + pg_net gọi Nest /jobs/* (email outbox, đối soát PayOS).
create extension if not exists pg_net with schema extensions;

-- Chỉ phục vụ test (supabase test db). Vô hại ở môi trường khác; không có dữ liệu nghiệp vụ.
create extension if not exists pgtap with schema extensions;
