import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LoginForm, type LoginResult } from "@/components/auth/login-form";
import { apiFetch, ApiError } from "@/lib/api/client";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AuthSessionResponse } from "@filmbooking/shared/schemas/auth";

export const metadata: Metadata = {
  title: "Đăng nhập | CINEMO",
  description: "Đăng nhập vào tài khoản CINEMO để đặt vé xem phim trực tuyến.",
};

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  async function handleLogin(data: {
    email: string;
    password: string;
    rememberMe: boolean;
    captchaToken?: string;
  }): Promise<LoginResult> {
    "use server";
    try {
      const res = await apiFetch<AuthSessionResponse>("/auth/login", {
        method: "POST",
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

      const allCookies = cookieStore.getAll();
      for (const c of allCookies) {
        if (c.name.includes("-auth-token")) {
          cookieStore.set(
            c.name,
            c.value,
            sessionCookieOptions({
              maxAge: data.rememberMe ? 30 * 24 * 3600 : undefined,
            }),
          );
        }
      }

      return { success: true };
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
