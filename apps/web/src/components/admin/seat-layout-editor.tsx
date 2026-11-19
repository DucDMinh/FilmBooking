"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SeatType } from "@filmbooking/shared";
import { seatColSpan, type SeatCellInput } from "@filmbooking/shared/schemas/cinema-ops";

export type EditorTool = SeatType | "empty";

interface ToolDef {
  tool: EditorTool;
  label: string;
  key: string;
  cellClass: string;
}

/** Phím tắt 1-5 đổi loại ô đang chọn, 0 / Delete / Backspace xoá ô. */
export const TOOLS: readonly ToolDef[] = [
  { tool: "standard", label: "Ghế thường", key: "1", cellClass: "border-seat-available-line bg-seat-available" },
  { tool: "vip", label: "Ghế VIP", key: "2", cellClass: "border-seat-vip-line bg-seat-vip" },
  { tool: "sweetbox", label: "Ghế đôi (Sweetbox)", key: "3", cellClass: "border-seat-sweetbox-line bg-seat-sweetbox" },
  { tool: "aisle", label: "Lối đi", key: "4", cellClass: "border-dashed border-border bg-transparent text-fg-muted" },
  { tool: "broken", label: "Ghế hỏng", key: "5", cellClass: "border-seat-locked-line bg-seat-locked text-fg-muted line-through" },
  { tool: "empty", label: "Ô trống", key: "0", cellClass: "border-dashed border-border-subtle bg-transparent" },
];

const EMPTY_TOOL: ToolDef = { tool: "empty", label: "Ô trống", key: "0", cellClass: "border-dashed border-border-subtle bg-transparent" };
const SELLABLE: ReadonlySet<SeatType> = new Set<SeatType>(["standard", "vip", "sweetbox"]);

const rowLetter = (index: number) => String.fromCharCode(65 + index);
const keyOf = (row: string, col: number) => `${row}:${col}`;

export type LayoutMap = ReadonlyMap<string, SeatCellInput>;

export function toLayoutMap(cells: readonly SeatCellInput[]): LayoutMap {
  return new Map(cells.map((cell) => [keyOf(cell.row, cell.col), cell]));
}

export function toCells(layout: LayoutMap): SeatCellInput[] {
  return [...layout.values()].sort((a, b) => a.row.localeCompare(b.row) || a.col - b.col);
}

/** Ô gốc của Sweetbox che phủ vị trí này (chính ô đó hoặc ô bên trái), nếu có. */
function coveringSweetbox(layout: LayoutMap, row: string, col: number): SeatCellInput | undefined {
  const here = layout.get(keyOf(row, col));
  if (here?.type === "sweetbox") return here;
  const left = layout.get(keyOf(row, col - 1));
  return left?.type === "sweetbox" ? left : undefined;
}

export type ApplyResult = { layout: LayoutMap; error?: undefined } | { layout: LayoutMap; error: string };

/**
 * Đặt/xoá một ô. Sweetbox chiếm 2 ô liền kề cùng hàng (R-48): thiếu chỗ → báo lỗi, không đổi gì.
 * Ô bị đè lên một nửa Sweetbox khác thì Sweetbox đó bị gỡ cả hai ô để không sinh ghế đôi lẻ.
 */
export function applyTool(
  layout: LayoutMap,
  row: string,
  col: number,
  tool: EditorTool,
  gridCols: number,
): ApplyResult {
  const span = tool === "empty" ? 1 : seatColSpan(tool);
  if (col + span - 1 > gridCols) {
    return { layout, error: "Ghế đôi cần 2 ô liền kề cùng hàng, không đủ chỗ ở cuối hàng." };
  }
  const next = new Map(layout);
  for (let offset = 0; offset < span; offset += 1) {
    const covering = coveringSweetbox(next, row, col + offset);
    if (covering) next.delete(keyOf(covering.row, covering.col));
    next.delete(keyOf(row, col + offset));
  }
  if (tool !== "empty") next.set(keyOf(row, col), { row, col, type: tool });
  return { layout: next };
}

export function summarizeLayout(layout: LayoutMap) {
  let seats = 0;
  let vip = 0;
  let sweetbox = 0;
  for (const cell of layout.values()) {
    if (!SELLABLE.has(cell.type)) continue;
    seats += 1;
    if (cell.type === "vip") vip += 1;
    if (cell.type === "sweetbox") sweetbox += 1;
  }
  return { seats, vip, sweetbox };
}

export interface SeatLayoutEditorProps {
  gridRows: number;
  gridCols: number;
  initialCells: readonly SeatCellInput[];
  /** Staff: chỉ xem. */
  readOnly?: boolean;
  saving?: boolean;
  /** Thông báo lỗi từ lần lưu trước (đã dịch tiếng Việt). */
  saveError?: string | null;
  onSave: (cells: SeatCellInput[]) => void;
}

function cellLabel(cell: SeatCellInput | undefined, row: string, col: number): string {
  if (!cell) return `${row}${col} ô trống`;
  const name = TOOLS.find((t) => t.tool === cell.type)?.label ?? cell.type;
  return `${row}${col} ${name}`;
}

