"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { type AdminMovie, MOVIE_STATUS_LABELS } from "@/components/admin/movie-form";
import { PageHeader, useAdminMe } from "@/components/admin/form-utils";
import { AgeBadge } from "@/components/common/age-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api/client";

const STATUS_TONE = { PUBLISHED: "success", DRAFT: "neutral", ARCHIVED: "warning" } as const;

const formatDate = (iso: string) => iso.split("-").reverse().join("/");

/** Màn 20 — Quản lý phim (R-41, R-42). Chỉ Admin. */
export default function AdminMoviesPage() {
  const { loading: meLoading, role } = useAdminMe();
  const [movies, setMovies] = useState<AdminMovie[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    apiFetch<AdminMovie[]>("/admin/movies", { cache: "no-store" })
      .then(setMovies)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (role === "ADMIN") load();
  }, [role, load]);

  async function toggleVisibility(movie: AdminMovie) {
    const status = movie.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await apiFetch(`/admin/movies/${movie.id}`, { method: "PATCH", json: { status } });
      setMovies((prev) => prev?.map((m) => (m.id === movie.id ? { ...m, status } : m)) ?? prev);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không đổi được trạng thái phim");
    }
  }

  if (meLoading) return <LoadingState />;
  if (role !== "ADMIN") {
    return <EmptyState title="Không có quyền" description="Chỉ quản trị viên chuỗi được quản lý phim." />;
  }

  return (
    <div>
      <PageHeader
        title="Phim"
        description="Danh mục phim toàn chuỗi: thông tin, nhãn độ tuổi, ngày khởi chiếu và trạng thái hiển thị."
        action={
          <Button asChild>
            <Link href="/admin/phim/moi">Thêm phim</Link>
          </Button>
        }
      />
      {failed ? (
        <ErrorState onRetry={load} />
      ) : movies === null ? (
        <LoadingState />
      ) : movies.length === 0 ? (
        <EmptyState title="Chưa có phim" description="Thêm phim đầu tiên để bắt đầu tạo suất chiếu." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phim</TableHead>
              <TableHead>Thể loại</TableHead>
              <TableHead>Thời lượng</TableHead>
              <TableHead>Nhãn</TableHead>
              <TableHead>Khởi chiếu</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movies.map((movie) => (
              <TableRow key={movie.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {movie.posterUrl ? (
                      <img src={movie.posterUrl} alt="" className="h-14 w-10 object-cover" />
                    ) : (
                      <span className="h-14 w-10 bg-surface-elevated" aria-hidden="true" />
                    )}
                    <div>
                      <div className="font-semibold">{movie.titleVi}</div>
                      <div className="text-small text-fg-muted">{movie.slug}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{movie.genres.join(", ") || "-"}</TableCell>
                <TableCell>{movie.durationMinutes} phút</TableCell>
                <TableCell>
                  <AgeBadge rating={movie.ageRating} />
                </TableCell>
                <TableCell>{formatDate(movie.releaseDate)}</TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[movie.status]}>{MOVIE_STATUS_LABELS[movie.status]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/admin/phim/${movie.id}`} aria-label={`Sửa phim ${movie.titleVi}`}>
                        Sửa
                      </Link>
                    </Button>
                    <Button
                      variant="ghost" className="shadow-none bg-transparent"
                      size="sm"
                      onClick={() => toggleVisibility(movie)}
                      aria-label={`${movie.status === "PUBLISHED" ? "Ẩn" : "Hiện"} phim ${movie.titleVi}`}
                    >
                      {movie.status === "PUBLISHED" ? "Ẩn" : "Hiện"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
