import { refundMethodLabel } from "@filmbooking/shared/schemas/cancellation";
import type { AffectedOrderDto, AffectedOrderStatus, EmailDeliveryStatus } from "@filmbooking/shared/schemas/cancellation";

import { ApiError } from "@/lib/api/client";

export const ORDER_STATUS_LABEL: Record<AffectedOrderStatus, string> = {
  affected: "Chờ xử lý",
  refunded_manual: "Đã hoàn tiền",
};

/** "2026-11-18" -> "18/11/2026" (ngày thuần, không qua múi giờ). */
export function formatRefundDate(isoDate: string | null): string {
  const match = isoDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Chưa ghi";
}

/** Phương thức hoàn bằng nhãn tiếng Việt; bản ghi cũ chưa có -> "Chưa ghi". */
export function refundMethodText(method: string | null): string {
  return refundMethodLabel(method) ?? "Chưa ghi";
}

export const EMAIL_STATUS_LABEL: Record<EmailDeliveryStatus, string> = {
  SENT: "Đã gửi",
  FAILED: "Lỗi",
  PENDING: "Đang chờ gửi",
};

export interface AffectedFilters {
  status?: AffectedOrderStatus;
  showtimeId?: string;
  cinemaId?: string;
}

/** Nút gửi lại chỉ có nghĩa khi email lỗi, hoặc chưa có email mà đơn có địa chỉ (server tạo outbox mới). */
export function canResendEmail(order: Pick<AffectedOrderDto, "emailStatus" | "contactEmail" | "status">): boolean {
  if (order.status !== "affected") return false;
  if (order.emailStatus === "FAILED") return true;
  return order.emailStatus === null && Boolean(order.contactEmail?.trim());
}

export function resendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "Email đang chờ gửi hoặc đã gửi, không cần gửi lại.";
  return error instanceof ApiError ? error.message : "Không gửi lại được email. Vui lòng thử lại.";
}

export function filtersToQuery(filters: AffectedFilters, page?: { limit: number; offset: number }): string {
  const params = new URLSearchParams();
  if (filters.cinemaId) params.set("cinemaId", filters.cinemaId);
  if (page) {
    params.set("limit", String(page.limit));
    params.set("offset", String(page.offset));
  }
  if (filters.status) params.set("status", filters.status);
  if (filters.showtimeId) params.set("showtimeId", filters.showtimeId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Tải CSV qua proxy cùng origin (cookie phiên -> proxy gắn Bearer). apiFetch chỉ parse JSON nên dùng fetch thô;
 * lỗi (kể cả 403/500) ném ApiError, không bao giờ tải một file lỗi về như thể thành công.
 */
export async function downloadAffectedCsv(filters: AffectedFilters): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/proxy/admin/affected-orders/export${filtersToQuery(filters)}`, { cache: "no-store" });
  } catch {
    throw new ApiError("UNKNOWN", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.", 0);
  }
  if (!res.ok) throw new ApiError("UNKNOWN", "Không xuất được file CSV. Vui lòng thử lại.", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "don-bi-anh-huong.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Trễ để trình duyệt kịp bắt đầu tải trước khi thu hồi URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
