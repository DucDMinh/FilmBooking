import { Clock, Film, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CinemaMap } from "@/components/catalog/cinema-map";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { getServerAccessToken } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { CinemaDto, ProvinceDto } from "@filmbooking/shared/schemas/catalog";

export const metadata: Metadata = {
  title: "Hệ thống rạp chiếu phim | CINEMO",
  description:
    "Danh sách hệ thống rạp chiếu phim hiện đại của CINEMO trên toàn quốc. Tra cứu địa chỉ, hotline, tiện ích và lịch chiếu các bộ phim hấp dẫn nhất.",
};

interface RapPageProps {
  searchParams: Promise<{ province?: string }>;
}

export default async function RapPage({ searchParams }: Readonly<RapPageProps>) {
  const { province } = await searchParams;

  // Lấy danh sách tỉnh thành và rạp từ API
  const provinces = await apiFetch<ProvinceDto[]>("/provinces").catch(() => [] as ProvinceDto[]);
  const cinemaQuery = province ? `/cinemas?province=${encodeURIComponent(province)}` : "/cinemas";
  const cinemas = await apiFetch<CinemaDto[]>(cinemaQuery).catch(() => [] as CinemaDto[]);

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
      <div className="space-y-3">
        <span className="text-overline uppercase tracking-wider text-brand">
          Mạng lưới CINEMO toàn quốc
        </span>
        <h1 className="text-h1 font-heavy tracking-tight text-fg">
          Hệ thống rạp chiếu phim
        </h1>
        <p className="max-w-2xl text-body text-fg-secondary">
          Không gian trải nghiệm điện ảnh chuẩn quốc tế với công nghệ âm thanh vòm đỉnh cao,
          ghế ngồi êm ái và dịch vụ tận tâm tại các thành phố lớn.
        </p>
      </div>

      {/* Bộ lọc theo tỉnh/thành (R-34, R-35) */}
      <section aria-labelledby="province-filter-heading" className="space-y-3">
        <h2 id="province-filter-heading" className="sr-only">
          Lọc rạp theo tỉnh thành
        </h2>
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <Link
            href="/rap"
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-pill px-5 text-body-sm font-semibold transition-colors",
              !province
                ? "bg-brand text-fg-on-brand"
                : "border border-border-subtle bg-surface text-fg-secondary hover:border-border hover:text-fg",
            )}
            aria-current={!province ? "page" : undefined}
          >
            Tất cả khu vực
          </Link>
          {provinces.map((p) => {
            const isActive = province === p.code;
            return (
              <Link
                key={p.code}
                href={`/rap?province=${encodeURIComponent(p.code)}`}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-pill px-5 text-body-sm font-semibold transition-colors",
                  isActive
                    ? "bg-brand text-fg-on-brand"
                    : "border border-border-subtle bg-surface text-fg-secondary hover:border-border hover:text-fg",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {p.name}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Danh sách rạp */}
      <section aria-labelledby="cinema-list-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 id="cinema-list-heading" className="text-h3 font-bold text-fg">
            {selectedProvinceName} ({cinemas.length} rạp)
          </h2>
        </div>

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
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cinemas.map((cinema) => {
              const cinemaId = cinema.id ?? "";
              const isFav = Boolean(cinemaId && favoriteIds.includes(cinemaId));

              return (
                <Card
                  key={cinema.code}
                  className="flex flex-col justify-between border-border-subtle bg-surface transition-colors hover:border-border"
                >
                  <CardHeader className="space-y-2 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-overline text-brand">
                          CINEMO {cinema.code}
                        </span>
                        <h3 className="text-h3 font-bold text-fg">
                          <Link
                            href={`/rap/${cinema.code}`}
                            className="transition-colors hover:text-brand"
                          >
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
                  </CardHeader>

                  <CardContent className="space-y-3 text-body-sm text-fg-secondary">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{cinema.address}</span>
                    </div>

                    {cinema.hotline ? (
                      <div className="flex items-center gap-2.5">
                        <Phone className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        <a
                          href={`tel:${cinema.hotline}`}
                          className="font-medium text-fg hover:text-brand hover:underline"
                        >
                          {cinema.hotline}
                        </a>
                      </div>
                    ) : null}

                    {cinema.openingHours ? (
                      <div className="flex items-center gap-2.5">
                        <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        <span>{cinema.openingHours}</span>
                      </div>
                    ) : null}

                    {cinema.amenities && cinema.amenities.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {cinema.amenities.slice(0, 3).map((item) => (
                          <Badge
                            key={item}
                            tone="neutral"
                            className="bg-surface-elevated text-caption text-fg-secondary"
                          >
                            {item}
                          </Badge>
                        ))}
                        {cinema.amenities.length > 3 ? (
                          <Badge
                            tone="neutral"
                            className="bg-surface-elevated text-caption text-fg-muted"
                          >
                            +{cinema.amenities.length - 3}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>

                  <CardFooter className="pt-3">
                    <Button asChild variant="secondary" className="w-full">
                      <Link href={`/rap/${cinema.code}`}>
                        <Film className="size-4" aria-hidden="true" />
                        Xem chi tiết & Lịch chiếu
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Bản đồ vị trí trực quan rạp đại diện (R-34, R-37, Defect 5) */}
      {featuredCinema ? (
        <section aria-labelledby="cinema-map-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="cinema-map-heading" className="text-h3 font-bold text-fg">
              Vị trí rạp ({featuredCinema.name})
            </h2>
            <span className="text-body-sm text-fg-secondary">
              Bản đồ trực quan OpenStreetMap
            </span>
          </div>
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
