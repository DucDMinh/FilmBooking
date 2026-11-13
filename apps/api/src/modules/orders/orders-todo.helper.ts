import type { SupabaseService } from "../../common/supabase/supabase.service";
import type { RawShowtimeRow } from "./orders.types";

export interface UpcomingShowtimeDto {
  id: string;
  cinemaId: string;
  cinemaName: string;
  movieTitle: string;
  roomName: string;
  format: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Phân giải tên rạp và tên phòng cho các suất chiếu sắp diễn ra trong todo.
 */
export async function resolveUpcomingShowtimes(
  supabase: SupabaseService,
  rawShowtimes: RawShowtimeRow[],
): Promise<UpcomingShowtimeDto[]> {
  const cinemaIds = Array.from(new Set(rawShowtimes.map((s) => s.cinema_id).filter(Boolean)));
  const roomIds = Array.from(new Set(rawShowtimes.map((s) => s.room_id).filter(Boolean)));

  const cinemaMap = new Map<string, string>();
  const roomMap = new Map<string, string>();

  if (cinemaIds.length > 0 || roomIds.length > 0) {
    const [cinemasRes, roomsRes] = await Promise.all([
      cinemaIds.length > 0
        ? supabase.admin().from("cinemas").select("id, name").in("id", cinemaIds)
        : Promise.resolve({ data: [] }),
      roomIds.length > 0
        ? supabase.admin().from("rooms").select("id, name").in("id", roomIds)
        : Promise.resolve({ data: [] }),
    ]);

    if (Array.isArray(cinemasRes.data)) {
      for (const c of cinemasRes.data as { id: string; name: string }[]) {
        cinemaMap.set(c.id, c.name);
      }
    }
    if (Array.isArray(roomsRes.data)) {
      for (const r of roomsRes.data as { id: string; name: string }[]) {
        roomMap.set(r.id, r.name);
      }
    }
  }

  return rawShowtimes.map((s) => {
    const movieTitle = Array.isArray(s.movies) ? s.movies[0]?.title_vi : s.movies?.title_vi;
    return {
      id: s.id,
      cinemaId: s.cinema_id,
      cinemaName: cinemaMap.get(s.cinema_id) ?? "",
      movieTitle: movieTitle ?? "",
      roomName: roomMap.get(s.room_id) ?? "",
      format: s.format,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
    };
  });
}
