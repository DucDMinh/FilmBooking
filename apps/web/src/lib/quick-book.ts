import type { ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { formatVnTime, generateNext7Days, isShowtimeOnlineClosed } from "@/components/catalog/showtime-schedule";
import { getVnDateString } from "@/lib/vn-date";

/**
 * Logic thuần của thanh "Đặt vé nhanh" (R-138). Nguồn dữ liệu và điều kiện lọc = lịch chiếu R-44
 * (GET /cinemas/:code?date=), chỉ khác: suất "Ngừng bán online" (R-67) không được liệt kê.
 * Server vẫn là nơi quyết định cuối khi vào màn chọn ghế.
 */

export interface QuickBookShowtime extends ShowtimeDto {
  movie: { slug: string; titleVi: string };
}

export interface QuickBookOption {
  value: string;
  label: string;
}

export interface QuickBookSelection {
  cinema: string;
  movie: string;
  /** YYYY-MM-DD theo giờ Việt Nam. */
  date: string;
  showtimeId: string;
}

export const EMPTY_SELECTION: QuickBookSelection = { cinema: "", movie: "", date: "", showtimeId: "" };

export type QuickBookField = keyof QuickBookSelection;

/** Thứ tự ô theo R-138: đổi ô đứng trước thì mọi ô đứng sau bị đặt lại. */
const FIELD_ORDER: readonly QuickBookField[] = ["cinema", "movie", "date", "showtimeId"];

const FIELD_LABELS: Record<QuickBookField, string> = {
  cinema: "Rạp",
  movie: "Phim",
  date: "Ngày",
  showtimeId: "Giờ chiếu",
};

const LANGUAGE_MODE_LABELS: Record<string, string> = {
  SUBTITLED: "Phụ đề",
  DUBBED: "Lồng tiếng",
  ORIGINAL: "Bản gốc",
};

/** Cùng mốc đóng bán mặc định với lịch chiếu R-44 (chưa có cấu hình rạp công khai). */
const DEFAULT_ONLINE_CUTOFF_MINUTES = 15;

/** Đổi một ô, các ô đứng sau về rỗng. */
export function applyFieldChange(
  selection: QuickBookSelection,
  field: QuickBookField,
  value: string,
): QuickBookSelection {
  const next = { ...selection };
  const changedAt = FIELD_ORDER.indexOf(field);
  FIELD_ORDER.forEach((key, index) => {
    if (index === changedAt) next[key] = value;
    else if (index > changedAt) next[key] = "";
  });
  return next;
}

/** Suất còn bán online: chưa huỷ/ngừng bán và chưa quá mốc đóng bán (cùng hàm kiểm với lịch chiếu R-44). */
export function sellableShowtimes(showtimes: readonly QuickBookShowtime[], now: Date): QuickBookShowtime[] {
  return showtimes.filter(
    (showtime) => !isShowtimeOnlineClosed(showtime.startsAt, showtime.status, DEFAULT_ONLINE_CUTOFF_MINUTES, now),
  );
}

/** Phim có ít nhất một suất bán được, theo thứ tự xuất hiện sớm nhất. */
export function movieOptions(sellable: readonly QuickBookShowtime[]): QuickBookOption[] {
  const seen = new Map<string, QuickBookOption>();
  for (const showtime of sellable) {
    if (!seen.has(showtime.movie.slug)) {
      seen.set(showtime.movie.slug, { value: showtime.movie.slug, label: showtime.movie.titleVi });
    }
  }
  return [...seen.values()];
}

/** 7 ngày tới (R-44) mà phim đã chọn còn suất bán được. */
export function dateOptions(
  sellable: readonly QuickBookShowtime[],
  movieSlug: string,
  now: Date,
): QuickBookOption[] {
  if (!movieSlug) return [];
  const datesWithShowtime = new Set(
    sellable
      .filter((showtime) => showtime.movie.slug === movieSlug)
      .map((showtime) => getVnDateString(new Date(showtime.startsAt))),
  );
  return generateNext7Days(now)
    .filter((day) => datesWithShowtime.has(day.dateString))
    .map((day) => ({ value: day.dateString, label: `${day.label} ${day.subLabel}` }));
}

/** Giờ chiếu của phim trong ngày đã chọn; giá trị là id suất để điều hướng thẳng. */
export function timeOptions(
  sellable: readonly QuickBookShowtime[],
  movieSlug: string,
  date: string,
): QuickBookOption[] {
  if (!movieSlug || !date) return [];
  return sellable
    .filter(
      (showtime) =>
        showtime.movie.slug === movieSlug && getVnDateString(new Date(showtime.startsAt)) === date,
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((showtime) => ({
      value: showtime.id,
      label: `${formatVnTime(showtime.startsAt)} · ${showtime.format} ${LANGUAGE_MODE_LABELS[showtime.languageMode] ?? showtime.languageMode}`,
    }));
}

export type QuickBookResult = { ok: true; href: string } | { ok: false; missing: string[] };

/** Đủ 4 ô thì trả đường dẫn màn chọn ghế của đúng suất (R-59); thiếu ô nào liệt kê tên ô đó. */
export function resolveSelection(selection: QuickBookSelection): QuickBookResult {
  const missing = FIELD_ORDER.filter((field) => !selection[field]).map((field) => FIELD_LABELS[field]);
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, href: `/dat-ve/${encodeURIComponent(selection.showtimeId)}` };
}

export function missingFieldsMessage(missing: readonly string[]): string {
  return `Vui lòng chọn: ${missing.join(", ")}`;
}

interface CinemaDetailResponse {
  cinema?: { status?: string };
  showtimes?: Array<ShowtimeDto & { movie: { slug: string; titleVi: string } }>;
}

/**
 * Lấy suất của một rạp trong 7 ngày tới bằng đúng endpoint lịch chiếu R-44 (mỗi ngày một lệnh gọi, chạy song song).
 * Một ngày lỗi thì bỏ ngày đó, không làm hỏng cả thanh. Rạp không còn hoạt động (R-137) không có suất.
 */
export async function loadCinemaShowtimes(
  cinemaCode: string,
  now: Date,
  fetchJson: (path: string) => Promise<unknown>,
): Promise<QuickBookShowtime[]> {
  const results = await Promise.allSettled(
    generateNext7Days(now).map(
      (day) => fetchJson(`/cinemas/${encodeURIComponent(cinemaCode)}?date=${day.dateString}`) as Promise<CinemaDetailResponse>,
    ),
  );
  const byId = new Map<string, QuickBookShowtime>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const detail = result.value;
    if (!detail || detail.cinema?.status !== "OPEN" || !Array.isArray(detail.showtimes)) continue;
    for (const showtime of detail.showtimes) {
      byId.set(showtime.id, {
        id: showtime.id,
        roomId: showtime.roomId,
        startsAt: showtime.startsAt,
        endsAt: showtime.endsAt,
        format: showtime.format,
        languageMode: showtime.languageMode,
        status: showtime.status,
        movie: { slug: showtime.movie.slug, titleVi: showtime.movie.titleVi },
      });
    }
  }
  return [...byId.values()];
}
