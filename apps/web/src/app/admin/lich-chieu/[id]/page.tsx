"use client";

import { vnLocalToUtc, toVnParts } from "@filmbooking/shared";
import type { SeatMapItem, SeatMapResponse } from "@filmbooking/shared/schemas/booking";
import type { CancelShowtimesResultDto } from "@filmbooking/shared/schemas/cancellation";
import type { MovieDto } from "@filmbooking/shared/schemas/catalog";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CancelShowtimesDialog } from "@/components/admin/cancel-showtimes-dialog";
import { SeatLockPanel } from "@/components/admin/seat-lock-panel";
import type { RoomOption } from "@/components/admin/showtime-bulk-form";
import {
  formatVnDate,
  formatVnTime,
  hasSoldSeats,
  SHOWTIME_STATUS_LABEL,
  SHOWTIME_STATUS_TONE,
  SOLD_LOCK_REASON,
  vnDateKey,
  overlapConflicts,
  type ShowtimeRowDto,
} from "@/components/admin/showtime-utils";
import { ConflictList } from "@/components/admin/showtime-bulk-form";
import { ShowtimeCinemaGate } from "@/components/admin/showtime-page-gate";
import type { ScopedCinema } from "@/components/admin/use-showtime-cinema";
import { ErrorState } from "@/components/common/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/client";

interface Loaded {
  showtime: ShowtimeRowDto;
  /** Rỗng khi suất đã huỷ hoặc seatmap công khai không phục vụ (rạp đóng, phim lưu trữ). */
  seats: SeatMapItem[];
  seatsAvailable: boolean;
  rooms: RoomOption[];
  movies: MovieDto[];
  cinema: ScopedCinema;
}

type Confirm = "close" | "reopen" | "delete" | null;

const CONFIRM_TEXT: Record<Exclude<Confirm, null>, { title: string; body: string; action: string }> = {
  close: { title: "Đóng bán suất chiếu?", body: "Khách sẽ không đặt thêm vé; vé đã bán vẫn hợp lệ.", action: "Đóng bán" },
  reopen: { title: "Mở bán lại suất chiếu?", body: "Suất sẽ hiển thị lại trên web để khách đặt vé.", action: "Mở bán" },
  delete: { title: "Xoá suất chiếu?", body: "Chỉ xoá được suất chưa bán vé. Không thể hoàn tác.", action: "Xoá suất" },
};

/**
 * Thông tin suất lấy từ endpoint quản trị (không lọc trạng thái suất/rạp/phim). Sơ đồ ghế lấy từ seatmap
 * công khai nên chỉ gọi khi suất chưa huỷ và lỗi seatmap không làm hỏng cả trang.
 */
async function loadAll(cinema: ScopedCinema, showtimeId: string): Promise<Loaded> {
  const [showtime, rooms, movies] = await Promise.all([
    apiFetch<ShowtimeRowDto>(`/cinemas/${cinema.id}/showtimes/${showtimeId}`, { cache: "no-store" }),
    apiFetch<RoomOption[]>(`/cinemas/${cinema.id}/rooms`),
    apiFetch<MovieDto[]>("/movies"),
  ]);
  let seats: SeatMapItem[] = [];
  let seatsAvailable = false;
  if (showtime.status !== "CANCELLED") {
    try {
      const map = await apiFetch<SeatMapResponse>(`/showtimes/${showtimeId}/seatmap`, { cache: "no-store" });
      seats = map.seats;
      seatsAvailable = true;
    } catch {
      // Rạp tạm đóng / phim lưu trữ: vẫn quản lý được suất, chỉ thiếu sơ đồ ghế.
    }
  }
  return { showtime, seats, seatsAvailable, rooms, movies, cinema };
}

