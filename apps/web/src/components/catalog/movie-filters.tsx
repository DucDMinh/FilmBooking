"use client";

import { AGE_RATINGS, type AgeRating } from "@filmbooking/shared";
import { FilterX, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const COMMON_GENRES = [
  "Hành động",
  "Phiêu lưu",
  "Kinh dị",
  "Hài",
  "Tình cảm",
  "Hoạt hình",
  "Khoa học viễn tưởng",
  "Tâm lý",
  "Gia đình",
  "Âm nhạc",
] as const;

export function MovieFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Đọc từ query string
  const paramQ = searchParams.get("q") ?? "";
  const paramGenre = searchParams.get("genre") ?? "";
  const paramAge = (searchParams.get("ageRating") || searchParams.get("age")) ?? "";
  const paramStatus = searchParams.get("status") ?? "";

  // Local state để nhập liệu mượt mà
  const [q, setQ] = useState(paramQ);
  const [genre, setGenre] = useState(paramGenre);
  const [ageRating, setAgeRating] = useState(paramAge);
  const [status, setStatus] = useState(paramStatus);

  // Đồng bộ lại khi searchParams thay đổi (ví dụ khi user bấm Back/Forward)
  useEffect(() => {
    setQ(paramQ);
    setGenre(paramGenre);
    setAgeRating(paramAge);
    setStatus(paramStatus);
  }, [paramQ, paramGenre, paramAge, paramStatus]);

  const hasActiveFilters = Boolean(paramQ || paramGenre || paramAge || paramStatus);

  const applyFilters = (newFilters: {
    q?: string;
    genre?: string;
    ageRating?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    const nextQ = newFilters.q !== undefined ? newFilters.q : q;
    const nextGenre = newFilters.genre !== undefined ? newFilters.genre : genre;
    const nextAge = newFilters.ageRating !== undefined ? newFilters.ageRating : ageRating;
    const nextStatus = newFilters.status !== undefined ? newFilters.status : status;

    if (nextQ.trim()) {
      params.set("q", nextQ.trim());
    } else {
      params.delete("q");
    }

    if (nextGenre) {
      params.set("genre", nextGenre);
    } else {
      params.delete("genre");
    }

    if (nextAge) {
      params.set("ageRating", nextAge);
      params.set("age", nextAge);
    } else {
      params.delete("ageRating");
      params.delete("age");
    }

    if (nextStatus) {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    applyFilters({ q, genre, ageRating, status });
  };

  const handleReset = () => {
    setQ("");
    setGenre("");
    setAgeRating("");
    setStatus("");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("genre");
    params.delete("ageRating");
    params.delete("age");
    params.delete("status");

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  return (
    <form
      role="search"
      aria-label="Bộ lọc phim"
      onSubmit={handleSubmit}
      className="rounded-lg border border-border-subtle bg-surface p-4 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tìm kiếm từ khoá */}
        <div className="space-y-1.5">
          <label htmlFor="filter-q" className="text-small font-medium text-fg-secondary">
            Từ khoá
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" aria-hidden="true" />
            <Input
              id="filter-q"
              name="q"
              type="search"
              placeholder="Tên phim..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Thể loại */}
        <div className="space-y-1.5">
          <label htmlFor="filter-genre" className="text-small font-medium text-fg-secondary">
            Thể loại
          </label>
          <select
            id="filter-genre"
            name="genre"
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              applyFilters({ genre: e.target.value });
            }}
            className="flex h-11 w-full rounded-sm border border-input bg-surface-input px-3 text-base text-foreground transition-colors duration-150 outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 md:h-10 md:text-body"
          >
            <option value="">Tất cả thể loại</option>
            {COMMON_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Độ tuổi */}
        <div className="space-y-1.5">
          <label htmlFor="filter-age" className="text-small font-medium text-fg-secondary">
            Độ tuổi
          </label>
          <select
            id="filter-age"
            name="ageRating"
            value={ageRating}
            onChange={(e) => {
              setAgeRating(e.target.value);
              applyFilters({ ageRating: e.target.value });
            }}
            className="flex h-11 w-full rounded-sm border border-input bg-surface-input px-3 text-base text-foreground transition-colors duration-150 outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 md:h-10 md:text-body"
          >
            <option value="">Tất cả độ tuổi</option>
            {AGE_RATINGS.map((rating: AgeRating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
        </div>

        {/* Trạng thái */}
        <div className="space-y-1.5">
          <label htmlFor="filter-status" className="text-small font-medium text-fg-secondary">
            Trạng thái
          </label>
          <select
            id="filter-status"
            name="status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              applyFilters({ status: e.target.value });
            }}
            className="flex h-11 w-full rounded-sm border border-input bg-surface-input px-3 text-base text-foreground transition-colors duration-150 outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 md:h-10 md:text-body"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="now_showing">Đang chiếu</option>
            <option value="coming_soon">Sắp chiếu</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <Button type="submit" variant="default" size="sm">
          <Search className="size-4 mr-1.5" aria-hidden="true" />
          Áp dụng
        </Button>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-fg-secondary hover:text-fg"
          >
            <FilterX className="size-4 mr-1.5" aria-hidden="true" />
            Xoá bộ lọc
          </Button>
        ) : null}
      </div>
    </form>
  );
}
