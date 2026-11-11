import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ERROR_CODES, toVnParts, vnLocalToUtc } from "@filmbooking/shared";
import type {
  CreateMovieInput,
  MovieAvailability,
  MovieDto,
  ShowtimeDto,
  UpdateMovieInput,
} from "@filmbooking/shared/schemas/catalog";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { ENV, type Env } from "../../config/env";

const MOVIE_COLUMNS =
  "id, slug, title_vi, title_original, poster_url, banner_url, trailer_url, description, genres, duration_minutes, director, cast_members, country, original_language, subtitle_languages, dubbed_languages, release_date, age_rating, status";
const SHOWTIME_COLUMNS = "id, room_id, starts_at, ends_at, format, language_mode, status";
const LIST_LIMIT = 200;
const BANNER_LIMIT = 5;
const MS_PER_DAY = 86_400_000;

export interface MovieRow {
  id: string;
  slug: string;
  title_vi: string;
  title_original: string | null;
  poster_url: string | null;
  banner_url: string | null;
  trailer_url: string | null;
  description: string | null;
  genres: string[];
  duration_minutes: number;
  director: string | null;
  cast_members: string[];
  country: string | null;
  original_language: string | null;
  subtitle_languages: string[];
  dubbed_languages: string[];
  release_date: string;
  age_rating: MovieDto["ageRating"];
  status: string;
}

export interface ShowtimeRow {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  format: string;
  language_mode: string;
  status: string;
}

interface DbResult<T> {
  data: T | null;
  error: { code?: string; message: string } | null;
}

/** Postgres/PostgREST error -> mã lỗi catalog. Không lộ message DB cho client. */
export function unwrap<T>(result: DbResult<T>): T | null {
  const { data, error } = result;
  if (!error) return data;
  if (error.code === "23505" || error.code === "23503") {
    throw new AppException(ERROR_CODES.CONFLICT, "Resource conflicts with existing data");
  }
  if (error.code === "42501") throw new AppException(ERROR_CODES.FORBIDDEN, "Insufficient permission");
  if (error.code === "23514" || error.code === "22P02") {
    throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Invalid data");
  }
  throw new AppException(ERROR_CODES.INTERNAL_ERROR, "Database error");
}

/** supabase-js suy kiểu embed thành mảng khi không có schema sinh sẵn; ép về hình dạng thật của hàng (1-1). */
export function asRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export const toIso = (value: string): string => new Date(value).toISOString();

/** Ngày lịch VN hiện tại, dạng YYYY-MM-DD. */
export function vnToday(now: Date): string {
  const { year, month, day } = toVnParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** [00:00, 24:00) giờ VN của `date` (mặc định hôm nay) dưới dạng UTC ISO. */
export function vnDayRange(date: string | undefined, now: Date): { from: string; to: string } {
  const start = vnLocalToUtc(date ?? vnToday(now), "00:00");
  return { from: start.toISOString(), to: new Date(start.getTime() + MS_PER_DAY).toISOString() };
}

export function showtimeToDto(row: ShowtimeRow): ShowtimeDto {
  return {
    id: row.id,
    roomId: row.room_id,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    format: row.format,
    languageMode: row.language_mode,
    status: row.status,
  };
}

/**
 * Quyết định #13: có suất tại khu vực -> Đang chiếu; chưa có suất mà ngày khởi chiếu còn ở tương lai -> Sắp chiếu;
 * còn lại (đã khởi chiếu nhưng không còn suất) -> null.
 */
export function classifyMovie(
  releaseDate: string,
  hasShowtimeInRegion: boolean,
  today: string,
): MovieAvailability | null {
  if (hasShowtimeInRegion) return "now_showing";
  return releaseDate > today ? "coming_soon" : null;
}

export function movieToDto(row: MovieRow, availability: MovieAvailability | null): MovieDto {
  return {
    id: row.id,
    slug: row.slug,
    titleVi: row.title_vi,
    titleOriginal: row.title_original,
    posterUrl: row.poster_url,
    bannerUrl: row.banner_url,
    trailerUrl: row.trailer_url,
    description: row.description,
    genres: row.genres,
    durationMinutes: row.duration_minutes,
    director: row.director,
    cast: row.cast_members,
    country: row.country,
    originalLanguage: row.original_language,
    subtitleLanguages: row.subtitle_languages,
    dubbedLanguages: row.dubbed_languages,
    releaseDate: row.release_date,
    ageRating: row.age_rating,
    availability,
  };
}

/** Bỏ ký tự có nghĩa trong cú pháp `or()`/`ilike` của PostgREST để từ khoá không chèn được filter. */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%*_\\"'.:]/g, " ").replace(/\s+/g, " ").trim();
}

