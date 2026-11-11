/**
 * Enum dùng chung web/api/DB. Giá trị là chuỗi ổn định (khớp cột/enum Postgres ở migration).
 * Dạng `as const` + type suy ra để dùng được trong zod (`z.enum(ORDER_STATUSES)`).
 */

/** Vai trò lưu trong DB. Guest = chưa đăng nhập; POS xác thực bằng khoá API theo rạp (không phải vai trò user). */
export const USER_ROLES = ["customer", "staff", "cinema_manager", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Vòng đời đơn — SPECIFICATIONS.md §8.5. */
export const ORDER_STATUSES = [
  "holding",
  "pending_payment",
  "paid",
  "expired",
  "cancelled",
  "checked_in",
  "affected",
  "exchanged",
  "refunded_manual",
  "needs_manual_review",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_CHANNELS = ["WEB", "POS"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

/** Loại ô trên sơ đồ ghế (R-48). `sweetbox` = ghế đôi, chiếm 2 ô, bán theo cặp. */
export const SEAT_TYPES = ["standard", "vip", "sweetbox", "aisle", "broken"] as const;
export type SeatType = (typeof SEAT_TYPES)[number];

/** Trạng thái ghế theo suất (hiển thị): Trống ↔ Đang giữ → Đã bán; Khoá do Manager. */
export const SEAT_STATES = ["available", "held", "sold", "blocked"] as const;
export type SeatState = (typeof SEAT_STATES)[number];

export const SHOWTIME_STATUSES = ["scheduled", "cancelled"] as const;
export type ShowtimeStatus = (typeof SHOWTIME_STATUSES)[number];

/** R-32: Đang hoạt động / Sắp khai trương / Tạm đóng / Ngừng hoạt động. */
export const CINEMA_STATUSES = [
  "active",
  "coming_soon",
  "temporarily_closed",
  "discontinued",
] as const;
export type CinemaStatus = (typeof CINEMA_STATUSES)[number];

export const ROOM_STATUSES = ["active", "maintenance"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const SCREEN_FORMATS = ["2D", "3D"] as const;
export type ScreenFormat = (typeof SCREEN_FORMATS)[number];

/** R-42: nhãn phân loại độ tuổi. */
export const AGE_RATINGS = ["P", "K", "T13", "T16", "T18"] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

/** Tuổi tối thiểu theo nhãn; P/K không giới hạn (0). Dùng cho chặn đặt vé theo ngày sinh (R-68). */
export const AGE_RATING_MIN_AGE: Record<AgeRating, number> = {
  P: 0,
  K: 0,
  T13: 13,
  T16: 16,
  T18: 18,
};

/** Loại ngày của bảng giá (R-52). */
export const DAY_TYPES = ["normal", "weekend", "holiday"] as const;
export type DayType = (typeof DAY_TYPES)[number];

/** Khung giờ của bảng giá (R-52): 17:00 thuộc "sau 17h". */
export const TIME_SLOTS = ["before_17", "after_17"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];
