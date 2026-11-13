import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next")) ?? "/";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error || errorDescription) {
    const loginUrl = new URL("/dang-nhap", request.url);
    loginUrl.searchParams.set("error", "oauth");
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createServerSupabase();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!exchangeError) {
        return NextResponse.redirect(new URL(next, request.url));
      }
    }
  }

  const fallbackUrl = new URL("/dang-nhap", request.url);
  fallbackUrl.searchParams.set("error", "oauth");
  return NextResponse.redirect(fallbackUrl);
}