function movieToColumns(input: CreateMovieInput | UpdateMovieInput): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    slug: input.slug,
    title_vi: input.titleVi,
    title_original: input.titleOriginal,
    poster_url: input.posterUrl,
    banner_url: input.bannerUrl,
    trailer_url: input.trailerUrl,
    description: input.description,
    genres: input.genres,
    duration_minutes: input.durationMinutes,
    director: input.director,
    cast_members: input.cast,
    country: input.country,
    original_language: input.originalLanguage,
    subtitle_languages: input.subtitleLanguages,
    dubbed_languages: input.dubbedLanguages,
    release_date: input.releaseDate,
    age_rating: input.ageRating,
    status: input.status,
  };
  // PATCH: chỉ gửi trường client thật sự truyền (undefined bị bỏ).
  return Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
}

export interface MovieFilters {
  q?: string;
  genre?: string;
  age?: MovieDto["ageRating"];
  status?: MovieAvailability;
  province?: string;
}

export interface HomeDto {
  banners: { slug: string; titleVi: string; bannerUrl: string }[];
  nowShowing: MovieDto[];
  comingSoon: MovieDto[];
}

export interface MovieScheduleDto {
  movie: MovieDto;
  schedule: {
    cinema: { code: string; name: string };
    showtimes: ShowtimeDto[];
  }[];
}

interface ScheduleRow extends ShowtimeRow {
  cinemas: { code: string; name: string };
}

