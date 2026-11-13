import type { OrderStatus } from "@filmbooking/shared/enums";
import type {
  OrderStatusHistoryItemDto,
  OrderSummaryDto,
} from "@filmbooking/shared/schemas/orders";
import type { AuditDbRow, OrderDbRow } from "./orders.types";

/**
 * Chuyển đổi bản ghi DB order thành OrderSummaryDto chuẩn.
 */
export function mapSummaryDto(row: OrderDbRow): OrderSummaryDto {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    channel: row.channel,
    cinemaId: row.cinema_id,
    cinemaCode: row.cinema_code,
    cinemaName: row.cinema_name,
    showtimeId: row.showtime_id,
    movieTitle: row.movie_title,
    roomName: row.room_name,
    showtimeStartsAt: row.showtime_starts_at,
    showtimeEndsAt: row.showtime_ends_at,
    status: row.status as OrderSummaryDto["status"],
    subtotalAmount: row.subtotal_amount,
    discountAmount: row.discount_amount,
    totalAmount: row.total_amount,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    manualReviewResolvedAt: row.manual_review_resolved_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    ticketCount: row.tickets?.length ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lịch sử trạng thái đơn hàng trích xuất từ bảng audit_logs (D/M6, R-103, R-107).
 * Loại bỏ hoàn toàn dữ liệu heuristic giả lập.
 */
export function extractStatusHistory(
  auditRows: AuditDbRow[],
  row: OrderDbRow,
): OrderStatusHistoryItemDto[] {
  const statusHistory: OrderStatusHistoryItemDto[] = [];

  for (const audit of auditRows) {
    const after = audit.after_data as Record<string, unknown> | null | undefined;
    const before = audit.before_data as Record<string, unknown> | null | undefined;

    if (audit.action === "INSERT" && after?.status) {
      statusHistory.push({
        status: after.status as OrderStatus,
        timestamp: audit.occurred_at,
        note: after.cancel_reason ? String(after.cancel_reason) : undefined,
      });
    } else if (audit.action === "UPDATE") {
      if (after?.status && (!before || before.status !== after.status)) {
        let note: string | undefined;
        if (after.cancel_reason) note = String(after.cancel_reason);
        else if (after.mismatch) note = "Lệch số tiền thanh toán";
        statusHistory.push({
          status: after.status as OrderStatus,
          timestamp: audit.occurred_at,
          note,
        });
      } else if (after?.action_detail === "RESOLVE_MANUAL_REVIEW") {
        statusHistory.push({
          status: "needs_manual_review",
          timestamp: audit.occurred_at,
          note: after.note ? String(after.note) : `Đã giải quyết (${after.action ?? ""})`.trim(),
        });
      }
    }
  }

  // Fallback an toàn nếu audit log chưa có bản ghi (ví dụ seed cũ)
  if (statusHistory.length === 0) {
    statusHistory.push({
      status: "holding",
      timestamp: row.created_at,
    });
    if (row.status !== "holding") {
      statusHistory.push({
        status: row.status as OrderStatus,
        timestamp: row.updated_at,
        note: row.cancel_reason ?? undefined,
      });
    }
  }

  statusHistory.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
  return statusHistory;
}
