import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Film } from "lucide-react";

import { MovieCard } from "@/components/catalog/movie-card";
import { MovieFilters } from "@/components/catalog/movie-filters";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { MovieDto } from "@filmbooking/shared/schemas/catalog";

export const metadata: Metadata = {
  title: "Danh sách & tìm kiếm phim – CINEMO",
  description:
    "Tra cứu lịch chiếu, thể loại, thông tin các bộ phim hot nhất đang và sắp chiếu tại cụm rạp CINEMO trên toàn quốc.",
};

interface MoviesPageProps {
  searchParams?: Promise<{
    q?: string;
    genre?: string;
    ageRating?: string;
    age?: string;
    status?: string;
    province?: string;
  }>;
}

export default async function MoviesPage(props: MoviesPageProps) {
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const cookieStore = await cookies();
  const provinceFromCookie = cookieStore.get("fb_province")?.value;
  const province = resolvedSearchParams.province || provinceFromCookie || undefined;

  const q = resolvedSearchParams.q?.trim() || undefined;
  const genre = resolvedSearchParams.genre?.trim() || undefined;
  const age = resolvedSearchParams.ageRating || resolvedSearchParams.age || undefined;
  const status = resolvedSearchParams.status || undefined;

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (genre) query.set("genre", genre);
  if (age) query.set("age", age);
  if (status) query.set("status", status);
  if (province) query.set("province", province);

  const queryString = query.toString();
  const movies = await apiFetch<MovieDto[]>(`/movies${queryString ? `?${queryString}` : ""}`).catch(
    () => [],
  );

  const hasFilter = Boolean(q || genre || age || status);

  return (
    <div className="space-y-8">
      {/* Header trang */}
      <div className="space-y-2 border-b border-border pb-6">
        <h1 className="text-h1 font-bold text-fg">Khám phá phim chiếu rạp</h1>
        <p className="text-body text-fg-secondary max-w-2xl">
          Tìm kiếm những bộ phim bom tấn đỉnh cao đang và sắp chiếu tại các cụm rạp CINEMO trên toàn quốc.
        </p>
      </div>

      {/* Bộ lọc phim */}
      <MovieFilters />

      {/* Kết quả tìm kiếm / Danh sách */}
      <section aria-label="Kết quả tìm kiếm phim" className="space-y-4">
        <div className="flex items-center justify-between text-body-sm text-fg-secondary">
          <span>
            Tìm thấy <strong className="text-fg font-semibold">{movies.length}</strong> bộ phim
            {hasFilter ? " theo bộ lọc" : ""}
          </span>
        </div>

        {movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {movies.map((movie: MovieDto) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Không tìm thấy phim phù hợp"
            description="Không có bộ phim nào khớp với các tiêu chí tìm kiếm của bạn. Hãy thử thay đổi từ khoá hoặc điều chỉnh lại bộ lọc."
            icon={Film}
            action={
              <Button asChild variant="secondary">
                <Link href="/phim">Xoá bộ lọc tìm kiếm</Link>
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
