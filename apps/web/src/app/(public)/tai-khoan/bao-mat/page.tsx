import type { UnlinkProvider } from "@filmbooking/shared/schemas/identity";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { LinkedAccounts } from "@/components/account/linked-accounts";
import { SessionsCard } from "@/components/account/sessions-card";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bảo mật & liên kết", robots: { index: false } };

// Phiên nằm trong cookie HttpOnly nên các thao tác cần session GoTrue chạy bằng Server Action ngay tại đây.
async function linkIdentity(provider: UnlinkProvider): Promise<{ url?: string; error?: string }> {
  "use server";
  if (provider !== "google" && provider !== "facebook") return { error: "Phương thức không hợp lệ." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${proto}://${host}/auth/callback?next=%2Ftai-khoan%2Fbao-mat`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) return { error: "Không thể liên kết tài khoản. Vui lòng thử lại." };
  return { url: data.url };
}

async function signOutOthers(): Promise<{ error?: string }> {
  "use server";
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return error ? { error: "Không thể đăng xuất các thiết bị khác. Vui lòng thử lại." } : {};
}

export default async function SecurityPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; error_code?: string }> }>) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <LinkedAccounts linkIdentity={linkIdentity} callbackError={params.error_code ?? params.error ?? null} />
      <SessionsCard signOutOthers={signOutOthers} />
    </div>
  );
}
