import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  CINEMA_ADMIN_ONLY_FIELDS,
  type CinemaDbStatus,
  type CinemaDto,
  type CreateCinemaInput,
  type ProvinceDto,
  type ShowtimeDto,
  type UpdateCinemaInput,
} from "@filmbooking/shared/schemas/catalog";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { ENV, type Env } from "../../config/env";
import { asRows, showtimeToDto, unwrap, vnDayRange, type ShowtimeRow } from "./movies.service";

const CINEMA_COLUMNS =
  "id, code, name, district, address, latitude, longitude, hotline, email, opening_hours, image_url, amenities, status, provinces!inner(code)";
const ROOM_COLUMNS = "id, name, supported_formats, status";
const SHOWTIME_COLUMNS = "id, room_id, starts_at, ends_at, format, language_mode, status";
/** Đóng rạp (tạm/vĩnh viễn) phải chờ hết suất tương lai. */
const CLOSING_STATUSES: readonly CinemaDbStatus[] = ["TEMP_CLOSED", "CLOSED"];

interface CinemaRow {
  id: string;
  code: string;
  name: string;
  district: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hotline: string | null;
  email: string | null;
  opening_hours: string | null;
  image_url: string | null;
  amenities: string[];
  status: CinemaDbStatus;
  provinces: { code: string } | null;
}

interface RoomRow {
  id: string;
  name: string;
  supported_formats: string[];
  status: string;
}

interface ShowtimeWithMovie extends ShowtimeRow {
  movies: { slug: string; title_vi: string; age_rating: string; poster_url: string | null; duration_minutes: number };
}

export interface CinemaDetailDto {
  cinema: CinemaDto;
  rooms: { id: string; name: string; supportedFormats: string[]; status: string }[];
  showtimes: (ShowtimeDto & {
    movie: { slug: string; titleVi: string; ageRating: string; posterUrl: string | null; durationMinutes: number };
  })[];
}

function cinemaToDto(row: CinemaRow): CinemaDto {
  return {
    code: row.code,
    name: row.name,
    provinceCode: row.provinces?.code ?? null,
    district: row.district,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    hotline: row.hotline,
    email: row.email,
    openingHours: row.opening_hours,
    imageUrl: row.image_url,
    amenities: row.amenities,
    status: row.status,
  };
}

function cinemaToColumns(input: CreateCinemaInput | UpdateCinemaInput): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    code: input.code,
    name: input.name,
    district: input.district,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    hotline: input.hotline,
    email: input.email,
    opening_hours: input.openingHours,
    image_url: input.imageUrl,
    amenities: input.amenities,
    status: input.status,
    cleaning_minutes: input.cleaningMinutes,
    online_cutoff_minutes: input.onlineCutoffMinutes,
  };
  return Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
}

