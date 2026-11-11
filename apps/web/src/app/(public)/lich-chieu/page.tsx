import type { Metadata } from "next";
import Link from "next/link";
import { Film, MapPin } from "lucide-react";
import type { CinemaDto, MovieDto, ProvinceDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { apiFetch } from "@/lib/api/client";
import { BookingStepper } from "@/components/booking/booking-stepper";
import { ShowtimeSchedule, getVnDateString } from "@/components/catalog/showtime-schedule";
import { EmptyState } from "@/components/common/states";

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
    cinema: { code: string; name: string };
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

export default async function LichChieuPage({ searchParams }: PageProps) {
  const { date, province, movie: selectedMovieSlug, cinema: selectedCinemaCode } = await searchParams;
  const activeDate = date ?? getVnDateString(new Date());

  // Tải danh mục tỉnh/thành, phim và rạp song song
  const [provincesRes, moviesRes, cinemasRes] = await Promise.allSettled([
    apiFetch<ProvinceDto[]>("/provinces"),
    apiFetch<MovieDto[]>("/movies?status=now_showing"),
    apiFetch<CinemaDto[]>(province ? `/cinemas?province=${province}` : "/cinemas"),
  ]);

  const provinces = provincesRes.status === "fulfilled" ? provincesRes.value : [];
  const movies = moviesRes.status === "fulfilled" ? moviesRes.value : [];
  const cinemas = cinemasRes.status === "fulfilled" ? cinemasRes.value : [];

  // Trường hợp 1: Người dùng đã chọn 1 phim cụ thể (hoặc mặc định phim đầu tiên)
  let movieDetailData: MovieScheduleDto | null = null;
  const targetMovieSlug = selectedMovieSlug ?? (movies.length > 0 && !selectedCinemaCode ? movies[0]?.slug : undefined);

  if (targetMovieSlug) {
    try {
      const q = new URLSearchParams();
      if (activeDate) q.set("date", activeDate);
      if (province) q.set("province", province);
      movieDetailData = await apiFetch<MovieScheduleDto>(`/movies/${targetMovieSlug}?${q.toString()}`);
    } catch {
      movieDetailData = null;
    }
  }

  // Trường hợp 2: Người dùng chọn tra cứu theo rạp
  let cinemaDetailData: CinemaDetailDto | null = null;
  if (selectedCinemaCode) {
    try {
      const q = new URLSearchParams();
      if (activeDate) q.set("date", activeDate);
      cinemaDetailData = await apiFetch<CinemaDetailDto>(`/cinemas/${selectedCinemaCode}?${q.toString()}`);
    } catch {
      cinemaDetailData = null;
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      {/* Tiêu đề trang */}
      <div>
        <h1 className="text-h1 font-bold tracking-tight text-fg">Lịch chiếu phim</h1>
        <p className="mt-1 text-body-sm text-fg-secondary">
          Tra cứu suất chiếu theo phim hoặc cụm rạp trên toàn hệ thống CINEMO
        </p>
      </div>

      {/* Stepper đặt vé: Bước 1 */}
      <BookingStepper currentStep={1} />

      {/* Thanh bộ lọc */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border-subtle bg-surface p-4 sm:grid-cols-2 md:grid-cols-3">
        {/* Bộ lọc Tỉnh/Thành */}
        <div className="space-y-1.5">
          <label htmlFor="filter-province" className="text-caption font-semibold uppercase tracking-wider text-fg-muted">
            Khu vực
          </label>
          <div className="relative">
            <select
              id="filter-province"
              defaultValue={province ?? ""}
              className="w-full rounded-sm border border-border-input bg-surface-input px-3 py-2 text-body-sm text-fg focus-visible:outline-2 focus-visible:outline-brand"
            >
              <option value="">Tất cả tỉnh/thành</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bộ lọc Phim */}
        <div className="space-y-1.5">
          <label htmlFor="filter-movie" className="text-caption font-semibold uppercase tracking-wider text-fg-muted">
            Chọn phim
          </label>
          <select
            id="filter-movie"
            defaultValue={selectedMovieSlug ?? ""}
            className="w-full rounded-sm border border-border-input bg-surface-input px-3 py-2 text-body-sm text-fg focus-visible:outline-2 focus-visible:outline-brand"
          >
            <option value="">-- Tất cả phim đang chiếu --</option>
            {movies.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.titleVi} ({m.ageRating})
              </option>
            ))}
          </select>
        </div>

        {/* Bộ lọc Rạp */}
        <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
          <label htmlFor="filter-cinema" className="text-caption font-semibold uppercase tracking-wider text-fg-muted">
            Chọn rạp
          </label>
          <select
            id="filter-cinema"
            defaultValue={selectedCinemaCode ?? ""}
            className="w-full rounded-sm border border-border-input bg-surface-input px-3 py-2 text-body-sm text-fg focus-visible:outline-2 focus-visible:outline-brand"
          >
            <option value="">-- Tất cả rạp --</option>
            {cinemas.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hiển thị kết quả suất chiếu */}
      {selectedCinemaCode && cinemaDetailData ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <MapPin className="size-5 text-brand" aria-hidden="true" />
            <h2 className="text-h2 font-bold text-fg">{cinemaDetailData.cinema.name}</h2>
          </div>

          {/* Gom các showtime theo phim để hiển thị */}
          {cinemaDetailData.showtimes.length === 0 ? (
            <EmptyState
              title="Không có suất chiếu"
              description={`Rạp ${cinemaDetailData.cinema.name} hiện chưa có suất chiếu trong ngày đã chọn.`}
            />
          ) : (
            <div className="space-y-6">
              {Array.from(
                cinemaDetailData.showtimes
                  .reduce((map, st) => {
                    const list = map.get(st.movie.slug) ?? {
                      movie: st.movie,
                      showtimes: [] as ShowtimeDto[],
                    };
                    list.showtimes.push(st);
                    map.set(st.movie.slug, list);
                    return map;
                  }, new Map<string, { movie: typeof cinemaDetailData.showtimes[0]["movie"]; showtimes: ShowtimeDto[] }>())
                  .values(),
              ).map(({ movie, showtimes }) => (
                <div key={movie.slug} className="rounded-lg border border-border-subtle bg-surface p-4 sm:p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-caption font-bold text-brand">
                      {movie.ageRating}
                    </span>
                    <Link href={`/phim/${movie.slug}`} className="text-h3 font-bold text-fg hover:text-brand">
                      {movie.titleVi}
                    </Link>
                    <span className="text-caption text-fg-muted">{movie.durationMinutes} phút</span>
                  </div>
                  <ShowtimeSchedule
                    schedule={[
                      {
                        cinema: cinemaDetailData.cinema,
                        showtimes,
                      },
                    ]}
                    selectedDate={activeDate}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : movieDetailData ? (
        <div className="space-y-6">
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <span className="rounded-pill bg-brand-soft px-2.5 py-0.5 text-caption font-bold text-brand">
                {movieDetailData.movie.ageRating}
              </span>
              <h2 className="text-h2 font-bold text-fg">{movieDetailData.movie.titleVi}</h2>
            </div>
            <Link
              href={`/phim/${movieDetailData.movie.slug}`}
              className="text-body-sm font-semibold text-link hover:underline"
            >
              Chi tiết phim →
            </Link>
          </div>

          <ShowtimeSchedule
            movie={movieDetailData.movie}
            schedule={movieDetailData.schedule}
            selectedDate={activeDate}
          />
        </div>
      ) : (
        <EmptyState
          title="Chưa có lịch chiếu"
          description="Hiện tại chưa có suất chiếu phù hợp với tiêu chí tìm kiếm của bạn. Vui lòng chọn phim hoặc cụm rạp khác."
          icon={Film}
        />
      )}
    </div>
  );
}
