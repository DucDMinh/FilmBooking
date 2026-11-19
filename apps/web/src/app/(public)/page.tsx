import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronRight, Film, MapPin, Phone } from "lucide-react";

import { MovieCard } from "@/components/catalog/movie-card";
import { ProvincePickerDialog } from "@/components/catalog/province-picker-dialog";
import { QuickBookBar } from "@/components/catalog/quick-book-bar";
import { EmptyState } from "@/components/common/states";
import { HomeHero } from "@/components/home/home-hero";
import { Scrub } from "@/components/motion/scrub";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { cn } from "@/lib/utils";
import type { CinemaDto, MovieDto, ProvinceDto } from "@filmbooking/shared/schemas/catalog";

export interface HomeBannerDto {
  slug: string;
  titleVi: string;
  bannerUrl: string;
}

export interface HomeDto {
  banners: HomeBannerDto[];
  nowShowing: MovieDto[];
  comingSoon: MovieDto[];
}

export const metadata: Metadata = {
  title: "CINEMO - Đặt vé xem phim trực tuyến nhanh chóng, tiện lợi",
  description:
    "Trải nghiệm rạp chiếu phim hiện đại với âm thanh đỉnh cao, hình ảnh sắc nét. Đặt vé xem phim nhanh chóng tại hệ thống rạp CINEMO trên toàn quốc.",
};

interface HomePageProps {
  searchParams?: Promise<{
    province?: string;
    tab?: string;
  }>;
}

const tabClass = (active: boolean) =>
  cn(
    "chamfer-md inline-flex min-h-11 items-center justify-center px-4 font-heading text-body-sm font-bold uppercase tracking-btn transition-colors",
    active ? "bg-brand text-fg-on-brand" : "bg-surface-control text-fg-secondary hover:text-brand",
  );

/** Tiêu đề section: hud + h2 wipe + vạch gradient, vào từ trên xuống theo cuộn (nhóm B, không glitch). */
function SectionHead({ kicker, title, description }: Readonly<{ kicker: string; title: string; description?: string }>) {
  return (
    <Scrub kind="down" className="space-y-1">
      <p className="hud hud-brand">{kicker}</p>
      <h2 data-scrub-wipe className="text-h2 font-bold uppercase text-fg">
        {title}
      </h2>
      <span data-scrub-rule className="rule-brand" aria-hidden="true" />
      {description ? <p className="pt-2 text-small text-fg-secondary">{description}</p> : null}
    </Scrub>
  );
}