@Injectable()
export class CinemasService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Khách ẩn danh: anon key, RLS quyết định hiển thị. */
  private publicClient(): SupabaseClient {
    return this.supabase.forUser(this.env.SUPABASE_ANON_KEY);
  }

  async listProvinces(): Promise<ProvinceDto[]> {
    const rows = (unwrap(
      await this.publicClient().from("provinces").select("code, name").order("sort_order").order("name"),
    ) ?? []) as ProvinceDto[];
    return rows.map((row) => ({ code: row.code, name: row.name }));
  }

  /** R-33: khách chỉ thấy rạp OPEN — lọc ở API kể cả khi RLS đã lọc. */
  async listPublic(province: string | undefined): Promise<CinemaDto[]> {
    let query = this.publicClient().from("cinemas").select(CINEMA_COLUMNS).eq("status", "OPEN");
    if (province) query = query.eq("provinces.code", province);
    const rows = asRows<CinemaRow>(unwrap(await query.order("name")));
    return rows.map(cinemaToDto);
  }

  async detailPublic(code: string, date: string | undefined, now = new Date()): Promise<CinemaDetailDto> {
    const db = this.publicClient();
    const cinema = unwrap(
      await db.from("cinemas").select(CINEMA_COLUMNS).eq("code", code).eq("status", "OPEN").maybeSingle(),
    ) as CinemaRow | null;
    if (!cinema) throw new AppException(ERROR_CODES.NOT_FOUND, "Cinema not found");

    const { from, to } = vnDayRange(date, now);
    const [rooms, showtimes] = await Promise.all([
      db.from("rooms").select(ROOM_COLUMNS).eq("cinema_id", cinema.id).order("name"),
      db
        .from("showtimes")
        .select(`${SHOWTIME_COLUMNS}, movies!inner(slug, title_vi, age_rating, poster_url, duration_minutes)`)
        .eq("cinema_id", cinema.id)
        .neq("status", "CANCELLED")
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at", { ascending: true }),
    ]);
    return {
      cinema: cinemaToDto(cinema),
      rooms: ((unwrap(rooms) ?? []) as RoomRow[]).map((room) => ({
        id: room.id,
        name: room.name,
        supportedFormats: room.supported_formats,
        status: room.status,
      })),
      showtimes: asRows<ShowtimeWithMovie>(unwrap(showtimes)).map((row) => ({
        ...showtimeToDto(row),
        movie: {
          slug: row.movies.slug,
          titleVi: row.movies.title_vi,
          ageRating: row.movies.age_rating,
          posterUrl: row.movies.poster_url,
          durationMinutes: row.movies.duration_minutes,
        },
      })),
    };
  }

  // ── Quản lý — dùng JWT của user, RLS vẫn áp dụng ───────────────

  async create(jwt: string, input: CreateCinemaInput): Promise<CinemaDto> {
    const db = this.supabase.forUser(jwt);
    const provinceId = await this.resolveProvinceId(db, input.provinceCode);
    const row = unwrap(
      await db
        .from("cinemas")
        .insert({ ...cinemaToColumns(input), province_id: provinceId })
        .select(CINEMA_COLUMNS)
        .single(),
    ) as CinemaRow;
    return cinemaToDto(row);
  }

  /**
   * Manager chỉ sửa thông tin rạp mình (CinemaScopeGuard đã chặn rạp khác); mã, tỉnh, trạng thái và
   * cấu hình vận hành chỉ Admin. Đóng rạp bị chặn khi còn suất tương lai (huỷ hàng loạt ở luồng riêng).
   */
  async update(jwt: string, id: string, input: UpdateCinemaInput, isAdmin: boolean): Promise<CinemaDto> {
    if (!isAdmin && CINEMA_ADMIN_ONLY_FIELDS.some((field) => input[field] !== undefined)) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Only an admin can change these fields");
    }
    const db = this.supabase.forUser(jwt);
    if (input.status && CLOSING_STATUSES.includes(input.status)) await this.assertNoFutureShowtimes(db, id);

    const changes: Record<string, unknown> = cinemaToColumns(input);
    if (input.provinceCode) changes.province_id = await this.resolveProvinceId(db, input.provinceCode);
    const row = unwrap(
      await db.from("cinemas").update(changes).eq("id", id).select(CINEMA_COLUMNS).maybeSingle(),
    ) as CinemaRow | null;
    if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Cinema not found");
    return cinemaToDto(row);
  }

  private async assertNoFutureShowtimes(db: SupabaseClient, cinemaId: string): Promise<void> {
    const { count, error } = await db
      .from("showtimes")
      .select("id", { count: "exact", head: true })
      .eq("cinema_id", cinemaId)
      .neq("status", "CANCELLED")
      .gte("starts_at", new Date().toISOString());
    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, "Database error");
    if ((count ?? 0) > 0) {
      throw new AppException(ERROR_CODES.CONFLICT, "Cinema still has upcoming showtimes", {
        upcomingShowtimes: count,
      });
    }
  }

  private async resolveProvinceId(db: SupabaseClient, provinceCode: string): Promise<string> {
    const province = unwrap(
      await db.from("provinces").select("id").eq("code", provinceCode).maybeSingle(),
    ) as { id: string } | null;
    if (!province) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Unknown province", { provinceCode });
    }
    return province.id;
  }
}
