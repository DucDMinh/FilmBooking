import { toVnParts } from "@filmbooking/shared";

/**
 * Lấy chuỗi ngày YYYY-MM-DD theo giờ Việt Nam (Asia/Ho_Chi_Minh).
 * Đặt ngoài module "use client" để server page (vd /lich-chieu) gọi được trực tiếp.
 */
export function getVnDateString(date: Date): string {
  const { year, month, day } = toVnParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
