"use client";

import { vnLocalToUtc } from "@filmbooking/shared";
import type { MovieDto } from "@filmbooking/shared/schemas/catalog";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { SELECT_FIELD_CLASS } from "@/components/catalog/filter-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/client";

import {
  dateRange,
  formatVnDate,
  formatVnTime,
  LANGUAGE_MODE_LABEL,
  overlapConflicts,
  vnDateKey,
  type ShowtimeConflict,
} from "./showtime-utils";

export interface RoomOption {
  id: string;
  name: string;
  status: string;
  supportedFormats: string[];
}

export interface ShowtimeBulkFormProps {
  cinemaId: string;
  /** `skipped` = số suất bị bỏ qua vì trùng (chỉ khi bật bỏ qua xung đột). */
  onCreated: (count: number, skipped: number) => void;
}


/** Danh sách suất xung đột (AC-14, R-50): suất dự kiến + suất đã có gây trùng. */
export function ConflictList({
  conflicts,
  rooms,
  movies,
}: Readonly<{ conflicts: readonly ShowtimeConflict[]; rooms: readonly RoomOption[]; movies: readonly MovieDto[] }>) {
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "Phòng";
  const movieTitle = (id: string) => movies.find((m) => m.id === id)?.titleVi ?? "phim khác";
  return (
    <div role="alert" className="space-y-2 border border-danger-line bg-danger-soft p-3 text-danger-text">
      <p className="font-semibold">Trùng lịch chiếu ({conflicts.length} suất)</p>
      <ul className="list-disc space-y-1 pl-5 text-body-sm" data-testid="conflict-list">
        {conflicts.map((c) => (
          <li key={`${c.roomId}|${c.startsAt}`}>
            {roomName(c.roomId)} {formatVnDate(c.startsAt)} {formatVnTime(c.startsAt)}-{formatVnTime(c.endsAt)}
            {c.conflictsWith.length > 0
              ? ` trùng với ${c.conflictsWith
                  .map((w) => `${movieTitle(w.movieId)} ${formatVnTime(w.startsAt)}-${formatVnTime(w.endsAt)}`)
                  .join(", ")}`
              : " trùng với một suất khác trong cùng yêu cầu"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tạo suất đơn lẻ (POST /cinemas/:id/showtimes) hoặc hàng loạt (POST /showtimes/bulk) cho một rạp (R-49..R-51). */
export function ShowtimeBulkForm({ cinemaId, onCreated }: Readonly<ShowtimeBulkFormProps>) {
  const today = vnDateKey(new Date());
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [movies, setMovies] = useState<MovieDto[]>([]);
  const [bulk, setBulk] = useState(false);
  const [movieId, setMovieId] = useState("");
  const [format, setFormat] = useState("2D");
  const [languageMode, setLanguageMode] = useState("SUBTITLED");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [times, setTimes] = useState<string[]>(["19:00"]);
  const [timeDraft, setTimeDraft] = useState("");
  const [skipConflicts, setSkipConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<ShowtimeConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch<RoomOption[]>(`/cinemas/${cinemaId}/rooms`), apiFetch<MovieDto[]>("/movies")])
      .then(([r, m]) => {
        setRooms(r.filter((room) => room.status === "ACTIVE"));
        setMovies(m);
      })
      .catch(() => setError("Không tải được danh sách phòng/phim. Vui lòng tải lại trang."));
  }, [cinemaId]);

  const dates = useMemo(() => (bulk ? dateRange(dateFrom, dateTo) : [dateFrom]), [bulk, dateFrom, dateTo]);
  const effectiveTimes = bulk ? times : times.slice(0, 1);
  const count = dates.length * effectiveTimes.length * roomIds.length;
  const ready = movieId !== "" && roomIds.length > 0 && effectiveTimes.length > 0 && dates.length > 0;

  const toggleRoom = (id: string) =>
    setRoomIds((prev) => (bulk ? (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]) : [id]));

  const addTime = () => {
    if (/^\d{2}:\d{2}$/.test(timeDraft) && !times.includes(timeDraft)) setTimes([...times, timeDraft].sort());
    setTimeDraft("");
  };

  const toggleBulk = (checked: boolean) => {
    setBulk(checked);
    setRoomIds([]);
  };

  const changeDateFrom = (value: string) => {
    setDateFrom(value);
    if (!bulk || value > dateTo) setDateTo(value);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    setConflicts([]);
    try {
      if (bulk) {
        const result = await apiFetch<{ created: unknown[]; skipped?: unknown[] }>("/showtimes/bulk", {
          method: "POST",
          json: {
            movieId,
            format,
            languageMode,
            dates,
            times: effectiveTimes,
            targets: [{ cinemaId, roomIds }],
            skipConflicts,
          },
        });
        onCreated(result.created.length, result.skipped?.length ?? 0);
      } else {
        const startsAt = vnLocalToUtc(dates[0] ?? today, effectiveTimes[0] ?? "00:00").toISOString();
        await apiFetch(`/cinemas/${cinemaId}/showtimes`, {
          method: "POST",
          json: { roomId: roomIds[0], movieId, startsAt, format, languageMode },
        });
        onCreated(1, 0);
      }
    } catch (e) {
      const found = overlapConflicts(e);
      if (found) setConflicts(found);
      else setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4" aria-label="Tạo suất chiếu">
      <label className="flex min-h-11 items-center gap-2 text-body">
        <input type="checkbox" checked={bulk} onChange={(e) => toggleBulk(e.target.checked)} className="size-5" />
        Tạo hàng loạt (nhiều ngày, nhiều khung giờ, nhiều phòng)
      </label>

      <div className="space-y-1">
        <Label htmlFor="st-movie">Phim *</Label>
        <select id="st-movie" className={SELECT_FIELD_CLASS} value={movieId} onChange={(e) => setMovieId(e.target.value)}>
          <option value="">- Chọn phim -</option>
          {movies.map((m) => (
            <option key={m.id} value={m.id}>
              {m.titleVi} ({m.durationMinutes} phút)
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="st-format">Định dạng *</Label>
          <select id="st-format" className={SELECT_FIELD_CLASS} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="2D">2D</option>
            <option value="3D">3D</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-lang">Ngôn ngữ *</Label>
          <select id="st-lang" className={SELECT_FIELD_CLASS} value={languageMode} onChange={(e) => setLanguageMode(e.target.value)}>
            {Object.entries(LANGUAGE_MODE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-body-sm font-semibold">Phòng chiếu *</legend>
        <div className="flex flex-wrap gap-2">
          {rooms
            .filter((r) => r.supportedFormats.includes(format))
            .map((room) => (
              <label key={room.id} className="flex min-h-11 items-center gap-2 border border-border px-3">
                <input
                  type={bulk ? "checkbox" : "radio"}
                  name="room"
                  checked={roomIds.includes(room.id)}
                  onChange={() => toggleRoom(room.id)}
                />
                {room.name}
              </label>
            ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="st-from">{bulk ? "Từ ngày *" : "Ngày chiếu *"}</Label>
          <Input id="st-from" type="date" value={dateFrom} onChange={(e) => changeDateFrom(e.target.value)} />
        </div>
        {bulk ? (
          <div className="space-y-1">
            <Label htmlFor="st-to">Đến ngày *</Label>
            <Input id="st-to" type="date" min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        ) : null}
      </div>

      {bulk ? (
        <div className="space-y-2">
          <Label htmlFor="st-time-add">Khung giờ bắt đầu (giờ Việt Nam) *</Label>
          <div className="flex flex-wrap items-center gap-2">
            {times.map((t) => (
              <Button
                key={t}
                type="button"
                variant="secondary"
                size="sm"
                aria-label={`Bỏ khung giờ ${t}`}
                onClick={() => setTimes(times.filter((x) => x !== t))}
              >
                {t} ✕
              </Button>
            ))}
            <Input id="st-time-add" type="time" className="w-32" value={timeDraft} onChange={(e) => setTimeDraft(e.target.value)} />
            <Button type="button" variant="secondary" size="sm" onClick={addTime}>
              Thêm giờ
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="st-time">Giờ bắt đầu (giờ Việt Nam) *</Label>
          <Input id="st-time" type="time" className="w-40" value={times[0] ?? ""} onChange={(e) => setTimes([e.target.value])} />
        </div>
      )}

      {bulk ? (
        <label className="flex min-h-11 items-center gap-2 text-body-sm">
          <input type="checkbox" checked={skipConflicts} onChange={(e) => setSkipConflicts(e.target.checked)} className="size-5" />
          Bỏ qua các suất trùng, chỉ tạo suất hợp lệ (mặc định: có trùng thì không tạo suất nào)
        </label>
      ) : null}

      <p className="text-body-sm text-fg-secondary" data-testid="st-count">
        Sẽ tạo {count} suất chiếu. Giờ kết thúc = giờ bắt đầu + thời lượng phim + thời gian dọn phòng. Suất có vé bán sẽ
        không thể xoá hoặc sửa giờ.
      </p>

      {conflicts.length > 0 ? <ConflictList conflicts={conflicts} rooms={rooms} movies={movies} /> : null}
      {error ? (
        <p role="alert" className="text-body-sm text-danger-text">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="gradient" disabled={!ready || busy}>
        Tạo {count} suất chiếu
      </Button>
    </form>
  );
}
