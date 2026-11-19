import { formatVnd } from "@filmbooking/shared";
import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";
import { Check, Lock, Timer, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { seatTypeLabel } from "./seat-rules";

// Mẫu ô chamfer-seat; viền vẽ bằng box-shadow inset (clip-path cắt border). Dấu hiệu khớp SeatMap, không chỉ màu.
const FREE_SWATCH = "bg-seat-available shadow-[inset_0_0_0_1px_var(--color-seat-available-line)]";
const ICON = "size-3";

const STATE_ITEMS: readonly { label: string; swatch: string; mark?: ReactNode }[] = [
  { label: "Trống", swatch: FREE_SWATCH },
  {
    label: "Đang chọn",
    swatch: "bg-seat-selected text-fg-on-brand",
    mark: <Check className={ICON} strokeWidth={3} aria-hidden="true" />,
  },
  { label: "Đang giữ", swatch: "bg-seat-held text-fg-on-brand", mark: <Timer className={ICON} aria-hidden="true" /> },
  { label: "Đã bán", swatch: "bg-seat-sold text-seat-sold-mark", mark: <X className={ICON} aria-hidden="true" /> },
  {
    label: "Khoá",
    swatch: "border border-dashed border-seat-locked-line bg-seat-locked text-fg-muted",
    mark: <Lock className={ICON} aria-hidden="true" />,
  },
  {
    label: "Hỏng",
    swatch: "border border-dashed border-seat-locked-line bg-seat-locked opacity-60",
  },
];

const TYPE_SWATCH: Record<string, string> = {
  NORMAL: FREE_SWATCH,
  VIP: "bg-seat-vip shadow-[inset_0_2px_0_var(--color-seat-vip-line),inset_0_0_0_1px_#12697A]",
  SWEETBOX: "bg-seat-sweetbox shadow-[inset_0_0_0_1px_var(--color-seat-sweetbox-line)]",
};

function Swatch({ className, children }: Readonly<{ className: string; children?: ReactNode }>) {
  return (
    <span
      aria-hidden="true"
      className={cn("chamfer-seat inline-flex h-4 w-[18px] shrink-0 items-center justify-center", className)}
    >
      {children}
    </span>
  );
}

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
          <li key={item.label} className="flex items-center gap-2">
            <Swatch className={item.swatch}>{item.mark}</Swatch>
            {item.label}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Giá theo loại ghế">
        {types.map((type) => (
          <li key={type} className="flex items-center gap-2">
            <Swatch className={TYPE_SWATCH[type] ?? ""} />
            {seatTypeLabel(type)}
            {pricing[type] ? <span className="tabular text-fg">{formatVnd(pricing[type])}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
