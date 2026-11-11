/** Đọc env Supabase (anon key — không bao giờ service role); thiếu biến nào thì báo đúng biến đó. */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (!url || !anonKey) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(", ")}`);
  }
  return { url, anonKey };
}