@Injectable()
export class MoviesService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Khách ẩn danh: anon key, RLS quyết định hiển thị (R-33). */
  private publicClient(): SupabaseClient {
    return this.supabase.forUser(this.env.SUPABASE_ANON_KEY);
  }

  async home(province: string | undefined, now = new Date()): Promise<HomeDto> {
    const db = this.publicClient();
    const today = vnToday(now);
    const [movies, showingIds] = await Promise.all([
      this.fetchPublished(db),
      this.showingMovieIds(db, province, now),
    ]);
    const classified = movies.map((row) => ({
      row,
      availability: classifyMovie(row.release_date, showingIds.has(row.id), today),
    }));
    const nowShowing = classified.filter((item) => item.availability === "now_showing");
    const comingSoon = classified.filter((item) => item.availability === "coming_soon");
    const banners = nowShowing.flatMap(({ row }) =>
      row.banner_url ? [{ slug: row.slug, titleVi: row.title_vi, bannerUrl: row.banner_url }] : [],
    );
    return {
      banners: banners.slice(0, BANNER_LIMIT),
      nowShowing: nowShowing.map((item) => movieToDto(item.row, item.availability)),
      comingSoon: comingSoon.map((item) => movieToDto(item.row, item.availability)),
    };
  }

  async list(filters: MovieFilters, now = new Date()): Promise<MovieDto[]> {
    const db = this.publicClient();
    const [movies, showingIds] = await Promise.all([
      this.fetchPublished(db, filters),
      this.showingMovieIds(db, filters.province, now),
    ]);
    const today = vnToday(now);
    return movies
      .map((row) => movieToDto(row, classifyMovie(row.release_date, showingIds.has(row.id), today)))
      .filter((movie) => !filters.status || movie.availability === filters.status);
  }

  async detail(
    slug: string,
    options: { date?: string; province?: string },
    now = new Date(),
  ): Promise<MovieScheduleDto> {
    const db = this.publicClient();
    const row = unwrap(
      await db.from("movies").select(MOVIE_COLUMNS).eq("slug", slug).eq("status", "PUBLISHED").maybeSingle(),
    ) as MovieRow | null;
    if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Movie not found");

    const { from, to } = vnDayRange(options.date, now);
    let schedule = db
      .from("showtimes")
      .select(`${SHOWTIME_COLUMNS}, cinemas!inner(code, name, status, provinces!inner(code))`)
      .eq("movie_id", row.id)
      .neq("status", "CANCELLED")
      .eq("cinemas.status", "OPEN")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at", { ascending: true });
    if (options.province) schedule = schedule.eq("cinemas.provinces.code", options.province);
    const showtimes = asRows<ScheduleRow>(unwrap(await schedule));

    const showingIds = await this.showingMovieIds(db, options.province, now);
    const availability = classifyMovie(row.release_date, showingIds.has(row.id), vnToday(now));
    return { movie: movieToDto(row, availability), schedule: groupByCinema(showtimes) };
  }

  // ── Quản lý (Admin) — dùng JWT của user, RLS vẫn áp dụng ─────────

  async create(jwt: string, input: CreateMovieInput): Promise<MovieDto> {
    const db = this.supabase.forUser(jwt);
    const row = unwrap(
      await db.from("movies").insert(movieToColumns(input)).select(MOVIE_COLUMNS).single(),
    ) as MovieRow;
    return movieToDto(row, null);
  }

  async update(jwt: string, id: string, input: UpdateMovieInput): Promise<MovieDto> {
    const db = this.supabase.forUser(jwt);
    const row = unwrap(
      await db.from("movies").update(movieToColumns(input)).eq("id", id).select(MOVIE_COLUMNS).maybeSingle(),
    ) as MovieRow | null;
    if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Movie not found");
    return movieToDto(row, null);
  }

  /** Xoá cứng; phim đã có suất bị FK chặn -> CONFLICT (hãy chuyển sang ARCHIVED). */
  async remove(jwt: string, id: string): Promise<void> {
    const db = this.supabase.forUser(jwt);
    const row = unwrap(await db.from("movies").delete().eq("id", id).select("id").maybeSingle());
    if (!row) throw new AppException(ERROR_CODES.NOT_FOUND, "Movie not found");
  }

  /** Nhân sự đọc được cả phim nháp (RLS), nên danh sách này gồm mọi trạng thái. */
  async listAll(jwt: string): Promise<(MovieDto & { status: string })[]> {
    const db = this.supabase.forUser(jwt);
    const rows = (unwrap(
      await db.from("movies").select(MOVIE_COLUMNS).order("release_date", { ascending: false }).limit(LIST_LIMIT),
    ) ?? []) as MovieRow[];
    return rows.map((row) => ({ ...movieToDto(row, null), status: row.status }));
  }

  private async fetchPublished(db: SupabaseClient, filters: MovieFilters = {}): Promise<MovieRow[]> {
    let query = db
      .from("movies")
      .select(MOVIE_COLUMNS)
      .eq("status", "PUBLISHED")
      .order("release_date", { ascending: false })
      .limit(LIST_LIMIT);
    const term = filters.q ? sanitizeSearchTerm(filters.q) : "";
    if (term) query = query.or(`title_vi.ilike.%${term}%,title_original.ilike.%${term}%`);
    if (filters.genre) query = query.contains("genres", [filters.genre]);
    if (filters.age) query = query.eq("age_rating", filters.age);
    return (unwrap(await query) ?? []) as MovieRow[];
  }

  /** Phim có ít nhất một suất còn bán/chưa chiếu xong tại rạp OPEN của khu vực. */
  private async showingMovieIds(db: SupabaseClient, province: string | undefined, now: Date): Promise<Set<string>> {
    let query = db
      .from("showtimes")
      .select("movie_id, cinemas!inner(status, provinces!inner(code))")
      .neq("status", "CANCELLED")
      .gte("ends_at", now.toISOString())
      .eq("cinemas.status", "OPEN");
    if (province) query = query.eq("cinemas.provinces.code", province);
    const rows = (unwrap(await query) ?? []) as { movie_id: string }[];
    return new Set(rows.map((row) => row.movie_id));
  }
}

function groupByCinema(rows: ScheduleRow[]): MovieScheduleDto["schedule"] {
  const byCinema = new Map<string, MovieScheduleDto["schedule"][number]>();
  for (const row of rows) {
    const entry = byCinema.get(row.cinemas.code) ?? {
      cinema: { code: row.cinemas.code, name: row.cinemas.name },
      showtimes: [],
    };
    entry.showtimes.push(showtimeToDto(row));
    byCinema.set(row.cinemas.code, entry);
  }
  return [...byCinema.values()];
}
