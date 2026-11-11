import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES, vnLocalToUtc } from "@filmbooking/shared";
import {
  type BulkCreateShowtimesInput,
  type CreateShowtimeInput,
  type ListShowtimesQuery,
  type LockSeatsInput,
  type UpdateCinemaSettingsInput,
  type UpdateShowtimeInput,
} from "@filmbooking/shared/schemas/cinema-ops";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessService, satisfies, type AuthenticatedRequest } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { ROOM_COLUMNS, throwDbError, unwrap, type RoomRow } from "./seat-layout.service";

const SHOWTIME_COLUMNS =
  "id, cinema_id, room_id, movie_id, starts_at, ends_at, format, language_mode, status, created_at, updated_at";
/** Liệt kê cột tường minh: `locked_by` không được grant cho client nên `select *` sẽ lỗi. */
const LOCK_COLUMNS = "id, showtime_id, seat_id, room_id, cinema_id, reason, created_at";
const FALLBACK_CLEANING_MINUTES = 15;
const FALLBACK_ONLINE_CUTOFF_MINUTES = 15;
const MS_PER_MINUTE = 60_000;
/** PostgREST/Postgres: bảng chưa tồn tại (migration đơn hàng chưa áp dụng). */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"]);

interface ShowtimeRow {
  id: string;
  cinema_id: string;
  room_id: string;
  movie_id: string;
  starts_at: string;
  ends_at: string;
  format: string;
  language_mode: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MovieRow {
  id: string;
  duration_minutes: number;
  status: string;
}

/** Suất dự kiến: chưa ghi DB, đã tính `endsAt` = bắt đầu + thời lượng phim + dọn phòng. */
interface Candidate {
  cinemaId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
}

interface ConflictReport {
  cinemaId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  /** Suất đã có trong DB bị trùng; rỗng nghĩa là trùng với một suất khác trong chính yêu cầu hàng loạt. */
  conflictsWith: ReturnType<typeof toShowtimeDto>[];
}

function toShowtimeDto(row: ShowtimeRow) {
  return {
    id: row.id,
    cinemaId: row.cinema_id,
    roomId: row.room_id,
    movieId: row.movie_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    format: row.format,
    languageMode: row.language_mode,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

const showtimeNotFound = () => new AppException(ERROR_CODES.NOT_FOUND, "Showtime not found");

/** Suất chiếu, đóng bán, khoá ghế, cấu hình rạp (R-49..R-51, R-54..R-56). Ghi bằng JWT user để giữ RLS. */
@Injectable()
export class ShowtimesService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  // ── Suất chiếu ───────────────────────────────────────────────────────────
  async list(user: AuthUser, cinemaId: string, query: ListShowtimesQuery) {
    let request = this.supabase.forUser(user.jwt).from("showtimes").select(SHOWTIME_COLUMNS).eq("cinema_id", cinemaId);
    if (query.roomId) request = request.eq("room_id", query.roomId);
    if (query.status) request = request.eq("status", query.status);
    if (query.from) request = request.gte("starts_at", query.from);
    if (query.to) request = request.lt("starts_at", query.to);
    const rows: ShowtimeRow[] = unwrap(await request.order("starts_at"));
    return rows.map(toShowtimeDto);
  }

  async create(user: AuthUser, cinemaId: string, input: CreateShowtimeInput) {
    const db = this.supabase.forUser(user.jwt);
    const planner = new Planner(db);
    const movie = await planner.movie(input.movieId);
    const room = await planner.room(cinemaId, input.roomId, input.format);
    const startsAt = new Date(input.startsAt);
    const candidate = await planner.candidate(room, movie, startsAt);

    const [conflict] = await this.findConflicts(db, [candidate]);
    if (conflict) throw conflictException([conflict]);
    return toShowtimeDto(await this.insertOne(db, cinemaId, input, startsAt));
  }

  /**
   * Tạo hàng loạt (R-51). Manager: chỉ rạp mình; Admin: nhiều rạp. Quyền từng rạp kiểm ở đây
   * (guard theo route chỉ xử lý được một cinemaId). `skipConflicts=false` -> có trùng thì không tạo gì.
   */
  async bulkCreate(user: AuthUser, request: AuthenticatedRequest, input: BulkCreateShowtimesInput) {
    await this.assertManagesCinemas(request, input.targets.map((target) => target.cinemaId));
    const db = this.supabase.forUser(user.jwt);
    const planner = new Planner(db);
    const movie = await planner.movie(input.movieId);

    const candidates: Candidate[] = [];
    for (const target of input.targets) {
      for (const roomId of target.roomIds) {
        const room = await planner.room(target.cinemaId, roomId, input.format);
        for (const date of input.dates) {
          for (const time of input.times) {
            candidates.push(await planner.candidate(room, movie, vnLocalToUtc(date, time)));
          }
        }
      }
    }

    const conflicts = await this.findConflicts(db, candidates);
    if (conflicts.length > 0 && !input.skipConflicts) throw conflictException(conflicts);
    const conflicted = new Set(conflicts.map((c) => `${c.roomId}|${c.startsAt}`));
    const valid = candidates.filter((c) => !conflicted.has(`${c.roomId}|${c.startsAt.toISOString()}`));

    let created: ShowtimeRow[] = [];
    if (valid.length > 0) {
      // Một câu INSERT nhiều dòng = atomic; race với tiến trình khác -> 23P01 -> 409.
      created = unwrap(
        await db
          .from("showtimes")
          .insert(
            valid.map((c) => ({
              cinema_id: c.cinemaId,
              room_id: c.roomId,
              movie_id: input.movieId,
              starts_at: c.startsAt.toISOString(),
              format: input.format,
              language_mode: input.languageMode,
            })),
          )
          .select(SHOWTIME_COLUMNS),
      );
    }
    return { created: created.map(toShowtimeDto), skipped: conflicts };
  }

  /** R-54: suất đã bán vé không được đổi giờ/phòng/phim (và định dạng/ngôn ngữ, vì ảnh hưởng giá & vé đã bán). */
  async update(user: AuthUser, cinemaId: string, showtimeId: string, input: UpdateShowtimeInput) {
    const db = this.supabase.forUser(user.jwt);
    const current = await this.requireShowtime(db, cinemaId, showtimeId);
    if (current.status === "CANCELLED") {
      throw new AppException(ERROR_CODES.SHOWTIME_CANCELLED, "Showtime is cancelled");
    }
    await this.assertNoSales(showtimeId, "edit");

    const planner = new Planner(db);
    const next = {
      roomId: input.roomId ?? current.room_id,
      movieId: input.movieId ?? current.movie_id,
      startsAt: input.startsAt ? new Date(input.startsAt) : new Date(current.starts_at),
      format: input.format ?? current.format,
    };
    const movie = await planner.movie(next.movieId);
    const room = await planner.room(cinemaId, next.roomId, next.format as "2D" | "3D");
    const candidate = await planner.candidate(room, movie, next.startsAt);
    const [conflict] = await this.findConflicts(db, [candidate], showtimeId);
    if (conflict) throw conflictException([conflict]);

    const patch = {
      room_id: next.roomId,
      movie_id: next.movieId,
      starts_at: next.startsAt.toISOString(),
      format: next.format,
      ...(input.languageMode !== undefined && { language_mode: input.languageMode }),
    };
    return toShowtimeDto(await this.updateOne(db, cinemaId, showtimeId, patch));
  }

  async remove(user: AuthUser, cinemaId: string, showtimeId: string): Promise<void> {
    const db = this.supabase.forUser(user.jwt);
    await this.requireShowtime(db, cinemaId, showtimeId);
    await this.assertNoSales(showtimeId, "delete");
    const rows: { id: string }[] = unwrap(
      await db.from("showtimes").delete().eq("id", showtimeId).eq("cinema_id", cinemaId).select("id"),
    );
    if (rows.length === 0) throw showtimeNotFound();
  }

  /** Đóng bán (ngừng bán tiếp) — vẫn cho phép khi suất đã có vé (R-54). */
  async close(user: AuthUser, cinemaId: string, showtimeId: string) {
    return this.setSalesStatus(user, cinemaId, showtimeId, "ON_SALE", "CLOSED");
  }

  async reopen(user: AuthUser, cinemaId: string, showtimeId: string) {
    return this.setSalesStatus(user, cinemaId, showtimeId, "CLOSED", "ON_SALE");
  }

  // ── Khoá ghế (R-55) ──────────────────────────────────────────────────────
  async listLocks(user: AuthUser, cinemaId: string, showtimeId: string) {
    const db = this.supabase.forUser(user.jwt);
    await this.requireShowtime(db, cinemaId, showtimeId);
    return unwrap(await db.from("showtime_seat_locks").select(LOCK_COLUMNS).eq("showtime_id", showtimeId));
  }

  async lockSeats(user: AuthUser, cinemaId: string, showtimeId: string, input: LockSeatsInput) {
    const db = this.supabase.forUser(user.jwt);
    const showtime = await this.requireShowtime(db, cinemaId, showtimeId);
    if (showtime.status === "CANCELLED") {
      throw new AppException(ERROR_CODES.SHOWTIME_CANCELLED, "Showtime is cancelled");
    }
    const seatIds = [...new Set(input.seatIds)];
    const seats: { id: string; seat_type: string }[] = unwrap(
      await db.from("seats").select("id, seat_type").eq("room_id", showtime.room_id).in("id", seatIds),
    );
    if (seats.length !== seatIds.length) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Seat does not belong to the showtime's room");
    }
    if (seats.some((seat) => seat.seat_type === "AISLE" || seat.seat_type === "BROKEN")) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Aisle or broken cells cannot be locked");
    }
    await this.assertSeatsNotSold(showtimeId, seatIds);

    return unwrap(
      await db
        .from("showtime_seat_locks")
        .insert(seatIds.map((seatId) => ({ showtime_id: showtimeId, seat_id: seatId, reason: input.reason })))
        .select(LOCK_COLUMNS),
    );
  }

