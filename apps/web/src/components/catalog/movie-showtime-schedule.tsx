"use client";

import { usePathname, useRouter } from "next/navigation";
import { ShowtimeSchedule, type ShowtimeScheduleProps } from "@/components/catalog/showtime-schedule";

interface MovieShowtimeScheduleProps extends Omit<ShowtimeScheduleProps, "onDateChange" | "selectedDate"> {
  selectedDate: string;
  /** `?province=` hiện tại của trang, giữ nguyên khi đổi ngày. */
  province?: string;
}

/**
 * Lịch chiếu ở trang chi tiết phim: API chỉ trả suất của đúng 1 ngày nên đổi ngày phải điều hướng
 * (server tải lại theo `?date=`) thay vì lọc client. Giữ neo `#lich-chieu`, không cuộn lên đầu trang.
 */
export function MovieShowtimeSchedule({ province, selectedDate, ...scheduleProps }: Readonly<MovieShowtimeScheduleProps>) {
  const router = useRouter();
  const pathname = usePathname();

  const handleDateChange = (date: string) => {
    const params = new URLSearchParams({ date });
    if (province) params.set("province", province);
    router.push(`${pathname}?${params.toString()}#lich-chieu`, { scroll: false });
  };

  return <ShowtimeSchedule {...scheduleProps} selectedDate={selectedDate} onDateChange={handleDateChange} />;
}
