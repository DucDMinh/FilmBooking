-- ============================================================================
-- bug-layer34-review K2: liên kết MXH không có bằng chứng sở hữu.
-- link_user_identity(user, provider, provider_id, identity_data) chèn thẳng auth.identities
-- theo provider_id do client khai (không qua OAuth) -> kẻ tấn công gắn MXH của nạn nhân
-- vào tài khoản của mình. Hướng (a): chỉ liên kết qua GoTrue
-- (client: supabase.auth.linkIdentity -> GoTrue xác thực OAuth rồi mới chèn identity).
-- Trigger trg_guard_identity_insert giữ nguyên (R-23 vẫn chặn provider_id đã thuộc user khác).
-- Additive: chỉ DROP một hàm đã không còn caller (API + test đã gỡ).
-- ============================================================================
drop function if exists public.link_user_identity(uuid, text, text, jsonb);
