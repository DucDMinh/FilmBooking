"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ALL_CINEMAS, type ScopeCinema } from "./use-admin-scope";

interface CinemaScopeSwitcherProps {
  cinemas: readonly ScopeCinema[];
  /** Chỉ Admin: thêm lựa chọn "Toàn chuỗi". */
  canSeeAll: boolean;
  scope: string;
  onScopeChange: (next: string) => void;
}

export function CinemaScopeSwitcher({
  cinemas,
  canSeeAll,
  scope,
  onScopeChange,
}: Readonly<CinemaScopeSwitcherProps>) {
  const isSingleAssigned = !canSeeAll && cinemas.length <= 1;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Select value={scope} onValueChange={onScopeChange} disabled={isSingleAssigned}>
        <SelectTrigger aria-label="Phạm vi rạp" className="w-48 md:w-60">
          <SelectValue placeholder="Chọn rạp" />
        </SelectTrigger>
        <SelectContent>
          {canSeeAll && <SelectItem value={ALL_CINEMAS}>Toàn chuỗi</SelectItem>}
          {cinemas.map((cinema) => (
            <SelectItem key={cinema.id} value={cinema.id}>
              {cinema.name}
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
