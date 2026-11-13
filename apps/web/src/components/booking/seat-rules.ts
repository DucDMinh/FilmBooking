import { formatVnd } from "@filmbooking/shared";
import type { SeatMapItem } from "@filmbooking/shared/schemas/booking";

/** Giới hạn ghế mỗi đơn; ghế đôi (colSpan 2) tính 2 ghế (R-65). */
export const MAX_SEATS_PER_ORDER = 8;

/** Ghế đặt được (không phải lối đi / ghế hỏng). */
export function isBookableType(seat: Pick<SeatMapItem, "type">): boolean {
  const type = seat.type.toUpperCase();
  return type === "NORMAL" || type === "VIP" || type === "SWEETBOX";
}

export function seatWeight(seat: Pick<SeatMapItem, "colSpan">): number {
  return seat.colSpan >= 2 ? 2 : 1;
}

export function totalWeight(seats: readonly SeatMapItem[]): number {
  return seats.reduce((sum, seat) => sum + seatWeight(seat), 0);
}

const TYPE_LABEL: Record<string, string> = {
  NORMAL: "Thường",
  VIP: "VIP",
  SWEETBOX: "Sweetbox",
  BROKEN: "Hỏng",
};

export function seatTypeLabel(type: string): string {
  return TYPE_LABEL[type.toUpperCase()] ?? type;
}

export type SeatVisualState = "free" | "selected" | "held" | "sold" | "locked" | "broken";

export const SEAT_STATE_LABEL: Record<SeatVisualState, string> = {
  free: "trống",
  selected: "đang chọn",
  held: "đang giữ",
  sold: "đã bán",
  locked: "khoá",
  broken: "hỏng",
};

export function visualState(seat: SeatMapItem, selected: boolean): SeatVisualState {
  if (seat.type.toUpperCase() === "BROKEN") return "broken";
  if (seat.state === "SOLD") return "sold";
  if (seat.state === "LOCKED") return "locked";
  if (seat.state === "HELD") return "held";
  return selected ? "selected" : "free";
}

/** "Hàng E ghế 5" / "Hàng H ghế 7-8" (ghế đôi). */
export function seatPositionLabel(seat: SeatMapItem): string {
  const cols = seat.colSpan >= 2 ? `${seat.col}-${seat.col + seat.colSpan - 1}` : `${seat.col}`;
  return `Hàng ${seat.row} ghế ${cols}`;
}

/** "Hàng E ghế 5, VIP, 120.000 đồng, trống" (NFR-12). */
export function seatAriaLabel(seat: SeatMapItem, selected: boolean): string {
  const state = SEAT_STATE_LABEL[visualState(seat, selected)];
  const price = formatVnd(seat.price).replace("₫", "đồng");
  return `${seatPositionLabel(seat)}, ${seatTypeLabel(seat.type)}, ${price}, ${state}`;
}

/**
 * Ghế lẻ (R-66) — mirror đúng RPC giữ ghế (20261112140000_hold_seats_hardening.sql):
 * hàng chia thành đoạn bởi barrier (AISLE/BROKEN/ghế khoá) và chỗ hở cột; trong đoạn có tổng ô trống
 * trước khi chọn > 2, một ghế NORMAL/VIP còn trống mà hai bên (nếu có) đều đã bị chiếm/được chọn là ghế lẻ.
 * Chỉ xét hàng có ghế được chọn. Server vẫn là nơi quyết định cuối (ORPHAN_SEAT).
 */
export function findOrphanSeatIds(seats: readonly SeatMapItem[], selectedIds: ReadonlySet<string>): string[] {
  const rows = new Map<string, SeatMapItem[]>();
  for (const seat of seats) rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat]);
  const orphans: string[] = [];
  for (const row of rows.values()) {
    if (!row.some((s) => selectedIds.has(s.id))) continue;
    const ordered = [...row].sort((a, b) => a.col - b.col);
    for (const segment of splitSegments(ordered)) {
      const availableBefore = segment.filter((s) => !isOccupied(s, null)).reduce((sum, s) => sum + s.colSpan, 0);
      if (availableBefore <= 2) continue;
      segment.forEach((seat, i) => {
        const type = seat.type.toUpperCase();
        if ((type !== "NORMAL" && type !== "VIP") || isOccupied(seat, selectedIds)) return;
        const prev = segment[i - 1];
        const next = segment[i + 1];
        if ((!prev || isOccupied(prev, selectedIds)) && (!next || isOccupied(next, selectedIds))) orphans.push(seat.id);
      });
    }
  }
  return orphans;
}

function isBarrier(seat: SeatMapItem): boolean {
  const type = seat.type.toUpperCase();
  return type === "AISLE" || type === "BROKEN" || seat.state === "LOCKED";
}

function isOccupied(seat: SeatMapItem, selectedIds: ReadonlySet<string> | null): boolean {
  return seat.state === "SOLD" || seat.state === "HELD" || (selectedIds?.has(seat.id) ?? false);
}

function splitSegments(ordered: readonly SeatMapItem[]): SeatMapItem[][] {
  const segments: SeatMapItem[][] = [];
  let current: SeatMapItem[] = [];
  let nextCol: number | null = null;
  for (const seat of ordered) {
    if (isBarrier(seat) || (nextCol !== null && seat.col !== nextCol)) {
      if (current.length > 0) segments.push(current);
      current = [];
    }
    if (!isBarrier(seat)) current.push(seat);
    nextCol = seat.col + seat.colSpan;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
