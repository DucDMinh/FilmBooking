import { toVnParts } from "@filmbooking/shared";
import type { CinemaDbStatus } from "@filmbooking/shared/schemas/catalog";

/** R-136: mọi đổi trạng thái rạp có hiệu lực sau đúng 7 ngày kể từ lúc Admin hẹn. */
export const CINEMA_STATUS_DELAY_DAYS = 7;

const DAY_MS = 86_400_000;

/** "25/11/2026" theo giờ Việt Nam — luôn theo múi giờ VN, không theo máy người xem. */
export function formatVnDate(instant: Date): string {
  const { year, month, day } = toVnParts(instant);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** "25/11" theo giờ Việt Nam (nhãn gọn trong bảng). */
export function formatVnShortDate(instant: Date): string {
  return formatVnDate(instant).slice(0, 5);
}

/** Ngày hiệu lực nếu Admin hẹn ngay bây giờ (R-136). */
export function expectedEffectiveDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + CINEMA_STATUS_DELAY_DAYS * DAY_MS);
}

/** Nhãn lịch đang chờ ở màn quản trị, vd "Sẽ đóng cửa". */
export const SCHEDULED_CHANGE_LABELS: Record<CinemaDbStatus, string> = {
  CLOSED: "Sẽ đóng cửa",
  TEMP_CLOSED: "Sẽ tạm đóng cửa",
  COMING_SOON: "Sẽ chuyển sang sắp mở",
  OPEN: "Sẽ mở cửa",
};

/** Trạng thái đích khiến rạp ngừng bán vé: khách có vé sau ngày hiệu lực phải hoàn tiền trước hạn. */
export function stopsSellingTickets(target: CinemaDbStatus): boolean {
  return target !== "OPEN";
}

/** Văn phong khớp email CINEMA_STATUS_NOTICE (apps/api mail templates). */
export function refundNoticeText(date: string): string {
  return `Quý khách đã đặt vé cho các suất chiếu diễn ra từ ngày ${date} trở đi tại rạp này, vui lòng đến trực tiếp quầy vé của rạp trước ngày ${date} (mang theo mã đặt vé hoặc mã QR trong email vé) để được hoàn tiền. Sau thời hạn này, CINEMO sẽ không giải quyết hoàn tiền; các suất chiếu còn lại của rạp sẽ bị huỷ.`;
}
