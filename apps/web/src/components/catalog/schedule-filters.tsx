"use client";

import { usePathname, useRouter } from "next/navigation";
import { FIELD_CLASS, FIELD_LABEL_CLASS } from "@/components/catalog/filter-field";
import { ScheduleDateStrip } from "@/components/catalog/showtime-schedule";

/** Giá trị bộ lọc hiện tại, lấy từ URL ở server page rồi truyền xuống (không cần useSearchParams/Suspense). */
export interface ScheduleFilterValues {
  province: string;
  movie: string;
  cinema: string;
  date: string;
}

interface ScheduleFiltersProps {
  provinces: Array<{ code: string; name: string }>;
  movies: Array<{ slug: string; titleVi: string; ageRating: string }>;
  cinemas: Array<{ code: string; name: string }>;
  values: ScheduleFilterValues;
}

const SELECT_CLASS = FIELD_CLASS;
const LABEL_CLASS = FIELD_LABEL_CLASS;

/** Dựng URL mới: ghi đè các tham số trong `patch`, tham số rỗng bị xoá khỏi query. */
function buildHref(pathname: string, values: ScheduleFilterValues, patch: Partial<ScheduleFilterValues>): string {
  const next = { ...values, ...patch };
  const params = new URLSearchParams();
  for (const key of ["province", "movie", "cinema", "date"] as const) {
    if (next[key]) params.set(key, next[key]);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function ScheduleFilters({ provinces, movies, cinemas, values }: Readonly<ScheduleFiltersProps>) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="frame">
    <div className="frame-in grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3">
      <div className="min-w-0 space-y-1.5">
        <label htmlFor="filter-province" className={LABEL_CLASS}>
          Khu vực
        </label>
        <select
          id="filter-province"
          value={values.province}
          // Rạp phụ thuộc tỉnh nên đổi tỉnh thì bỏ rạp đang chọn
          onChange={(e) => router.push(buildHref(pathname, values, { province: e.target.value, cinema: "" }))}
          className={SELECT_CLASS}
        >
          <option value="">Tất cả tỉnh/thành</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0 space-y-1.5">
        <label htmlFor="filter-movie" className={LABEL_CLASS}>
          Chọn phim
        </label>
        <select
          id="filter-movie"
          value={values.movie}
          onChange={(e) => router.push(buildHref(pathname, values, { movie: e.target.value }))}
          className={SELECT_CLASS}
        >
          <option value="">-- Tất cả phim đang chiếu --</option>
          {movies.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.titleVi} ({m.ageRating})
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0 space-y-1.5 sm:col-span-2 md:col-span-1">
        <label htmlFor="filter-cinema" className={LABEL_CLASS}>
          Chọn rạp
        </label>
        <select
          id="filter-cinema"
          value={values.cinema}
          onChange={(e) => router.push(buildHref(pathname, values, { cinema: e.target.value }))}
          className={SELECT_CLASS}
        >
          <option value="">-- Tất cả rạp --</option>
          {cinemas.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
    </div>
  );
}

/** Dải 7 ngày dùng chung cho cả trang: chọn ngày → đổi ?date= và giữ các bộ lọc khác. */
export function ScheduleDateNav({ values, now }: Readonly<{ values: ScheduleFilterValues; now?: Date }>) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <ScheduleDateStrip
      selectedDate={values.date}
      onSelect={(date) => router.push(buildHref(pathname, values, { date }))}
      // Trang /lich-chieu: bộ lọc xếp chồng ở mobile đẩy dải ngày xuống dưới vạch inset đáy; điều khiển phải hiện ngay lúc vào trang (NFR-19).
      className="scrub-inset-0"
      now={now}
    />
  );
}
