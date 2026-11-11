import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/**
 * Client Supabase cho trình duyệt — chỉ anon key (không bao giờ service role).
 * Phiên nằm trong cookie HttpOnly do server quản lý nên client này KHÔNG giữ/đọc phiên:
 * chỉ dùng cho việc công khai (vd Realtime kênh công khai). Gọi API nghiệp vụ qua `apiFetch` -> /api/proxy.
 */
export function createBrowserSupabase() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
