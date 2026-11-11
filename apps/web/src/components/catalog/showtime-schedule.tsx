"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Clock, MapPin } from "lucide-react";
import { toVnParts } from "@filmbooking/shared";
import type { MovieDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { EmptyState } from "@/components/common/states";
import { cn } from "@/lib/utils";

export interface CinemaScheduleGroup {
  cinema: {
    code: string;
    name: string;
    address?: string;
    onlineCutoffMinutes?: number | null;
  };
  showtimes: ShowtimeDto[];
}

export interface ShowtimeScheduleProps {
  movie?: MovieDto;
  schedule: CinemaScheduleGroup[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onlineCutoffMinutes?: number;
  now?: Date;
  className?: string;
}

const WEEKDAY_NAMES: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ hai",
  2: "Thứ ba",
  3: "Thứ tư",
  4: "Thứ năm",
  5: "Thứ sáu",
  6: "Thứ bảy",
};

const LANGUAGE_MODE_LABELS: Record<string, string> = {
  SUBTITLED: "Phụ đề",
  DUBBED: "Lồng tiếng",
  ORIGINAL: "Bản gốc",
};

/** Lấy chuỗi ngày YYYY-MM-DD theo giờ Việt Nam (Asia/Ho_Chi_Minh). */
export function getVnDateString(date: Date): string {
  const { year, month, day } = toVnParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Định dạng giờ phút HH:mm theo giờ Việt Nam. */
export function formatVnTime(isoStringOrDate: string | Date): string {
  const date = typeof isoStringOrDate === "string" ? new Date(isoStringOrDate) : isoStringOrDate;
  const { hour, minute } = toVnParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Kiểm tra xem suất chiếu đã bị đóng bán online chưa:
 * 1. Suất có status là CLOSED hoặc CANCELLED
 * 2. Hoặc thời điểm hiện tại đã vượt qua mốc (startsAt - cutoffMinutes).
 */
export function isShowtimeOnlineClosed(
  startsAt: string | Date,
  status: string,
  cutoffMinutes = 15,
  now: Date = new Date(),
): boolean {
  if (status === "CLOSED" || status === "CANCELLED") {
    return true;
  }
  const startTime = typeof startsAt === "string" ? new Date(startsAt).getTime() : startsAt.getTime();
  const cutoffTime = startTime - cutoffMinutes * 60 * 1000;
  return now.getTime() >= cutoffTime;
}

/** Sinh danh sách 7 ngày liên tiếp từ ngày hiện tại theo giờ Việt Nam. */
export function generateNext7Days(fromDate: Date = new Date()) {
  const days: Array<{ dateString: string; label: string; subLabel: string; isToday: boolean }> = [];
  const baseTime = fromDate.getTime();
  const ONE_DAY_MS = 86_400_000;

  for (let i = 0; i < 7; i++) {
    const current = new Date(baseTime + i * ONE_DAY_MS);
    const dateString = getVnDateString(current);
    const { day, month, weekday } = toVnParts(current);
    const isToday = i === 0;

    days.push({
      dateString,
      label: isToday ? "Hôm nay" : (WEEKDAY_NAMES[weekday] ?? `Thứ ${weekday + 1}`),
      subLabel: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
      isToday,
    });
  }

  return days;
}

export function ShowtimeSchedule({
  movie,
  schedule,
  selectedDate: propSelectedDate,
  onDateChange,
  onlineCutoffMinutes = 15,
  now = new Date(),
  className,
}: Readonly<ShowtimeScheduleProps>) {
  const next7Days = generateNext7Days(now);
  const defaultDate = next7Days[0]?.dateString ?? getVnDateString(now);

  const [internalDate, setInternalDate] = useState<string>(defaultDate);
  const activeDate = propSelectedDate ?? internalDate;

  const handleSelectDate = (dateString: string) => {
    if (onDateChange) {
      onDateChange(dateString);
    } else {
      setInternalDate(dateString);
    }
  };

  // R-45: Phim sắp chiếu chưa có bất kỳ suất chiếu nào
  const totalShowtimes = schedule.reduce((sum, g) => sum + g.showtimes.length, 0);
  const isComingSoonWithoutShowtimes =
    movie?.availability === "coming_soon" && totalShowtimes === 0;

  if (isComingSoonWithoutShowtimes) {
    return (
      <div className={cn("w-full py-8", className)}>
        <EmptyState
          title="Sắp chiếu — Lịch chiếu sẽ được cập nhật sớm"
          description={
            movie.releaseDate
              ? `Phim dự kiến khởi chiếu vào ngày ${movie.releaseDate}. Vui lòng quay lại sau để cập nhật lịch chiếu mới nhất.`
              : "Lịch chiếu cho bộ phim này sẽ sớm được công bố trên toàn hệ thống rạp."
          }
          icon={Calendar}
        />
      </div>
    );
  }

  // Lọc các suất chiếu theo ngày được chọn (so khớp YYYY-MM-DD theo giờ VN)
  const filteredSchedule = schedule
    .map((group) => {
      const showtimesInDate = group.showtimes.filter((st) => {
        if (st.status === "CANCELLED") return false;
        const stDateStr = getVnDateString(new Date(st.startsAt));
        return stDateStr === activeDate;
      });
      return {
        ...group,
        showtimes: showtimesInDate,
      };
    })
    .filter((group) => group.showtimes.length > 0);

  return (
    <div className={cn("w-full space-y-6", className)}>
      {/* Dải 7 ngày chọn lịch chiếu */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {next7Days.map((day) => {
          const isSelected = day.dateString === activeDate;
          return (
            <button
              key={day.dateString}
              type="button"
              onClick={() => handleSelectDate(day.dateString)}
              className={cn(
                "flex min-w-[88px] flex-col items-center justify-center rounded-sm px-3 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-brand",
                isSelected
                  ? "bg-brand text-fg-on-brand font-semibold shadow-sm"
                  : "bg-surface-control text-fg-secondary hover:bg-surface-elevated hover:text-fg",
              )}
              aria-pressed={isSelected}
            >
              <span className="text-caption uppercase tracking-wider">{day.label}</span>
              <span className="text-body font-bold">{day.subLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Danh sách rạp và suất chiếu */}
      {filteredSchedule.length === 0 ? (
        <EmptyState
          title="Không có suất chiếu"
          description={`Không tìm thấy suất chiếu nào vào ngày đã chọn tại khu vực này. Bạn có thể chọn ngày khác hoặc rạp khác.`}
          icon={Clock}
        />
      ) : (
        <div className="space-y-4">
          {filteredSchedule.map((group) => {
            // Nhóm suất theo định dạng (2D / 3D) và ngôn ngữ (Phụ đề / Lồng tiếng)
            const groupedByFormat = new Map<string, ShowtimeDto[]>();
            for (const st of group.showtimes) {
              const lang = LANGUAGE_MODE_LABELS[st.languageMode] ?? st.languageMode;
              const formatKey = `${st.format} • ${lang}`;
              const list = groupedByFormat.get(formatKey) ?? [];
              list.push(st);
              groupedByFormat.set(formatKey, list);
            }

            const cinemaCutoff = group.cinema.onlineCutoffMinutes ?? onlineCutoffMinutes;

            return (
              <div
                key={group.cinema.code}
                className="rounded-lg border border-border-subtle bg-surface p-4 sm:p-6"
              >
                <div className="mb-4 flex flex-col gap-1 border-b border-border pb-3 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="text-h3 font-bold text-fg">{group.cinema.name}</h3>
                  {group.cinema.address && (
                    <p className="flex items-center gap-1.5 text-small text-fg-secondary">
                      <MapPin className="size-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
                      <span>{group.cinema.address}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  {Array.from(groupedByFormat.entries()).map(([formatLabel, showtimes]) => (
                    <div key={formatLabel} className="space-y-2">
                      <span className="text-caption font-semibold uppercase tracking-wider text-fg-muted">
                        {formatLabel}
                      </span>
                      <div className="flex flex-wrap gap-2.5">
                        {showtimes.map((st) => {
                          const isClosed = isShowtimeOnlineClosed(
                            st.startsAt,
                            st.status,
                            cinemaCutoff,
                            now,
                          );
                          const startTimeStr = formatVnTime(st.startsAt);
                          const endTimeStr = formatVnTime(st.endsAt);

                          if (isClosed) {
                            return (
                              <div
                                key={st.id}
                                className="flex min-h-[44px] flex-col items-center justify-center rounded-sm border border-border-subtle bg-surface-control/40 px-3 py-1.5 text-fg-muted opacity-80 cursor-not-allowed"
                                aria-label={`Suất chiếu ${startTimeStr} đến ${endTimeStr}: Đã đóng bán online, vui lòng mua tại quầy`}
                              >
                                <span className="text-body font-bold tabular tracking-tight">
                                  {startTimeStr}
                                </span>
                                <span className="text-[11px] font-semibold text-warning">
                                  Mua tại quầy
                                </span>
                              </div>
                            );
                          }

                          return (
                            <Link
                              key={st.id}
                              href={`/dat-ve/${st.id}`}
                              className="group flex min-h-[44px] min-w-[76px] flex-col items-center justify-center rounded-sm border border-border-subtle bg-surface-control px-3.5 py-1.5 text-fg transition-all hover:border-brand hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-brand"
                              aria-label={`Đặt vé suất ${startTimeStr} đến ${endTimeStr}`}
                            >
                              <span className="text-body font-bold tabular tracking-tight group-hover:text-brand">
                                {startTimeStr}
                              </span>
                              <span className="text-[10px] tabular text-fg-muted">
                                ~ {endTimeStr}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
