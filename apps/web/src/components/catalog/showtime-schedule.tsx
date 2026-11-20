"use client";

import { useState } from "react";
import { Calendar, Clock, MapPin } from "lucide-react";
import { toVnParts } from "@filmbooking/shared";
import type { MovieDto, ShowtimeDto } from "@filmbooking/shared/schemas/catalog";
import { DateChipText, dateChipClass, ShowtimeClosedChip, ShowtimeLinkChip } from "@/components/catalog/chips";
import { EmptyState } from "@/components/common/states";
import { Scrub, ScrubGroup } from "@/components/motion/scrub";
import { isShowtimeOnlineClosed } from "@/lib/showtime-closing";
import { getVnDateString, ONE_DAY_MS } from "@/lib/vn-date";
import { cn } from "@/lib/utils";

export interface CinemaScheduleGroup {
  cinema: {
    code: string;
    name: string;
    address?: string;
    /** R-56: mốc đóng bán online hiệu lực của rạp (API trả); thiếu thì dùng `onlineCutoffMinutes` của lịch (15). */
    effectiveOnlineCutoffMinutes?: number | null;
  };
  showtimes: ShowtimeDto[];
}

export interface ShowtimeScheduleProps {
  movie?: MovieDto;
  schedule: CinemaScheduleGroup[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  /** Ẩn dải 7 ngày khi trang cha đã tự hiển thị một dải dùng chung (vd /lich-chieu). Mặc định false. */
  hideDateStrip?: boolean;
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

export { getVnDateString };

/** Định dạng giờ phút HH:mm theo giờ Việt Nam. */
export function formatVnTime(isoStringOrDate: string | Date): string {
  const date = typeof isoStringOrDate === "string" ? new Date(isoStringOrDate) : isoStringOrDate;
  const { hour, minute } = toVnParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export { isShowtimeOnlineClosed };

/** Sinh danh sách 7 ngày liên tiếp từ ngày hiện tại theo giờ Việt Nam. */
export function generateNext7Days(fromDate: Date = new Date()) {
  const days: Array<{ dateString: string; label: string; subLabel: string; isToday: boolean }> = [];
  const baseTime = fromDate.getTime();

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

export interface ScheduleDateStripProps {
  selectedDate: string;
  onSelect: (date: string) => void;
  now?: Date;
  /** Class thêm cho dải (vd `scrub-inset-0` khi dải nằm sẵn trong khung nhìn lúc vào trang). */
  className?: string;
}

/**
 * Dải 7 ngày chọn lịch chiếu (controlled) - dùng chung cho ShowtimeSchedule và trang /lich-chieu.
 * Nhóm A (đặt vé): từng chip hiện lần lượt từ trái sang phải theo một timeline chung của dải (design-spec §16.4).
 */
export function ScheduleDateStrip({
  selectedDate,
  onSelect,
  now = new Date(),
  className,
}: Readonly<ScheduleDateStripProps>) {
  const days = generateNext7Days(now);
  return (
    <ScrubGroup n={days.length} className={cn("flex gap-2 overflow-x-auto px-1 py-1 scrollbar-none", className)}>
      {days.map((day, index) => {
        const isSelected = day.dateString === selectedDate;
        return (
          <Scrub
            key={day.dateString}
            as="button"
            kind="ltr"
            i={index}
            type="button"
            onClick={() => onSelect(day.dateString)}
            className={dateChipClass(isSelected)}
            aria-pressed={isSelected}
          >
            <DateChipText label={day.label} subLabel={day.subLabel} selected={isSelected} />
          </Scrub>
        );
      })}
    </ScrubGroup>
  );
}

export function ShowtimeSchedule({
  movie,
  schedule,
  selectedDate: propSelectedDate,
  onDateChange,
  hideDateStrip = false,
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
          title="Sắp chiếu - Lịch chiếu sẽ được cập nhật sớm"
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
      {hideDateStrip ? null : (
        <ScheduleDateStrip selectedDate={activeDate} onSelect={handleSelectDate} now={now} />
      )}

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

            const cinemaCutoff = group.cinema.effectiveOnlineCutoffMinutes ?? onlineCutoffMinutes;

            return (
              <Scrub
                key={group.cinema.code}
                kind="ltr"
                className="frame"
              >
                <div className="frame-in p-4 sm:p-6">
                  <div className="mb-4 flex flex-col gap-1 border-b border-border pb-3 sm:flex-row sm:items-baseline sm:justify-between">
                    <h3 className="font-heading text-h3 font-bold uppercase text-fg">{group.cinema.name}</h3>
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
                        <span className="hud">{formatLabel}</span>
                        <div className="flex flex-wrap gap-2.5">
                          {showtimes.map((st) => {
                            const isClosed = isShowtimeOnlineClosed(st.startsAt, st.status, cinemaCutoff, now);
                            const startTimeStr = formatVnTime(st.startsAt);
                            const endTimeStr = formatVnTime(st.endsAt);

                            if (isClosed) {
                              return (
                                <ShowtimeClosedChip
                                  key={st.id}
                                  time={startTimeStr}
                                  ariaLabel={`Suất chiếu ${startTimeStr} đến ${endTimeStr}: Đã đóng bán online, vui lòng mua tại quầy`}
                                />
                              );
                            }

                            return (
                              <ShowtimeLinkChip
                                key={st.id}
                                href={`/dat-ve/${st.id}`}
                                time={startTimeStr}
                                detail={`~ ${endTimeStr}`}
                                ariaLabel={`Đặt vé suất ${startTimeStr} đến ${endTimeStr}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Scrub>
            );
          })}
        </div>
      )}
    </div>
  );
}