  async unlockSeat(user: AuthUser, cinemaId: string, showtimeId: string, seatId: string): Promise<void> {
    const db = this.supabase.forUser(user.jwt);
    await this.requireShowtime(db, cinemaId, showtimeId);
    const rows: { id: string }[] = unwrap(
      await db.from("showtime_seat_locks").delete().eq("showtime_id", showtimeId).eq("seat_id", seatId).select("id"),
    );
    if (rows.length === 0) throw new AppException(ERROR_CODES.NOT_FOUND, "Seat lock not found");
  }

  // ── Cấu hình rạp (R-56) ──────────────────────────────────────────────────
  async getSettings(user: AuthUser, cinemaId: string) {
    const db = this.supabase.forUser(user.jwt);
    const row = await this.fetchCinemaSettings(db, cinemaId);
    if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Cinema not found");
    return this.toSettingsDto(db, row);
  }

  async updateSettings(user: AuthUser, cinemaId: string, input: UpdateCinemaSettingsInput) {
    const db = this.supabase.forUser(user.jwt);
    const patch = {
      ...(input.cleaningMinutes !== undefined && { cleaning_minutes: input.cleaningMinutes }),
      ...(input.onlineCutoffMinutes !== undefined && { online_cutoff_minutes: input.onlineCutoffMinutes }),
    };
    const rows: CinemaSettingsRow[] = unwrap(
      await db.from("cinemas").update(patch).eq("id", cinemaId).select("id, cleaning_minutes, online_cutoff_minutes"),
    );
    // RLS từ chối UPDATE thì trả 0 dòng.
    const updated = rows[0];
    if (!updated) throw new AppException(ERROR_CODES.NOT_FOUND, "Cinema not found");
    return this.toSettingsDto(db, updated);
  }

