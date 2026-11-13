import { z } from "zod";

/**
 * Hợp đồng thanh toán PayOS (R-73..R-84). Không có trường nào chứa dữ liệu thẻ/tài khoản (R-81).
 */

export const BOOKING_PAYMENT_STATUSES = [
  "AWAITING_PAYMENT",
  "PAID",
  "EXPIRED",
  "CANCELLED",
  "NEEDS_MANUAL_REVIEW",
] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

export const bookingIdParamSchema = z.string().uuid("Invalid booking id");

export const createPaymentBodySchema = z
  .object({
    // URL tuyệt đối hoặc path tương đối; service kiểm cùng origin web.
    returnUrl: z.string().min(1).max(2048).optional(),
    cancelUrl: z.string().min(1).max(2048).optional(),
  })
  .optional();
export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;

/** Kết quả POST /bookings/:id/payment. Đơn 0đ: không có checkoutUrl, chốt luôn (status PAID). */
export interface CreatePaymentResultDto {
  status: "AWAITING_PAYMENT" | "PAID";
  checkoutUrl: string | null;
  expiresAt: string | null;
  bookingCode: string | null;
}

/** Kết quả GET /bookings/:id/payment-status (màn "Đang xác nhận"). */
export interface PaymentStatusDto {
  status: BookingPaymentStatus;
  orderStatus: string;
  bookingCode: string | null;
}

/** Kết quả POST /bookings/:id/payment/cancel. */
export interface CancelPaymentResultDto {
  status: "CANCELLED";
}

/**
 * Body webhook PayOS. `data` giữ nguyên mọi trường (passthrough) vì chữ ký tính trên TOÀN BỘ trường của `data`.
 * Chỉ kiểm hình dạng tối thiểu ở đây; các trường nghiệp vụ được parse bằng `payosWebhookDataSchema` SAU khi chữ ký hợp lệ.
 */
export const payosWebhookEnvelopeSchema = z.object({
  code: z.string().optional(),
  desc: z.string().optional(),
  success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string().min(1),
});
export type PayosWebhookEnvelope = z.infer<typeof payosWebhookEnvelopeSchema>;

export const payosWebhookDataSchema = z.object({
  orderCode: z.number().int().positive(),
  amount: z.number().int().min(0),
  reference: z.string().min(1).optional(),
  code: z.string().optional(),
  transactionDateTime: z.string().optional(),
});
export type PayosWebhookData = z.infer<typeof payosWebhookDataSchema>;

/** Mã thành công của PayOS (cả envelope lẫn data). */
export const PAYOS_SUCCESS_CODE = "00";
