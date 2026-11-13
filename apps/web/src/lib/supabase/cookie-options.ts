import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_COOKIE_NAME = "fb-remember";
export const REMEMBER_MAX_AGE = 30 * 24 * 3600; // 30 ngày (R-15)
export const DEFAULT_SUPABASE_MAX_AGE = 400 * 24 * 60 * 60; // 400 ngày mặc định của @supabase/ssr

/**
 * Nguồn duy nhất cho cookie phiên (server components + proxy.ts).
 * HttpOnly: token không đọc được bằng JS; trình duyệt gọi API qua /api/proxy.
 * F-04: Lưu giữ cờ `fb-remember=0|1`. Nếu không remember thì không đặt maxAge 400 ngày ở refresh token.
 */
export function sessionCookieOptions(
  options: CookieOptions = {},
  remember?: boolean | string | null,
): CookieOptions {
  const isRemember =
    remember === true || remember === "1"
      ? true
      : remember === false || remember === "0"
        ? false
        : null;

  const base: CookieOptions = {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  if (isRemember === false) {
    // Không ghi nhớ đăng nhập: phiên kết thúc khi đóng trình duyệt (xóa maxAge).
    delete base.maxAge;
  } else if (isRemember === true) {
    // Có ghi nhớ: tối đa 30 ngày theo spec R-15.
    base.maxAge = REMEMBER_MAX_AGE;
  } else {
    // Không có cờ rõ ràng (vd refresh token trong proxy/server.ts mà không truyền cờ):
    // Không cho phép maxAge 400 ngày từ @supabase/ssr ghi đè session cookie.
    if (base.maxAge && base.maxAge >= DEFAULT_SUPABASE_MAX_AGE) {
      delete base.maxAge;
    } else if (base.maxAge && base.maxAge > REMEMBER_MAX_AGE) {
      base.maxAge = REMEMBER_MAX_AGE;
    }
  }

  return base;
}
