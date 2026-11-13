"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const ALL_CINEMAS = "all";

export interface ScopeCinema {
  id: string;
  name: string;
}

export interface AdminScope {
  /** `"all"` (toàn chuỗi, chỉ Admin) hoặc id một rạp. */
  scope: string;
  setScope: (next: string) => void;
}

/**
 * Chọn scope hợp lệ từ giá trị `?cinema=`. Giá trị không nằm trong danh sách cho phép
 * (rạp không được gán, "all" với Manager/Staff) bị bỏ qua. Chỉ là bộ lọc hiển thị — không phải bằng chứng quyền.
 */
export function resolveScope(raw: string | null, cinemas: readonly ScopeCinema[], canSeeAll: boolean): string {
  if (raw === ALL_CINEMAS && canSeeAll) return ALL_CINEMAS;
  if (raw && cinemas.some((c) => c.id === raw)) return raw;
  return canSeeAll ? ALL_CINEMAS : (cinemas[0]?.id ?? ALL_CINEMAS);
}

export function useAdminScope(cinemas: readonly ScopeCinema[], canSeeAll: boolean): AdminScope {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = resolveScope(searchParams.get("cinema"), cinemas, canSeeAll);

  const setScope = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("cinema", next);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return { scope, setScope };
}
