import type { CookieOptions } from "@supabase/ssr";

/**
 * Nguồn duy nhất cho cookie phiên (server components + proxy.ts).
 * HttpOnly: token không đọc được bằng JS; trình duyệt gọi API qua /api/proxy.
 */
export function sessionCookieOptions(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
