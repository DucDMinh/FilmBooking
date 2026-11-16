import { NextResponse, type NextRequest } from "next/server";
import { fetchMeOrNull } from "@/lib/auth/load-me";
import { resolvePostLoginTarget } from "@/lib/auth/role-home";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { createServerSupabase } from "@/lib/supabase/server";

export type OAuthErrorCategory = "identity_taken" | "email_exists" | "missing_email" | "oauth";

/**
 * Phân loại lỗi OAuth theo allowlist (F-01, AC-04, R-20, R-23, R-19).
 * Không phản chiếu nguyên văn error_description ra ngoài (chống giả mạo / XSS).
 */
export function classifyOAuthError(
  error: string | null | undefined,
  errorCode: string | null | undefined,
  errorDescription: string | null | undefined,
  exchangeError?: { message?: string; code?: string; status?: number } | null,
): OAuthErrorCategory {
  const combined = [
    error,
    errorCode,
    errorDescription,
    exchangeError?.message,
    exchangeError?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // 1. R-23: MXH đã thuộc user khác (23505) hoặc GoTrue báo identity_already_exists
  if (
    combined.includes("identity_already_exists") ||
    combined.includes("oauth_identity_already_linked") ||
    combined.includes("already_linked") ||
    combined.includes("identity_taken")
  ) {
    return "identity_taken";
  }

  // 2. AC-04 / R-20: Trùng email không tự gộp (23514 OAUTH_AUTO_MERGE_BLOCKED / OAUTH_EMAIL_COLLISION)
  if (
    combined.includes("oauth_auto_merge_blocked") ||
    combined.includes("oauth_email_collision") ||
    combined.includes("auto_merge_blocked") ||
    combined.includes("email_collision") ||
    combined.includes("email_exists")
  ) {
    return "email_exists";
  }

  // 3. R-19: Facebook thiếu email
  if (
    combined.includes("missing_email") ||
    combined.includes("email_required") ||
    combined.includes("missing email")
  ) {
    return "missing_email";
  }

  return "oauth";
}

export function buildRedirectForError(
  category: OAuthErrorCategory,
  next: string,
  requestUrl: string,
): NextResponse {
  // 1. Already linked:
  // Nếu ở luồng liên kết (/tai-khoan), quay lại next?error=identity_taken.
  // Nếu bấm từ bên ngoài (!next.startsWith("/tai-khoan")), chuyển hướng về /dang-nhap?error=identity_taken và giữ next.
  if (category === "identity_taken") {
    if (next.startsWith("/tai-khoan")) {
      const target = new URL(next, requestUrl);
      target.searchParams.set("error", "identity_taken");
      return NextResponse.redirect(target);
    }
    const target = new URL("/dang-nhap", requestUrl);
    target.searchParams.set("error", "identity_taken");
    if (next && next !== "/") {
      target.searchParams.set("next", next);
    }
    return NextResponse.redirect(target);
  }

  // 2. Trùng email (AC-04 / R-20):
  if (category === "email_exists") {
    if (next.startsWith("/tai-khoan")) {
      const target = new URL(next, requestUrl);
      target.searchParams.set("error", "email_exists");
      return NextResponse.redirect(target);
    }
    const target = new URL("/dang-nhap", requestUrl);
    target.searchParams.set("error", "email_exists");
    if (next && next !== "/") {
      target.searchParams.set("next", next);
    }
    return NextResponse.redirect(target);
  }

  // 3. Facebook không có email (R-19):
  if (category === "missing_email") {
    const target = new URL("/bo-sung-email", requestUrl);
    if (next && next !== "/") {
      target.searchParams.set("next", next);
    }
    return NextResponse.redirect(target);
  }

  // 4. Lỗi chung khác:
  const fallback = new URL(next.startsWith("/tai-khoan") ? next : "/dang-nhap", requestUrl);
  fallback.searchParams.set("error", "oauth");
  if (next && next !== "/" && !next.startsWith("/tai-khoan")) {
    fallback.searchParams.set("next", next);
  }
  return NextResponse.redirect(fallback);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next")) ?? "/";
  const error = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  // Nếu GoTrue trả query error ngay lúc redirect:
  if (error || errorCode || errorDescription) {
    const category = classifyOAuthError(error, errorCode, errorDescription);
    return buildRedirectForError(category, next, request.url);
  }

  // Nếu có code thì trao đổi code lấy session:
  if (code) {
    const supabase = await createServerSupabase();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      // Nhân sự về khu vực của vai trò; /me lỗi hoặc thiếu token → fail-open về `next` (layout (public) vẫn chuyển đi).
      const accessToken = data.session?.access_token;
      const me = accessToken ? await fetchMeOrNull(accessToken) : null;
      return NextResponse.redirect(new URL(resolvePostLoginTarget({ next, me }), request.url));
    }
    const category = classifyOAuthError(null, null, null, exchangeError);
    return buildRedirectForError(category, next, request.url);
  }

  // Không có code lẫn error: fallback oauth error
  return buildRedirectForError("oauth", next, request.url);
}
