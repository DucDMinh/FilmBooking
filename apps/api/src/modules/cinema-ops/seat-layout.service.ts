import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES, type SeatType } from "@filmbooking/shared";
import {
  seatColSpan,
  type CreateRoomInput,
  type SaveSeatLayoutInput,
  type SeatCellInput,
  type UpdateRoomInput,
} from "@filmbooking/shared/schemas/cinema-ops";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";

export const ROOM_COLUMNS = "id, cinema_id, name, supported_formats, status, grid_rows, grid_cols, created_at, updated_at";
const SEAT_COLUMNS = "id, room_id, row_label, col_number, seat_type, col_span, label";

const DB_SEAT_TYPE: Record<SeatType, string> = {
  standard: "NORMAL",
  vip: "VIP",
  sweetbox: "SWEETBOX",
  aisle: "AISLE",
  broken: "BROKEN",
};
const API_SEAT_TYPE = new Map<string, SeatType>(
  Object.entries(DB_SEAT_TYPE).map(([api, db]) => [db, api as SeatType]),
);
/** Ô bán được thì có nhãn ghế (A1, B12...); lối đi/ghế hỏng không có nhãn. */
const SELLABLE_TYPES: ReadonlySet<SeatType> = new Set<SeatType>(["standard", "vip", "sweetbox"]);

interface DbError {
  code?: string;
  message?: string;
}

export interface RoomRow {
  id: string;
  cinema_id: string;
  name: string;
  supported_formats: string[];
  status: string;
  grid_rows: number;
  grid_cols: number;
  created_at: string;
  updated_at: string;
}

interface SeatRow {
  id: string;
  room_id: string;
  row_label: string;
  col_number: number;
  seat_type: string;
  col_span: number;
  label: string | null;
}

/**
 * Dịch lỗi Postgres/PostgREST sang AppException mã ổn định (dùng chung cho cả module).
 * Lỗi không nhận diện được ném nguyên để AllExceptionsFilter trả 500 (không lộ chi tiết DB).
 */
export function throwDbError(error: DbError, details?: Record<string, unknown>): never {
  switch (error.code) {
    case "23P01": // exclusion_violation: chồng giờ phòng / chồng ô ghế
      throw new AppException(ERROR_CODES.CONFLICT, "Overlaps an existing record", { reason: "OVERLAP", ...details });
    case "23505": // unique_violation
      throw new AppException(ERROR_CODES.CONFLICT, "Already exists", { reason: "DUPLICATE", ...details });
    case "23503": // foreign_key_violation: còn tham chiếu hoặc tham chiếu không tồn tại
      throw new AppException(ERROR_CODES.CONFLICT, "Referenced record missing or still in use", {
        reason: "REFERENCE",
        ...details,
      });
    case "23514": // check_violation: trigger nghiệp vụ (ghế ngoài lưới, phòng bảo trì, phim chưa PUBLISHED, suất đã bán vé...)
      if (error.message?.includes("Suất đã bán vé")) {
        throw new AppException(ERROR_CODES.CONFLICT, error.message, { reason: "SHOWTIME_HAS_SALES", ...details });
      }
      if (error.message?.includes("đang được giữ hoặc đã bán")) {
        throw new AppException(ERROR_CODES.SEAT_TAKEN, error.message, details);
      }
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, error.message ?? "Constraint violated", details);
    case "42501": // insufficient_privilege / RLS: không có quyền ghi dữ liệu rạp này
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No permission for this cinema");
    default:
      throw error;
  }
}

/**
 * Trả `data` hoặc ném lỗi đã dịch. Khi không có lỗi, PostgREST luôn trả mảng (có thể rỗng) cho truy vấn nhiều dòng
 * và dòng/null cho `single`/`maybeSingle`, nên `null` chỉ xuất hiện ở kiểu tĩnh, không ở runtime.
 */
export function unwrap<T>(result: { data: T | null; error: DbError | null }, details?: Record<string, unknown>): T {
  if (result.error) throwDbError(result.error, details);
  return result.data as T;
}

