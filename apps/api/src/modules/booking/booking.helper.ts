import { Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ERROR_CODES } from "@filmbooking/shared";
import type { BookingSummaryResponse } from "@filmbooking/shared/schemas/booking";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";

const logger = new Logger("BookingHelper");

/**
 * Xử lý lỗi trả về từ RPC hold_seats (AC-01, AC-06, R-05, R-61..R-67).
 * Hỗ trợ regex nhận diện cả "Ghế ... đã có người giữ" và "Ghế ... đang bị khoá".
 */
export function handleHoldError(error: { message: string; code?: string }): never {
  const msg = error.message;

  if (msg.includes("SEAT_TAKEN")) {
    const match = msg.match(/Ghế\s+(.+?)\s+(?:đã|đang)/i);
    const seats = match && match[1] ? match[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
    throw new AppException(ERROR_CODES.SEAT_TAKEN, msg, { seats });
  }
  if (msg.includes("ORPHAN_SEAT")) throw new AppException(ERROR_CODES.ORPHAN_SEAT, msg);
  if (msg.includes("HOLD_LIMIT")) throw new AppException(ERROR_CODES.HOLD_LIMIT, msg);
  if (msg.includes("SALES_CLOSED")) throw new AppException(ERROR_CODES.SALES_CLOSED, msg);
  if (msg.includes("SHOWTIME_CANCELLED")) throw new AppException(ERROR_CODES.SHOWTIME_CANCELLED, msg);
  if (msg.includes("SHOWTIME_NOT_FOUND")) throw new AppException(ERROR_CODES.NOT_FOUND, msg);
  if (msg.includes("CINEMA_NOT_OPEN")) throw new AppException(ERROR_CODES.CINEMA_NOT_OPEN, msg);
  if (msg.includes("MOVIE_NOT_PUBLISHED")) throw new AppException(ERROR_CODES.MOVIE_NOT_PUBLISHED, msg);
  if (msg.includes("UNDERAGE_FOR_RATING") || msg.includes("AGE_RESTRICTED")) {
    throw new AppException(ERROR_CODES.AGE_RESTRICTED, msg);
  }
  if (msg.includes("EMAIL_NOT_CONFIRMED")) throw new AppException(ERROR_CODES.EMAIL_NOT_CONFIRMED, msg);
  // Mỗi lỗi nghiệp vụ của hold_seats có mã riêng để web hiện đúng nguyên nhân (CR-017);
  // VALIDATION_ERROR chỉ dành cho lỗi biểu mẫu do zod pipe sinh ra.
  if (msg.includes("DOB_REQUIRED")) throw new AppException(ERROR_CODES.DOB_REQUIRED, msg);
  if (msg.includes("SEAT_REQUIRED")) throw new AppException(ERROR_CODES.SEAT_REQUIRED, msg);
  if (msg.includes("DUPLICATE_SEATS")) throw new AppException(ERROR_CODES.DUPLICATE_SEATS, msg);
  if (msg.includes("INVALID_SEATS")) throw new AppException(ERROR_CODES.INVALID_SEATS, msg);
  if (msg.includes("PERMISSION_DENIED")) throw new AppException(ERROR_CODES.FORBIDDEN, msg);

  throw new AppException(ERROR_CODES.INTERNAL_ERROR, msg);
}

/**
 * Ánh xạ mã lỗi nghiệp vụ từ RPC apply_voucher sang AppException tương ứng (R-90..R-95).
 */
export function handleVoucherBusinessError(errorCode?: string): never {
  switch (errorCode) {
    case "RATE_LIMITED":
      throw new AppException(
        ERROR_CODES.RATE_LIMITED,
        "Bạn đã thử nhập voucher quá nhiều lần (tối đa 10 lần/phút). Vui lòng thử lại sau.",
        { retryAfter: 60 },
      );
    case "VOUCHER_INVALID":
      throw new AppException(ERROR_CODES.VOUCHER_NOT_FOUND, "Mã voucher không tồn tại hoặc không còn hiệu lực");
    case "VOUCHER_EXPIRED":
      throw new AppException(ERROR_CODES.VOUCHER_EXPIRED, "Mã voucher đã hết hạn sử dụng");
    case "VOUCHER_EXHAUSTED":
    case "VOUCHER_USER_LIMIT_REACHED":
      throw new AppException(ERROR_CODES.VOUCHER_EXHAUSTED, "Mã voucher đã hết lượt sử dụng");
    case "VOUCHER_MIN_NOT_MET":
      throw new AppException(ERROR_CODES.VOUCHER_MIN_ORDER, "Đơn hàng chưa đạt giá trị tối thiểu để áp dụng voucher");
    case "VOUCHER_NOT_APPLICABLE":
      throw new AppException(ERROR_CODES.VOUCHER_NOT_APPLICABLE_SHOWTIME, "Voucher không áp dụng cho suất chiếu này");
    case "VOUCHER_NOT_APPLICABLE_CINEMA":
      throw new AppException(ERROR_CODES.VOUCHER_NOT_APPLICABLE_CINEMA, "Voucher không áp dụng cho rạp này");
    case "VOUCHER_ALREADY_APPLIED":
      throw new AppException(ERROR_CODES.CONFLICT, "Đơn hàng đã được áp dụng voucher");
    case "ORDER_NOT_FOUND":
      throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
    case "ORDER_NOT_HOLDING":
    case "ORDER_EXPIRED":
      throw new AppException(ERROR_CODES.HOLD_EXPIRED, "Đơn hàng đã hết hạn giữ ghế");
    case "FORBIDDEN":
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền áp dụng voucher cho đơn này");
    default:
      // Mã RPC chưa được ánh xạ: không lộ mã nội bộ cho khách, ghi log để bổ sung ánh xạ.
      logger.warn(`apply_voucher trả mã lỗi chưa ánh xạ: ${errorCode ?? "(rỗng)"}`);
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, "Không áp dụng được voucher");
  }
}

