"use client";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type { MeResponse } from "@filmbooking/shared/schemas/me";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

import { ALL_CINEMAS, resolveScope } from "./use-admin-scope";

export interface ScopedCinema {
  id: string;
  name: string;
  code: string;
}

export type ShowtimeCinemaState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "need-cinema" }
  | { status: "ready"; cinema: ScopedCinema };

/**
 * Rạp đang thao tác cho các trang lịch chiếu: `?cinema=` của shell, hoặc rạp đầu tiên được gán
 * (Manager). Admin ở "Toàn chuỗi" phải chọn một rạp cụ thể. Chỉ là lọc hiển thị; API kiểm quyền thật.
 */
export function useShowtimeCinema(): ShowtimeCinemaState {
  const raw = useSearchParams().get("cinema");
  const [state, setState] = useState<ShowtimeCinemaState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([apiFetch<MeResponse>("/me"), apiFetch<CinemaDto[]>("/cinemas")])
      .then(([me, all]) => {
        if (cancelled) return;
        const assigned = me.cinemas.map((c) => ({ id: c.cinemaId, name: c.cinemaId }));
        const pool = me.isAdmin ? all.flatMap((c) => (c.id ? [{ id: c.id, name: c.name }] : [])) : assigned;
        const scope = resolveScope(raw, pool, me.isAdmin);
        if (scope === ALL_CINEMAS) {
          setState({ status: "need-cinema" });
          return;
        }
        // Rạp tạm đóng không có trong danh sách công khai: dùng id rút gọn làm tên/mã.
        const found = all.find((c) => c.id === scope);
        const short = scope.slice(0, 8);
        setState({
          status: "ready",
          cinema: { id: scope, name: found?.name ?? `Rạp ${short}`, code: found?.code ?? short },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", retry });
      });
    return () => {
      cancelled = true;
    };
  }, [raw, attempt, retry]);

  return state;
}
