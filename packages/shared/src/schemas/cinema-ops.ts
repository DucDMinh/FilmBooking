import { z } from "zod";
import { SCREEN_FORMATS, SEAT_TYPES } from "../enums";
import { vnLocalToUtc } from "../time";

/** DTO vận hành rạp (phòng, sơ đồ ghế, suất chiếu, khoá ghế, cấu hình rạp) — R-47..R-51, R-55, R-56. */

export const uuidSchema = z.uuid();

export const ROOM_STATUS_VALUES = ["ACTIVE", "MAINTENANCE"] as const;
export const SHOWTIME_STATUS_VALUES = ["ON_SALE", "CLOSED", "CANCELLED"] as const;
export const LANGUAGE_MODE_VALUES = ["SUBTITLED", "DUBBED", "ORIGINAL"] as const;
export const LOCK_REASON_VALUES = ["GUEST", "BROKEN_EQUIPMENT", "OTHER"] as const;

export const MAX_GRID_ROWS = 26;
export const MAX_GRID_COLS = 60;
export const MAX_BULK_SHOWTIMES = 1000;

const requireOneField = (value: object) => Object.keys(value).length > 0;
const ONE_FIELD_MESSAGE = "At least one field is required";

// ── Phòng ──────────────────────────────────────────────────────────────────
export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  supportedFormats: z.array(z.enum(SCREEN_FORMATS)).min(1),
  gridRows: z.number().int().min(1).max(MAX_GRID_ROWS).default(10),
  gridCols: z.number().int().min(1).max(MAX_GRID_COLS).default(12),
  status: z.enum(ROOM_STATUS_VALUES).default("ACTIVE"),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    supportedFormats: z.array(z.enum(SCREEN_FORMATS)).min(1),
    status: z.enum(ROOM_STATUS_VALUES),
  })
  .partial()
  .refine(requireOneField, ONE_FIELD_MESSAGE);
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

// ── Sơ đồ ghế ──────────────────────────────────────────────────────────────
export const seatCellSchema = z.object({
  row: z.string().regex(/^[A-Z]$/, "Row must be a letter A-Z"),
  col: z.number().int().min(1).max(MAX_GRID_COLS),
  type: z.enum(SEAT_TYPES),
});
export type SeatCellInput = z.infer<typeof seatCellSchema>;

/** Số ô lưới một loại ghế chiếm: Sweetbox = 2 (R-48), còn lại 1. */
export function seatColSpan(type: SeatCellInput["type"]): number {
  return type === "sweetbox" ? 2 : 1;
}

/** Không ô nào được chồng nhau trong cùng hàng (kể cả ô thứ 2 của Sweetbox). */
function findOverlappingCell(cells: readonly SeatCellInput[]): SeatCellInput | undefined {
  const occupied = new Set<string>();
  for (const cell of cells) {
    for (let offset = 0; offset < seatColSpan(cell.type); offset += 1) {
      const key = `${cell.row}:${cell.col + offset}`;
      if (occupied.has(key)) return cell;
      occupied.add(key);
    }
  }
  return undefined;
}

export const saveSeatLayoutSchema = z
  .object({ cells: z.array(seatCellSchema).max(MAX_GRID_ROWS * MAX_GRID_COLS) })
  .superRefine((value, ctx) => {
    const overlap = findOverlappingCell(value.cells);
    if (overlap) {
      ctx.addIssue({
        code: "custom",
        path: ["cells"],
        message: `Cell ${overlap.row}${overlap.col} overlaps another cell (Sweetbox occupies 2 columns)`,
      });
    }
  });
export type SaveSeatLayoutInput = z.infer<typeof saveSeatLayoutSchema>;

export const copySeatLayoutSchema = z.object({ sourceRoomId: uuidSchema });
export type CopySeatLayoutInput = z.infer<typeof copySeatLayoutSchema>;

