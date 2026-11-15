/** Host ảnh được next/image tối ưu hoá — đồng bộ với `images.remotePatterns` trong next.config.ts. */
function supabaseHost(): string | null {
  try {
    // Chỉ https: next/image từ chối tối ưu hoá IP nội bộ (Supabase local http://127.0.0.1) → dùng <img> thường.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
    return url?.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

export const IMAGE_HOSTS: readonly string[] = ["images.unsplash.com", supabaseHost()].filter(
  (host): host is string => host !== null,
);
