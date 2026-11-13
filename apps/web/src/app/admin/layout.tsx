import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { resolveAdminRole } from "@/components/admin/nav-config";
import { ApiError, apiFetch } from "@/lib/api/client";
import { getServerAccessToken } from "@/lib/supabase/server";
import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type { MeResponse } from "@filmbooking/shared/schemas/me";

export const metadata: Metadata = {
  title: "Quản trị",
  robots: { index: false },
};

async function loadMe(accessToken: string): Promise<MeResponse> {
  try {
    return await apiFetch<MeResponse>("/me", { accessToken, cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/dang-nhap?next=/admin");
    if (error instanceof ApiError && error.status === 403) redirect("/khong-co-quyen");
    throw error;
  }
}

/**
 * Chặn người không có vai trò nhân sự (Customer) bằng trang 403 (/khong-co-quyen).
 * Đây chỉ là lớp UX: mọi endpoint quản trị vẫn tự kiểm quyền ở API/RLS.
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/dang-nhap?next=/admin");

  const me = await loadMe(accessToken);
  const role = resolveAdminRole(me);
  if (!role) redirect("/khong-co-quyen");

  // /me chỉ trả cinemaId; lấy tên từ danh sách rạp công khai. Lỗi → hiện id rút gọn thay vì chặn shell.
  const allCinemas = await apiFetch<CinemaDto[]>("/cinemas").catch(() => [] as CinemaDto[]);
  const nameById = new Map(allCinemas.flatMap((c) => (c.id ? [[c.id, c.name] as const] : [])));
  const assignedIds = me.cinemas.map((c) => c.cinemaId);
  const allIds = Array.from(new Set([...nameById.keys(), ...assignedIds]));
  const scopeIds = role === "ADMIN" ? (allIds.length > 0 ? allIds : assignedIds) : assignedIds;
  const cinemas = scopeIds.map((id) => ({ id, name: nameById.get(id) ?? `Rạp ${id.slice(0, 8)}` }));

  return (
    <Suspense>
      <AdminShell role={role} cinemas={cinemas}>
        {children}
      </AdminShell>
    </Suspense>
  );
}
