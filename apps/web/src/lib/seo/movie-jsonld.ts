import type { MovieDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";

export interface ScreeningEventJsonLd {
  "@type": "ScreeningEvent";
  startDate: string;
  endDate: string;
  eventStatus: "https://schema.org/EventScheduled";
  location: {
    "@type": "MovieTheater";
    name: string;
  };
  videoFormat?: string;
  subtitleLanguage?: string;
}

export interface MovieJsonLd {
  "@context": "https://schema.org";
  "@type": "Movie";
  name: string;
  alternateName?: string;
  image?: string[];
  description?: string;
  duration?: string;
  genre?: string[];
  datePublished?: string;
  director?: {
    "@type": "Person";
    name: string;
  };
  actor?: Array<{
    "@type": "Person";
    name: string;
  }>;
  inLanguage?: string;
  contentRating?: string;
  event?: ScreeningEventJsonLd[];
}

export interface CinemaGroupSchedule {
  cinema: {
    code: string;
    name: string;
  };
  showtimes: ShowtimeDto[];
}

/**
 * Tạo dữ liệu có cấu trúc Schema.org dạng Movie kèm các ScreeningEvent
 * cho các suất chiếu đang mở bán (không huỷ, không đóng bán).
 */
export function buildMovieJsonLd(
  movie: MovieDto,
  schedules?: CinemaGroupSchedule[],
): MovieJsonLd {
  const events: ScreeningEventJsonLd[] = [];

  if (schedules && schedules.length > 0) {
    for (const group of schedules) {
      for (const st of group.showtimes) {
        // Chỉ đưa vào JSON-LD các suất chiếu không bị huỷ hoặc đóng bán
        if (st.status === "CANCELLED" || st.status === "CLOSED") {
          continue;
        }

        events.push({
          "@type": "ScreeningEvent",
          startDate: st.startsAt,
          endDate: st.endsAt,
          eventStatus: "https://schema.org/EventScheduled",
          location: {
            "@type": "MovieTheater",
            name: group.cinema.name,
          },
          videoFormat: st.format,
          subtitleLanguage: st.languageMode,
        });
      }
    }
  }

  const jsonLd: MovieJsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.titleVi,
    alternateName: movie.titleOriginal ?? undefined,
    image: movie.posterUrl ? [movie.posterUrl] : undefined,
    description: movie.description ?? undefined,
    duration: movie.durationMinutes > 0 ? `PT${movie.durationMinutes}M` : undefined,
    genre: movie.genres.length > 0 ? movie.genres : undefined,
    datePublished: movie.releaseDate,
    director: movie.director ? { "@type": "Person", "name": movie.director } : undefined,
    actor:
      movie.cast && movie.cast.length > 0
        ? movie.cast.map((name) => ({ "@type": "Person", name }))
        : undefined,
    inLanguage: movie.originalLanguage ?? undefined,
    contentRating: movie.ageRating,
    event: events.length > 0 ? events : undefined,
  };

  return jsonLd;
}

/**
 * Serialize an toàn JSON-LD chống tấn công XSS khi nhúng vào thẻ <script>.
 * Thoát ký tự `<` thành `\u003c` để ngăn chặn đóng thẻ `</script>`.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
