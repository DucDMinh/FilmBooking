import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, ChevronRight, Film, MapPin, Phone, Sparkles } from "lucide-react";

import { MovieCard } from "@/components/catalog/movie-card";
import { ProvincePickerDialog } from "@/components/catalog/province-picker-dialog";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
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
  title: "CINEMO – Đặt vé xem phim trực tuyến nhanh chóng, tiện lợi",
  description:
    "Trải nghiệm rạp chiếu phim hiện đại với âm thanh đỉnh cao, hình ảnh sắc nét. Đặt vé xem phim nhanh chóng tại hệ thống rạp CINEMO trên toàn quốc.",
};

interface HomePageProps {
  searchParams?: Promise<{
    province?: string;
    tab?: string;
  }>;
}

export default async function HomePage(props: HomePageProps) {
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const cookieStore = await cookies();
  const provinceFromCookie = cookieStore.get("fb_province")?.value;
  const currentProvinceCode = resolvedSearchParams.province || provinceFromCookie || undefined;
  const activeTab = resolvedSearchParams.tab === "coming_soon" ? "coming_soon" : "now_showing";

  const provinceQuery = currentProvinceCode ? `?province=${encodeURIComponent(currentProvinceCode)}` : "";
  const [homeData, provinces, cinemas] = await Promise.all([
    apiFetch<HomeDto>(`/home${provinceQuery}`).catch((): HomeDto => ({
      banners: [],
      nowShowing: [],
      comingSoon: [],
    })),
    apiFetch<ProvinceDto[]>("/provinces").catch((): ProvinceDto[] => []),
    apiFetch<CinemaDto[]>(`/cinemas${provinceQuery}`).catch((): CinemaDto[] => []),
  ]);

  const currentProvince = provinces.find((p: ProvinceDto) => p.code === currentProvinceCode);
  const featuredBanner = homeData.banners[0] ?? null;
  const displayMovies = activeTab === "now_showing" ? homeData.nowShowing : homeData.comingSoon;

  return (
    <div className="space-y-10 md:space-y-14">
      {/* Thanh chọn/hiển thị khu vực hiện tại */}
      <section
        aria-label="Khu vực hiện tại"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3 text-body-sm"
      >
        <div className="flex items-center gap-2 text-fg-secondary">
          <MapPin className="size-4 text-brand shrink-0" aria-hidden="true" />
          <span>Khu vực đang chọn:</span>
          <span className="font-bold text-fg">
            {currentProvince ? currentProvince.name : "Tất cả khu vực"}
          </span>
        </div>
        <Link
          href="/rap"
          className="inline-flex items-center gap-1 text-small font-semibold text-link hover:underline"
        >
          <span>Xem hệ thống rạp</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>

      {/* Hero / Banner nổi bật */}
      {featuredBanner ? (
        <section
          aria-label="Phim nổi bật"
          className="relative overflow-hidden rounded-hero border border-border-subtle bg-surface"
        >
          <div className="relative aspect-[16/9] sm:aspect-[21/9] min-h-[300px] max-h-[460px] w-full overflow-hidden">
            <img
              src={featuredBanner.bannerUrl}
              alt={`Banner phim ${featuredBanner.titleVi}`}
              className="size-full object-cover object-center"
            />
            {/* Lớp phủ gradient tối bảo đảm độ tương phản chữ */}
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-pill bg-brand-soft px-3 py-1 text-caption font-bold tracking-wide uppercase text-brand">
                <Sparkles className="size-3.5" aria-hidden="true" />
                <span>Phim nổi bật</span>
              </div>
              <h1 className="text-h1 md:text-display font-heavy uppercase tracking-wide text-fg line-clamp-2">
                {featuredBanner.titleVi}
              </h1>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button asChild variant="gradient" size="lg">
                  <Link href={`/phim/${featuredBanner.slug}#lich-chieu`}>
                    Đặt vé ngay
                    <ArrowRight className="size-4 ml-1.5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href={`/phim/${featuredBanner.slug}`}>
                    Xem chi tiết
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Danh sách phim: Tabs Đang chiếu / Sắp chiếu */}
      <section aria-label="Danh sách phim chiếu rạp" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-3">
          <div role="tablist" aria-label="Phân loại phim" className="flex items-center gap-2">
            <Link
              role="tab"
              aria-selected={activeTab === "now_showing"}
              href={currentProvinceCode ? `/?province=${currentProvinceCode}&tab=now_showing` : "/?tab=now_showing"}
              className={`inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-body font-bold transition-colors ${
                activeTab === "now_showing"
                  ? "border-b-2 border-brand text-brand"
                  : "text-fg-secondary hover:text-fg"
              }`}
            >
              Phim đang chiếu ({homeData.nowShowing.length})
            </Link>
            <Link
              role="tab"
              aria-selected={activeTab === "coming_soon"}
              href={currentProvinceCode ? `/?province=${currentProvinceCode}&tab=coming_soon` : "/?tab=coming_soon"}
              className={`inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-body font-bold transition-colors ${
                activeTab === "coming_soon"
                  ? "border-b-2 border-brand text-brand"
                  : "text-fg-secondary hover:text-fg"
              }`}
            >
              Phim sắp chiếu ({homeData.comingSoon.length})
            </Link>
          </div>

          <Link
            href="/phim"
            className="inline-flex items-center gap-1 text-body-sm font-semibold text-link hover:underline"
          >
            <span>Xem tất cả phim</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {displayMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {displayMovies.map((movie: MovieDto) => (
              <MovieCard key={movie.id} movie={movie} />
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

      {/* Rạp tại {tỉnh} hoặc Hệ thống rạp CINEMO */}
      <section aria-label="Hệ thống rạp" className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-h2 font-bold text-fg">
              {currentProvince ? `Rạp tại ${currentProvince.name}` : "Hệ thống rạp CINEMO"}
            </h2>
            <p className="text-small text-fg-secondary">
              Không gian điện ảnh đẳng cấp, dịch vụ chu đáo
            </p>
          </div>
          <Link
            href="/rap"
            className="inline-flex items-center gap-1 text-body-sm font-semibold text-link hover:underline"
          >
            <span>Xem tất cả rạp</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {cinemas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {cinemas.map((cinema: CinemaDto) => (
              <article
                key={cinema.code}
                data-testid={`cinema-card-${cinema.code}`}
                className="flex flex-col justify-between rounded-lg border border-border-subtle bg-surface p-5 transition-colors hover:border-brand/40 space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-bold tracking-wide uppercase text-brand">
                      {cinema.code}
                    </span>
                    <span className="rounded-pill bg-success-soft px-2.5 py-0.5 text-caption font-semibold text-success">
                      Mở cửa
                    </span>
                  </div>
                  <h3 className="text-h3 font-bold text-fg">{cinema.name}</h3>
                  <p className="text-body-sm text-fg-secondary line-clamp-2">
                    {cinema.address}
                  </p>
                  {cinema.hotline ? (
                    <div className="flex items-center gap-1.5 text-small text-fg-muted pt-1">
                      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{cinema.hotline}</span>
                    </div>
                  ) : null}
                </div>

                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/rap/${cinema.code}`}>Xem lịch chiếu</Link>
                  </Button>
                  <span className="text-caption text-fg-muted">
                    {cinema.amenities && cinema.amenities.length > 0 ? cinema.amenities.slice(0, 2).join(" • ") : "2D • 3D"}
                  </span>
                </div>
              </article>
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
      <ProvincePickerDialog
        provinces={provinces}
        currentProvince={currentProvinceCode}
      />
    </div>
  );
}
