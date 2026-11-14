"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CinemaForm, type CinemaSettings } from "@/components/admin/cinema-form";
import { PageHeader, useAdminMe } from "@/components/admin/form-utils";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AdminCinemaDto } from "@filmbooking/shared/schemas/catalog";

const NEW_ID = "moi";

interface Loaded {
  cinema: AdminCinemaDto | null;
  settings: CinemaSettings | undefined;
}

/** Màn 36 — Form rạp: `/admin/rap/moi` (Admin) tạo mới, `/admin/rap/[id]` sửa (Admin hoặc Manager của rạp đó). */
export default function AdminCinemaEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === NEW_ID;
  const { loading: meLoading, role, me } = useAdminMe();
  const [loaded, setLoaded] = useState<Loaded | undefined>(isNew ? { cinema: null, settings: undefined } : undefined);
  const [failed, setFailed] = useState(false);

  const allowed =
    role === "ADMIN" ||
    (role === "MANAGER" && !isNew && Boolean(me?.cinemas.some((c) => c.cinemaId === id && c.role === "MANAGER")));

  useEffect(() => {
    if (isNew || !allowed) return;
    // Settings lỗi = cả trang lỗi (ErrorState): không bao giờ hiện form với cấu hình rỗng để rồi ghi đè.
    Promise.all([
      apiFetch<AdminCinemaDto>(`/admin/cinemas/${id}`, { cache: "no-store" }).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
      apiFetch<CinemaSettings>(`/cinemas/${id}/settings`, { cache: "no-store" }).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return undefined;
        throw err;
      }),
    ])
      .then(([cinema, settings]) => setLoaded({ cinema, settings }))
      .catch(() => setFailed(true));
  }, [id, isNew, allowed]);

  if (meLoading) return <LoadingState />;
  if (!allowed) {
    return <EmptyState title="Không có quyền" description="Bạn không có quyền quản lý rạp này." />;
  }
  if (failed) return <ErrorState />;
  if (loaded === undefined) return <LoadingState />;
  if (!isNew && (loaded.cinema === null || loaded.settings === undefined)) {
    return <EmptyState title="Không tìm thấy rạp" description="Rạp không tồn tại hoặc bạn không có quyền xem." />;
  }

  return (
    <div>
      <PageHeader
        title={isNew ? "Thêm rạp" : "Sửa rạp"}
        description="Rạp mới xuất hiện ở trang Rạp chiếu ngay khi lưu, không cần triển khai lại."
        action={
          isNew ? null : (
            <Button asChild variant="secondary">
              <Link href={`/admin/rap/${id}/phong`}>Phòng & sơ đồ ghế</Link>
            </Button>
          )
        }
      />
      <CinemaForm role={role ?? "MANAGER"} cinema={loaded.cinema ?? undefined} settings={loaded.settings} />
    </div>
  );
}
