import type { ReactNode } from "react";

import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader, type HeaderUser } from "@/components/shell/site-header";
import { UnverifiedEmailBanner } from "@/components/shell/unverified-email-banner";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  let headerUser: HeaderUser | null = null;
  let email: string | null = null;
  let emailConfirmed = true;

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
    }
  } catch {
    // Phiên không khả dụng hoặc chưa cấu hình biến môi trường
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-3 focus:text-fg-on-brand"
      >
        Bỏ qua tới nội dung chính
      </a>
      <SiteHeader user={headerUser} />
      <UnverifiedEmailBanner email={email} emailConfirmed={emailConfirmed} />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
