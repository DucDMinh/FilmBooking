import { toVnParts } from "@filmbooking/shared";

import { ApiError } from "@/lib/api/client";

export interface ShowtimeRowDto {
  id: string;
  cinemaId: string;
  roomId: string;
  movieId: string;
  startsAt: string;
  endsAt: string;
  format: string;
  languageMode: string;
  status: "ON_SALE" | "CLOSED" | "CANCELLED";
}

/** Một suất dự kiến bị trùng (409 SHOWTIME_OVERLAP, AC-14). `conflictsWith` rỗng = trùng với suất khác trong cùng yêu cầu. */
export interface ShowtimeConflict {
  cinemaId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  conflictsWith: ShowtimeRowDto[];
}

export const SHOWTIME_STATUS_LABEL: Record<ShowtimeRowDto["status"], string> = {
  ON_SALE: "Đang bán",
  CLOSED: "Đóng bán",
  CANCELLED: "Đã huỷ",
};

export const SHOWTIME_STATUS_TONE = {
  ON_SALE: "success",
  CLOSED: "neutral",
  CANCELLED: "danger",
} as const;

export const LANGUAGE_MODE_LABEL: Record<string, string> = {
  SUBTITLED: "Phụ đề",
  DUBBED: "Lồng tiếng",
  ORIGINAL: "Nguyên bản",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "19:00" theo giờ Việt Nam. */
export function formatVnTime(iso: string): string {
  const p = toVnParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "14/11/2026" theo giờ Việt Nam. */
export function formatVnDate(iso: string): string {
  const p = toVnParts(new Date(iso));
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** "2026-11-14" theo giờ Việt Nam (giá trị `<input type="date">`). */
export function vnDateKey(date: Date): string {
  const p = toVnParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Ngày kế tiếp của "YYYY-MM-DD" (tính trên lịch, không phụ thuộc múi giờ máy). */
export function nextDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** Liệt kê ngày từ `from` đến `to` (gồm cả hai đầu), tối đa `limit`. */
export function dateRange(from: string, to: string, limit = 62): string[] {
  const out: string[] = [];
  for (let cursor = from; cursor <= to && out.length < limit; cursor = nextDateKey(cursor)) out.push(cursor);
  return out;
}

/** Lấy danh sách suất trùng từ lỗi 409 SHOWTIME_OVERLAP; null nếu không phải lỗi trùng lịch. */
export function overlapConflicts(error: unknown): ShowtimeConflict[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (error.details?.reason !== "SHOWTIME_OVERLAP") return null;
  const conflicts = error.details.conflicts;
  return Array.isArray(conflicts) ? (conflicts as ShowtimeConflict[]) : null;
}

/** R-54: suất đã có vé bán (ghế SOLD) không được sửa giờ/phòng/xoá. */
export function hasSoldSeats(seats: readonly { state: string }[]): boolean {
  return seats.some((seat) => seat.state === "SOLD");
}

export const SOLD_LOCK_REASON = "Suất đã có vé bán nên không thể sửa giờ/phòng hoặc xoá (R-54). Bạn vẫn có thể đóng bán hoặc huỷ suất.";
