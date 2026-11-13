import { formatVnd } from "@filmbooking/shared";
import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";

import { cn } from "@/lib/utils";
import { seatTypeLabel } from "./seat-rules";

const STATE_ITEMS = [
  { label: "Trống", swatch: "border-seat-available-line bg-seat-available" },
  { label: "Đang chọn", swatch: "border-seat-selected bg-seat-selected" },
  { label: "Đang giữ", swatch: "border-seat-held bg-seat-held/60" },
  { label: "Đã bán", swatch: "border-transparent bg-seat-sold" },
  { label: "Khoá", swatch: "border-seat-locked-line bg-seat-locked" },
  { label: "Hỏng", swatch: "border-seat-locked-line bg-seat-locked opacity-60" },
] as const;

const TYPE_SWATCH: Record<string, string> = {
  NORMAL: "border-seat-available-line bg-seat-available",
  VIP: "border-seat-vip-line bg-seat-vip",
  SWEETBOX: "border-seat-sweetbox-line bg-seat-sweetbox",
};

/** Chú thích trạng thái + loại ghế có mặt trong phòng kèm giá (R-59). */
export function SeatLegend({
  pricing,
  seats,
  className,
}: Readonly<{ pricing: Record<string, number>; seats: readonly SeatMapItem[]; className?: string }>) {
  const types = [...new Set(seats.map((s) => s.type.toUpperCase()))].filter((t) => t in TYPE_SWATCH);
  return (
    <div className={cn("flex flex-col gap-3 text-caption text-fg-secondary", className)}>
      <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Chú thích trạng thái ghế">
        {STATE_ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-4 rounded-seat border", item.swatch)} />
            {item.label}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Giá theo loại ghế">
        {types.map((type) => (
          <li key={type} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-4 rounded-seat border", TYPE_SWATCH[type])} />
            {seatTypeLabel(type)}
            {pricing[type] ? <span className="tabular text-fg">{formatVnd(pricing[type])}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
