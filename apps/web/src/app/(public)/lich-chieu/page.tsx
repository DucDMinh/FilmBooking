import type { Metadata } from "next";
import Link from "next/link";
import { Film, MapPin } from "lucide-react";
import {
  codeParamSchema,
  listCinemasQuerySchema,
  slugParamSchema,
  type CinemaDto,
  type MovieDto,
  type ProvinceDto,
  type ShowtimeDto,
} from "@filmbooking/shared/schemas/catalog";
import { apiFetch } from "@/lib/api/client";
import { BookingStepper } from "@/components/booking/booking-stepper";
import { ScheduleDateNav, ScheduleFilters } from "@/components/catalog/schedule-filters";
import { SectionHeading } from "@/components/catalog/section-heading";
import { ShowtimeSchedule } from "@/components/catalog/showtime-schedule";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { getVnDateString, resolveScheduleDate } from "@/lib/vn-date";

export const metadata: Metadata = {
  title: "Lịch chiếu phim | CINEMO",
  description: "Tra cứu lịch chiếu phim mới nhất tại các cụm rạp CINEMO trên toàn quốc. Đặt vé xem phim tiện lợi và nhanh chóng.",
};

interface PageProps {
  searchParams: Promise<{
    date?: string;
    province?: string;
    movie?: string;
    cinema?: string;
  }>;
}

interface MovieScheduleDto {
  movie: MovieDto;
  schedule: Array<{
    cinema: { code: string; name: string; effectiveOnlineCutoffMinutes?: number };
    showtimes: ShowtimeDto[];
  }>;
}

interface CinemaDetailDto {
  cinema: CinemaDto;
  showtimes: Array<
    ShowtimeDto & {
      movie: {
        slug: string;
        titleVi: string;
        ageRating: string;
        posterUrl: string | null;
        durationMinutes: number;
      };
    }
  >;
}

/** Phim có ít nhất một suất chưa huỷ trong ngày đã chọn (giờ VN). */
function hasShowtimeOnDate(schedule: MovieScheduleDto["schedule"], date: string): boolean {
  return schedule.some((group) =>
    group.showtimes.some((st) => st.status !== "CANCELLED" && getVnDateString(new Date(st.startsAt)) === date),
  );
}

/** Tham số URL không hợp lệ (rác, `.`, `..`, lặp tham số) coi như chưa chọn - tránh dot-segment trỏ nhầm route danh sách. */
function parseParam(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): string | undefined {
  return typeof value === "string" && schema.safeParse(value).success ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lấy danh sách từ kết quả allSettled; lỗi hoặc sai dạng (không phải mảng) thì coi là rỗng. */
function settledList<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
}

async function fetchMovieSchedule(slug: string, date: string, province?: string): Promise<MovieScheduleDto> {
  const q = new URLSearchParams({ date });
  if (province) q.set("province", province);
  const data = await apiFetch<unknown>(`/movies/${encodeURIComponent(slug)}?${q.toString()}`);
  // Phòng thủ: API trả sai dạng (vd danh sách thay vì chi tiết) thì bỏ khối này, không làm sập trang
  if (!isRecord(data) || !isRecord(data.movie) || !Array.isArray(data.schedule)) {
    throw new Error("Phản hồi lịch chiếu phim không hợp lệ");
  }
  return data as unknown as MovieScheduleDto;
}

async function fetchCinemaDetail(code: string, date: string): Promise<CinemaDetailDto | null> {
  try {
    const data = await apiFetch<unknown>(`/cinemas/${encodeURIComponent(code)}?${new URLSearchParams({ date }).toString()}`);
    if (!isRecord(data) || !isRecord(data.cinema) || !Array.isArray(data.showtimes)) return null;
    return data as unknown as CinemaDetailDto;
  } catch {
    return null;
  }
}

function NoSchedule() {
  return (
    <EmptyState
      title="Chưa có lịch chiếu"
      description="Hiện tại chưa có suất chiếu phù hợp với tiêu chí tìm kiếm của bạn. Vui lòng chọn ngày, phim hoặc cụm rạp khác."
      icon={Film}
    />
  );
}

