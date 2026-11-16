import { toVnParts } from "@filmbooking/shared";

/**
 * Lấy chuỗi ngày YYYY-MM-DD theo giờ Việt Nam (Asia/Ho_Chi_Minh).
 * Đặt ngoài module "use client" để server page (vd /lich-chieu) gọi được trực tiếp.
 */
export function getVnDateString(date: Date): string {
  const { year, month, day } = toVnParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const ONE_DAY_MS = 86_400_000;

/**
 * Chuẩn hoá tham số ?date= của trang lịch chiếu: chỉ nhận 7 ngày từ hôm nay (giờ VN),
 * giá trị thiếu/sai định dạng/ngoài khoảng rơi về hôm nay để trang không lỗi.
 */
export function resolveScheduleDate(date: string | undefined, now: Date = new Date()): string {
  const today = getVnDateString(now);
  if (!date) return today;
  for (let i = 0; i < 7; i++) {
    if (getVnDateString(new Date(now.getTime() + i * ONE_DAY_MS)) === date) return date;
  }
  return today;
}
