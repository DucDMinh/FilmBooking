import { z } from "zod";

/**
 * Schemas & DTOs cho API booking: sơ đồ ghế, giữ/nhả ghế, đơn hàng, tóm tắt, đồng ý điều khoản, voucher (R-05, R-59..R-71, R-94, R-95, R-131, R-133).
 */

/** GUID lỏng: ID đặt tay trong seed (suất demo 50000000-…, rạp, phòng…) không đúng version/variant RFC. */
export const uuidSchema = z.guid("Invalid UUID");

// ── Giữ ghế ─────────────────────────────────────────────────────────────
export const holdSeatsSchema = z.object({
  showtimeId: uuidSchema,
  seatIds: z
    .array(uuidSchema)
    .min(1, "At least 1 seat is required")
    .max(8, "Maximum 8 seats per booking"),
});
export type HoldSeatsInput = z.infer<typeof holdSeatsSchema>;

export interface HoldSeatsResponse {
  orderId: string;
  bookingCode: string;
  holdExpiresAt: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  seatCount: number;
}

// ── Sơ đồ ghế (seatmap) ──────────────────────────────────────────────────
export const SEAT_MAP_STATES = ["FREE", "HELD", "SOLD", "LOCKED"] as const;
export type SeatMapState = (typeof SEAT_MAP_STATES)[number];

export interface SeatMapItem {
  id: string;
  row: string;
  col: number;
  colSpan: number;
  type: string;
  label: string;
  state: SeatMapState;
  expiresAt: string | null;
  price: number;
}

export interface SeatMapResponse {
  showtime: {
    id: string;
    cinemaId: string;
    roomId: string;
    movieId: string;
    startsAt: string;
    endsAt: string;
    format: string;
    status: string;
  };
  room: {
    id: string;
    name: string;
    gridRows: number;
    gridCols: number;
  };
  pricing: Record<string, number>;
  seats: SeatMapItem[];
}

// ── Xác nhận tuổi & Đồng ý điều khoản ────────────────────────────────────
export const ageConfirmSchema = z.object({
  confirmed: z.boolean().default(true).optional(),
});
export type AgeConfirmInput = z.infer<typeof ageConfirmSchema>;

export interface AgeConfirmResponse {
  ok: boolean;
  ageConfirmed: boolean;
}

export const consentSchema = z.object({
  version: z.string().trim().min(1, "Version is required").max(20, "Version is too long").default("1.0.0").optional(),
});
export type ConsentInput = z.infer<typeof consentSchema>;

export interface ConsentResponse {
  ok: boolean;
  consentAt: string;
  version: string;
}

// ── Voucher ──────────────────────────────────────────────────────────────
export const applyVoucherSchema = z.object({
  code: z.string().trim().min(1, "Voucher code is required").max(50, "Voucher code is too long"),
});
export type ApplyVoucherInput = z.infer<typeof applyVoucherSchema>;

export interface ApplyVoucherResponse {
  orderId: string;
  voucherId: string | null;
  code: string | null;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
}

// ── Tóm tắt đơn hàng ────────────────────────────────────────────────────
export interface BookingSummaryResponse {
  id: string;
  bookingCode: string;
  status: string;
  holdExpiresAt: string | null;
  expiresInSeconds: number;
  movie: {
    title: string;
    ageRating: string | null;
    posterUrl: string | null;
  };
  cinema: {
    id: string;
    code: string;
    name: string;
    address: string;
    district: string | null;
  };
  showtime: {
    id: string;
    startsAt: string;
    endsAt: string;
    roomName: string;
    format: string;
  };
  seats: Array<{
    id: string;
    label: string;
    type: string;
    price: number;
  }>;
  combos?: OrderComboItemDto[];
  pricing: {
    subtotal: number;
    combosTotal?: number;
    discount: number;
    total: number;
  };
  voucher: {
    code: string;
    discount: number;
  } | null;
  consent: {
    consented: boolean;
    consentAt: string | null;
  };
  ageConfirmed: boolean;
}

// ── Combo bắp nước (R-58, R-69) ─────────────────────────────────────────
export interface ComboDto {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface OrderComboItemDto {
  id: string;
  comboId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** Số lượng tối đa mỗi combo trong một đơn (khớp RPC `sync_order_combos`). */
export const MAX_COMBO_QUANTITY = 20;

export const updateOrderCombosSchema = z.object({
  items: z.array(
    z.object({
      comboId: uuidSchema,
      quantity: z.number().int().min(0, "Số lượng không được âm").max(MAX_COMBO_QUANTITY, `Tối đa ${MAX_COMBO_QUANTITY} phần mỗi combo`),
    }),
  ),
});
export type UpdateOrderCombosInput = z.infer<typeof updateOrderCombosSchema>;

