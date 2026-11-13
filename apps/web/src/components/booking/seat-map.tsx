"use client";

import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";
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

const STATE_CLASS: Record<SeatVisualState, string> = {
  free: "border-seat-available-line bg-seat-available text-fg hover:border-brand",
  selected: "border-seat-selected bg-seat-selected text-fg-on-brand font-bold",
  held: "border-seat-held bg-seat-held/60 text-fg-on-brand",
  sold: "border-transparent bg-seat-sold text-seat-sold-mark",
  locked: "border-seat-locked-line bg-seat-locked text-fg-muted",
  broken: "border-seat-locked-line bg-seat-locked text-fg-muted line-through",
};

const TYPE_CLASS: Record<string, string> = {
  VIP: "border-seat-vip-line bg-seat-vip",
  SWEETBOX: "border-seat-sweetbox-line bg-seat-sweetbox",
};

function seatClass(seat: SeatMapItem, state: SeatVisualState, orphan: boolean): string {
  const typeClass = state === "free" ? TYPE_CLASS[seat.type.toUpperCase()] : undefined;
  return cn(
    "flex h-9 w-full min-w-7 items-center justify-center rounded-seat border text-caption tabular transition-colors duration-100",
    "outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    STATE_CLASS[state],
    typeClass,
    state === "free" ? "cursor-pointer" : "cursor-default",
    orphan && "ring-2 ring-danger",
  );
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
        <span className="text-caption font-bold uppercase tracking-widest text-fg-muted">Màn hình</span>
        <div className="h-1.5 w-[70%] rounded-pill bg-seat-screen" />
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
              <span role="rowheader" className="w-5 shrink-0 text-center text-caption text-fg-muted">
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
                        onClick={() => onSeatActivate(seat)}
                      >
                        <span aria-hidden="true">{seat.col}</span>
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
