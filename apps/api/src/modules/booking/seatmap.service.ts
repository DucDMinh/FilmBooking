import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type { SeatMapItem, SeatMapResponse, SeatMapState } from "@filmbooking/shared/schemas/booking";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";

@Injectable()
export class SeatmapService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /**
   * Sơ đồ ghế công khai: lưới ghế + state + expires_at + giá theo loại.
   * Tuyệt đối không trả user_id / order_id; ghế HELD có expires_at < now trả về FREE (R-59, AC-07).
   */
  async getSeatMap(showtimeId: string): Promise<SeatMapResponse> {
    const db = this.supabase.admin();
    const { showtime, room } = await this.loadShowtimeAndRoom(showtimeId);

    const { data: seats, error: seatsErr } = await db
      .from("seats")
      .select("id, row_label, col_number, col_span, seat_type, label")
      .eq("room_id", showtime.room_id)
      .order("row_label", { ascending: true })
      .order("col_number", { ascending: true });

    if (seatsErr) throw new AppException(ERROR_CODES.INTERNAL_ERROR, seatsErr.message);

    const [statesRes, locksRes] = await Promise.all([
      db.from("showtime_seat_states").select("seat_id, state, expires_at").eq("showtime_id", showtimeId),
      db.from("showtime_seat_locks").select("seat_id").eq("showtime_id", showtimeId),
    ]);

    if (statesRes.error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, statesRes.error.message);
    if (locksRes.error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, locksRes.error.message);

    const pricingMap = await this.fetchPricingMap(showtimeId, seats ?? []);
    const seatItems = this.buildSeatItems(seats ?? [], statesRes.data ?? [], locksRes.data ?? [], pricingMap);

    return {
      showtime: {
        id: showtime.id,
        cinemaId: showtime.cinema_id,
        roomId: showtime.room_id,
        movieId: showtime.movie_id,
        startsAt: showtime.starts_at,
        endsAt: showtime.ends_at,
        format: showtime.format,
        status: showtime.status,
      },
      room: {
        id: room.id,
        name: room.name,
        gridRows: room.grid_rows,
        gridCols: room.grid_cols,
      },
      pricing: pricingMap,
      seats: seatItems,
    };
  }

  private async loadShowtimeAndRoom(showtimeId: string) {
    const db = this.supabase.admin();
    const { data: showtime, error: stErr } = await db
      .from("showtimes")
      .select("id, cinema_id, room_id, movie_id, starts_at, ends_at, format, status")
      .eq("id", showtimeId)
      .maybeSingle();

    if (stErr) throw new AppException(ERROR_CODES.INTERNAL_ERROR, stErr.message);
    if (!showtime) throw new AppException(ERROR_CODES.NOT_FOUND, "Suất chiếu không tồn tại");
    if (showtime.status === "CANCELLED") {
      throw new AppException(ERROR_CODES.SHOWTIME_CANCELLED, "Suất chiếu đã bị huỷ");
    }

    const { data: room, error: roomErr } = await db
      .from("rooms")
      .select("id, name, grid_rows, grid_cols")
      .eq("id", showtime.room_id)
      .single();

    if (roomErr) throw new AppException(ERROR_CODES.INTERNAL_ERROR, roomErr.message);
    return { showtime, room };
  }

  private async fetchPricingMap(showtimeId: string, seats: Array<{ id: string; seat_type: string }>) {
    const db = this.supabase.admin();
    const bookableSeats = seats.filter((s) => ["NORMAL", "VIP", "SWEETBOX"].includes(s.seat_type));
    const sampleSeatIdsByType: Record<string, string> = {};
    for (const s of bookableSeats) {
      if (!sampleSeatIdsByType[s.seat_type]) {
        sampleSeatIdsByType[s.seat_type] = s.id;
      }
    }

    const sampleIds = Object.values(sampleSeatIdsByType);
    const pricingMap: Record<string, number> = {};
    if (sampleIds.length > 0) {
      const { data: quoteData } = await db.rpc("price_quote", {
        p_showtime_id: showtimeId,
        p_seat_ids: sampleIds,
      });
      if (Array.isArray(quoteData)) {
        for (const item of quoteData) {
          pricingMap[item.seat_type] = item.amount;
        }
      }
    }
    return pricingMap;
  }

  private buildSeatItems(
    seats: Array<{ id: string; row_label: string; col_number: number; col_span: number; seat_type: string; label: string | null }>,
    states: Array<{ seat_id: string; state: string; expires_at: string | null }>,
    locks: Array<{ seat_id: string }>,
    pricingMap: Record<string, number>,
  ): SeatMapItem[] {
    const now = new Date();
    const lockedSeatIds = new Set(locks.map((l) => l.seat_id));
    const statesMap = new Map<string, { state: string; expires_at: string | null }>();
    for (const s of states) {
      statesMap.set(s.seat_id, s);
    }

    return seats.map((s) => {
      let state: SeatMapState = "FREE";
      let expiresAt: string | null = null;

      if (s.seat_type === "BROKEN" || lockedSeatIds.has(s.id)) {
        state = "LOCKED";
      } else if (statesMap.has(s.id)) {
        const recorded = statesMap.get(s.id)!;
        if (recorded.state === "SOLD") {
          state = "SOLD";
        } else if (recorded.state === "HELD") {
          if (recorded.expires_at && new Date(recorded.expires_at) > now) {
            state = "HELD";
            expiresAt = recorded.expires_at;
          }
        }
      }

      return {
        id: s.id,
        row: s.row_label,
        col: s.col_number,
        colSpan: s.col_span,
        type: s.seat_type,
        label: s.label || `${s.row_label}${s.col_number}`,
        state,
        expiresAt,
        price: pricingMap[s.seat_type] ?? 0,
      };
    });
  }
}