export function SeatLayoutEditor({
  gridRows,
  gridCols,
  initialCells,
  readOnly = false,
  saving = false,
  saveError,
  onSave,
}: Readonly<SeatLayoutEditorProps>) {
  const [layout, setLayout] = useState<LayoutMap>(() => toLayoutMap(initialCells));
  const [tool, setTool] = useState<EditorTool>("standard");
  const [active, setActive] = useState({ r: 0, c: 1 });
  const [error, setError] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const summary = useMemo(() => summarizeLayout(layout), [layout]);
  const rows = useMemo(() => Array.from({ length: gridRows }, (_, i) => rowLetter(i)), [gridRows]);

  const place = (row: string, col: number, chosen: EditorTool) => {
    if (readOnly) return;
    const result = applyTool(layout, row, col, chosen, gridCols);
    setError(result.error ?? null);
    if (!result.error) setLayout(result.layout);
  };

  const focusCell = (r: number, c: number) => {
    const nr = Math.min(Math.max(r, 0), gridRows - 1);
    let nc = Math.min(Math.max(c, 1), gridCols);
    const covering = coveringSweetbox(layout, rowLetter(nr), nc);
    if (covering) nc = covering.col;
    setActive({ r: nr, c: nc });
    buttons.current.get(keyOf(rowLetter(nr), nc))?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, row: string, col: number) => {
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = arrows[event.key];
    if (move) {
      event.preventDefault();
      const span = layout.get(keyOf(row, col))?.type === "sweetbox" ? 2 : 1;
      focusCell(active.r + move[0], col + (move[1] > 0 ? span : move[1]));
      return;
    }
    if (readOnly) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      place(row, col, "empty");
      return;
    }
    const byKey = TOOLS.find((t) => t.key === event.key);
    if (byKey) {
      event.preventDefault();
      setTool(byKey.tool);
      place(row, col, byKey.tool);
    }
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div role="radiogroup" aria-label="Loại ô" className="flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <Button
              key={t.tool}
              type="button"
              role="radio"
              aria-checked={tool === t.tool}
              variant={tool === t.tool ? "default" : "outline"}
              size="sm"
              className="min-h-11"
              onClick={() => setTool(t.tool)}
            >
              <span aria-hidden className={cn("mr-2 inline-block size-4 border", t.cellClass)} />
              {t.label}
              <kbd className="ml-2 text-caption text-fg-muted">{t.key}</kbd>
            </Button>
          ))}
        </div>
      )}
      <p className="text-body-sm text-fg-secondary">
        {readOnly
          ? "Bạn chỉ có quyền xem sơ đồ ghế."
          : "Chọn loại ô, rồi nhấn vào ô để đặt. Bàn phím: mũi tên di chuyển, phím 1-5 đặt loại ghế, 0 hoặc Delete xoá ô."}
      </p>

      <div className="overflow-x-auto border border-border-subtle p-3">
        <div className="mx-auto mb-3 h-1.5 w-[70%] bg-seat-screen" aria-hidden />
        <div
          role="grid"
          aria-label="Sơ đồ ghế"
          aria-rowcount={gridRows}
          aria-colcount={gridCols}
          className="mx-auto grid w-max gap-1.5"
          style={{ gridTemplateColumns: `1.5rem repeat(${gridCols}, 2.25rem)` }}
        >
          {rows.map((row, r) => (
            <div key={row} role="row" className="contents">
              <span role="rowheader" className="flex items-center justify-center text-caption text-fg-muted">
                {row}
              </span>
              {Array.from({ length: gridCols }, (_, i) => i + 1).map((col) => {
                const cell = layout.get(keyOf(row, col));
                const covered = !cell && coveringSweetbox(layout, row, col);
                if (covered) return null;
                const def = TOOLS.find((t) => t.tool === (cell?.type ?? "empty")) ?? EMPTY_TOOL;
                const label = cell && SELLABLE.has(cell.type) ? `${row}${col}` : "";
                return (
                  <button
                    key={col}
                    ref={(el) => {
                      if (el) buttons.current.set(keyOf(row, col), el);
                      else buttons.current.delete(keyOf(row, col));
                    }}
                    type="button"
                    role="gridcell"
                    aria-label={cellLabel(cell, row, col)}
                    tabIndex={active.r === r && active.c === col ? 0 : -1}
                    style={cell?.type === "sweetbox" ? { gridColumn: "span 2" } : undefined}
                    className={cn(
                      "flex h-9 min-w-9 items-center justify-center border text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      def.cellClass,
                    )}
                    onFocus={() => setActive({ r, c: col })}
                    onClick={() => place(row, col, tool)}
                    onKeyDown={(e) => onKeyDown(e, row, col)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {(error ?? saveError) && (
        <p role="alert" className="text-body-sm text-danger-text">
          {error ?? saveError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-fg-secondary">
          Tổng: {summary.seats} ghế • {summary.vip} VIP • {summary.sweetbox} Sweetbox
        </p>
        {!readOnly && (
          <Button type="button" disabled={saving} className="min-h-11" onClick={() => onSave(toCells(layout))}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Lưu sơ đồ
          </Button>
        )}
      </div>
    </div>
  );
}
