import { apiFetch } from "@/lib/api/client";
import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type { MeResponse } from "@filmbooking/shared/schemas/me";

export interface StaffCinema {
  id: string;
  code: string;
  name: string;
  address: string;
}

const STORAGE_KEY = "staff.cinemaId";

/** Rạp nhân sự được phép soát: Admin = mọi rạp; Staff/Manager = rạp được gán. */
export async function loadStaffCinemas(): Promise<StaffCinema[]> {
  const [me, cinemas] = await Promise.all([
    apiFetch<MeResponse>("/me", { cache: "no-store" }),
    apiFetch<CinemaDto[]>("/cinemas"),
  ]);
  const assigned = new Set(me.cinemas.map((c) => c.cinemaId));
  return cinemas.flatMap((c) =>
    c.id && (me.isAdmin || assigned.has(c.id))
      ? [{ id: c.id, code: c.code, name: c.name, address: c.address }]
      : [],
  );
}

export function readSelectedCinemaId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedCinemaId(id: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Trình duyệt chặn storage: lựa chọn chỉ sống trong trang hiện tại.
  }
}