interface BuildSummaryParams {
  order: {
    id: string;
    booking_code: string;
    status: string;
    subtotal_amount: number;
    discount_amount: number;
    total_amount: number;
    hold_expires_at: string | null;
    consent_at: string | null;
    age_confirmed: boolean;
    cinema_id: string;
    cinema_code: string;
    cinema_name: string;
    showtime_id: string;
    showtime_starts_at: string;
    showtime_ends_at: string;
    room_name: string;
    movie_title: string;
  };
  cinema?: { address?: string; district?: string | null } | null;
  showtime?: { format?: string; movies?: unknown } | null;
  seats: Array<{ seat_id: string; seat_label: string; seat_type: string; price_amount: number }>;
  voucher: { code: string; discount: number } | null;
}

/**
 * Xây dựng tóm tắt đơn hàng trả về cho khách (R-70).
 */
export function buildBookingSummary(params: BuildSummaryParams): BookingSummaryResponse {
  const { order, cinema, showtime, seats, voucher } = params;
  const holdExpiresAt = order.hold_expires_at ? new Date(order.hold_expires_at) : null;
  const expiresInSeconds = holdExpiresAt ? Math.max(0, Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000)) : 0;
  const movieRel = showtime?.movies as { age_rating?: string; poster_url?: string } | undefined;

  return {
    id: order.id,
    bookingCode: order.booking_code,
    status: order.status,
    holdExpiresAt: order.hold_expires_at,
    expiresInSeconds,
    movie: {
      title: order.movie_title,
      ageRating: movieRel?.age_rating ?? null,
      posterUrl: movieRel?.poster_url ?? null,
    },
    cinema: {
      id: order.cinema_id,
      code: order.cinema_code,
      name: order.cinema_name,
      address: cinema?.address ?? "",
      district: cinema?.district ?? null,
    },
    showtime: {
      id: order.showtime_id,
      startsAt: order.showtime_starts_at,
      endsAt: order.showtime_ends_at,
      roomName: order.room_name,
      format: showtime?.format ?? "2D",
    },
    seats: seats.map((s) => ({
      id: s.seat_id,
      label: s.seat_label,
      type: s.seat_type,
      price: s.price_amount,
    })),
    pricing: {
      subtotal: order.subtotal_amount,
      discount: order.discount_amount,
      total: order.total_amount,
    },
    voucher,
    consent: {
      consented: Boolean(order.consent_at),
      consentAt: order.consent_at,
    },
    ageConfirmed: order.age_confirmed,
  };
}

/**
 * Lấy mã voucher hiển thị cho khách qua admin client (bảng vouchers có RLS chỉ Admin/Manager SELECT).
 */
export async function resolveVoucherSummary(adminDb: SupabaseClient, orderId: string, discountAmount: number) {
  if (discountAmount <= 0) return null;

  const { data: redemption } = await adminDb
    .from("voucher_redemptions")
    .select("voucher_id, discount_amount")
    .eq("order_id", orderId)
    .in("status", ["HELD", "CONSUMED"])
    .maybeSingle();

  if (!redemption) return null;

  const { data: v } = await adminDb
    .from("vouchers")
    .select("code")
    .eq("id", redemption.voucher_id)
    .maybeSingle();

  return {
    code: (v as { code?: string } | null)?.code ?? "",
    discount: redemption.discount_amount,
  };
}

/**
 * Kiểm tra xem người dùng có quyền tiếp cận đơn (tránh lộ thông tin khi RLS trả về rỗng).
 */
export async function ensureOrderAccessOrThrow(adminDb: SupabaseClient, user: AuthUser, orderId: string) {
  const { data: existing } = await adminDb
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (existing && existing.user_id !== user.id) {
    throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền thao tác trên đơn hàng này");
  }
}

/**
 * Xác thực tư cách thao tác trên đơn hàng (A/MAJOR-3):
 * 1. Đơn phải tồn tại và thuộc về chính khách hàng đang đăng nhập.
 * 2. Đơn phải ở trạng thái holding hoặc pending_payment.
 * 3. Đơn giữ ghế chưa hết hạn.
 */
export async function verifyOrderActionEligibility(
  userDb: SupabaseClient,
  adminDb: SupabaseClient,
  user: AuthUser,
  orderId: string,
  actionName: string,
) {
  const { data: order } = await userDb
    .from("orders")
    .select("id, user_id, status, hold_expires_at")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    await ensureOrderAccessOrThrow(adminDb, user, orderId);
    throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
  }

  if (order.user_id !== user.id) {
    throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền thao tác trên đơn hàng này");
  }

  if (order.status !== "holding" && order.status !== "pending_payment") {
    throw new AppException(ERROR_CODES.CONFLICT, `Đơn hàng không ở trạng thái có thể ${actionName}`);
  }

  if (order.hold_expires_at && new Date(order.hold_expires_at) < new Date()) {
    throw new AppException(ERROR_CODES.HOLD_EXPIRED, "Đơn giữ ghế đã hết hạn");
  }

  return order;
}
