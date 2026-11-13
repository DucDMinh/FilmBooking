import { z } from "zod";
import { ORDER_STATUSES, type OrderStatus } from "../enums";

export const uuidSchema = z.string().uuid("UUID không hợp lệ");

// ── Search Orders ────────────────────────────────────────────────────────────
export const searchOrdersQuerySchema = z.object({
  bookingCode: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  showtimeId: uuidSchema.optional(),
  cinemaId: uuidSchema.optional(),
  transactionRef: z.string().trim().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SearchOrdersQuery = z.infer<typeof searchOrdersQuerySchema>;

// ── Needs Manual Review ─────────────────────────────────────────────────────
export const listNeedsManualReviewQuerySchema = z.object({
  cinemaId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListNeedsManualReviewQuery = z.infer<typeof listNeedsManualReviewQuerySchema>;

export const MANUAL_REVIEW_ACTIONS = ["CONFIRM_SALE", "REFUND_MANUAL"] as const;
export type ManualReviewAction = (typeof MANUAL_REVIEW_ACTIONS)[number];
export const manualReviewActionSchema = z.enum(MANUAL_REVIEW_ACTIONS);

export const resolveManualReviewSchema = z
  .object({
    action: manualReviewActionSchema,
    note: z.string().trim().max(1000).optional(),
    refundReference: z.string().trim().min(1).max(200).optional(),
    refundedAmount: z.number().int().min(0).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "REFUND_MANUAL") {
      if (!val.refundReference || val.refundReference.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mã giao dịch ngân hàng là bắt buộc khi hoàn tiền thủ công",
          path: ["refundReference"],
        });
      }
      if (val.refundedAmount === undefined || val.refundedAmount === null || val.refundedAmount < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Số tiền hoàn là bắt buộc và phải >= 0 khi hoàn tiền thủ công",
          path: ["refundedAmount"],
        });
      }
    }
  });
export type ResolveManualReviewInput = z.infer<typeof resolveManualReviewSchema>;

// ── DTOs ────────────────────────────────────────────────────────────────────
export interface OrderTicketDto {
  id: string;
  orderSeatId: string;
  seatId: string;
  seatLabel: string;
  seatType: string;
  priceAmount: number;
  qrToken: string;
  checkedInAt: string | null;
  checkedInByName: string | null;
}

export interface OrderPaymentDto {
  id: string;
  orderCode: number;
  amount: number;
  status: string;
  transactionRef: string | null;
  paidAt: string | null;
  paymentLinkId: string | null;
  createdAt: string;
}

export interface OrderStatusHistoryItemDto {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export interface OrderSummaryDto {
  id: string;
  bookingCode: string | null;
  channel: string;
  cinemaId: string;
  cinemaCode: string;
  cinemaName: string;
  showtimeId: string;
  movieTitle: string;
  roomName: string;
  showtimeStartsAt: string;
  showtimeEndsAt: string;
  status: OrderStatus;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  contactEmail: string | null;
  contactPhone: string | null;
  manualReviewResolvedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  userId: string | null;
  tickets: OrderTicketDto[];
  payments: OrderPaymentDto[];
  statusHistory: OrderStatusHistoryItemDto[];
  affectedAction?: {
    action: string;
    note: string | null;
    refundReference: string | null;
    refundedAmount: number | null;
    createdAt: string;
  } | null;
}

export interface AdminTodoDto {
  needsManualReviewCount: number;
  needsManualReviewOrders: OrderSummaryDto[];
  affectedCount: number;
  affectedOrders: OrderSummaryDto[];
  failedEmailCount: number;
  failedEmails: {
    id: string;
    toEmail: string;
    kind: string;
    lastError: string | null;
    attempts: number;
    createdAt: string;
  }[];
  upcomingShowtimesCount: number;
  upcomingShowtimes: {
    id: string;
    cinemaId: string;
    cinemaName: string;
    movieTitle: string;
    roomName: string;
    format: string;
    startsAt: string;
    endsAt: string;
  }[];
}
