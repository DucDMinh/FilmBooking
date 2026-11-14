"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader, useAdminMe } from "@/components/admin/form-utils";
import { type AdminMovie, MovieForm } from "@/components/admin/movie-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { apiFetch } from "@/lib/api/client";

const NEW_ID = "moi";

/** Màn 37 — Form phim: `/admin/phim/moi` tạo mới, `/admin/phim/[id]` sửa. Chỉ Admin. */
export default function AdminMovieEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === NEW_ID;
  const { loading: meLoading, role } = useAdminMe();
  const [movie, setMovie] = useState<AdminMovie | null | undefined>(isNew ? null : undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isNew || role !== "ADMIN") return;
    // API chưa có GET /admin/movies/:id -> lấy từ danh sách admin.
    apiFetch<AdminMovie[]>("/admin/movies", { cache: "no-store" })
      .then((list) => setMovie(list.find((m) => m.id === id) ?? null))
      .catch(() => setFailed(true));
  }, [id, isNew, role]);

  if (meLoading) return <LoadingState />;
  if (role !== "ADMIN") {
    return <EmptyState title="Không có quyền" description="Chỉ quản trị viên chuỗi được quản lý phim." />;
  }
  if (failed) return <ErrorState />;
  if (movie === undefined) return <LoadingState />;
  if (!isNew && movie === null) return <EmptyState title="Không tìm thấy phim" />;

  return (
    <div>
      <PageHeader
        title={isNew ? "Thêm phim" : "Sửa phim"}
        description="Thông tin hiển thị cho khách và nhãn độ tuổi dùng để chặn đặt vé."
      />
      <MovieForm movie={movie ?? undefined} />
    </div>
  );
}