function ShowtimeDetail({ data, reload }: Readonly<{ data: Loaded; reload: () => void }>) {
  const { showtime: st, seats, seatsAvailable, rooms, movies, cinema } = data;
  const status = st.status;
  const cancelled = status === "CANCELLED";
  const started = new Date(st.startsAt).getTime() <= Date.now();
  const sold = hasSoldSeats(seats);
  const soldCount = seats.filter((s) => s.state === "SOLD").length;
  const roomName = rooms.find((r) => r.id === st.roomId)?.name ?? "Phòng";
  const capacity = seats.filter((s) => s.type.toUpperCase() !== "AISLE" && s.type.toUpperCase() !== "BROKEN").length;
  const movie = movies.find((m) => m.id === st.movieId);
  const base = `/cinemas/${cinema.id}/showtimes/${st.id}`;

  const startParts = toVnParts(new Date(st.startsAt));
  const [roomId, setRoomId] = useState(st.roomId);
  const [date, setDate] = useState(vnDateKey(new Date(st.startsAt)));
  const [time, setTime] = useState(
    `${String(startParts.hour).padStart(2, "0")}:${String(startParts.minute).padStart(2, "0")}`,
  );
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictsView, setConflictsView] = useState<ReturnType<typeof overlapConflicts>>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  /** Trả `true` khi thành công; lỗi được hiển thị và trả `false`. */
  const run = async (task: () => Promise<unknown>, done?: string, reloadAfter = true): Promise<boolean> => {
    setError(null);
    setConflictsView(null);
    try {
      await task();
      if (done) setNotice(done);
      if (reloadAfter) reload();
      return true;
    } catch (e) {
      const found = overlapConflicts(e);
      if (found) setConflictsView(found);
      else setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra. Vui lòng thử lại.");
      return false;
    }
  };

  const save = () =>
    run(
      () =>
        apiFetch(base, {
          method: "PATCH",
          json: { roomId, startsAt: vnLocalToUtc(date, time).toISOString() },
        }),
      "Đã lưu thay đổi",
    );

  const doConfirmed = async () => {
    const action = confirm;
    setConfirm(null);
    if (action === "close") await run(() => apiFetch(`${base}/close`, { method: "POST" }), "Đã đóng bán");
    if (action === "reopen") await run(() => apiFetch(`${base}/reopen`, { method: "POST" }), "Đã mở bán lại");
    if (action === "delete") {
      // Không reload: suất đã mất, GET sẽ 404. Chỉ báo xoá khi API thành công.
      if (await run(() => apiFetch(base, { method: "DELETE" }), undefined, false)) setDeleted(true);
    }
  };

  if (deleted) {
    return (
      <p role="status">
        Đã xoá suất.{" "}
        <Link href={`/admin/lich-chieu?cinema=${cinema.id}`} className="font-semibold underline">
          Về lịch chiếu
        </Link>
      </p>
    );
  }

  const editLocked = sold || cancelled;
  const lockReason = cancelled ? "Suất đã huỷ nên không thể chỉnh sửa." : SOLD_LOCK_REASON;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h2 font-bold uppercase">{movie?.titleVi ?? "Suất chiếu"}</h1>
          <Badge tone={SHOWTIME_STATUS_TONE[status]}>{SHOWTIME_STATUS_LABEL[status]}</Badge>
        </div>
        <p className="text-body-sm text-fg-secondary">
          {cinema.name} • {roomName} • {formatVnDate(st.startsAt)} {formatVnTime(st.startsAt)}-
          {formatVnTime(st.endsAt)} • {st.format} • <span data-testid="sold-count">{soldCount}/{capacity} vé đã bán</span>
        </p>
      </header>

      {notice ? <p role="status" className="text-success">{notice}</p> : null}
      {error ? <p role="alert" className="text-danger-text">{error}</p> : null}
      {conflictsView ? <ConflictList conflicts={conflictsView} rooms={rooms} movies={movies} /> : null}

      <section aria-label="Sửa suất" className="space-y-3 border border-border p-4">
        <h2 className="text-h3 font-bold">Thời gian & phòng</h2>
        <fieldset disabled={editLocked} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ed-room">Phòng</Label>
            <select
              id="ed-room"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="h-11 w-full border border-input bg-surface-input px-2 text-base disabled:opacity-45 md:h-10 md:text-body"
            >
              {rooms
                .filter((r) => r.id === st.roomId || (r.status === "ACTIVE" && r.supportedFormats.includes(st.format)))
                .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-date">Ngày</Label>
            <Input id="ed-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-time">Giờ bắt đầu</Label>
            <Input id="ed-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </fieldset>
        {editLocked ? (
          <p className="text-body-sm text-warning" data-testid="edit-lock-reason">
            {lockReason}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={editLocked} onClick={save}>
            Lưu thay đổi
          </Button>
          <Button variant="outline" disabled={editLocked} onClick={() => setConfirm("delete")}>
            Xoá suất
          </Button>
          {status === "ON_SALE" ? (
            <Button variant="secondary" onClick={() => setConfirm("close")}>
              Đóng bán
            </Button>
          ) : null}
          {status === "CLOSED" ? (
            <Button variant="secondary" onClick={() => setConfirm("reopen")}>
              Mở bán lại
            </Button>
          ) : null}
          <Button variant="destructive" disabled={cancelled || started} onClick={() => setCancelOpen(true)}>
            Huỷ suất
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-bold">Sơ đồ ghế & khoá ghế</h2>
        {seatsAvailable ? (
          <SeatLockPanel cinemaId={cinema.id} showtimeId={st.id} seats={seats} onChanged={reload} />
        ) : (
          <p className="text-body-sm text-fg-secondary" data-testid="seats-unavailable">
            {cancelled ? "Suất đã huỷ nên không còn sơ đồ ghế." : "Sơ đồ ghế chưa khả dụng (rạp tạm đóng hoặc phim đã lưu trữ)."}
          </p>
        )}
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? CONFIRM_TEXT[confirm].title : ""}</AlertDialogTitle>
            <AlertDialogDescription>{confirm ? CONFIRM_TEXT[confirm].body : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Để sau</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirmed}>{confirm ? CONFIRM_TEXT[confirm].action : ""}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CancelShowtimesDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        cinemaId={cinema.id}
        cinemaCode={cinema.code}
        target={{ showtimeIds: [st.id] }}
        scopeLabel={`${movie?.titleVi ?? "Suất chiếu"} • ${roomName} • ${formatVnTime(st.startsAt)} ${formatVnDate(st.startsAt)}`}
        onCancelled={(result: CancelShowtimesResultDto) => {
          setNotice(
            `Đã huỷ suất; ${result.affectedOrdersCount} đơn chuyển sang Bị ảnh hưởng, ${result.emailsEnqueuedCount} email đã xếp hàng gửi.`,
          );
          reload();
        }}
      />
    </div>
  );
}

function ShowtimeDetailLoader({ cinema, id }: Readonly<{ cinema: ScopedCinema; id: string }>) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const reload = useCallback(() => setKey((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    loadAll(cinema, id)
      .then((loaded) => {
        if (!cancelled) {
          setData(loaded);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cinema, id, key]);

  // Lỗi tải lại (vd sau thao tác) không được hiện dữ liệu cũ kèm nút còn bật.
  if (failed) return <ErrorState onRetry={reload} />;
  if (!data) return <Skeleton className="h-60 w-full" />;
  return <ShowtimeDetail data={data} reload={reload} />;
}

export default function ShowtimeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <Link href="/admin/lich-chieu" className="text-body-sm text-link hover:underline">
        ← Lịch chiếu
      </Link>
      <ShowtimeCinemaGate>{(cinema) => <ShowtimeDetailLoader cinema={cinema} id={id} />}</ShowtimeCinemaGate>
    </div>
  );
}