// ── Suất chiếu ─────────────────────────────────────────────────────────────
const isoInstant = z.iso.datetime({ offset: true });
const vnDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealVnDate, "Invalid date");
const vnTime = z.string().regex(/^\d{2}:\d{2}$/).refine(isRealVnTime, "Invalid time");

function isRealVnDate(value: string): boolean {
  try {
    vnLocalToUtc(value, "00:00");
    return true;
  } catch {
    return false;
  }
}

function isRealVnTime(value: string): boolean {
  try {
    vnLocalToUtc("2026-01-01", value);
    return true;
  } catch {
    return false;
  }
}

export const createShowtimeSchema = z.object({
  roomId: uuidSchema,
  movieId: uuidSchema,
  startsAt: isoInstant,
  format: z.enum(SCREEN_FORMATS),
  languageMode: z.enum(LANGUAGE_MODE_VALUES).default("SUBTITLED"),
});
export type CreateShowtimeInput = z.infer<typeof createShowtimeSchema>;

export const updateShowtimeSchema = z
  .object({
    roomId: uuidSchema,
    movieId: uuidSchema,
    startsAt: isoInstant,
    format: z.enum(SCREEN_FORMATS),
    languageMode: z.enum(LANGUAGE_MODE_VALUES),
  })
  .partial()
  .refine(requireOneField, ONE_FIELD_MESSAGE);
export type UpdateShowtimeInput = z.infer<typeof updateShowtimeSchema>;

export const bulkShowtimeTargetSchema = z.object({
  cinemaId: uuidSchema,
  roomIds: z.array(uuidSchema).min(1).max(50),
});

/** Một phim × (nhiều ngày × nhiều khung giờ VN) × (nhiều phòng, nhiều rạp). */
export const bulkCreateShowtimesSchema = z
  .object({
    movieId: uuidSchema,
    format: z.enum(SCREEN_FORMATS),
    languageMode: z.enum(LANGUAGE_MODE_VALUES).default("SUBTITLED"),
    dates: z.array(vnDate).min(1).max(62),
    times: z.array(vnTime).min(1).max(24),
    targets: z.array(bulkShowtimeTargetSchema).min(1).max(50),
    /** true: bỏ qua suất trùng, tạo các suất hợp lệ; false (mặc định): có trùng thì không tạo gì (atomic). */
    skipConflicts: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const roomCount = value.targets.reduce((sum, target) => sum + target.roomIds.length, 0);
    if (value.dates.length * value.times.length * roomCount > MAX_BULK_SHOWTIMES) {
      ctx.addIssue({ code: "custom", message: `At most ${MAX_BULK_SHOWTIMES} showtimes per request` });
    }
  });
export type BulkCreateShowtimesInput = z.infer<typeof bulkCreateShowtimesSchema>;

export const listShowtimesQuerySchema = z.object({
  from: isoInstant.optional(),
  to: isoInstant.optional(),
  roomId: uuidSchema.optional(),
  status: z.enum(SHOWTIME_STATUS_VALUES).optional(),
});
export type ListShowtimesQuery = z.infer<typeof listShowtimesQuerySchema>;

// ── Khoá ghế theo suất (R-55) ──────────────────────────────────────────────
export const lockSeatsSchema = z.object({
  seatIds: z.array(uuidSchema).min(1).max(100),
  reason: z.enum(LOCK_REASON_VALUES).default("OTHER"),
});
export type LockSeatsInput = z.infer<typeof lockSeatsSchema>;

// ── Cấu hình rạp (R-56): null = dùng mặc định chuỗi ────────────────────────
export const updateCinemaSettingsSchema = z
  .object({
    cleaningMinutes: z.number().int().min(0).max(240).nullable(),
    onlineCutoffMinutes: z.number().int().min(0).max(1440).nullable(),
  })
  .partial()
  .refine(requireOneField, ONE_FIELD_MESSAGE);
export type UpdateCinemaSettingsInput = z.infer<typeof updateCinemaSettingsSchema>;
