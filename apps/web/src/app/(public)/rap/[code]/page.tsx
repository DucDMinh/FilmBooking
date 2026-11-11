import { Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CinemaMap } from "@/components/catalog/cinema-map";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { AgeBadge } from "@/components/common/age-badge";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api/client";
import { buildCinemaJsonLd, serializeCinemaJsonLd } from "@/lib/seo/cinema-jsonld";
import { getServerAccessToken } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { AgeRating } from "@filmbooking/shared";
import type { CinemaDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { toVnParts } from "@filmbooking/shared/time";

export interface CinemaDetailPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ date?: string }>;
}

export interface CinemaDetailDto {
  cinema: CinemaDto;
  rooms: { id: string; name: string; supportedFormats: string[]; status: string }[];
  showtimes: (ShowtimeDto & {
    movie: {
      slug: string;
      titleVi: string;
      ageRating: string;
      posterUrl: string | null;
      durationMinutes: number;
    };
  })[];
}

function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://filmbooking.local").replace(/\/+$/, "");
}

function getTodayVn(): string {
  const p = toVnParts(new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Sinh danh sách 7 ngày kế tiếp theo giờ Việt Nam */
function getNext7DaysVn(todayStr: string) {
  const parts = todayStr.split("-").map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const baseDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const p = toVnParts(d);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    const label = i === 0 ? "Hôm nay" : WEEKDAYS[p.weekday];
    const displayDate = `${pad(p.day)}/${pad(p.month)}`;
    return { dateStr, label, displayDate };
  });
}

