import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { StaffAreaGuard } from "@/components/auth/staff-area-guard";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader, type HeaderUser } from "@/components/shell/site-header";
import { UnverifiedEmailBanner } from "@/components/shell/unverified-email-banner";
import { fetchMeOrNull } from "@/lib/auth/load-me";
import { isStaffAllowedPath, roleHome } from "@/lib/auth/role-home";
import { createServerSupabase, getServerAccessToken } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  let headerUser: HeaderUser | null = null;
  let email: string | null = null;
  let emailConfirmed = true;
  let staffHome: string | null = null;

  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const user = data.user;
      email = user.email ?? null;
      emailConfirmed = Boolean(user.email_confirmed_at);
      const name =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.email ? user.email.split("@")[0] : undefined);
      headerUser = {
        displayName: name || "Tài khoản",
      };
      // Chỉ người đã đăng nhập mới tốn thêm 1 lệnh /me; khách không bao giờ gọi.
      const accessToken = await getServerAccessToken();
      if (accessToken) staffHome = roleHome(await fetchMeOrNull(accessToken));
    }
  } catch {
    // Phiên không khả dụng hoặc chưa cấu hình biến môi trường
  }

  // x-pathname do proxy.ts gắn; thiếu thì bỏ qua redirect server (StaffAreaGuard phía client vẫn chặn).
  // redirect() ném lỗi điều hướng nên phải nằm ngoài try/catch ở trên.
  if (staffHome) {
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !isStaffAllowedPath(pathname)) redirect(staffHome);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-brand focus:px-4 focus:py-3 focus:text-fg-on-brand"
      >
        Bỏ qua tới nội dung chính
      </a>
      {/* Scanline chỉ ở trang khách (design-tokens §3.3); /admin và /staff không đi qua layout này. */}
      <div className="scanline" aria-hidden="true" />
      {staffHome ? <StaffAreaGuard home={staffHome} /> : null}
      <SiteHeader user={headerUser} />
      <UnverifiedEmailBanner email={email} emailConfirmed={emailConfirmed} />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