  // ── Nội bộ ───────────────────────────────────────────────────────────────
  private async fetchCinemaSettings(db: SupabaseClient, cinemaId: string): Promise<CinemaSettingsRow | null> {
    return unwrap(
      await db.from("cinemas").select("id, cleaning_minutes, online_cutoff_minutes").eq("id", cinemaId).maybeSingle(),
    );
  }

  private async toSettingsDto(db: SupabaseClient, row: CinemaSettingsRow) {
    const defaults = await readChainDefaults(db);
    return {
      cleaningMinutes: row.cleaning_minutes,
      onlineCutoffMinutes: row.online_cutoff_minutes,
      effectiveCleaningMinutes: row.cleaning_minutes ?? defaults.cleaning,
      effectiveOnlineCutoffMinutes: row.online_cutoff_minutes ?? defaults.onlineCutoff,
    };
  }

  /** Vai trò MANAGER (hoặc Admin) tại MỌI rạp trong yêu cầu; thiếu một rạp là từ chối cả yêu cầu. */
  private async assertManagesCinemas(request: AuthenticatedRequest, cinemaIds: readonly string[]): Promise<void> {
    const access = await this.access.loadForRequest(request);
    if (access.isAdmin) return;
    const denied = cinemaIds.filter((id) => {
      const held = access.cinemaRoles.get(id);
      return held === undefined || !satisfies(held, "MANAGER");
    });
    if (denied.length > 0) {
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No access to this cinema", { cinemaIds: denied });
    }
  }

