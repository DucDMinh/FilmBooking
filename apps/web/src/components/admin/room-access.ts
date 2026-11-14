import { notFound, redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api/client";
import { getServerAccessToken } from "@/lib/supabase/server";
import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type { MeResponse } from "@filmbooking/shared/schemas/me";

import type { CopySourceCinema } from "./copy-layout-dialog";

export interface RoomAccess {
  accessToken: string;
  /** Admin, hoặc Manager của rạp này. Staff chỉ xem. API vẫn là lớp quyền thật. */
  canEdit: boolean;
  /** Rạp làm nguồn sao chép: mọi rạp đang mở (R-48 cho sao chép liên rạp; chỉ quyền ghi phòng đích bị kiểm). */
  sourceCinemas: CopySourceCinema[];
}

/** Dữ liệu quyền cho trang phòng chiếu (layout /admin đã chặn Customer). */
export async function loadRoomAccess(cinemaId: string): Promise<RoomAccess> {
  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/dang-nhap?next=/admin");
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>("/me", { accessToken, cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect("/khong-co-quyen");
    throw error;
  }
  const allCinemas = await apiFetch<CinemaDto[]>("/cinemas").catch(() => [] as CinemaDto[]);
  const managedIds = me.cinemas.filter((c) => c.role === "MANAGER").map((c) => c.cinemaId);
  return {
    accessToken,
    canEdit: me.isAdmin || managedIds.includes(cinemaId),
    sourceCinemas: allCinemas.flatMap((c) => (c.id ? [{ id: c.id, code: c.code, name: c.name }] : [])),
  };
}

/** Lỗi API của trang phòng: 403 (rạp không thuộc quyền) → trang không có quyền; 400/404 → 404; còn lại ném tiếp. */
export function rethrowRoomApiError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 403) redirect("/khong-co-quyen");
    if (error.status === 404 || error.status === 400) notFound();
  }
  throw error;
}
