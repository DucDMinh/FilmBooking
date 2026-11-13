"use client";

import { useEffect, useRef, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBrowserSupabase } from "@/lib/supabase/browser";

import { ALL_CINEMAS, type ScopeCinema } from "./use-admin-scope";

export interface ScopeCinemaWithStatus extends ScopeCinema {
  status?: string;
  code?: string;
}

export interface CinemaSelectorProps {
  cinemas: readonly ScopeCinemaWithStatus[];
  /** Chỉ Admin: thêm lựa chọn "Toàn chuỗi". */
  canSeeAll: boolean;
  scope: string;
  onScopeChange: (next: string) => void;
  onCinemasLoaded?: (cinemas: ScopeCinemaWithStatus[]) => void;
}

const STATUS_LABELS: Record<string, string> = {
  COMING_SOON: "Sắp mở",
  TEMP_CLOSED: "Tạm đóng",
  CLOSED: "Đóng cửa",
};

export function formatCinemaOption(cinema: ScopeCinemaWithStatus): string {
  const statusLabel = cinema.status ? STATUS_LABELS[cinema.status] : undefined;
  return statusLabel ? `${cinema.name} (${statusLabel})` : cinema.name;
}

async function fetchCinemasFromSupabase(): Promise<ScopeCinemaWithStatus[] | null> {
  try {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from("cinemas")
      .select("id, name, code, status")
      .order("name");

    if (error || !data) return null;
    return data.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      status: c.status,
    }));
  } catch {
    return null;
  }
}

export function CinemaSelector({
  cinemas,
  canSeeAll,
  scope,
  onScopeChange,
  onCinemasLoaded,
}: Readonly<CinemaSelectorProps>) {
  const [items, setItems] = useState<readonly ScopeCinemaWithStatus[]>(cinemas);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    setItems(cinemas);
  }, [cinemas]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    let isMounted = true;

    async function load() {
      const data = await fetchCinemasFromSupabase();
      if (!data || !isMounted) return;
      hasLoadedRef.current = true;

      if (canSeeAll) {
        setItems(data);
        onCinemasLoaded?.(data);
      } else {
        const nameMap = new Map(data.map((c) => [c.id, c]));
        const updated = cinemas.map((c) => {
          const found = nameMap.get(c.id);
          return found ? { ...c, name: found.name, status: found.status, code: found.code } : c;
        });
        setItems(updated);
        onCinemasLoaded?.(updated);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [canSeeAll, cinemas, onCinemasLoaded]);

  const isSingleAssigned = !canSeeAll && items.length <= 1;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Select value={scope} onValueChange={onScopeChange} disabled={isSingleAssigned}>
        <SelectTrigger aria-label="Phạm vi rạp" className="w-48 md:w-60">
          <SelectValue placeholder="Chọn rạp" />
        </SelectTrigger>
        <SelectContent>
          {canSeeAll && <SelectItem value={ALL_CINEMAS}>Toàn chuỗi</SelectItem>}
          {items.map((cinema) => (
            <SelectItem key={cinema.id} value={cinema.id}>
              {formatCinemaOption(cinema)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!canSeeAll && (
        <span className="sr-only text-caption text-fg-muted lg:not-sr-only">
          Dữ liệu chỉ giới hạn trong rạp được phân công
        </span>
      )}
    </div>
  );
}

export { CinemaSelector as CinemaScopeSwitcher };