function formatVnTime(utcIso: string): string {
  const p = toVnParts(new Date(utcIso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

async function fetchCinemaDetail(code: string, date: string): Promise<CinemaDetailDto | null> {
  try {
    return await apiFetch<CinemaDetailDto>(`/cinemas/${encodeURIComponent(code)}?date=${date}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    return null;
  }
}

export async function generateMetadata({ params }: CinemaDetailPageProps): Promise<Metadata> {
  const { code } = await params;
  const today = getTodayVn();
  const detail = await fetchCinemaDetail(code, today);

  if (!detail) {
    return {
      title: "Không tìm thấy rạp | CINEMO",
      description: "Rạp chiếu phim không tồn tại hoặc đã tạm dừng phục vụ.",
    };
  }

  const { cinema } = detail;
  return {
    title: `${cinema.name} | Rạp chiếu phim CINEMO`,
    description: `Xem lịch chiếu phim và đặt vé tại ${cinema.name}. Địa chỉ: ${cinema.address}. Hotline: ${cinema.hotline ?? "1900 8888"}.`,
  };
}

export default async function CinemaDetailPage({
  params,
  searchParams,
}: Readonly<CinemaDetailPageProps>) {
  const { code } = await params;
  const { date } = await searchParams;

  const todayVn = getTodayVn();
  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayVn;

  const detail = await fetchCinemaDetail(code, selectedDate);
  if (!detail) {
    notFound();
  }

  const { cinema, showtimes } = detail;
  const siteUrl = getSiteUrl();
  const jsonLd = buildCinemaJsonLd(cinema, siteUrl);

  // Kiểm tra phiên đăng nhập và danh sách rạp yêu thích
  const token = await getServerAccessToken();
  const isAuthenticated = Boolean(token);
  let favoriteIds: string[] = [];
  if (token) {
    try {
      const profile = await apiFetch<{ favorite_cinema_ids?: string[] }>("/me/profile", {
        accessToken: token,
      });
      favoriteIds = profile?.favorite_cinema_ids ?? [];
    } catch {
      favoriteIds = [];
    }
  }

  const cinemaId = cinema.id ?? "";
  const isFavorite = Boolean(cinemaId && favoriteIds.includes(cinemaId));

  // Nhóm suất chiếu theo từng phim
  type MovieGroup = {
    movie: CinemaDetailDto["showtimes"][number]["movie"];
    slots: CinemaDetailDto["showtimes"];
  };

  const moviesMap = new Map<string, MovieGroup>();
  for (const st of showtimes) {
    const slug = st.movie.slug;
    if (!moviesMap.has(slug)) {
      moviesMap.set(slug, { movie: st.movie, slots: [] });
    }
    moviesMap.get(slug)?.slots.push(st);
  }
  const movieGroups = Array.from(moviesMap.values());

  const days = getNext7DaysVn(todayVn);

  const directionsUrl =
    typeof cinema.latitude === "number" && typeof cinema.longitude === "number"
      ? `https://www.openstreetmap.org/directions?to=${cinema.latitude}%2C${cinema.longitude}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${cinema.name} ${cinema.address}`)}`;

  return (
    <>
      {/* Schema.org MovieTheater JSON-LD cho AI agents & Search Engines (R-46) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeCinemaJsonLd(jsonLd) }}
      />

      <div className="space-y-8">
        {/* Breadcrumb */}
        <nav aria-label="Đường dẫn phân cấp" className="flex items-center gap-2 text-body-sm text-fg-secondary">
          <Link href="/" className="hover:text-fg">Trang chủ</Link>
          <span aria-hidden="true">/</span>
          <Link href="/rap" className="hover:text-fg">Hệ thống rạp</Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-fg" aria-current="page">{cinema.name}</span>
        </nav>

        {/* Thông tin rạp (Hero header) */}
        <header className="rounded-2xl border border-border bg-chrome p-6 md:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-overline uppercase tracking-wider text-brand">
                  CINEMO {cinema.code}
                </span>
                <Badge tone="success">
                  Đang hoạt động
                </Badge>
              </div>

              <h1 className="text-h1 font-heavy tracking-tight text-fg">
                {cinema.name}
              </h1>

              <div className="space-y-2 text-body text-fg-secondary">
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-1 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{cinema.address}</span>
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-1">
                  {cinema.hotline ? (
                    <div className="flex items-center gap-2">
                      <Phone className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                      <a href={`tel:${cinema.hotline}`} className="font-semibold text-fg hover:text-brand">
                        {cinema.hotline}
                      </a>
                    </div>
                  ) : null}

                  {cinema.email ? (
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                      <a href={`mailto:${cinema.email}`} className="text-fg hover:text-brand">
                        {cinema.email}
                      </a>
                    </div>
                  ) : null}

                  {cinema.openingHours ? (
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                      <span>{cinema.openingHours}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {cinema.amenities && cinema.amenities.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {cinema.amenities.map((item) => (
                    <Badge
                      key={item}
                      tone="neutral"
                      className="bg-surface-elevated text-body-sm text-fg-secondary"
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Nút thao tác: Yêu thích + Chỉ đường */}
            <div className="flex flex-wrap items-center gap-3">
              <FavoriteButton
                cinemaId={cinemaId}
                cinemaCode={cinema.code}
                cinemaName={cinema.name}
                initialFavorite={isFavorite}
                isAuthenticated={isAuthenticated}
                showLabel={true}
                variant="secondary"
                size="default"
              />

              <Button asChild variant="outline" size="default">
                <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Chỉ đường
                </a>
              </Button>
            </div>
          </div>
        </header>

        {/* Bản đồ vị trí (Client-only lazy Leaflet OSM) */}
        <section aria-labelledby="map-heading" className="space-y-3">
          <h2 id="map-heading" className="text-h3 font-bold text-fg">
            Vị trí trên bản đồ
          </h2>
          <CinemaMap
            latitude={cinema.latitude}
            longitude={cinema.longitude}
            cinemaName={cinema.name}
            address={cinema.address}
          />
        </section>

        {/* Lịch chiếu phim tại rạp (R-37, R-42) */}
        <section aria-labelledby="showtimes-heading" className="space-y-6">
          <div className="space-y-4">
            <h2 id="showtimes-heading" className="text-h2 font-bold text-fg">
              Lịch chiếu phim
            </h2>

            {/* Dải chọn ngày 7 ngày liên tiếp (DateStrip) */}
            <div
              className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none"
              role="tablist"
              aria-label="Chọn ngày chiếu phim"
            >
              {days.map((d) => {
                const isSelected = selectedDate === d.dateStr;
                return (
                  <Link
                    key={d.dateStr}
                    href={`/rap/${encodeURIComponent(code)}?date=${d.dateStr}`}
                    role="tab"
                    aria-selected={isSelected}
                    className={cn(
                      "flex min-h-14 min-w-24 shrink-0 flex-col items-center justify-center rounded-xl px-4 py-2 text-center transition-all",
                      isSelected
                        ? "bg-brand text-fg-on-brand shadow-md"
                        : "border border-border-subtle bg-surface text-fg-secondary hover:border-border hover:text-fg",
                    )}
                  >
                    <span className="text-overline uppercase font-bold tracking-wider">
                      {d.label}
                    </span>
                    <span className="text-body font-heavy">
                      {d.displayDate}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Danh sách phim & suất chiếu */}
          {movieGroups.length === 0 ? (
            <EmptyState
              title="Chưa có lịch chiếu cho ngày đã chọn"
              description="Hiện chưa có suất chiếu được xếp lịch cho ngày này tại rạp. Quý khách vui lòng chọn ngày khác để xem lịch chiếu."
            />
          ) : (
            <div className="space-y-6">
              {movieGroups.map(({ movie, slots }) => {
                const rating = movie.ageRating as AgeRating;
                return (
                  <div
                    key={movie.slug}
                    className="flex flex-col gap-5 rounded-2xl border border-border-subtle bg-surface p-5 md:flex-row md:items-start md:p-6"
                  >
                    {/* Poster phim */}
                    <div className="relative aspect-2/3 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-elevated md:w-36">
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt={movie.titleVi}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-caption text-fg-muted">
                          Không có poster
                        </div>
                      )}
                    </div>

                    {/* Chi tiết phim & danh sách suất */}
                    <div className="flex-1 space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <AgeBadge rating={rating} tone="semantic" />
                          <span className="text-body-sm text-fg-secondary">
                            {movie.durationMinutes} phút
                          </span>
                        </div>
                        <h3 className="text-h3 font-bold text-fg">
                          <Link href={`/phim/${movie.slug}`} className="hover:text-brand">
                            {movie.titleVi}
                          </Link>
                        </h3>
                      </div>

                      {/* Suất chiếu */}
                      <div className="space-y-2">
                        <span className="text-overline uppercase tracking-wider text-fg-muted">
                          Suất chiếu (Giờ Việt Nam)
                        </span>
                        <div className="flex flex-wrap gap-2.5">
                          {slots.map((st) => {
                            const startTime = formatVnTime(st.startsAt);
                            const isCancelled = st.status === "CANCELLED";

                            if (isCancelled) return null;

                            return (
                              <Button
                                key={st.id}
                                asChild
                                variant="outline"
                                className="group flex min-h-12 flex-col items-center justify-center rounded-xl border-border px-4 py-2 hover:border-brand hover:bg-brand-soft"
                              >
                                <Link href={`/dat-ve/${st.id}`}>
                                  <span className="text-body font-heavy text-fg group-hover:text-brand-hover">
                                    {startTime}
                                  </span>
                                  <span className="text-caption text-fg-muted group-hover:text-fg-secondary">
                                    {st.format} • {st.languageMode}
                                  </span>
                                </Link>
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
