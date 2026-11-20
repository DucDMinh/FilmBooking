"use client";

import { vnLocalToUtc } from "@filmbooking/shared";
import type { CancelShowtimesResultDto } from "@filmbooking/shared/schemas/cancellation";
import type { MovieDto } from "@filmbooking/shared/schemas/catalog";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CancelShowtimesDialog, type CancelTarget } from "@/components/admin/cancel-showtimes-dialog";
import { SELECT_FIELD_CLASS } from "@/components/catalog/filter-field";
import type { RoomOption } from "@/components/admin/showtime-bulk-form";
import { ShowtimeCinemaGate } from "@/components/admin/showtime-page-gate";
import {
  formatVnTime,
  LANGUAGE_MODE_LABEL,
  nextDateKey,
  SHOWTIME_STATUS_LABEL,
  SHOWTIME_STATUS_TONE,
  vnDateKey,
  type ShowtimeRowDto,
} from "@/components/admin/showtime-utils";
import type { ScopedCinema } from "@/components/admin/use-showtime-cinema";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Loaded {
  rooms: RoomOption[];
  movies: MovieDto[];
  showtimes: ShowtimeRowDto[];
}

function ShowtimeSchedule({ cinema }: Readonly<{ cinema: ScopedCinema }>) {
  const cancelAll = useSearchParams().get("cancelAll") === "1";
  const [date, setDate] = useState(() => vnDateKey(new Date()));
  const [roomFilter, setRoomFilter] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<"closed" | "selected" | "all">(cancelAll ? "all" : "closed");
  const [lastResult, setLastResult] = useState<CancelShowtimesResultDto | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const from = vnLocalToUtc(date, "00:00").toISOString();
    const to = vnLocalToUtc(nextDateKey(date), "00:00").toISOString();
    const query = new URLSearchParams({ from, to });
    if (roomFilter) query.set("roomId", roomFilter);
    Promise.all([
      apiFetch<RoomOption[]>(`/cinemas/${cinema.id}/rooms`),
      apiFetch<MovieDto[]>("/movies"),
      apiFetch<ShowtimeRowDto[]>(`/cinemas/${cinema.id}/showtimes?${query.toString()}`),
    ])
      .then(([rooms, movies, showtimes]) => {
        if (!cancelled) setData({ rooms, movies, showtimes });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cinema.id, date, roomFilter, reloadKey]);

  const byRoom = useMemo(() => {
    if (!data) return [];
    return data.rooms
      .map((room) => ({ room, items: data.showtimes.filter((s) => s.roomId === room.id) }))
      .filter((group) => group.items.length > 0);
  }, [data]);

  const now = Date.now();
  const cancellable = (s: ShowtimeRowDto) => s.status !== "CANCELLED" && new Date(s.startsAt).getTime() > now;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const target: CancelTarget =
    dialog === "all" ? { allFuture: true } : { showtimeIds: [...selected] };
  const scopeLabel =
    dialog === "all" ? `Tất cả suất tương lai của rạp ${cinema.name}` : `${selected.size} suất đã chọn tại ${cinema.name}`;
  const movieTitle = (id: string) => data?.movies.find((m) => m.id === id)?.titleVi ?? "Phim";
  const q = `?cinema=${cinema.id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="sch-date">Ngày</Label>
          <Input id="sch-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sch-room">Phòng</Label>
          <select
            id="sch-room"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className={cn(SELECT_FIELD_CLASS, "w-auto min-w-auto")}
          >
            <option value="">Tất cả phòng</option>
            {data?.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="destructive" disabled={selected.size === 0} onClick={() => setDialog("selected")}>
            Huỷ {selected.size} suất đã chọn
          </Button>
          <Button variant="outline" onClick={() => setDialog("all")}>
            Huỷ tất cả suất tương lai
          </Button>
          <Button asChild variant="gradient">
            <Link href={`/admin/lich-chieu/tao${q}`}>＋ Tạo suất chiếu</Link>
          </Button>
        </div>
      </div>

      {lastResult ? (
        <div role="status" className="border border-success-line bg-success-soft p-3 text-success">
          Đã huỷ {lastResult.cancelledShowtimesCount} suất; {lastResult.affectedOrdersCount} đơn chuyển sang Bị ảnh
          hưởng, {lastResult.emailsEnqueuedCount} email đã xếp hàng gửi.{" "}
          <Link href={`/admin/don-bi-anh-huong${q}`} className="font-semibold underline">
            Xem đơn bị ảnh hưởng
          </Link>
        </div>
      ) : null}

      {failed ? <ErrorState onRetry={reload} /> : null}
      {!failed && !data ? <Skeleton className="h-40 w-full" /> : null}
      {data && byRoom.length === 0 ? (
        <EmptyState title="Không có suất chiếu" description="Chưa có suất nào trong ngày này." />
      ) : null}

      {byRoom.map(({ room, items }) => (
        <section key={room.id} aria-label={room.name} className="space-y-2">
          <h2 className="text-h3 font-bold">{room.name}</h2>
          <ul className="space-y-2">
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border border-border bg-surface p-3">
                <input
                  type="checkbox"
                  className="size-5"
                  aria-label={`Chọn suất ${formatVnTime(s.startsAt)} ${movieTitle(s.movieId)}`}
                  disabled={!cancellable(s)}
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <Link href={`/admin/lich-chieu/${s.id}${q}`} className="min-w-0 flex-1">
                  <span className="tabular font-bold">
                    {formatVnTime(s.startsAt)}-{formatVnTime(s.endsAt)}
                  </span>{" "}
                  <span className={s.status === "CANCELLED" ? "line-through" : undefined}>{movieTitle(s.movieId)}</span>
                  <span className="block text-body-sm text-fg-secondary">
                    {s.format} • {LANGUAGE_MODE_LABEL[s.languageMode] ?? s.languageMode}
                  </span>
                </Link>
                <Badge tone={SHOWTIME_STATUS_TONE[s.status]}>{SHOWTIME_STATUS_LABEL[s.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <CancelShowtimesDialog
        open={dialog !== "closed"}
        onOpenChange={(open) => !open && setDialog("closed")}
        cinemaId={cinema.id}
        cinemaCode={cinema.code}
        target={target}
        scopeLabel={scopeLabel}
        onCancelled={(result) => {
          setLastResult(result);
          setSelected(new Set());
          reload();
        }}
      />
    </div>
  );
}

export default function ShowtimesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-h2 font-bold uppercase">Lịch chiếu</h1>
      <ShowtimeCinemaGate>{(cinema) => <ShowtimeSchedule cinema={cinema} />}</ShowtimeCinemaGate>
    </div>
  );
}
