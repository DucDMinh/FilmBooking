import type { MovieDto } from "@filmbooking/shared/schemas/catalog";
import { Calendar, Film } from "lucide-react";
import Link from "next/link";

import { AgeBadge } from "@/components/common/age-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function MovieCard({ movie, variant = "grid", className }: Readonly<MovieCardProps>) {
  const isComingSoon = movie.availability === "coming_soon";
  const movieHref = `/phim/${movie.slug}`;
  const bookingHref = `/phim/${movie.slug}#lich-chieu`;
  const genresText = movie.genres && movie.genres.length > 0 ? movie.genres.slice(0, 2).join(", ") : null;

  if (variant === "row") {
    return (
      <article
        data-testid={`movie-card-${movie.slug}`}
        className={cn(
          "group flex flex-col sm:flex-row gap-4 rounded-lg border border-border-subtle bg-surface p-4 transition-colors hover:border-brand/40",
          className,
        )}
      >
        <Link
          href={movieHref}
          className="relative aspect-[2/3] w-full sm:w-32 shrink-0 overflow-hidden rounded-md bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={`Poster phim ${movie.titleVi}`}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-fg-muted">
              <Film className="size-8" aria-hidden="true" />
            </div>
          )}
          <div className="absolute top-2 left-2 z-10">
            <AgeBadge rating={movie.ageRating} tone="semantic" />
          </div>
        </Link>

        <div className="flex flex-1 flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-caption font-semibold tracking-wide uppercase text-brand">
              {isComingSoon ? "Sắp chiếu" : "Đang chiếu"}
            </div>
            <h3 className="text-body font-bold text-fg transition-colors group-hover:text-brand">
              <Link href={movieHref} className="hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                {movie.titleVi}
              </Link>
            </h3>
            {movie.titleOriginal ? (
              <p className="text-small text-fg-muted italic">{movie.titleOriginal}</p>
            ) : null}
            <p className="text-small text-fg-secondary">
              {movie.durationMinutes} phút {genresText ? `• ${genresText}` : ""}
            </p>
          </div>

          <div className="pt-2">
            {isComingSoon ? (
              <div className="flex items-center gap-1.5 text-body-sm font-medium text-warning">
                <Calendar className="size-4 shrink-0" aria-hidden="true" />
                <span>Khởi chiếu {formatReleaseDate(movie.releaseDate)}</span>
              </div>
            ) : (
              <Button asChild variant="gradient" size="sm">
                <Link href={bookingHref}>Đặt vé</Link>
              </Button>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-testid={`movie-card-${movie.slug}`}
      className={cn(
        "group flex flex-col justify-between overflow-hidden rounded-lg border border-border-subtle bg-surface transition-colors hover:border-brand/40",
        className,
      )}
    >
      <div className="space-y-3">
        <Link
          href={movieHref}
          className="relative block aspect-[2/3] w-full overflow-hidden bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={`Poster phim ${movie.titleVi}`}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-fg-muted">
              <Film className="size-10" aria-hidden="true" />
            </div>
          )}
          <div className="absolute top-2.5 left-2.5 z-10">
            <AgeBadge rating={movie.ageRating} tone="semantic" />
          </div>
          <div className="absolute top-2.5 right-2.5 z-10 rounded-pill bg-bg/80 px-2 py-0.5 text-caption font-semibold tracking-wide uppercase text-fg backdrop-blur-xs">
            {isComingSoon ? "Sắp chiếu" : "Đang chiếu"}
          </div>
        </Link>

        <div className="space-y-1 px-3">
          <h3 className="line-clamp-2 text-body font-bold text-fg transition-colors group-hover:text-brand">
            <Link href={movieHref} className="hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              {movie.titleVi}
            </Link>
          </h3>
          <p className="text-small text-fg-secondary">
            {movie.durationMinutes} phút {genresText ? `• ${genresText}` : ""}
          </p>
        </div>
      </div>

      <div className="p-3 pt-2">
        {isComingSoon ? (
          <div className="flex min-h-11 items-center justify-center rounded-md border border-border-subtle bg-surface-control/40 px-3 text-center text-small font-medium text-warning">
            Khởi chiếu {formatReleaseDate(movie.releaseDate)}
          </div>
        ) : (
          <Button asChild variant="gradient" className="w-full">
            <Link href={bookingHref}>Đặt vé</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