  private async requireShowtime(db: SupabaseClient, cinemaId: string, showtimeId: string): Promise<ShowtimeRow> {
    const row: ShowtimeRow | null = unwrap(
      await db
        .from("showtimes")
        .select(SHOWTIME_COLUMNS)
        .eq("id", showtimeId)
        .eq("cinema_id", cinemaId)
        .maybeSingle(),
    );
    if (!row) throw showtimeNotFound();
    return row;
  }

  /**
   * Suất đã có ghế SOLD (R-54). Đọc bằng service role vì RLS của bảng trạng thái ghế có thể giấu
   * dòng của khách; quyền thao tác đã được guard theo rạp kiểm ở trên. Bảng chưa có thì coi như chưa bán.
   * DB trigger (R-54) vẫn là chốt cuối.
   */
  private async soldSeatIds(showtimeId: string, seatIds?: readonly string[]): Promise<string[]> {
    let query = this.supabase
      .admin()
      .from("showtime_seat_states")
      .select("seat_id")
      .eq("showtime_id", showtimeId)
      .eq("state", "SOLD");
    if (seatIds) query = query.in("seat_id", [...seatIds]);
    const { data, error } = await query.limit(1000);
    if (error) {
      if (error.code && MISSING_RELATION_CODES.has(error.code)) return [];
      throwDbError(error);
    }
    return (data ?? []).map((row: { seat_id: string }) => row.seat_id);
  }

  private async assertNoSales(showtimeId: string, action: "edit" | "delete"): Promise<void> {
    const sold = await this.soldSeatIds(showtimeId);
    if (sold.length > 0) {
      throw new AppException(ERROR_CODES.CONFLICT, `Showtime already has sold tickets; cannot ${action} it`, {
        reason: "SHOWTIME_HAS_SALES",
      });
    }
  }

  private async assertSeatsNotSold(showtimeId: string, seatIds: readonly string[]): Promise<void> {
    const sold = await this.soldSeatIds(showtimeId, seatIds);
    if (sold.length > 0) {
      throw new AppException(ERROR_CODES.SEAT_TAKEN, "Seat is already sold", { seatIds: sold });
    }
  }

  private async setSalesStatus(user: AuthUser, cinemaId: string, showtimeId: string, from: string, to: string) {
    const db = this.supabase.forUser(user.jwt);
    const current = await this.requireShowtime(db, cinemaId, showtimeId);
    if (current.status === "CANCELLED") {
      throw new AppException(ERROR_CODES.SHOWTIME_CANCELLED, "Showtime is cancelled");
    }
    if (current.status === to) return toShowtimeDto(current);
    if (current.status !== from) throw new AppException(ERROR_CODES.CONFLICT, "Invalid showtime status transition");
    return toShowtimeDto(await this.updateOne(db, cinemaId, showtimeId, { status: to }));
  }

