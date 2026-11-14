"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  CINEMA_DB_STATUSES,
  type CinemaDbStatus,
  type CinemaDto,
  type ShowtimeDto,
} from "@filmbooking/shared/schemas/catalog";

export const CINEMA_STATUS_LABELS: Record<CinemaDbStatus, string> = {
  COMING_SOON: "Sắp mở",
  OPEN: "Đang hoạt động",
  TEMP_CLOSED: "Tạm đóng",
  CLOSED: "Ngừng hoạt động",
};

/** Chi tiết suất chặn đóng rạp từ API suất; lỗi thì trả rỗng và UI rơi về mã suất. */
async function loadBlockingShowtimes(cinemaId: string, ids: readonly string[]): Promise<ShowtimeDto[]> {
  try {
    const from = encodeURIComponent(new Date().toISOString());
    const all = await apiFetch<ShowtimeDto[]>(`/cinemas/${cinemaId}/showtimes?from=${from}`);
    return all.filter((showtime) => ids.includes(showtime.id));
  } catch {
    return [];
  }
}

const formatStart = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });

/** Đổi trạng thái rạp (Admin). AC-26: còn suất đã bán -> chặn, hiện danh sách + link huỷ hàng loạt. */
export function CinemaStatusDialog({
  cinema,
  open,
  onOpenChange,
  onChanged,
}: Readonly<{
  cinema: CinemaDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (status: CinemaDbStatus) => void;
}>) {
  const [status, setStatus] = useState<CinemaDbStatus>(cinema.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<string[] | null>(null);
  const [blockedShowtimes, setBlockedShowtimes] = useState<ShowtimeDto[]>([]);

  useEffect(() => {
    if (open) {
      setStatus(cinema.status);
      setError(null);
      setBlockedIds(null);
      setBlockedShowtimes([]);
    }
  }, [open, cinema.status]);

  async function submit() {
    if (!cinema.id) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/admin/cinemas/${cinema.id}/status`, { method: "PATCH", json: { status } });
      toast.success("Đã đổi trạng thái rạp");
      onChanged(status);
      onOpenChange(false);
    } catch (err) {
      const ids = err instanceof ApiError && err.code === "CONFLICT" ? err.details?.showtimeIds : undefined;
      if (Array.isArray(ids)) {
        const list = ids.filter((id): id is string => typeof id === "string");
        setBlockedIds(list);
        setBlockedShowtimes(await loadBlockingShowtimes(cinema.id, list));
      } else {
        setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    } finally {
      setSaving(false);
    }
  }

  const cancelAllHref = `/admin/lich-chieu?cinema=${cinema.id ?? ""}&cancelAll=1`;
  const rows =
    blockedShowtimes.length > 0
      ? blockedShowtimes.map((s) => ({ key: s.id, text: `${formatStart(s.startsAt)} • ${s.format}` }))
      : (blockedIds ?? []).map((id) => ({ key: id, text: `Suất ${id.slice(0, 8)}` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi trạng thái rạp</DialogTitle>
          <DialogDescription>{cinema.name}</DialogDescription>
        </DialogHeader>

        {blockedIds ? (
          <div role="alert" className="space-y-3 rounded-md border border-danger-line bg-danger-soft p-3 text-body-sm">
            <p>
              Rạp còn {blockedIds.length} suất tương lai đã bán vé. Cần huỷ các suất này (kèm email cho khách) trước
              khi đổi trạng thái. Trạng thái rạp chưa thay đổi.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {rows.map((row) => (
                <li key={row.key}>{row.text}</li>
              ))}
            </ul>
            <Button asChild variant="destructive">
              <Link href={cancelAllHref}>Huỷ hàng loạt các suất</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="cinema-status" className="text-body-sm font-semibold">
              Trạng thái mới
            </label>
            <Select value={status} onValueChange={(value) => setStatus(value as CinemaDbStatus)}>
              <SelectTrigger id="cinema-status" aria-label="Trạng thái mới">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CINEMA_DB_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CINEMA_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error ? (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {blockedIds ? null : (
            <Button onClick={submit} disabled={saving || status === cinema.status}>
              {saving ? "Đang lưu…" : "Đổi trạng thái"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
