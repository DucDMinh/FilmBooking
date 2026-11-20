import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, Film, Globe, Play, User } from "lucide-react";
import type { MovieDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { apiFetch, ApiError } from "@/lib/api/client";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { buildMovieJsonLd, serializeJsonLd } from "@/lib/seo/movie-jsonld";
import { BookingStepper } from "@/components/booking/booking-stepper";
import { MovieShowtimeSchedule } from "@/components/catalog/movie-showtime-schedule";
import { SectionHeading } from "@/components/catalog/section-heading";
import { AgeBadge } from "@/components/common/age-badge";
import { Scrub } from "@/components/motion/scrub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveScheduleDate } from "@/lib/vn-date";

interface MovieScheduleDto {
  movie: MovieDto;
  schedule: Array<{
    cinema: { code: string; name: string; effectiveOnlineCutoffMinutes?: number };
    showtimes: ShowtimeDto[];
  }>;
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string | string[]; province?: string }>;
}

async function fetchMovieData(slug: string, date?: string, province?: string): Promise<MovieScheduleDto | null> {
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  if (province) query.set("province", province);
  const qs = query.toString() ? `?${query.toString()}` : "";

  try {
    return await apiFetch<MovieScheduleDto>(`/movies/${slug}${qs}`, PUBLIC_CACHE);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
      return null;
    }
    // Trả về null khi không kết nối được hoặc lỗi máy chủ để SSR graceful
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchMovieData(slug);

  if (!data?.movie) {
    return {
      title: "Thông tin phim | CINEMO",
      description: "Xem thông tin chi tiết phim và lịch chiếu tại chuỗi rạp CINEMO.",
    };
  }

  const { movie } = data;
  const title = `${movie.titleVi}${movie.titleOriginal ? ` (${movie.titleOriginal})` : ""} - Đặt vé xem phim | CINEMO`;
  const description =
    movie.description?.slice(0, 160) ??
    `Đặt vé xem phim ${movie.titleVi} tại cụm rạp CINEMO. Khám phá lịch chiếu và đặt chỗ ngay hôm nay.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.movie",
      images: movie.posterUrl ? [{ url: movie.posterUrl, alt: movie.titleVi }] : [],
    },
  };
}

export default async function MovieDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { date, province } = await searchParams;
  // API chỉ trả suất của đúng 1 ngày nên luôn truyền ngày đã chuẩn hoá (sai/ngoài 7 ngày/lặp tham số → hôm nay)
  const activeDate = resolveScheduleDate(typeof date === "string" ? date : undefined);

  const data = await fetchMovieData(slug, activeDate, province);
  if (!data) {
    notFound();
  }

  const { movie, schedule } = data;
  const jsonLd = buildMovieJsonLd(movie, schedule);
  const isComingSoon = movie.availability === "coming_soon";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <article className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        {/* Khối Hero thông tin chi tiết phim */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
          {/* Poster phim */}
          <Scrub kind="left" className="space-y-4">
            <div className="frame">
            <div className="frame-in relative aspect-[2/3] w-full overflow-hidden bg-surface-elevated">
              {movie.posterUrl ? (
                <img
                  src={movie.posterUrl}
                  alt={`Poster phim ${movie.titleVi}`}
                  className="size-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-fg-muted">
                  <Film className="size-12" aria-hidden="true" />
                  <span className="text-body-sm font-medium">Chưa có poster</span>
                </div>
              )}
              <div className="absolute top-3 left-3">
                <AgeBadge rating={movie.ageRating} tone="semantic" />
              </div>
            </div>
            </div>

            {movie.trailerUrl && (
              <Button asChild variant="secondary" className="w-full">
                <a href={movie.trailerUrl} target="_blank" rel="noopener noreferrer">
                  <Play className="size-4 text-brand" aria-hidden="true" />
                  <span>Xem trailer</span>
                </a>
              </Button>
            )}
          </Scrub>

          {/* Thông tin metadata và nội dung phim */}
          <Scrub kind="right" className="flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{isComingSoon ? "Sắp chiếu" : "Đang chiếu"}</Badge>
                {movie.genres.map((genre) => (
                  <Badge key={genre} tone="neutral">
                    {genre}
                  </Badge>
                ))}
              </div>

              <div>
                <h1 className="text-h1 font-bold tracking-tight text-fg uppercase">{movie.titleVi}</h1>
                {movie.titleOriginal && (
                  <p className="mt-1 text-body text-fg-secondary">{movie.titleOriginal}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-y-2 gap-x-6 text-body-sm text-fg-secondary sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  <span>Thời lượng: <strong className="text-fg">{movie.durationMinutes} phút</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  <span>Khởi chiếu: <strong className="text-fg">{movie.releaseDate}</strong></span>
                </div>
                {movie.country && (
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                    <span>Quốc gia: <strong className="text-fg">{movie.country}</strong></span>
                  </div>
                )}
                {movie.director && (
                  <div className="flex items-center gap-2">
                    <User className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                    <span>Đạo diễn: <strong className="text-fg">{movie.director}</strong></span>
                  </div>
                )}
              </div>

              {movie.cast.length > 0 && (
                <div className="text-body-sm text-fg-secondary">
                  <span>Diễn viên: </span>
                  <span className="text-fg">{movie.cast.join(", ")}</span>
                </div>
              )}

              {movie.description && (
                <div className="border-t border-border pt-4">
                  <h2 className="mb-2 text-h3 font-bold text-fg">Nội dung phim</h2>
                  <p className="text-body leading-relaxed text-fg-secondary whitespace-pre-line">
                    {movie.description}
                  </p>
                </div>
              )}
            </div>

            {/* Hành động chính: Nút đặt vé hoặc nhãn thông báo sắp chiếu (R-45) */}
            <div className="pt-2">
              {isComingSoon ? (
                <div className="chamfer-md bg-surface-control p-4 text-center text-body-sm text-fg-secondary">
                  Phim dự kiến khởi chiếu vào ngày <strong className="text-fg">{movie.releaseDate}</strong>. Lịch chiếu sẽ được mở trước ngày khởi chiếu.
                </div>
              ) : (
                <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-[200px]">
                  <Link href="#lich-chieu">Chọn suất chiếu</Link>
                </Button>
              )}
            </div>
          </Scrub>
        </div>

        {/* Luồng đặt vé: Stepper và Lịch chiếu */}
        <section id="lich-chieu" className="space-y-6 border-t border-border pt-8">
          <SectionHeading
            title="Lịch chiếu"
            description="Chọn ngày và suất chiếu phù hợp tại rạp gần bạn nhất"
          />

          {/* Stepper đặt vé bước 1: Chọn suất */}
          <BookingStepper currentStep={1} />

          <MovieShowtimeSchedule
            movie={movie}
            schedule={schedule}
            selectedDate={activeDate}
            province={province}
          />
        </section>
      </article>
    </>
  );
}
