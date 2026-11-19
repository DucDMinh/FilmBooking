"use client";

import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";
import { Check, Heart, Lock, Timer, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { isBookableType, seatAriaLabel, visualState, type SeatVisualState } from "./seat-rules";

export interface SeatMapProps {
  seats: readonly SeatMapItem[];
  selectedIds: ReadonlySet<string>;
  /** Ghế lẻ cần tô cảnh báo (R-66). */
  orphanIds?: ReadonlySet<string>;
  /** Mọi lần bấm / Enter / Space trên ghế; nơi gọi quyết định chọn, chặn hay mở dialog đăng nhập. */
  onSeatActivate: (seat: SeatMapItem) => void;
  className?: string;
}

// Ô ghế là chamfer (clip-path cắt mất border), nên viền vẽ bằng box-shadow inset (design-tokens §1.5, §6).
// Trạng thái luôn có dấu hiệu ngoài màu (✓, đồng hồ, ×, ổ khoá, nét đứt) để không chỉ dựa vào màu (NFR-12).
const STATE_CLASS: Record<SeatVisualState, string> = {
  free: "bg-seat-available text-fg shadow-[inset_0_0_0_1px_var(--color-seat-available-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand)]",
  selected: "bg-seat-selected text-fg-on-brand font-bold [--seat-focus:var(--color-fg-on-brand)]",
  held: "bg-seat-held text-fg-on-brand [--seat-focus:var(--color-fg-on-brand)]",
  sold: "bg-seat-sold text-seat-sold-mark",
  locked: "border border-dashed border-seat-locked-line bg-seat-locked text-fg-muted",
  broken: "border border-dashed border-seat-locked-line bg-seat-locked text-fg-muted line-through",
};

const TYPE_CLASS: Record<string, string> = {
  VIP: "bg-seat-vip shadow-[inset_0_2px_0_var(--color-seat-vip-line),inset_0_0_0_1px_#12697A]",
  SWEETBOX: "bg-seat-sweetbox shadow-[inset_0_0_0_1px_var(--color-seat-sweetbox-line)]",
};

function seatClass(seat: SeatMapItem, state: SeatVisualState, orphan: boolean): string {
  const typeClass = state === "free" ? TYPE_CLASS[seat.type.toUpperCase()] : undefined;
  return cn(
    "chamfer-seat flex h-9 w-full min-w-7 items-center justify-center gap-px font-mono text-[11px] tabular transition-[background-color,box-shadow] duration-[120ms] motion-reduce:transition-none",
    "outline-hidden focus-visible:shadow-[inset_0_0_0_2px_var(--seat-focus,var(--color-brand))]",
    STATE_CLASS[state],
    typeClass,
    state === "free" ? "cursor-pointer" : "cursor-default",
    // Ghế lẻ (R-66): khung danger inset (ring ngoài sẽ bị clip-path cắt).
    orphan && "shadow-[inset_0_0_0_2px_var(--color-danger)]",
  );
}

/** Dấu hiệu ngoài màu cho từng trạng thái; nội dung trang trí, nhãn đọc màn hình nằm ở aria-label của nút. */
function SeatMark({ seat, state }: Readonly<{ seat: SeatMapItem; state: SeatVisualState }>) {
  const icon = "size-3 shrink-0";
  if (state === "selected") {
    return (
      <>
        <Check className={icon} strokeWidth={3} aria-hidden="true" />
        <span aria-hidden="true">{seat.col}</span>
      </>
    );
  }
  if (state === "held") return <Timer className="size-3.5" aria-hidden="true" />;
  if (state === "sold") return <X className="size-3.5" aria-hidden="true" />;
  if (state === "locked") return <Lock className="size-3.5" aria-hidden="true" />;
  if (state === "free" && seat.type.toUpperCase() === "SWEETBOX") {
    return (
      <>
        <Heart className={cn(icon, "text-seat-sweetbox-line")} aria-hidden="true" />
        <span aria-hidden="true">{seat.col}</span>
      </>
    );
  }
  return <span aria-hidden="true">{seat.col}</span>;
}

/** Phản hồi chọn ghế: scale 1 -> 1.15 -> 1 trong 160ms, theo thời gian (không scrub). Bỏ qua khi reduced-motion. */
export function popElement(el: HTMLElement) {
  if (typeof el.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  el.animate([{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], { duration: 160, easing: "ease-out" });
}

/** Ghế kế tiếp theo phím mũi tên: trái/phải trong hàng, lên/xuống sang hàng có cột gần nhất. */
function neighbour(rows: SeatMapItem[][], seat: SeatMapItem, key: string): SeatMapItem | undefined {
  const rowIndex = rows.findIndex((row) => row.some((s) => s.id === seat.id));
  const row = rows[rowIndex];
  if (!row) return undefined;
  const index = row.findIndex((s) => s.id === seat.id);
  if (key === "ArrowLeft") return row[index - 1];
  if (key === "ArrowRight") return row[index + 1];
  const target = rows[rowIndex + (key === "ArrowUp" ? -1 : 1)];
  if (!target) return undefined;
  return target.reduce<SeatMapItem | undefined>(
    (best, s) => (!best || Math.abs(s.col - seat.col) < Math.abs(best.col - seat.col) ? s : best),
    undefined,
  );
}

/** Lưới ghế (design-spec §5.3): role=grid, roving tabindex, mũi tên di chuyển, Space/Enter chọn. */
export function SeatMap({ seats, selectedIds, orphanIds, onSeatActivate, className }: Readonly<SeatMapProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const visible = seats.filter((s) => s.type.toUpperCase() !== "AISLE");
  const rowLabels = [...new Set(visible.map((s) => s.row))].sort();
  const rows = rowLabels.map((label) => visible.filter((s) => s.row === label).sort((a, b) => a.col - b.col));
  const gridCols = Math.max(1, ...visible.map((s) => s.col + s.colSpan - 1));
  const tabbableId = focusId && visible.some((s) => s.id === focusId) ? focusId : (rows.flat()[0]?.id ?? null);

  const moveFocus = (seat: SeatMapItem, key: string) => {
    const target = neighbour(rows, seat, key);
    if (!target) return;
    setFocusId(target.id);
    containerRef.current?.querySelector<HTMLButtonElement>(`[data-seat-id="${target.id}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, seat: SeatMapItem) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    moveFocus(seat, event.key);
  };

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="flex w-full flex-col items-center gap-1" aria-hidden="true">
        <span className="hud">Màn hình</span>
        {/* Thanh màn hình: tia quét theo tiến độ cuộn (wipe); trong khung nhìn thì hiện đủ ngay. */}
        <div data-scrub-wipe="" className="h-1.5 w-[70%] bg-seat-screen shadow-[0_0_14px_rgb(154_154_176/0.45)]" />
      </div>
      <div className="w-full overflow-x-auto pb-2">
        <div
          ref={containerRef}
          role="grid"
          aria-label="Sơ đồ ghế"
          aria-rowcount={rows.length}
          aria-colcount={gridCols}
          className="mx-auto flex w-max min-w-full flex-col gap-1.5 md:gap-2"
        >
          {rows.map((row, rowIndex) => (
            <div key={rowLabels[rowIndex]} role="row" className="flex items-center gap-2">
              <span role="rowheader" className="hud w-5 shrink-0 text-center">
                {rowLabels[rowIndex]}
              </span>
              <div
                className="grid flex-1 gap-1.5 md:gap-2"
                style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(28px, 36px))` }}
              >
                {row.map((seat) => {
                  const selected = selectedIds.has(seat.id);
                  const state = visualState(seat, selected);
                  const interactive = state === "free" || state === "selected";
                  return (
                    <div
                      key={seat.id}
                      role="gridcell"
                      style={{ gridColumn: `${seat.col} / span ${Math.max(1, seat.colSpan)}` }}
                    >
                      <button
                        type="button"
                        data-seat-id={seat.id}
                        data-state={state}
                        aria-label={seatAriaLabel(seat, selected)}
                        aria-pressed={isBookableType(seat) ? selected : undefined}
                        aria-disabled={interactive ? undefined : true}
                        tabIndex={seat.id === tabbableId ? 0 : -1}
                        className={seatClass(seat, state, orphanIds?.has(seat.id) ?? false)}
                        onFocus={() => setFocusId(seat.id)}
                        onKeyDown={(event) => onKeyDown(event, seat)}
                        onClick={(event) => {
                          if (interactive) popElement(event.currentTarget);
                          onSeatActivate(seat);
                        }}
                      >
                        <SeatMark seat={seat} state={state} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
