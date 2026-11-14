import type { Metadata } from "next";

import { HolidayManager } from "@/components/admin/price-matrix";
import { resolveAdminRole } from "@/components/admin/nav-config";
import { apiFetch } from "@/lib/api/client";
import { getServerAccessToken } from "@/lib/supabase/server";
import type { MeResponse } from "@filmbooking/shared/schemas/me";

export const metadata: Metadata = { title: "Ngày lễ" };

export default async function Page() {
  const accessToken = await getServerAccessToken();
  const me = await apiFetch<MeResponse>("/me", { accessToken, cache: "no-store" });
  // Layout đã chặn người không có vai trò; mặc định STAFF chỉ để thu hẹp kiểu (UI ẩn, API vẫn kiểm quyền).
  const role = resolveAdminRole(me) ?? "STAFF";
  return (
    <div className="space-y-4">
      <h1 className="text-h2 font-bold">Ngày lễ</h1>
      <HolidayManager role={role} />
    </div>
  );
}
