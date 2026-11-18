"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CINEMA_STATUS_LABELS, CinemaStatusDialog } from "@/components/admin/cinema-status-dialog";
import { PageHeader, useAdminMe } from "@/components/admin/form-utils";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { SCHEDULED_CHANGE_LABELS, formatVnShortDate } from "@/lib/cinema-schedule";
import type { AdminCinemaDto, CinemaDbStatus } from "@filmbooking/shared/schemas/catalog";

const STATUS_TONE: Record<CinemaDbStatus, "success" | "neutral" | "warning" | "danger"> = {
  OPEN: "success",
  COMING_SOON: "neutral",
  TEMP_CLOSED: "warning",
  CLOSED: "danger",
};

/**
 * Màn 19 — Quản lý rạp (R-32, R-33, R-38). Admin: toàn chuỗi + tạo rạp + hẹn đổi trạng thái (R-136);
 * Manager: chỉ rạp mình, không có nút tạo / đổi trạng thái.
 */
export default function AdminCinemasPage() {
  const { loading: meLoading, role } = useAdminMe();
  const [cinemas, setCinemas] = useState<AdminCinemaDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [statusTarget, setStatusTarget] = useState<AdminCinemaDto | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    // Mọi trạng thái; API tự giới hạn Manager về rạp mình quản lý.
    apiFetch<AdminCinemaDto[]>("/admin/cinemas", { cache: "no-store" })
      .then(setCinemas)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (role === "ADMIN" || role === "MANAGER") load();
  }, [role, load]);

  if (meLoading) return <LoadingState />;
  if (role !== "ADMIN" && role !== "MANAGER") {
    return <EmptyState title="Không có quyền" description="Chỉ Admin hoặc Quản lý rạp được xem trang này." />;
  }

  const isAdmin = role === "ADMIN";
  const visible = cinemas ?? [];

  return (
    <div>
      <PageHeader
        title="Rạp chiếu"
        description={
          isAdmin
            ? "Thêm rạp, sửa thông tin và hẹn đổi trạng thái hoạt động của từng rạp (có hiệu lực sau 7 ngày)."
            : "Thông tin và cấu hình các rạp bạn quản lý."
        }
        action={
          isAdmin ? (
            <Button asChild>
              <Link href="/admin/rap/moi">Thêm rạp</Link>
            </Button>
          ) : null
        }
      />
      {failed ? (
        <ErrorState onRetry={load} />
      ) : cinemas === null ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <EmptyState title="Chưa có rạp" description={isAdmin ? "Thêm rạp đầu tiên của chuỗi." : "Bạn chưa được gán rạp nào."} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã rạp</TableHead>
              <TableHead>Tên rạp</TableHead>
              <TableHead>Tỉnh/thành</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <TableHead>Phòng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((cinema) => (
              <TableRow key={cinema.id}>
                <TableCell className="font-semibold">{cinema.code}</TableCell>
                <TableCell>{cinema.name}</TableCell>
                <TableCell>{cinema.provinceCode ?? "—"}</TableCell>
                <TableCell>{cinema.address}</TableCell>
                <TableCell>{cinema.roomCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONE[cinema.status]}>{CINEMA_STATUS_LABELS[cinema.status]}</Badge>
                    {cinema.scheduledStatus && cinema.scheduledEffectiveAt ? (
                      <Badge tone="info">
                        {SCHEDULED_CHANGE_LABELS[cinema.scheduledStatus]}{" "}
                        {formatVnShortDate(new Date(cinema.scheduledEffectiveAt))}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/admin/rap/${cinema.id}`} aria-label={`Sửa rạp ${cinema.name}`}>
                        Sửa
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/admin/rap/${cinema.id}/phong`} aria-label={`Phòng và sơ đồ ghế rạp ${cinema.name}`}>
                        Phòng
                      </Link>
                    </Button>
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatusTarget(cinema)}
                        aria-label={`Đổi trạng thái rạp ${cinema.name}`}
                      >
                        Đổi trạng thái
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {statusTarget ? (
        <CinemaStatusDialog
          cinema={statusTarget}
          open
          onOpenChange={(open) => !open && setStatusTarget(null)}
          // Hẹn lịch KHÔNG đổi trạng thái hiện tại (R-136): chỉ cập nhật lịch đang chờ.
          onChanged={({ status, scheduledStatus, scheduledEffectiveAt }) => {
            setCinemas(
              (prev) =>
                prev?.map((c) =>
                  c.id === statusTarget.id ? { ...c, status, scheduledStatus, scheduledEffectiveAt } : c,
                ) ?? prev,
            );
          }}
        />
      ) : null}
    </div>
  );
}
