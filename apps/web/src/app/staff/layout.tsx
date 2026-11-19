import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/common/sign-out-button";
import { resolveAdminRole } from "@/components/admin/nav-config";
import { ApiError, apiFetch } from "@/lib/api/client";
import { getServerAccessToken } from "@/lib/supabase/server";
import type { MeResponse } from "@filmbooking/shared/schemas/me";

export const metadata: Metadata = {
  title: "Soát vé",
  robots: { index: false },
};

async function loadMe(accessToken: string): Promise<MeResponse> {
  try {
    return await apiFetch<MeResponse>("/me", { accessToken, cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/dang-nhap?next=/staff/chon-rap");
    if (error instanceof ApiError && error.status === 403) redirect("/khong-co-quyen");
    throw error;
  }
}

/** Khung toàn màn hình cho nhân sự soát vé. Chỉ là lớp UX: API tự kiểm quyền theo rạp. */
export default async function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/dang-nhap?next=/staff/chon-rap");
  if (!resolveAdminRole(await loadMe(accessToken))) redirect("/khong-co-quyen");

  return (
    <div className="staff-static min-h-dvh bg-background">
      <header className="flex h-14 items-center border-b border-border bg-chrome px-4 md:h-18 md:px-6">
        <span className="font-display text-body font-heavy tracking-[0.02em] text-fg">CINEMO</span>
        <span className="hud hud-brand ml-3">Soát vé</span>
        <SignOutButton variant="secondary" size="sm" className="ml-auto" />
      </header>
      {children}
    </div>
  );
}
