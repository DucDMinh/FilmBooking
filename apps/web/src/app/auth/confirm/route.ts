import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { fetchMeOrNull } from "@/lib/auth/load-me";
import { resolvePostLoginTarget } from "@/lib/auth/role-home";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { REMEMBER_COOKIE_NAME, sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { createServerSupabase } from "@/lib/supabase/server";

const CONFIRM_PAGE = "/xac-nhan-email";

// Chỉ link xác nhận đăng ký mới được tạo phiên từ đây; recovery/magic link/... không đi qua route này
// (tránh biến link đổi mật khẩu hoặc link khác thành đăng nhập ngoài ý muốn).
const ALLOWED_TYPE = "signup";

function redirectTo(path: string, requestUrl: string): NextResponse {
  return NextResponse.redirect(new URL(path, requestUrl));
}

/**
 * Phiên từ link xác nhận luôn là phiên trình duyệt (hết khi đóng trình duyệt, R-15), bất kể cờ `fb-remember=1`
 * còn sót từ lần đăng nhập "Ghi nhớ" trước (cờ chỉ bị xoá khi đăng xuất chủ động).
 * verifyOtp ghi cookie qua createServerSupabase vốn đọc cờ cũ nên có thể ra maxAge 30 ngày: ghim cờ về 0
 * (để proxy.ts refresh sau này không nâng phiên lên 30 ngày) rồi ghi lại cookie auth-token không maxAge.
 * Chỉ gọi sau khi verifyOtp thành công để lỗi không làm hạ cấp phiên "Ghi nhớ" đang có.
 */
async function pinBrowserSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  const options = sessionCookieOptions({}, false);
  cookieStore.set(REMEMBER_COOKIE_NAME, "0", options);
  for (const { name, value } of cookieStore.getAll()) {
    // Bỏ qua chunk rỗng: @supabase/ssr xoá chunk thừa bằng value "" + maxAge 0, ghi lại sẽ để cookie rác.
    if (name.includes("-auth-token") && value !== "") cookieStore.set(name, value, options);
  }
}

/**
 * Link xác nhận email (R-04): GoTrue gửi `token_hash`, server đổi lấy phiên bằng `verifyOtp` rồi đặt cookie.
 * Không dùng `?code=` (PKCE) vì mail do Nest gửi nên không có `code_verifier`; chạy được cả khi mở link ở thiết bị khác.
 * Mọi thất bại trả cùng một đích `expired`, không lộ chi tiết lỗi và không có phiên.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = sanitizeNext(searchParams.get("next")) ?? "/";
  const expired = () => redirectTo(`${CONFIRM_PAGE}?status=expired`, request.url);

  if (!tokenHash || type !== ALLOWED_TYPE) return expired();

  let accessToken: string | undefined;
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.verifyOtp({ type: ALLOWED_TYPE, token_hash: tokenHash });
    if (error) return expired();
    accessToken = data.session?.access_token;
  } catch {
    return expired();
  }
  if (accessToken) await pinBrowserSessionCookies();

  // /me lỗi hoặc thiếu token → fail-open như khách (email đã xác nhận); nhân sự về khu vực vai trò.
  const me = accessToken ? await fetchMeOrNull(accessToken) : null;
  const successParams = new URLSearchParams({ status: "success" });
  if (next !== "/") successParams.set("next", next);
  const target = resolvePostLoginTarget({ next: `${CONFIRM_PAGE}?${successParams}`, me });
  return redirectTo(target, request.url);
}