function CinemaResults({
  detail,
  date,
  movieSlug,
}: Readonly<{ detail: CinemaDetailDto; date: string; movieSlug?: string }>) {
  const showtimes = movieSlug ? detail.showtimes.filter((st) => st.movie.slug === movieSlug) : detail.showtimes;
  const byMovie = new Map<string, { movie: CinemaDetailDto["showtimes"][number]["movie"]; showtimes: ShowtimeDto[] }>();
  for (const st of showtimes) {
    const entry = byMovie.get(st.movie.slug) ?? { movie: st.movie, showtimes: [] };
    entry.showtimes.push(st);
    byMovie.set(st.movie.slug, entry);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <MapPin className="size-5 text-brand" aria-hidden="true" />
        <h2 className="font-heading text-h2 font-bold uppercase text-fg">{detail.cinema.name}</h2>
      </div>

      {byMovie.size === 0 ? (
        <EmptyState
          title="Không có suất chiếu"
          description={`Rạp ${detail.cinema.name} hiện chưa có suất chiếu trong ngày đã chọn.`}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(byMovie.values()).map(({ movie, showtimes: movieShowtimes }, movieIndex) => (
            <div key={movie.slug} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="brand">
                  {movie.ageRating}
                </Badge>
                <Link href={`/phim/${movie.slug}`} className="font-heading text-h3 font-bold uppercase text-fg hover:text-brand">
                  {movie.titleVi}
                </Link>
                <span className="text-caption text-fg-muted">{movie.durationMinutes} phút</span>
              </div>
              <ShowtimeSchedule
                schedule={[{ cinema: detail.cinema, showtimes: movieShowtimes }]}
                selectedDate={date}
                hideDateStrip
                // Chỉ phim đầu tiên là hàng đầu của kết quả (NFR-19, AC-35); các phim sau vẫn hiện dần theo cuộn.
                first={movieIndex === 0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MovieBlock({ data, date, first }: Readonly<{ data: MovieScheduleDto; date: string; first: boolean }>) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <Badge tone="brand">
            {data.movie.ageRating}
          </Badge>
          <h2 className="font-heading text-h2 font-bold uppercase text-fg">{data.movie.titleVi}</h2>
        </div>
        <Link href={`/phim/${data.movie.slug}`} className="text-body-sm font-semibold text-link hover:underline">
          Chi tiết phim
        </Link>
      </div>
      <ShowtimeSchedule movie={data.movie} schedule={data.schedule} selectedDate={date} hideDateStrip first={first} />
    </section>
  );
}

async function loadMovieBlocks(
  movies: MovieDto[],
  selectedMovieSlug: string | undefined,
  date: string,
  province: string | undefined,
): Promise<MovieScheduleDto[]> {
  const slugs = selectedMovieSlug ? [selectedMovieSlug] : movies.map((m) => m.slug);
  const settled = await Promise.allSettled(slugs.map((slug) => fetchMovieSchedule(slug, date, province)));
  const loaded = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  // Chọn 1 phim: luôn hiện khối phim (kể cả rỗng, để thấy thông báo "không có suất"); tất cả phim: bỏ phim không có suất
  return selectedMovieSlug ? loaded : loaded.filter((d) => hasShowtimeOnDate(d.schedule, date));
}

function MovieResults({ blocks, date }: Readonly<{ blocks: MovieScheduleDto[]; date: string }>) {
  if (blocks.length === 0) return <NoSchedule />;

  return (
    <div className="space-y-6">
      {blocks.map((data, index) => (
        <MovieBlock key={data.movie.slug} data={data} date={date} first={index === 0} />
      ))}
    </div>
  );
}

export default async function LichChieuPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const province = parseParam(listCinemasQuerySchema.shape.province, params.province);
  const selectedMovieSlug = parseParam(slugParamSchema, params.movie);
  const selectedCinemaCode = parseParam(codeParamSchema, params.cinema);
  const activeDate = resolveScheduleDate(typeof params.date === "string" ? params.date : undefined);

  const cinemaQuery = province ? `/cinemas?${new URLSearchParams({ province }).toString()}` : "/cinemas";
  // Tải danh mục tỉnh/thành, phim và rạp song song
  const [provincesRes, moviesRes, cinemasRes] = await Promise.allSettled([
    apiFetch<ProvinceDto[]>("/provinces"),
    apiFetch<MovieDto[]>("/movies?status=now_showing"),
    apiFetch<CinemaDto[]>(cinemaQuery),
  ]);

  const provinces = settledList(provincesRes);
  const movies = settledList(moviesRes);
  const cinemas = settledList(cinemasRes);

  const cinemaDetail = selectedCinemaCode ? await fetchCinemaDetail(selectedCinemaCode, activeDate) : null;
  const movieBlocks = selectedCinemaCode
    ? []
    : await loadMovieBlocks(movies, selectedMovieSlug, activeDate, province);
  const values = {
    province: province ?? "",
    movie: selectedMovieSlug ?? "",
    cinema: selectedCinemaCode ?? "",
    date: activeDate,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <SectionHeading
        first
        level="h1"
        title="Lịch chiếu phim"
        description="Tra cứu suất chiếu theo phim hoặc cụm rạp trên toàn hệ thống CINEMO"
      />

      <BookingStepper currentStep={1} />

      <ScheduleFilters provinces={provinces} movies={movies} cinemas={cinemas} values={values} />

      {/* Dải 7 ngày dùng chung: hiện một lần, các khối phim bên dưới không lặp lại */}
      <ScheduleDateNav values={values} />

      {selectedCinemaCode ? (
        cinemaDetail ? (
          <CinemaResults detail={cinemaDetail} date={activeDate} movieSlug={selectedMovieSlug} />
        ) : (
          <NoSchedule />
        )
      ) : (
        <MovieResults blocks={movieBlocks} date={activeDate} />
      )}
    </div>
  );
}