function toSeatDto(row: SeatRow) {
  return {
    id: row.id,
    row: row.row_label,
    col: row.col_number,
    colSpan: row.col_span,
    type: API_SEAT_TYPE.get(row.seat_type) ?? "standard",
    label: row.label,
  };
}

export function toRoomDto(row: RoomRow) {
  return {
    id: row.id,
    cinemaId: row.cinema_id,
    name: row.name,
    supportedFormats: row.supported_formats,
    status: row.status,
    gridRows: row.grid_rows,
    gridCols: row.grid_cols,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSeatInsert(room: RoomRow, cell: SeatCellInput) {
  return {
    room_id: room.id,
    cinema_id: room.cinema_id,
    row_label: cell.row,
    col_number: cell.col,
    seat_type: DB_SEAT_TYPE[cell.type],
    label: SELLABLE_TYPES.has(cell.type) ? `${cell.row}${cell.col}` : null,
  };
}

function roomNotFound(): AppException {
  return new AppException(ERROR_CODES.NOT_FOUND, "Room not found");
}

/** Phòng + sơ đồ ghế (R-47, R-48). Dùng JWT của user nên RLS vẫn áp dụng ở DB. */
@Injectable()
export class SeatLayoutService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  async listRooms(user: AuthUser, cinemaId: string) {
    const rows: RoomRow[] = unwrap(
      await this.supabase.forUser(user.jwt).from("rooms").select(ROOM_COLUMNS).eq("cinema_id", cinemaId).order("name"),
    );
    return rows.map(toRoomDto);
  }

  async createRoom(user: AuthUser, cinemaId: string, input: CreateRoomInput) {
    const row: RoomRow = unwrap(
      await this.supabase
        .forUser(user.jwt)
        .from("rooms")
        .insert({
          cinema_id: cinemaId,
          name: input.name,
          supported_formats: input.supportedFormats,
          grid_rows: input.gridRows,
          grid_cols: input.gridCols,
          status: input.status,
        })
        .select(ROOM_COLUMNS)
        .single(),
    );
    return toRoomDto(row);
  }

  async updateRoom(user: AuthUser, cinemaId: string, roomId: string, input: UpdateRoomInput) {
    const patch = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.supportedFormats !== undefined && { supported_formats: input.supportedFormats }),
      ...(input.status !== undefined && { status: input.status }),
    };
    const rows: RoomRow[] = unwrap(
      await this.supabase
        .forUser(user.jwt)
        .from("rooms")
        .update(patch)
        .eq("id", roomId)
        .eq("cinema_id", cinemaId)
        .select(ROOM_COLUMNS),
    );
    // RLS từ chối UPDATE thì trả 0 dòng thay vì lỗi.
    const updated = rows[0];
    if (!updated) throw roomNotFound();
    return toRoomDto(updated);
  }

  async deleteRoom(user: AuthUser, cinemaId: string, roomId: string): Promise<void> {
    const rows: { id: string }[] = unwrap(
      await this.supabase
        .forUser(user.jwt)
        .from("rooms")
        .delete()
        .eq("id", roomId)
        .eq("cinema_id", cinemaId)
        .select("id"),
    );
    if (rows.length === 0) throw roomNotFound();
  }

  async getLayout(user: AuthUser, cinemaId: string, roomId: string) {
    const db = this.supabase.forUser(user.jwt);
    const room = await this.requireRoom(db, cinemaId, roomId);
    return { room: toRoomDto(room), cells: (await this.fetchSeats(db, roomId)).map(toSeatDto) };
  }

  /** Thay toàn bộ sơ đồ của phòng. Bị chặn khi phòng còn suất sắp chiếu (ghế đã được bán/khoá theo ghế cũ). */
  async saveLayout(user: AuthUser, cinemaId: string, roomId: string, input: SaveSeatLayoutInput) {
    const db = this.supabase.forUser(user.jwt);
    const room = await this.requireRoom(db, cinemaId, roomId);
    this.assertCellsInGrid(input.cells, room.grid_rows, room.grid_cols);
    await this.replaceSeats(db, room, input.cells);
    return this.getLayout(user, cinemaId, roomId);
  }

  /** Sao chép sơ đồ từ phòng khác, kể cả rạp khác (R-48): sơ đồ ghế đọc công khai nên chỉ cần quyền ghi phòng đích. */
  async copyLayout(user: AuthUser, cinemaId: string, roomId: string, sourceRoomId: string) {
    const db = this.supabase.forUser(user.jwt);
    const target = await this.requireRoom(db, cinemaId, roomId);
    const source: RoomRow | null = unwrap(
      await db.from("rooms").select(ROOM_COLUMNS).eq("id", sourceRoomId).maybeSingle(),
    );
    if (!source) throw roomNotFound();
    const cells = (await this.fetchSeats(db, sourceRoomId))
      .map(toSeatDto)
      .map((seat): SeatCellInput => ({ row: seat.row, col: seat.col, type: seat.type }));
    // Kiểm tra trước khi đụng dữ liệu đích.
    await this.assertNoUpcomingShowtimes(db, roomId);
    if (source.grid_rows !== target.grid_rows || source.grid_cols !== target.grid_cols) {
      unwrap(
        await db
          .from("rooms")
          .update({ grid_rows: source.grid_rows, grid_cols: source.grid_cols })
          .eq("id", roomId)
          .eq("cinema_id", cinemaId)
          .select("id"),
      );
    }
    await this.replaceSeats(db, target, cells);
    return this.getLayout(user, cinemaId, roomId);
  }

  private async requireRoom(db: SupabaseClient, cinemaId: string, roomId: string): Promise<RoomRow> {
    const room: RoomRow | null = unwrap(
      await db.from("rooms").select(ROOM_COLUMNS).eq("id", roomId).eq("cinema_id", cinemaId).maybeSingle(),
    );
    if (!room) throw roomNotFound();
    return room;
  }

  private async fetchSeats(db: SupabaseClient, roomId: string): Promise<SeatRow[]> {
    return unwrap(
      await db.from("seats").select(SEAT_COLUMNS).eq("room_id", roomId).order("row_label").order("col_number"),
    );
  }

  private assertCellsInGrid(cells: readonly SeatCellInput[], gridRows: number, gridCols: number): void {
    const outside = cells.find(
      (cell) => cell.row.charCodeAt(0) - 64 > gridRows || cell.col + seatColSpan(cell.type) - 1 > gridCols,
    );
    if (outside) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Cell is outside the room grid", {
        cell: `${outside.row}${outside.col}`,
        gridRows,
        gridCols,
      });
    }
  }

  private async assertNoUpcomingShowtimes(db: SupabaseClient, roomId: string): Promise<void> {
    const rows: { id: string }[] = unwrap(
      await db
        .from("showtimes")
        .select("id")
        .eq("room_id", roomId)
        .neq("status", "CANCELLED")
        .gt("ends_at", new Date().toISOString())
        .limit(1),
    );
    if (rows.length > 0) {
      throw new AppException(ERROR_CODES.CONFLICT, "Room has upcoming showtimes; cancel them before changing the layout", {
        reason: "ROOM_HAS_UPCOMING_SHOWTIMES",
      });
    }
  }

  /** Xoá rồi chèn lại; chèn lỗi thì khôi phục sơ đồ cũ (Supabase REST không có transaction nhiều câu lệnh). */
  private async replaceSeats(db: SupabaseClient, room: RoomRow, cells: readonly SeatCellInput[]): Promise<void> {
    await this.assertNoUpcomingShowtimes(db, room.id);
    const previous = await this.fetchSeats(db, room.id);
    unwrap(await db.from("seats").delete().eq("room_id", room.id).select("id"));
    if (cells.length === 0) return;

    const inserted = await db.from("seats").insert(cells.map((cell) => toSeatInsert(room, cell)));
    if (!inserted.error) return;
    if (previous.length > 0) {
      const restore = previous.map((seat) =>
        toSeatInsert(room, { row: seat.row_label, col: seat.col_number, type: API_SEAT_TYPE.get(seat.seat_type) ?? "standard" }),
      );
      await db.from("seats").insert(restore);
    }
    throwDbError(inserted.error);
  }
}
