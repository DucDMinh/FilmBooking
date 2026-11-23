import { Clock, Film, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CinemaMap } from "@/components/catalog/cinema-map";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { SectionHeading } from "@/components/catalog/section-heading";
import { EmptyState } from "@/components/common/states";
import { Scrub } from "@/components/motion/scrub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { PUBLIC_CACHE } from "@/lib/api/cache";
import { getServerAccessToken } from "@/lib/supabase/server";
import type { CinemaDto, ProvinceDto } from "@filmbooking/shared/schemas/catalog";

export const metadata: Metadata = {
  title: "Hệ thống rạp chiếu phim | CINEMO",
  description:
    "Danh sách hệ thống rạp chiếu phim hiện đại của CINEMO trên toàn quốc. Tra cứu địa chỉ, hotline, tiện ích và lịch chiếu các bộ phim hấp dẫn nhất.",
};

interface RapPageProps {
  searchParams: Promise<{ province?: string }>;
}

/** Tab tỉnh/thành (design-spec §16.3 Tabs): chamfer-md, đang chọn nền vàng chữ tối; focus vẽ inset vì clip-path. */
function provinceTabClass(active: boolean): string {
  return [
    "chamfer-md inline-flex min-h-11 items-center justify-center px-5 font-heading text-body-sm font-bold tracking-btn uppercase transition-colors duration-200 outline-hidden focus-visible:shadow-[inset_0_0_0_2px_var(--focus-inset,var(--color-brand))]",
    active
      ? "bg-brand text-fg-on-brand [--focus-inset:var(--color-fg-on-brand)]"
      : "bg-surface-control text-fg-secondary shadow-[inset_0_0_0_1px_var(--color-frame)] hover:text-fg hover:shadow-[inset_0_0_0_1px_var(--color-brand)]",
  ].join(" ");
}

