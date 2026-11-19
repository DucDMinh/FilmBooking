import Link from "next/link";

import { cn } from "@/lib/utils";

// Chip có clip-path nên focus vẽ bằng vòng inset (T7); utility box-shadow thắng rule base nên phải khai báo lại ở đây.
const CHIP_FOCUS = "outline-hidden focus-visible:shadow-[inset_0_0_0_2px_var(--focus-inset,var(--color-brand))]";

/** Class cho chip ngày (DateStrip): chamfer-sm 2 dòng, đang chọn = nền vàng chữ tối. */
export function dateChipClass(selected: boolean): string {
  return cn(
    "chamfer-sm flex min-h-[52px] min-w-[88px] shrink-0 flex-col items-center justify-center px-3.5 py-2 text-center transition-colors duration-200",
    CHIP_FOCUS,
    selected
      ? "bg-brand text-fg-on-brand [--focus-inset:var(--color-fg-on-brand)]"
      : "bg-surface text-fg-secondary shadow-[inset_0_0_0_1px_var(--color-frame)] hover:text-fg hover:shadow-[inset_0_0_0_1px_var(--color-brand)]",
  );
}

/** Hai dòng của chip ngày: nhãn HUD (Hôm nay, Thứ sáu) và ngày/tháng. Digit + "/" là ASCII nên dùng được Orbitron. */
export function DateChipText({
  label,
  subLabel,
  selected,
}: Readonly<{ label: string; subLabel: string; selected: boolean }>) {
  return (
    <>
      <span
        className={cn(
          "font-mono text-hud uppercase tracking-wider",
          selected ? "text-fg-on-brand" : "text-fg-muted",
        )}
      >
        {label}
      </span>
      <span className="font-display text-lg leading-tight font-bold tabular">{subLabel}</span>
    </>
  );
}

/** ShowtimeChip còn bán: giờ mono + dòng phụ. ≥ 44px; hover/focus đổi nền vàng. */
export function ShowtimeLinkChip({
  href,
  time,
  detail,
  ariaLabel,
}: Readonly<{ href: string; time: string; detail: string; ariaLabel?: string }>) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        "group chamfer-sm flex min-h-11 min-w-16 flex-col items-center justify-center bg-surface-elevated px-3.5 py-1.5 text-fg transition-colors duration-200",
        "hover:bg-brand hover:text-fg-on-brand focus-visible:bg-brand focus-visible:text-fg-on-brand focus-visible:[--focus-inset:var(--color-fg-on-brand)]",
        CHIP_FOCUS,
      )}
    >
      <span className="font-mono text-[15px] leading-tight font-medium tabular">{time}</span>
      <span className="font-mono text-[11px] leading-tight text-fg-muted group-hover:text-fg-on-brand group-focus-visible:text-fg-on-brand">
        {detail}
      </span>
    </Link>
  );
}

/** ShowtimeChip đã đóng bán online (R-67): không phải link, giữ aria-label + tooltip, chỉ dẫn mua tại quầy. */
export function ShowtimeClosedChip({ time, ariaLabel }: Readonly<{ time: string; ariaLabel: string }>) {
  return (
    <div
      aria-label={ariaLabel}
      aria-disabled="true"
      title="Đã đóng bán online, vui lòng mua tại quầy"
      className="chamfer-sm flex min-h-11 min-w-16 cursor-not-allowed flex-col items-center justify-center bg-surface-control px-3.5 py-1.5 text-fg-muted"
    >
      <span className="font-mono text-[15px] leading-tight font-medium tabular">{time}</span>
      <span className="font-mono text-[11px] leading-tight text-warning">Mua tại quầy</span>
    </div>
  );
}