  private async updateOne(
    db: SupabaseClient,
    cinemaId: string,
    showtimeId: string,
    patch: Record<string, unknown>,
  ): Promise<ShowtimeRow> {
    const rows: ShowtimeRow[] = unwrap(
      await db
        .from("showtimes")
        .update(patch)
        .eq("id", showtimeId)
        .eq("cinema_id", cinemaId)
        .select(SHOWTIME_COLUMNS),
    );
    const updated = rows[0];
    if (!updated) throw showtimeNotFound();
    return updated;
  }

  private async insertOne(
    db: SupabaseClient,
    cinemaId: string,
    input: CreateShowtimeInput,
    startsAt: Date,
  ): Promise<ShowtimeRow> {
    return unwrap(
      await db
        .from("showtimes")
        .insert({
          cinema_id: cinemaId,
          room_id: input.roomId,
          movie_id: input.movieId,
          starts_at: startsAt.toISOString(),
          format: input.format,
          language_mode: input.languageMode,
        })
        .select(SHOWTIME_COLUMNS)
        .single(),
    );
  }

  /**
   * Trùng với suất đang có trong cùng phòng (không tính suất huỷ) hoặc với suất đứng trước trong cùng yêu cầu.
   * Mỗi phòng một truy vấn bao cả dải thời gian của mọi suất dự kiến. `ignoreShowtimeId` dùng khi sửa suất.
   */
  private async findConflicts(
    db: SupabaseClient,
    candidates: readonly Candidate[],
    ignoreShowtimeId?: string,
  ): Promise<ConflictReport[]> {
    const existingByRoom = await this.loadExistingByRoom(db, candidates, ignoreShowtimeId);
    const accepted: Candidate[] = [];
    const conflicts: ConflictReport[] = [];
    for (const candidate of candidates) {
      const start = candidate.startsAt.getTime();
      const end = candidate.endsAt.getTime();
      const hits = (existingByRoom.get(candidate.roomId) ?? []).filter((row) =>
        overlaps(start, end, Date.parse(row.starts_at), Date.parse(row.ends_at)),
      );
      const duplicatesBatch = accepted.some(
        (other) =>
          other.roomId === candidate.roomId &&
          overlaps(start, end, other.startsAt.getTime(), other.endsAt.getTime()),
      );
      if (hits.length === 0 && !duplicatesBatch) {
        accepted.push(candidate);
        continue;
      }
      conflicts.push({
        cinemaId: candidate.cinemaId,
        roomId: candidate.roomId,
        startsAt: candidate.startsAt.toISOString(),
        endsAt: candidate.endsAt.toISOString(),
        conflictsWith: hits.map(toShowtimeDto),
      });
    }
    return conflicts;
  }

  private async loadExistingByRoom(
    db: SupabaseClient,
    candidates: readonly Candidate[],
    ignoreShowtimeId?: string,
  ): Promise<Map<string, ShowtimeRow[]>> {
    const spanByRoom = new Map<string, { from: number; to: number }>();
    for (const c of candidates) {
      const span = spanByRoom.get(c.roomId);
      const from = c.startsAt.getTime();
      const to = c.endsAt.getTime();
      spanByRoom.set(c.roomId, span ? { from: Math.min(span.from, from), to: Math.max(span.to, to) } : { from, to });
    }
    const result = new Map<string, ShowtimeRow[]>();
    for (const [roomId, span] of spanByRoom) {
      let query = db
        .from("showtimes")
        .select(SHOWTIME_COLUMNS)
        .eq("room_id", roomId)
        .neq("status", "CANCELLED")
        .lt("starts_at", new Date(span.to).toISOString())
        .gt("ends_at", new Date(span.from).toISOString());
      if (ignoreShowtimeId) query = query.neq("id", ignoreShowtimeId);
      result.set(roomId, unwrap(await query));
    }
    return result;
  }
}

