"use client";

import { useSearchParams } from "next/navigation";

import type { OrderStatus } from "@filmbooking/shared/enums";
import type { OrderSummaryDto } from "@filmbooking/shared/schemas/orders";

import { useAdminMe, type AdminMeState } from "./form-utils";
import { resolveScope } from "./use-admin-scope";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  holding: "Đang giữ ghế",
  pending_payment: "Chờ thanh toán",
  paid: "Đã thanh toán",
  expired: "Hết hạn",
  cancelled: "Đã huỷ",
  checked_in: "Đã soát vé",
  affected: "Bị ảnh hưởng",
  exchanged: "Đã đổi",
  refunded_manual: "Đã hoàn tiền thủ công",
  needs_manual_review: "Cần xử lý thủ công",
};

export type OrderTone = "neutral" | "success" | "warning" | "danger" | "info";

export const ORDER_STATUS_TONE: Record<OrderStatus, OrderTone> = {
  holding: "neutral",
  pending_payment: "warning",
  paid: "success",
  expired: "neutral",
  cancelled: "neutral",
  checked_in: "info",
  affected: "warning",
  exchanged: "info",
  refunded_manual: "info",
  needs_manual_review: "danger",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_RE.test(value);

/** Link chi tiết: ưu tiên mã đặt vé; đơn chưa có mã (đang giữ/lỗi) dùng id. */
export const orderHref = (order: Pick<OrderSummaryDto, "id" | "bookingCode">): string =>
  `/admin/don-hang/${encodeURIComponent(order.bookingCode ?? order.id)}`;

/** Quyền xử lý thủ công theo TỪNG rạp: Admin, hoặc Manager của đúng rạp đơn. Staff/Manager rạp khác = chỉ đọc. */
export function canResolveOrder(me: AdminMeState["me"], cinemaId: string): boolean {
  if (!me) return false;
  return me.isAdmin || me.cinemas.some((c) => c.cinemaId === cinemaId && c.role === "MANAGER");
}

/** RPC resolve KHÔNG đổi status: đơn đã giải quyết vẫn là needs_manual_review + manualReviewResolvedAt. */
export const isManualReviewResolved = (order: Pick<OrderSummaryDto, "status" | "manualReviewResolvedAt">): boolean =>
  order.status === "needs_manual_review" && order.manualReviewResolvedAt !== null;

/** Nhãn + tone hiển thị của đơn, có xét trạng thái "đã giải quyết thủ công". */
export function orderStatusView(order: Pick<OrderSummaryDto, "status" | "manualReviewResolvedAt">): {
  label: string;
  tone: OrderTone;
} {
  if (isManualReviewResolved(order)) return { label: "Đã xử lý thủ công", tone: "info" };
  return { label: ORDER_STATUS_LABEL[order.status] ?? order.status, tone: ORDER_STATUS_TONE[order.status] ?? "neutral" };
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  CANCELLED: "Đã huỷ",
  EXPIRED: "Hết hạn",
  FAILED: "Thất bại",
};
export const paymentStatusLabel = (status: string): string => PAYMENT_STATUS_LABEL[status] ?? status;

const AFFECTED_ACTION_LABEL: Record<string, string> = { EXCHANGED: "Đã đổi vé", REFUNDED_MANUAL: "Đã hoàn tiền thủ công" };
export const affectedActionLabel = (action: string): string => AFFECTED_ACTION_LABEL[action] ?? action;

const MAIL_KIND_LABEL: Record<string, string> = {
  TICKET_ISSUED: "Gửi vé",
  TICKET: "Gửi vé",
  ACCOUNT_LOCKED_ALERT: "Cảnh báo khoá tài khoản",
  ACCOUNT_LOCKED: "Cảnh báo khoá tài khoản",
  IDENTITY_LINKED: "Liên kết tài khoản",
  IDENTITY_UNLINKED: "Huỷ liên kết tài khoản",
  LATE_PAYMENT_MANUAL_REVIEW: "Thanh toán muộn",
  AMOUNT_MISMATCH_MANUAL_REVIEW: "Lệch số tiền thanh toán",
  LATE_PAYMENT: "Thanh toán muộn",
  SHOWTIME_CANCELLED: "Huỷ suất chiếu",
  PASSWORD_SET: "Đặt mật khẩu",
  OAUTH_MISSING_EMAIL_COLLISION: "Đăng nhập xã hội trùng email",
  OAUTH_MISSING_EMAIL_VERIFY: "Xác minh email đăng nhập xã hội",
};
export const mailKindLabel = (kind: string): string => MAIL_KIND_LABEL[kind.toUpperCase().trim()] ?? kind;

export interface OrdersScope {
  me: AdminMeState;
  /** `undefined` = toàn chuỗi. Chỉ là bộ lọc hiển thị; API vẫn kiểm quyền theo rạp. */
  cinemaId: string | undefined;
}

/**
 * Phạm vi rạp của trang (khớp bộ chọn ở shell, `?cinema=`).
 * Admin: nhận bất kỳ UUID hợp lệ (rạp tạm đóng không có trong danh sách công khai; API vẫn kiểm quyền).
 * Manager/Staff: chỉ rạp được gán, mặc định rạp đầu tiên.
 */
export function useOrdersScope(): OrdersScope {
  const me = useAdminMe();
  const raw = useSearchParams().get("cinema");
  if (me.role === "ADMIN") return { me, cinemaId: raw && isUuid(raw) ? raw : undefined };
  const cinemas = (me.me?.cinemas ?? []).map((c) => ({ id: c.cinemaId, name: c.cinemaId }));
  const scope = resolveScope(raw, cinemas, false);
  return { me, cinemaId: scope === "all" ? undefined : scope };
}
