import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm, type LoginResult } from "@/components/auth/login-form";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  REMEMBER_COOKIE_NAME,
  REMEMBER_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/supabase/cookie-options";
import { fetchMeOrNull } from "@/lib/auth/load-me";
import { resolvePostLoginTarget, roleHome } from "@/lib/auth/role-home";
import { createServerSupabase, getServerAccessToken } from "@/lib/supabase/server";
import type { AuthSessionResponse } from "@filmbooking/shared/schemas/auth";

export const metadata: Metadata = {
  title: "Đăng nhập | CINEMO",
  description: "Đăng nhập vào tài khoản CINEMO để đặt vé xem phim trực tuyến.",
};

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

/**
 * Nhân sự đã đăng nhập mà mở /dang-nhap → đích theo vai trò. Khách / customer / lỗi phiên / lỗi /me → null (hiện form).
 * Khách chưa đăng nhập không có token nên không tốn lệnh /me.
 */
async function staffRedirectTarget(next: string | undefined): Promise<string | null> {
  try {
    const accessToken = await getServerAccessToken();
    if (!accessToken) return null;
    const me = await fetchMeOrNull(accessToken);
    return roleHome(me) ? resolvePostLoginTarget({ next, me }) : null;
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  const staffTarget = await staffRedirectTarget(next);
  if (staffTarget) redirect(staffTarget);

  async function handleLogin(data: {
    email: string;
    password: string;
    rememberMe: boolean;
    captchaToken?: string;
  }): Promise<LoginResult> {
    "use server";
    try {
      const headerList = await headers();
      const clientIp = headerList.get("x-forwarded-for") ?? headerList.get("x-real-ip");

      const res = await apiFetch<AuthSessionResponse>("/auth/login", {
        method: "POST",
        headers: clientIp ? { "x-forwarded-for": clientIp } : undefined,
        json: {
          email: data.email,
          password: data.password,
          captchaToken: data.captchaToken,
        },
      });

      const cookieStore = await cookies();
      const supabase = await createServerSupabase();
      await supabase.auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });

      // F-04: Lưu cờ fb-remember=0|1 vào cookie HttpOnly
      cookieStore.set(
        REMEMBER_COOKIE_NAME,
        data.rememberMe ? "1" : "0",
        sessionCookieOptions(
          { maxAge: data.rememberMe ? REMEMBER_MAX_AGE : undefined },
          data.rememberMe,
        ),
      );

      const allCookies = cookieStore.getAll();
      for (const c of allCookies) {
        if (c.name.includes("-auth-token")) {
          cookieStore.set(
            c.name,
            c.value,
            sessionCookieOptions(
              { maxAge: data.rememberMe ? REMEMBER_MAX_AGE : undefined },
              data.rememberMe,
            ),
          );
        }
      }

      // /me lỗi → fail-open: về `next`/`/`, layout (public) vẫn chuyển nhân sự đi khi hạ cánh ở trang khách.
      const me = await fetchMeOrNull(res.accessToken);
      return { success: true, redirectTo: resolvePostLoginTarget({ next, me }) };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        return {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        };
      }
      return {
        success: false,
        error: {
          code: "UNKNOWN",
          message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
        },
      };
    }
  }

  return <LoginForm next={next} initialError={error} onLogin={handleLogin} />;
}