export default async function HomePage(props: HomePageProps) {
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const cookieStore = await cookies();
  const provinceFromCookie = cookieStore.get("fb_province")?.value;
  const currentProvinceCode = resolvedSearchParams.province || provinceFromCookie || undefined;
  const activeTab = resolvedSearchParams.tab === "coming_soon" ? "coming_soon" : "now_showing";

  const provinceQuery = currentProvinceCode ? `?province=${encodeURIComponent(currentProvinceCode)}` : "";
  const [homeData, provinces, cinemas] = await Promise.all([
    apiFetch<HomeDto>(`/home${provinceQuery}`, PUBLIC_CACHE).catch((): HomeDto => ({
      banners: [],
      nowShowing: [],
      comingSoon: [],
    })),
    apiFetch<ProvinceDto[]>("/provinces", PUBLIC_CACHE).catch((): ProvinceDto[] => []),
    apiFetch<CinemaDto[]>(`/cinemas${provinceQuery}`, PUBLIC_CACHE).catch((): CinemaDto[] => []),
  ]);

  const currentProvince = provinces.find((p: ProvinceDto) => p.code === currentProvinceCode);
  const featuredBanner = homeData.banners[0] ?? null;
  const featuredMovie = featuredBanner
    ? homeData.nowShowing.find((movie) => movie.slug === featuredBanner.slug)
    : undefined;
  const displayMovies = activeTab === "now_showing" ? homeData.nowShowing : homeData.comingSoon;

  return (
    <div className="space-y-10 md:space-y-14">
      {/* Hero ghim + Đặt vé nhanh (R-138): CSS scroll-driven, mobile/màn thấp để tĩnh */}
      <HomeHero
        movie={
          featuredBanner
            ? { ...featuredBanner, ageRating: featuredMovie?.ageRating, durationMinutes: featuredMovie?.durationMinutes }
            : null
        }
      >
        <QuickBookBar cinemas={cinemas} provinces={provinces} provinceCode={currentProvinceCode} />
      </HomeHero>

      {/* Khu vực hiện tại */}
      <section
        aria-label="Khu vực hiện tại"
        className="chamfer-md flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3 text-body-sm"
      >
        <div className="flex items-center gap-2 text-fg-secondary">
          <MapPin className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <span>Khu vực đang chọn:</span>
          <span className="font-bold text-fg">{currentProvince ? currentProvince.name : "Tất cả khu vực"}</span>
        </div>
        <Link
          href="/rap"
          className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-link hover:underline"
        >
          <span>Xem hệ thống rạp</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>

      {/* Danh sách phim: Tabs Đang chiếu / Sắp chiếu */}
      <section aria-label="Danh sách phim chiếu rạp" className="space-y-6 overflow-x-clip">
        <SectionHead kicker="Lịch chiếu" title="Phim chiếu rạp" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Phân loại phim" className="flex items-center gap-2">
            <Link
              role="tab"
              aria-selected={activeTab === "now_showing"}
              href={currentProvinceCode ? `/?province=${currentProvinceCode}&tab=now_showing` : "/?tab=now_showing"}
              className={tabClass(activeTab === "now_showing")}
            >
              Phim đang chiếu ({homeData.nowShowing.length})
            </Link>
            <Link
              role="tab"
              aria-selected={activeTab === "coming_soon"}
              href={currentProvinceCode ? `/?province=${currentProvinceCode}&tab=coming_soon` : "/?tab=coming_soon"}
              className={tabClass(activeTab === "coming_soon")}
            >
              Phim sắp chiếu ({homeData.comingSoon.length})
            </Link>
          </div>

          <Link
            href="/phim"
            className="inline-flex min-h-11 items-center gap-1 text-body-sm font-semibold text-link hover:underline"
          >
            <span>Xem tất cả phim</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {displayMovies.length > 0 ? (
          <div className="home-movie-grid grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
            {displayMovies.map((movie: MovieDto) => (
              <Scrub key={movie.id} kind="beam">
                <MovieCard movie={movie} />
              </Scrub>
            ))}
          </div>
        ) : (
          <EmptyState
            title={activeTab === "now_showing" ? "Chưa có phim đang chiếu" : "Chưa có phim sắp chiếu"}
            description={
              currentProvince
                ? `Hiện tại chưa có suất chiếu phù hợp tại khu vực ${currentProvince.name}. Bạn có thể xem các phim ở rạp khác.`
                : "Danh sách phim đang được cập nhật. Vui lòng quay lại sau ít phút."
            }
            icon={Film}
            action={
              <Button asChild variant="secondary">
                <Link href="/phim">Khám phá tất cả phim</Link>
              </Button>
            }
          />
        )}
      </section>

      {/* Rạp tại {tỉnh} hoặc Hệ thống rạp CINEMO: lẻ vào từ trái, chẵn vào từ phải */}
      <section aria-label="Hệ thống rạp" className="space-y-6 overflow-x-clip">
        <div className="flex items-end justify-between gap-4">
          <SectionHead
            kicker="Hệ thống rạp"
            title={currentProvince ? `Rạp tại ${currentProvince.name}` : "Hệ thống rạp CINEMO"}
            description="Không gian điện ảnh đẳng cấp, dịch vụ chu đáo"
          />
          <Link
            href="/rap"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-body-sm font-semibold text-link hover:underline"
          >
            <span>Xem tất cả rạp</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {cinemas.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {cinemas.map((cinema: CinemaDto, index) => (
              <Scrub key={cinema.code} kind={index % 2 === 0 ? "left" : "right"} i={index % 3} n={3}>
                <article
                  data-testid={`cinema-card-${cinema.code}`}
                  className="frame h-full transition-colors hover:[--frame-color:var(--color-brand)]"
                >
                  <div className="frame-in flex h-full flex-col justify-between space-y-4 bg-linear-to-br from-surface-elevated to-chrome p-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="hud hud-brand">{cinema.code}</span>
                        <span className="chamfer-sm bg-success-soft px-2.5 py-0.5 text-caption font-semibold text-success">
                          Mở cửa
                        </span>
                      </div>
                      <h3 className="text-h3 font-bold uppercase text-fg">{cinema.name}</h3>
                      <p className="line-clamp-2 text-body-sm text-fg-secondary">{cinema.address}</p>
                      {cinema.hotline ? (
                        <div className="flex items-center gap-1.5 pt-1 text-small text-fg-muted">
                          <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="font-mono">{cinema.hotline}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/rap/${cinema.code}`}>Xem lịch chiếu</Link>
                      </Button>
                      <span className="font-mono text-caption text-fg-muted">
                        {cinema.amenities && cinema.amenities.length > 0 ? cinema.amenities.slice(0, 2).join(" • ") : "2D • 3D"}
                      </span>
                    </div>
                  </div>
                </article>
              </Scrub>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Chưa có cụm rạp tại khu vực này"
            description="CINEMO đang tiếp tục mở rộng thêm các cụm rạp mới. Vui lòng chọn khu vực khác."
            icon={MapPin}
            action={
              <Button asChild variant="secondary">
                <Link href="/rap">Xem danh sách toàn bộ rạp</Link>
              </Button>
            }
          />
        )}
      </section>

      {/* Hộp thoại chọn tỉnh/thành tự động mở khi chưa có cookie */}
      <ProvincePickerDialog provinces={provinces} currentProvince={currentProvinceCode} />
    </div>
  );
}
