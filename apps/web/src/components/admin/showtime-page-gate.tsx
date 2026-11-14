"use client";

import type { ReactNode } from "react";

import { EmptyState, ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";

import { useShowtimeCinema, type ScopedCinema } from "./use-showtime-cinema";

/** Chờ/cảnh báo xác định rạp đang thao tác, rồi render `children(cinema)`. */
export function ShowtimeCinemaGate({ children }: Readonly<{ children: (cinema: ScopedCinema) => ReactNode }>) {
  const state = useShowtimeCinema();
  if (state.status === "loading") return <Skeleton className="h-40 w-full" />;
  if (state.status === "error") return <ErrorState onRetry={state.retry} />;
  if (state.status === "need-cinema") {
    return (
      <EmptyState
        title="Chọn một rạp"
        description="Lịch chiếu được quản lý theo từng rạp. Hãy chọn rạp ở thanh trên cùng."
      />
    );
  }
  return <>{children(state.cinema)}</>;
}
