import { z } from "zod";
import { uuidSchema } from "./orders";

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày phải là YYYY-MM-DD");

// ── 1. Revenue Report (R-112) ───────────────────────────────────────────────
export const revenueReportQuerySchema = z.object({
  cinemaId: uuidSchema.optional(),
  fromDate: dateStringSchema.optional(),
  toDate: dateStringSchema.optional(),
  channel: z.enum(["WEB", "POS"]).optional(),
});
export type RevenueReportQuery = z.infer<typeof revenueReportQuerySchema>;

export interface RevenueReportItemDto {
  reportDate: string;
  cinemaId: string;
  cinemaCode: string;
  cinemaName: string;
  channel: string;
  totalOrders: number;
  totalTickets: number;
  grossRevenue: number;
  totalDiscount: number;
  netRevenue: number;
}

// ── 2. Movie / Showtime Report (R-113) ──────────────────────────────────────
export const movieShowtimeReportQuerySchema = z.object({
  cinemaId: uuidSchema.optional(),
  movieId: uuidSchema.optional(),
  fromDate: dateStringSchema.optional(),
  toDate: dateStringSchema.optional(),
});
export type MovieShowtimeReportQuery = z.infer<typeof movieShowtimeReportQuerySchema>;

export interface MovieShowtimeReportItemDto {
  showtimeId: string;
  cinemaId: string;
  cinemaCode: string;
  cinemaName: string;
  movieId: string;
  movieTitle: string;
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  format: string;
  showtimeStatus: string;
  roomCapacity: number;
  soldSeats: number;
  occupancyRate: number;
  netRevenue: number;
}

// ── 3. PayOS Reconciliation Report (R-116) ──────────────────────────────────
export const payosReconciliationReportQuerySchema = z.object({
  cinemaId: uuidSchema.optional(),
});
export type PayosReconciliationReportQuery = z.infer<typeof payosReconciliationReportQuerySchema>;

export interface PayosReconciliationItemDto {
  paymentId: string;
  orderId: string;
  cinemaId: string;
  cinemaCode: string;
  cinemaName: string;
  orderCode: number;
  paymentAmount: number;
  orderTotalAmount: number;
  paymentStatus: string;
  orderStatus: string;
  transactionRef: string | null;
  discrepancyType: string;
  paymentCreatedAt: string;
  orderCreatedAt: string;
}

// ── 4. Cancelled Showtimes Report (R-119 lát MVP) ───────────────────────────
export const cancelledShowtimesReportQuerySchema = z.object({
  cinemaId: uuidSchema.optional(),
  fromDate: dateStringSchema.optional(),
  toDate: dateStringSchema.optional(),
});
export type CancelledShowtimesReportQuery = z.infer<typeof cancelledShowtimesReportQuerySchema>;

export interface CancelledShowtimeReportItemDto {
  showtimeId: string;
  cinemaId: string;
  cinemaCode: string;
  cinemaName: string;
  movieTitle: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  showtimeStatus: string;
  totalAffectedOrders: number;
  exchangedOrders: number;
  refundedManualOrders: number;
  pendingOrders: number;
  totalRefundedAmount: number;
}
