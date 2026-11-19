import type { MovieDto } from "@filmbooking/shared/schemas/catalog";
import { Calendar, Film } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AgeBadge } from "@/components/common/age-badge";
import { RemoteImage } from "@/components/common/remote-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import styles from "./movie-card.module.css";

export interface MovieCardProps {
  movie: MovieDto;
  variant?: "grid" | "row";
  className?: string;
}

function formatReleaseDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-");
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  } catch {
    // fallback
  }
  return dateStr;
}

/** Lưới phim 4 / 3 / 2 cột; MovieCard con trực tiếp tự lệch pha theo cột (movie-card.module.css). */
export function MovieGrid({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn(styles.grid, className)}>{children}</div>;
}

function Poster({ movie, sizes }: Readonly<{ movie: MovieDto; sizes: string }>) {
  if (!movie.posterUrl) {
    return (
      <div className="flex size-full items-center justify-center text-fg-muted">
        <Film className="size-10" aria-hidden="true" />
      </div>
    );
  }
  return (
    <RemoteImage
      src={movie.posterUrl}
      alt={`Poster phim ${movie.titleVi}`}
      sizes={sizes}
      className={cn("size-full object-cover", styles.poster)}
    />
  );
}

/** Chữ khởi chiếu của phim sắp chiếu (R-45): chỉ thông tin, không có CTA đặt vé. */
function ComingSoonDate({ movie }: Readonly<{ movie: MovieDto }>) {
  return (
    <div className="flex items-center gap-1.5 text-body-sm font-medium text-warning">
      <Calendar className="size-4 shrink-0" aria-hidden="true" />
      <span>Khởi chiếu {formatReleaseDate(movie.releaseDate)}</span>
    </div>
  );
}

function genresOf(movie: MovieDto): string | null {
  return movie.genres && movie.genres.length > 0 ? movie.genres.slice(0, 2).join(", ") : null;
}

function RowCard({ movie, className }: Readonly<{ movie: MovieDto; className?: string }>) {
  const isComingSoon = movie.availability === "coming_soon";
  const movieHref = `/phim/${movie.slug}`;
  const genresText = genresOf(movie);

  return (
    <article data-testid={`movie-card-${movie.slug}`} className={cn("frame group", className)}>
      <div className="frame-in flex flex-col gap-4 p-4 sm:flex-row">
        <Link
          href={movieHref}
          className="chamfer-sm relative aspect-[2/3] w-full shrink-0 overflow-hidden bg-surface-elevated outline-hidden focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)] sm:w-32"
        >
          <Poster movie={movie} sizes="(min-width: 640px) 200px, 50vw" />
          <div className="absolute top-2 left-2 z-10">
            <AgeBadge rating={movie.ageRating} tone="semantic" />
          </div>
        </Link>

        <div className="flex flex-1 flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <p className="hud hud-brand">{isComingSoon ? "Sắp chiếu" : "Đang chiếu"}</p>
            <h3 className="font-heading text-h3 font-bold uppercase text-fg transition-colors group-hover:text-brand">
              <Link href={movieHref} className="hover:underline">
                {movie.titleVi}
              </Link>
            </h3>
            {movie.titleOriginal ? <p className="text-small text-fg-muted italic">{movie.titleOriginal}</p> : null}
            <p className="text-small text-fg-secondary">
              {movie.durationMinutes} phút {genresText ? `• ${genresText}` : ""}
            </p>
          </div>

          <div className="pt-2">
            {isComingSoon ? (
              <ComingSoonDate movie={movie} />
            ) : (
              <Button asChild variant="gradient" size="sm">
                <Link href={`${movieHref}#lich-chieu`}>Đặt vé</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Thẻ phim CYBERPLEX (design-spec §16.3): khung chamfer viền gradient, poster phóng nhẹ khi hover/focus, thanh CTA
 * "Đặt vé" trượt lên đáy poster (luôn hiện ở thiết bị không hover). Phim sắp chiếu KHÔNG có CTA (R-45).
 * AgeBadge giữ góc trên-trái poster (R-42); nhãn trạng thái đặt dưới ảnh, không đè ảnh.
 * Chuyển động: tia vàng quét từ trên xuống mở poster, lệch pha theo cột (nhóm B).
 */
export function MovieCard({ movie, variant = "grid", className }: Readonly<MovieCardProps>) {
  if (variant === "row") return <RowCard movie={movie} className={className} />;

  const isComingSoon = movie.availability === "coming_soon";
  const movieHref = `/phim/${movie.slug}`;
  const genresText = genresOf(movie);

  return (
    <article data-testid={`movie-card-${movie.slug}`} data-scrub="beam" className={cn(styles.card, className)}>
      <div className={cn("frame", styles.frame)}>
        <div className="frame-in flex h-full flex-col">
          <div data-scrub-media="" className="relative overflow-hidden">
            <div className="relative aspect-[2/3] w-full overflow-hidden bg-surface-elevated">
              <Link
                href={movieHref}
                aria-label={`Poster phim ${movie.titleVi}`}
                tabIndex={-1}
                className="absolute inset-0 block outline-hidden"
              >
                <Poster movie={movie} sizes="(min-width: 1024px) 300px, (min-width: 560px) 33vw, 50vw" />
              </Link>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,var(--color-bg)_4%,color-mix(in_srgb,var(--color-bg)_72%,transparent)_26%,transparent_62%)]"
              />
              <div className="absolute top-3 left-3 z-10">
                <AgeBadge rating={movie.ageRating} tone="semantic" />
              </div>
              <h3 className="pointer-events-none absolute right-3 bottom-3 left-3 z-[1] line-clamp-3 font-heading text-[15px] leading-[1.15] font-bold uppercase text-fg sm:text-[20px]">
                <Link
                  href={movieHref}
                  className="pointer-events-auto outline-hidden hover:text-brand focus-visible:text-brand focus-visible:underline"
                >
                  {movie.titleVi}
                </Link>
              </h3>
              <span data-scrub-beam="" className="scrub-beam" aria-hidden="true" />
            </div>
            {isComingSoon ? null : (
              <div className={styles.cta}>
                <Button asChild variant="gradient" className="w-full">
                  <Link href={`${movieHref}#lich-chieu`}>Đặt vé</Link>
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between gap-2 border-t border-border px-3 py-3 sm:px-4 sm:pb-4">
            <p className="text-small text-fg-secondary">
              {movie.durationMinutes} phút {genresText ? `• ${genresText}` : ""}
            </p>
            {isComingSoon ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">Sắp chiếu</Badge>
                <ComingSoonDate movie={movie} />
              </div>
            ) : (
              <div>
                <Badge tone="brand">Đang chiếu</Badge>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
