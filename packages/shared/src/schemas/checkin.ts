import { z } from "zod";

/**
 * Soát vé (R-97..R-102, AC-12, AC-13). Khớp RPC `checkin_ticket` (migration 20261111040400).
 */

const MAX_CODE_LENGTH = 200;

/** Đúng MỘT trong `token` (QR) hoặc `bookingCode` (nhập tay); nhân viên chỉ định rạp đang làm việc. */
export const scanTicketSchema = z
  .object({
    cinemaId: z.guid(),
    token: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
    bookingCode: z.string().trim().min(1).max(MAX_CODE_LENGTH).optional(),
  })
  .strict()
  .refine((value) => (value.token === undefined) !== (value.bookingCode === undefined), {
    message: "Provide exactly one of token or bookingCode",
    path: ["token"],
  });
export type ScanTicketInput = z.infer<typeof scanTicketSchema>;

export const SCAN_RESULTS = ["OK", "USED", "WRONG_CINEMA", "CANCELLED", "EXPIRED", "TOO_EARLY", "NOT_PAID", "NOT_FOUND"] as const;
export type ScanResult = (typeof SCAN_RESULTS)[number];

/** Màu hiển thị cho màn soát vé. */
export type ScanColor = "green" | "yellow" | "red";

export const SCAN_RESULT_COLOR: Record<ScanResult, ScanColor> = {
  OK: "green",
  USED: "red",
  TOO_EARLY: "red",
  WRONG_CINEMA: "red",
  CANCELLED: "red",
  EXPIRED: "red",
  NOT_PAID: "red",
  NOT_FOUND: "red",
};

/**
 * Phản hồi soát vé (QR cấp đơn: một lần quét = cả đơn). Mỗi trường chỉ xuất hiện ở kết quả liên quan:
 * WRONG_CINEMA chỉ có `correctCinema` (tên + địa chỉ rạp), KHÔNG có tên khách/ghế/email (AC-13).
 */
export interface ScanTicketResponse {
  result: ScanResult;
  color: ScanColor;
  message: string;
  order?: {
    orderId: string;
    bookingCode: string;
    movieTitle: string;
    cinemaName: string;
    roomName: string;
    /** Mọi ghế của đơn (xếp tự nhiên: A2 trước A10); một lần quét soát cả đơn. */
    seats: string[];
    seatCount: number;
    startsAt: string;
    checkedInAt: string;
  };
  used?: { checkedInAt: string; staffName: string };
  correctCinema?: { id: string; code: string; name: string; address: string | null };
  startsAt?: string;
}