export default async function RapPage({ searchParams }: Readonly<RapPageProps>) {
  const { province } = await searchParams;

  // Lấy danh sách tỉnh thành và rạp từ API
  const provinces = await apiFetch<ProvinceDto[]>("/provinces", PUBLIC_CACHE).catch(() => [] as ProvinceDto[]);
  const cinemaQuery = province ? `/cinemas?province=${encodeURIComponent(province)}` : "/cinemas";
  const cinemas = await apiFetch<CinemaDto[]>(cinemaQuery, PUBLIC_CACHE).catch(() => [] as CinemaDto[]);

  // Kiểm tra phiên đăng nhập và lấy danh sách rạp yêu thích của user (nếu có)
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

  const selectedProvinceName = province
    ? provinces.find((p) => p.code === province)?.name ?? province
    : "Tất cả khu vực";

  const featuredCinema = cinemas.find(
    (c) => typeof c.latitude === "number" && typeof c.longitude === "number",
  );

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <SectionHeading
        first
        level="h1"
        kicker="Mạng lưới CINEMO toàn quốc"
        title="Hệ thống rạp chiếu phim"
        description="Không gian trải nghiệm điện ảnh chuẩn quốc tế với công nghệ âm thanh vòm đỉnh cao, ghế ngồi êm ái và dịch vụ tận tâm tại các thành phố lớn."
      />

      {/* Bộ lọc theo tỉnh/thành (R-34, R-35) */}
      <section aria-labelledby="province-filter-heading" className="space-y-3">
        <h2 id="province-filter-heading" className="sr-only">
          Lọc rạp theo tỉnh thành
        </h2>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Link href="/rap" className={provinceTabClass(!province)} aria-current={!province ? "page" : undefined}>
            Tất cả khu vực
          </Link>
          {provinces.map((p) => {
            const isActive = province === p.code;
            return (
              <Link
                key={p.code}
                href={`/rap?province=${encodeURIComponent(p.code)}`}
                className={provinceTabClass(isActive)}
                aria-current={isActive ? "page" : undefined}
              >
                {p.name}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Danh sách rạp */}
      <section aria-labelledby="cinema-list-heading" className="space-y-6">
        <SectionHeading first id="cinema-list-heading" title={`${selectedProvinceName} (${cinemas.length} rạp)`} />

        {cinemas.length === 0 ? (
          <EmptyState
            title="Không tìm thấy rạp phù hợp"
            description={
              province
                ? `Hiện chưa có rạp CINEMO hoạt động tại ${selectedProvinceName}. Quý khách vui lòng chọn khu vực khác.`
                : "Hiện chưa có cụm rạp nào mở cửa."
            }
            action={
              province ? (
                <Button asChild variant="secondary" className="mt-2">
                  <Link href="/rap">Xem tất cả các rạp</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          // data-scrub-grid="cinema": hàng đầu (1 / 2 / 3 thẻ theo grid-cols bên dưới) không scrub, xem globals.css
          <div data-scrub-grid="cinema" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cinemas.map((cinema, index) => {
              const cinemaId = cinema.id ?? "";
              const isFav = Boolean(cinemaId && favoriteIds.includes(cinemaId));

              return (
                // Hai bên (nhóm B): thẻ lẻ vào từ trái, thẻ chẵn vào từ phải; mỗi thẻ có timeline cuộn riêng.
                <Scrub
                  as="article"
                  key={cinema.code}
                  kind={index % 2 === 0 ? "left" : "right"}
                  className="frame h-full"
                >
                  <div className="frame-in flex h-full flex-col justify-between gap-4 bg-[linear-gradient(160deg,var(--color-surface),var(--color-bg)_72%)] p-6">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="hud hud-brand">CINEMO {cinema.code}</span>
                          <h3 className="font-heading text-h3 font-bold uppercase text-fg">
                            <Link href={`/rap/${cinema.code}`} className="transition-colors hover:text-brand">
                              {cinema.name}
                            </Link>
                          </h3>
                        </div>
                        <FavoriteButton
                          cinemaId={cinemaId}
                          cinemaCode={cinema.code}
                          cinemaName={cinema.name}
                          initialFavorite={isFav}
                          isAuthenticated={isAuthenticated}
                          variant="ghost"
                          size="icon"
                        />
                      </div>

                      <div className="space-y-3 text-body-sm text-fg-secondary">
                        <div className="flex items-start gap-2.5">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                          <span>{cinema.address}</span>
                        </div>

                        {cinema.hotline ? (
                          <div className="flex items-center gap-2.5">
                            <Phone className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                            <a
                              href={`tel:${cinema.hotline}`}
                              className="font-mono font-medium text-brand hover:underline"
                            >
                              {cinema.hotline}
                            </a>
                          </div>
                        ) : null}

                        {cinema.openingHours ? (
                          <div className="flex items-center gap-2.5">
                            <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                            <span className="font-mono">{cinema.openingHours}</span>
                          </div>
                        ) : null}

                        {cinema.amenities && cinema.amenities.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {cinema.amenities.slice(0, 3).map((item) => (
                              <Badge key={item} tone="neutral">
                                {item}
                              </Badge>
                            ))}
                            {cinema.amenities.length > 3 ? (
                              <Badge tone="neutral">+{cinema.amenities.length - 3}</Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <Button asChild variant="secondary" className="w-full">
                      <Link href={`/rap/${cinema.code}`}>
                        <Film className="size-4" aria-hidden="true" />
                        Xem chi tiết & Lịch chiếu
                      </Link>
                    </Button>
                  </div>
                </Scrub>
              );
            })}
          </div>
        )}
      </section>

      {/* Bản đồ vị trí trực quan rạp đại diện (R-34, R-37, Defect 5) */}
      {featuredCinema ? (
        <section aria-labelledby="cinema-map-heading" className="space-y-4">
          <SectionHeading id="cinema-map-heading" title={`Vị trí rạp (${featuredCinema.name})`} />
          <CinemaMap
            cinemaName={featuredCinema.name}
            address={featuredCinema.address}
            latitude={featuredCinema.latitude}
            longitude={featuredCinema.longitude}
          />
        </section>
      ) : null}
    </div>
  );
}
