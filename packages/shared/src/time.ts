/**
 * Lưu thời gian dạng UTC, hiển thị/tính giá theo giờ Việt Nam (Asia/Ho_Chi_Minh).
 * Việt Nam không có DST (UTC+7 cố định) nên dùng offset cố định, không phụ thuộc ICU.
 */
export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const VN_OFFSET_MINUTES = 7 * 60;
const MS_PER_MINUTE = 60_000;
/** Mốc khung giờ giá: 17:00 thuộc "sau 17h". */
export const EVENING_SLOT_START_HOUR = 17;

export interface VnParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Chủ nhật … 6 = Thứ bảy, theo lịch Việt Nam. */
  weekday: number;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})$/;

/** ("2026-11-14", "17:00") giờ VN -> Date UTC (10:00Z). */
export function vnLocalToUtc(date: string, time: string): Date {
  const d = LOCAL_DATE.exec(date);
  const t = LOCAL_TIME.exec(time);
  if (!d || !t) throw new RangeError(`Invalid VN local date/time: ${date} ${time}`);
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(asUtcMs);
  // Date.UTC tự cuộn ngày/tháng không hợp lệ (30/02, tháng 13) -> so ngược để bắt.
  const isRealCalendarDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  if (!isRealCalendarDate || hour > 23 || minute > 59) {
    throw new RangeError(`Invalid VN local date/time: ${date} ${time}`);
  }
  return new Date(asUtcMs - VN_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function toVnParts(instant: Date): VnParts {
  const shifted = new Date(instant.getTime() + VN_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Thứ bảy / Chủ nhật theo giờ VN (loại ngày "cuối tuần" của bảng giá). */
export function isVnWeekend(instant: Date): boolean {
  const { weekday } = toVnParts(instant);
  return weekday === 0 || weekday === 6;
}

/** Giờ bắt đầu suất từ 17:00 VN trở đi = khung "sau 17h". */
export function isVnEveningSlot(instant: Date): boolean {
  return toVnParts(instant).hour >= EVENING_SLOT_START_HOUR;
}

/** "17:00 14/11/2026" theo giờ VN. */
export function formatVnDateTime(instant: Date): string {
  const p = toVnParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.hour)}:${pad(p.minute)} ${pad(p.day)}/${pad(p.month)}/${p.year}`;
}