interface CinemaSettingsRow {
  id: string;
  cleaning_minutes: number | null;
  online_cutoff_minutes: number | null;
}

function conflictException(conflicts: readonly ConflictReport[]): AppException {
  return new AppException(ERROR_CODES.CONFLICT, "Showtime overlaps an existing showtime in the same room", {
    reason: "SHOWTIME_OVERLAP",
    conflicts,
  });
}

/** Mặc định chuỗi (app_settings) cho dọn phòng / mốc đóng bán online; thiếu thì dùng 15 phút. */
async function readChainDefaults(db: SupabaseClient): Promise<{ cleaning: number; onlineCutoff: number }> {
  const { data, error } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["default_cleaning_minutes", "default_online_cutoff_minutes"]);
  if (error) throwDbError(error);
  const byKey = new Map<string, unknown>((data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
  const asMinutes = (key: string, fallback: number) => {
    const value = Number(byKey.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    cleaning: asMinutes("default_cleaning_minutes", FALLBACK_CLEANING_MINUTES),
    onlineCutoff: asMinutes("default_online_cutoff_minutes", FALLBACK_ONLINE_CUTOFF_MINUTES),
  };
}

/** Tra phim/phòng/dọn phòng (có cache theo yêu cầu) để tính giờ kết thúc giống trigger `showtimes_derive_end`. */
class Planner {
  private readonly movies = new Map<string, MovieRow>();
  private readonly rooms = new Map<string, RoomRow>();
  private readonly cleaning = new Map<string, number>();
  private chainDefault?: number;

  constructor(private readonly db: SupabaseClient) {}

  async movie(movieId: string): Promise<MovieRow> {
    const cached = this.movies.get(movieId);
    if (cached) return cached;
    const row: MovieRow | null = unwrap(
      await this.db.from("movies").select("id, duration_minutes, status").eq("id", movieId).maybeSingle(),
    );
    if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Movie not found");
    if (row.status !== "PUBLISHED") {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Only PUBLISHED movies can be scheduled");
    }
    this.movies.set(movieId, row);
    return row;
  }

  /** Phòng phải thuộc đúng rạp của yêu cầu, đang hoạt động và hỗ trợ định dạng. */
  async room(cinemaId: string, roomId: string, format: string): Promise<RoomRow> {
    let room = this.rooms.get(roomId);
    if (!room) {
      const row: RoomRow | null = unwrap(
        await this.db.from("rooms").select(ROOM_COLUMNS).eq("id", roomId).eq("cinema_id", cinemaId).maybeSingle(),
      );
      if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Room not found in this cinema", { roomId });
      room = row;
      this.rooms.set(roomId, room);
    }
    if (room.status !== "ACTIVE") {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Room is under maintenance", { roomId });
    }
    if (!room.supported_formats.includes(format)) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, `Room does not support format ${format}`, { roomId });
    }
    return room;
  }

  async candidate(room: RoomRow, movie: MovieRow, startsAt: Date): Promise<Candidate> {
    const cleaningMinutes = await this.cleaningMinutes(room.cinema_id);
    const endsAt = new Date(startsAt.getTime() + (movie.duration_minutes + cleaningMinutes) * MS_PER_MINUTE);
    return { cinemaId: room.cinema_id, roomId: room.id, startsAt, endsAt };
  }

  private async cleaningMinutes(cinemaId: string): Promise<number> {
    const cached = this.cleaning.get(cinemaId);
    if (cached !== undefined) return cached;
    const cinema: { cleaning_minutes: number | null } | null = unwrap(
      await this.db.from("cinemas").select("cleaning_minutes").eq("id", cinemaId).maybeSingle(),
    );
    const minutes = cinema?.cleaning_minutes ?? (await this.defaultCleaning());
    this.cleaning.set(cinemaId, minutes);
    return minutes;
  }

  private async defaultCleaning(): Promise<number> {
    this.chainDefault ??= (await readChainDefaults(this.db)).cleaning;
    return this.chainDefault;
  }
}
