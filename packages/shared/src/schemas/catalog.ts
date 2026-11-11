import { z } from "zod";
import { AGE_RATINGS } from "../enums";

/**
 * Schema catalog dùng chung api/web. Giá trị enum khớp enum Postgres (migration catalog):
 * trạng thái rạp/phim viết HOA, khác `CINEMA_STATUSES` kiểu cũ trong enums.ts.
 */

export const CINEMA_DB_STATUSES = ["COMING_SOON", "OPEN", "TEMP_CLOSED", "CLOSED"] as const;
export const MOVIE_DB_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
/** Trạng thái hiển thị cho khách (quyết định #13). */
export const MOVIE_AVAILABILITIES = ["now_showing", "coming_soon"] as const;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const provinceCode = z.string().regex(/^[A-Z0-9_]{2,20}$/);
const urlOrNull = z.url().nullable();
const textList = z.array(z.string().trim().min(1).max(100)).max(50);

export const cinemaStatusSchema = z.enum(CINEMA_DB_STATUSES);
export const movieStatusSchema = z.enum(MOVIE_DB_STATUSES);
export const movieAvailabilitySchema = z.enum(MOVIE_AVAILABILITIES);
export const ageRatingSchema = z.enum(AGE_RATINGS);

// ── Query (công khai) ─────────────────────────────────────────────
export const listCinemasQuerySchema = z.object({ province: provinceCode.optional() });
export const cinemaDetailQuerySchema = z.object({ date: localDate.optional() });
export const homeQuerySchema = z.object({ province: provinceCode.optional() });
export const listMoviesQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  genre: z.string().trim().min(1).max(50).optional(),
  age: ageRatingSchema.optional(),
  status: movieAvailabilitySchema.optional(),
  province: provinceCode.optional(),
});
export const movieDetailQuerySchema = z.object({
  date: localDate.optional(),
  province: provinceCode.optional(),
});

// ── Body (quản lý) ────────────────────────────────────────────────
const cinemaCode = z.string().regex(/^[A-Z0-9]{2,10}$/);
const cinemaInfoFields = {
  name: z.string().trim().min(1).max(150),
  district: z.string().trim().min(1).max(100).nullable(),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  hotline: z.string().trim().min(1).max(30).nullable(),
  email: z.email().nullable(),
  openingHours: z.string().trim().min(1).max(200).nullable(),
  imageUrl: urlOrNull,
  amenities: textList,
};
const cinemaAdminFields = {
  code: cinemaCode,
  provinceCode,
  status: cinemaStatusSchema,
  cleaningMinutes: z.number().int().min(0).max(240).nullable(),
  onlineCutoffMinutes: z.number().int().min(0).max(1440).nullable(),
};

/** Admin tạo rạp: thêm rạp = INSERT một dòng (R-38). */
export const createCinemaSchema = z.object({
  ...cinemaAdminFields,
  ...cinemaInfoFields,
  status: cinemaAdminFields.status.default("OPEN"),
  cleaningMinutes: cinemaAdminFields.cleaningMinutes.default(null),
  onlineCutoffMinutes: cinemaAdminFields.onlineCutoffMinutes.default(null),
  district: cinemaInfoFields.district.default(null),
  latitude: cinemaInfoFields.latitude.default(null),
  longitude: cinemaInfoFields.longitude.default(null),
  hotline: cinemaInfoFields.hotline.default(null),
  email: cinemaInfoFields.email.default(null),
  openingHours: cinemaInfoFields.openingHours.default(null),
  imageUrl: cinemaInfoFields.imageUrl.default(null),
  amenities: cinemaInfoFields.amenities.default([]),
});

/** Các trường chỉ Admin được đổi; Manager chỉ sửa thông tin rạp mình. */
export const CINEMA_ADMIN_ONLY_FIELDS = [
  "code",
  "provinceCode",
  "status",
  "cleaningMinutes",
  "onlineCutoffMinutes",
] as const;

export const updateCinemaSchema = z
  .object({ ...cinemaAdminFields, ...cinemaInfoFields })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });

const movieFields = {
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120),
  titleVi: z.string().trim().min(1).max(200),
  titleOriginal: z.string().trim().min(1).max(200).nullable(),
  posterUrl: urlOrNull,
  bannerUrl: urlOrNull,
  trailerUrl: urlOrNull,
  description: z.string().trim().min(1).max(5000).nullable(),
  genres: textList,
  durationMinutes: z.number().int().min(1).max(600),
  director: z.string().trim().min(1).max(200).nullable(),
  cast: textList,
  country: z.string().trim().min(1).max(100).nullable(),
  originalLanguage: z.string().trim().min(1).max(100).nullable(),
  subtitleLanguages: textList,
  dubbedLanguages: textList,
  releaseDate: localDate,
  ageRating: ageRatingSchema,
  status: movieStatusSchema,
};

export const createMovieSchema = z.object({
  ...movieFields,
  titleOriginal: movieFields.titleOriginal.default(null),
  posterUrl: movieFields.posterUrl.default(null),
  bannerUrl: movieFields.bannerUrl.default(null),
  trailerUrl: movieFields.trailerUrl.default(null),
  description: movieFields.description.default(null),
  genres: movieFields.genres.default([]),
  director: movieFields.director.default(null),
  cast: movieFields.cast.default([]),
  country: movieFields.country.default(null),
  originalLanguage: movieFields.originalLanguage.default(null),
  subtitleLanguages: movieFields.subtitleLanguages.default([]),
  dubbedLanguages: movieFields.dubbedLanguages.default([]),
  status: movieFields.status.default("DRAFT"),
});

export const updateMovieSchema = z
  .object(movieFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });

export const idParamSchema = z.guid();
export const codeParamSchema = cinemaCode;
export const slugParamSchema = movieFields.slug;

// ── Kiểu trả về (thời gian UTC ISO; catalog không chứa tiền) ───────
export type CreateCinemaInput = z.output<typeof createCinemaSchema>;
export type UpdateCinemaInput = z.output<typeof updateCinemaSchema>;
export type CreateMovieInput = z.output<typeof createMovieSchema>;
export type UpdateMovieInput = z.output<typeof updateMovieSchema>;
export type MovieAvailability = z.output<typeof movieAvailabilitySchema>;
export type CinemaDbStatus = z.output<typeof cinemaStatusSchema>;

export interface ProvinceDto {
  code: string;
  name: string;
}

export interface CinemaDto {
  code: string;
  name: string;
  provinceCode: string | null;
  district: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hotline: string | null;
  email: string | null;
  openingHours: string | null;
  imageUrl: string | null;
  amenities: string[];
  status: CinemaDbStatus;
}

export interface MovieDto {
  id: string;
  slug: string;
  titleVi: string;
  titleOriginal: string | null;
  posterUrl: string | null;
  bannerUrl: string | null;
  trailerUrl: string | null;
  description: string | null;
  genres: string[];
  durationMinutes: number;
  director: string | null;
  cast: string[];
  country: string | null;
  originalLanguage: string | null;
  subtitleLanguages: string[];
  dubbedLanguages: string[];
  releaseDate: string;
  ageRating: z.output<typeof ageRatingSchema>;
  /** null = phim đã hết chiếu hoặc chưa phân loại được. */
  availability: MovieAvailability | null;
}

export interface ShowtimeDto {
  id: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  format: string;
  languageMode: string;
  status: string;
}
