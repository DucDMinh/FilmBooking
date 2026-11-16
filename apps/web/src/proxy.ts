import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { sessionCookieOptions, REMEMBER_COOKIE_NAME } from "@/lib/supabase/cookie-options";
import { getSupabaseEnv } from "@/lib/supabase/env";

// /dat-ve/[showtimeId] (chọn ghế) mở cho khách xem sơ đồ; chỉ các màn đơn hàng cần đăng nhập.
const PROTECTED_PREFIXES = ["/tai-khoan", "/ve", "/dat-ve/don", "/admin", "/staff"];

const PATHNAME_HEADER = "x-pathname";

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();
  // Layout (public) cần biết pathname để chuyển nhân sự đi (Server Component không đọc được URL).
  // Luôn ghi đè để client không giả mạo được; chỉ là gợi ý UX, không dùng cho phân quyền.
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        const rememberVal = request.cookies.get(REMEMBER_COOKIE_NAME)?.value;
        for (const { name, value, options } of items) {
          response.cookies.set(name, value, sessionCookieOptions(options, rememberVal));
        }
      },
    },
  });

  // getUser() xác thực với Supabase và refresh token khi hết hạn.
  const { data } = await supabase.auth.getUser();
  const { pathname, search } = request.nextUrl;

  if (!data.user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/dang-nhap";
    loginUrl.search = "";
    const next = sanitizeNext(pathname + search);
    if (next) loginUrl.searchParams.set("next", next);
    const redirect = NextResponse.redirect(loginUrl);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
