import { z } from "zod";
import { cinemaStatusSchema } from "./catalog";

/**
 * DTO huỷ suất / đóng rạp / đơn bị ảnh hưởng — R-33, R-108..R-110, R-134 (AC-24..AC-26).
 * Spec 3.0.0: kết quả xử lý đơn `affected` DUY NHẤT là hoàn tiền thủ công (`refunded_manual`);
 * không có giá trị `exchanged` ở bất kỳ DTO nào.
 */

const uuid = z.string().uuid();
const MAX_CANCEL_SHOWTIMES = 500;
const MAX_REASON_LENGTH = 500;
const MAX_REFUND_REFERENCE_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;
const MAX_AMOUNT_VND = 1_000_000_000;

/** Đích huỷ: danh sách suất cụ thể HOẶC tất cả suất tương lai chưa huỷ của rạp (R-108). */
const cancelTargetShape = {
  showtimeIds: z.array(uuid).min(1).max(MAX_CANCEL_SHOWTIMES).optional(),
  allFuture: z.literal(true).optional(),
};
const hasExactlyOneTarget = (value: { showtimeIds?: unknown; allFuture?: unknown }) =>
  (value.showtimeIds !== undefined) !== (value.allFuture !== undefined);
const TARGET_MESSAGE = "Provide either showtimeIds or allFuture=true";

export const previewCancelShowtimesSchema = z.object(cancelTargetShape).refine(hasExactlyOneTarget, TARGET_MESSAGE);
export type PreviewCancelShowtimesInput = z.infer<typeof previewCancelShowtimesSchema>;

export const cancelShowtimesSchema = z
  .object({ ...cancelTargetShape, reason: z.string().trim().min(1).max(MAX_REASON_LENGTH) })
  .refine(hasExactlyOneTarget, TARGET_MESSAGE);
export type CancelShowtimesInput = z.infer<typeof cancelShowtimesSchema>;

export const setCinemaStatusSchema = z.object({ status: cinemaStatusSchema });
export type SetCinemaStatusInput = z.infer<typeof setCinemaStatusSchema>;

/** Trạng thái xử lý hiển thị trong màn Đơn bị ảnh hưởng. */
export const AFFECTED_ORDER_STATUSES = ["affected", "refunded_manual"] as const;
export type AffectedOrderStatus = (typeof AFFECTED_ORDER_STATUSES)[number];

export const EMAIL_DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

export const listAffectedOrdersQuerySchema = z.object({
  cinemaId: uuid.optional(),
  showtimeId: uuid.optional(),
  status: z.enum(AFFECTED_ORDER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListAffectedOrdersQuery = z.infer<typeof listAffectedOrdersQuerySchema>;

export const exportAffectedOrdersQuerySchema = listAffectedOrdersQuerySchema.pick({
  cinemaId: true,
  showtimeId: true,
  status: true,
});
export type ExportAffectedOrdersQuery = z.infer<typeof exportAffectedOrdersQuerySchema>;

/** AC-25: số tiền + mã giao dịch ngân hàng bắt buộc; thiếu -> 422. Người thực hiện lấy từ JWT, ngày từ server. */
export const recordRefundSchema = z.object({
  refundedAmount: z.number().int().min(1).max(MAX_AMOUNT_VND),
  refundReference: z.string().trim().min(1).max(MAX_REFUND_REFERENCE_LENGTH),
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});
export type RecordRefundInput = z.infer<typeof recordRefundSchema>;

/** DTO kết quả xem trước ảnh hưởng huỷ suất chiếu */
export interface PreviewCancelResultDto {
  showtimesCount: number;
  paidOrdersCount: number;
  webPaidOrdersCount: number;
  posPaidOrdersCount: number;
  holdingOrdersCount: number;
  soldSeatsCount: number;
  heldSeatsCount: number;
  totalRefundAmount: number;
}

/** DTO kết quả thực hiện huỷ suất chiếu */
export interface CancelShowtimesResultDto {
  success: boolean;
  cancelledShowtimesCount: number;
  affectedOrdersCount: number;
  cancelledHoldsCount: number;
  cancelledOrdersCount: number;
  emailsEnqueuedCount: number;
}

/** DTO item trong danh sách đơn bị ảnh hưởng */
export interface AffectedOrderDto {
  id: string;
  bookingCode: string;
  cinemaId: string;
  cinemaName: string;
  cinemaCode: string;
  showtimeId: string;
  movieTitle: string;
  roomName: string;
  showtimeStartsAt: string;
  totalAmount: number;
  status: AffectedOrderStatus;
  cancelReason: string | null;
  cancelledAt: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  seatLabels: string[];
  emailStatus: EmailDeliveryStatus | null;
  emailSentAt: string | null;
  refundedAmount: number | null;
  refundReference: string | null;
  refundedAt: string | null;
  refundedBy: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** DTO chi tiết đơn bị ảnh hưởng */
export interface AffectedOrderDetailDto extends AffectedOrderDto {
  seats?: Array<{
    seatId: string;
    seatLabel: string;
    seatType: string;
    priceAmount: number;
  }>;
  emailOutbox?: {
    id: string;
    status: EmailDeliveryStatus;
    attempts: number;
    lastError: string | null;
    sentAt: string | null;
    createdAt: string;
  } | null;
}

/** DTO kết quả ghi nhận hoàn tiền thủ công */
export interface RecordRefundResultDto {
  success: boolean;
  orderId: string;
  status: "refunded_manual";
  refundedAmount: number;
  refundReference: string;
}

/** DTO kết quả gửi lại email */
export interface ResendEmailResultDto {
  success: boolean;
  orderId: string;
  status: "PENDING";
  message: string;
}
