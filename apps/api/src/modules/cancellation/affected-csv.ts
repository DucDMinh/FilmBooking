/**
 * Xuất CSV đơn bị ảnh hưởng — R-110 (AC-24..AC-26).
 * Quy cách: UTF-8 BOM (\uFEFF) cho Excel hiển thị tiếng Việt, tiêu đề tiếng Việt chuẩn.
 */

import { refundMethodLabel } from "@filmbooking/shared/schemas/cancellation";

export const UTF8_BOM = "\uFEFF";

export interface AffectedOrderCsvRow {
  bookingCode: string;
  orderId?: string;
  cinemaName?: string;
  movieTitle?: string;
  showtimeStartsAt?: string;
  roomName?: string;
  seatLabels?: string[] | string;
  totalAmount: number;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status: string;
  emailStatus?: string | null;
  refundedAmount?: number | null;
  refundReference?: string | null;
  refundMethod?: string | null;
  note?: string | null;
  /** Ngày hoàn do người ghi nhập (YYYY-MM-DD). */
  refundedAt?: string | null;
  /** Thời điểm hệ thống ghi nhận (ISO). */
  processedAt?: string | null;
  performedBy?: string | null;
}

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Vô hiệu hoá formula injection cho Excel bằng cách prepend ' nếu chuỗi bắt đầu bằng =, +, -, @, \t, \r
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatStatusVi(status: string): string {
  if (status === "refunded_manual") return "Đã hoàn tiền thủ công";
  if (status === "affected") return "Chờ xử lý";
  return status;
}

export function formatEmailStatusVi(status?: string | null): string {
  if (!status) return "Không có email";
  if (status === "SENT") return "Đã gửi";
  if (status === "FAILED") return "Gửi thất bại";
  if (status === "PENDING") return "Đang chờ gửi";
  return status;
}

export const CSV_HEADERS = [
  "Mã đặt vé",
  "Mã đơn hàng",
  "Tên rạp",
  "Tên phim",
  "Suất chiếu",
  "Phòng chiếu",
  "Danh sách ghế",
  "Tổng tiền (VNĐ)",
  "Tên khách hàng",
  "Số điện thoại",
  "Email liên hệ",
  "Trạng thái xử lý",
  "Trạng thái gửi email",
  "Số tiền hoàn (VNĐ)",
  "Phương thức hoàn",
  "Ngày hoàn",
  "Mã GD ngân hàng",
  "Ghi chú",
  "Thời gian xử lý",
  "Người xử lý",
];

export function buildAffectedOrdersCsv(rows: AffectedOrderCsvRow[]): string {
  const headerLine = CSV_HEADERS.map(escapeCsvField).join(",");
  const dataLines = rows.map((r) => {
    const seatsStr = Array.isArray(r.seatLabels) ? r.seatLabels.join(", ") : (r.seatLabels ?? "");
    return [
      r.bookingCode,
      r.orderId ?? "",
      r.cinemaName ?? "",
      r.movieTitle ?? "",
      r.showtimeStartsAt ?? "",
      r.roomName ?? "",
      seatsStr,
      r.totalAmount,
      r.contactName ?? "",
      r.contactPhone ?? "",
      r.contactEmail ?? "",
      formatStatusVi(r.status),
      formatEmailStatusVi(r.emailStatus),
      r.refundedAmount ?? "",
      refundMethodLabel(r.refundMethod) ?? "",
      r.refundedAt ?? "",
      r.refundReference ?? "",
      r.note ?? "",
      r.processedAt ?? "",
      r.performedBy ?? "",
    ]
      .map(escapeCsvField)
      .join(",");
  });

  return UTF8_BOM + [headerLine, ...dataLines].join("\r\n");
}
