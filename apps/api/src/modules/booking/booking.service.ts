import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type {
  AgeConfirmResponse,
  ApplyVoucherResponse,
  BookingSummaryResponse,
  ConsentResponse,
  HoldSeatsInput,
  HoldSeatsResponse,
} from "@filmbooking/shared/schemas/booking";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { buildBookingSummary, handleHoldError, handleVoucherBusinessError } from "./booking.helper";

@Injectable()
export class BookingService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly accessService: AccessService,
  ) {}

  /**
   * Giữ ghế nguyên tử (R-05, R-61..R-67, AC-01, AC-06).
   * Chỉ CUSTOMER đã xác nhận email mới được gọi. Staff/Manager/Admin bị từ chối 403.
   */
  async hold(user: AuthUser, req: AuthenticatedRequest, input: HoldSeatsInput): Promise<HoldSeatsResponse> {
    const emailConfirmed = await this.accessService.isEmailConfirmed(req);
    if (!emailConfirmed) {
      throw new AppException(ERROR_CODES.EMAIL_NOT_CONFIRMED, "Tài khoản chưa xác nhận email, không thể đặt vé");
    }

    const access = await this.accessService.loadForRequest(req);
    if (access.isAdmin || access.cinemaRoles.size > 0) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Chỉ khách hàng (CUSTOMER) mới được đặt vé online");
    }

    const { data, error } = await this.supabase.forUser(user.jwt).rpc("hold_seats", {
      p_showtime_id: input.showtimeId,
      p_seat_ids: input.seatIds,
      p_channel: "WEB",
    });

    if (error) {
      handleHoldError(error);
    }

    const row = Array.isArray(data) ? data[0] : (data as Record<string, unknown>);
    return {
      orderId: (row as { order_id: string }).order_id,
      bookingCode: (row as { booking_code: string }).booking_code,
      holdExpiresAt: (row as { hold_expires_at: string }).hold_expires_at,
      subtotalAmount: (row as { subtotal_amount: number }).subtotal_amount,
      discountAmount: (row as { discount_amount: number }).discount_amount,
      totalAmount: (row as { total_amount: number }).total_amount,
      seatCount: (row as { seat_count: number }).seat_count,
    };
  }

  /**
   * Nhả ghế đang giữ của đơn.
   */
  async releaseHold(user: AuthUser, orderId: string): Promise<{ ok: boolean; orderId: string }> {
    const { error } = await this.supabase.forUser(user.jwt).rpc("release_seats", {
      p_order_id: orderId,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("ORDER_NOT_FOUND")) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
      }
      if (msg.includes("PERMISSION_DENIED")) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền thao tác trên đơn hàng này");
      }
      if (msg.includes("INVALID_ORDER_STATUS")) {
        throw new AppException(ERROR_CODES.CONFLICT, "Chỉ có thể nhả ghế cho đơn đang ở trạng thái holding");
      }
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, msg);
    }

    return { ok: true, orderId };
  }

  /**
   * Tóm tắt đơn hàng (R-70).
   */
  async getBooking(user: AuthUser, orderId: string): Promise<BookingSummaryResponse> {
    const userDb = this.supabase.forUser(user.jwt);

    const { data: order } = await userDb
      .from("orders")
      .select(
        "id, booking_code, status, subtotal_amount, discount_amount, total_amount, hold_expires_at, consent_at, age_confirmed, cinema_id, cinema_code, cinema_name, showtime_id, showtime_starts_at, showtime_ends_at, room_name, movie_title, user_id",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      await this.ensureOrderAccessOrThrow(user, orderId);
      throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
    }

    if (order.user_id !== user.id) {
      const access = await this.accessService.loadForRequest({ user });
      if (!access.isAdmin && !access.cinemaRoles.has(order.cinema_id as string)) {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền truy cập đơn hàng này");
      }
    }

    const [seatsRes, cinemaRes, showtimeRes] = await Promise.all([
      userDb.from("order_seats").select("seat_id, seat_label, seat_type, price_amount").eq("order_id", orderId),
      userDb.from("cinemas").select("address, district").eq("id", order.cinema_id).maybeSingle(),
      userDb.from("showtimes").select("movie_id, format, movies(age_rating, poster_url)").eq("id", order.showtime_id).maybeSingle(),
    ]);

    const voucher = await this.resolveVoucherSummary(orderId, order.discount_amount);

    return buildBookingSummary({
      order,
      cinema: cinemaRes.data,
      showtime: showtimeRes.data,
      seats: seatsRes.data ?? [],
      voucher,
    });
  }

  /**
   * Xác nhận độ tuổi xem phim (R-68).
   * Cập nhật `orders` qua service role (admin) sau khi kiểm tra quyền sở hữu đơn.
   */
  async ageConfirm(user: AuthUser, orderId: string): Promise<AgeConfirmResponse> {
    const order = await this.verifyOrderActionEligibility(user, orderId, "xác nhận độ tuổi");

    const { error } = await this.supabase
      .admin()
      .from("orders")
      .update({ age_confirmed: true })
      .eq("id", order.id);

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    return { ok: true, ageConfirmed: true };
  }

  /**
   * Lưu bằng chứng đồng ý chính sách không huỷ/không hoàn (R-71, R-133, AC-08).
   * Ghi qua service role (admin) sau khi kiểm tra quyền sở hữu đơn; DB tự điền accepted_at qua default now().
   */
  async saveConsent(
    user: AuthUser,
    orderId: string,
    ip: string,
    userAgent?: string,
    version: string = "1.0.0",
  ): Promise<ConsentResponse> {
    const order = await this.verifyOrderActionEligibility(user, orderId, "xác nhận điều khoản");
    const consentAt = new Date().toISOString();

    const [updateOrder, insertConsent] = await Promise.all([
      this.supabase.admin().from("orders").update({ consent_at: consentAt }).eq("id", order.id),
      this.supabase.admin().from("consents").insert({
        user_id: user.id,
        consent_type: "NO_REFUND_BOOKING",
        version,
        metadata: { order_id: order.id, ip, user_agent: userAgent ?? null },
      }),
    ]);

    if (updateOrder.error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, updateOrder.error.message);
    if (insertConsent.error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, insertConsent.error.message);

    return { ok: true, consentAt, version };
  }

  /**
   * Áp dụng voucher cho đơn hàng (R-90..R-95).
   * Rate limit: tối đa 10 lần nhập/phút/khách -> 429 nếu vượt (R-95).
   */
  async applyVoucher(user: AuthUser, orderId: string, code: string): Promise<ApplyVoucherResponse> {
    const { data, error } = await this.supabase.forUser(user.jwt).rpc("apply_voucher", {
      p_order_id: orderId,
      p_code: code,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("FORBIDDEN") || (error as { code?: string }).code === "42501") {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền áp dụng voucher cho đơn này");
      }
      if (msg.includes("ORDER_NOT_FOUND")) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
      }
      if (msg.includes("RATE_LIMITED")) {
        throw new AppException(
          ERROR_CODES.RATE_LIMITED,
          "Bạn đã thử nhập voucher quá nhiều lần (tối đa 10 lần/phút). Vui lòng thử lại sau.",
          { retryAfter: 60 },
        );
      }
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, msg);
    }

    const res = data as {
      ok: boolean;
      error_code?: string;
      order_id: string;
      voucher_id: string;
      code: string;
      subtotal_amount: number;
      discount_amount: number;
      total_amount: number;
    };

    if (!res.ok) {
      handleVoucherBusinessError(res.error_code);
    }

    return {
      orderId: res.order_id,
      voucherId: res.voucher_id,
      code: res.code,
      subtotalAmount: res.subtotal_amount,
      discountAmount: res.discount_amount,
      totalAmount: res.total_amount,
    };
  }

  /**
   * Gỡ voucher khỏi đơn hàng.
   */
  async removeVoucher(user: AuthUser, orderId: string): Promise<ApplyVoucherResponse> {
    const { data, error } = await this.supabase.forUser(user.jwt).rpc("remove_voucher", {
      p_order_id: orderId,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("FORBIDDEN") || (error as { code?: string }).code === "42501") {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền gỡ voucher khỏi đơn này");
      }
      if (msg.includes("ORDER_NOT_FOUND")) {
        throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
      }
      if (msg.includes("ORDER_NOT_HOLDING")) {
        throw new AppException(ERROR_CODES.HOLD_EXPIRED, "Đơn hàng đã hết hạn giữ ghế");
      }
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, msg);
    }

    const res = data as {
      order_id: string;
      subtotal_amount: number;
      discount_amount: number;
      total_amount: number;
    };

    return {
      orderId: res.order_id,
      voucherId: null,
      code: null,
      subtotalAmount: res.subtotal_amount,
      discountAmount: 0,
      totalAmount: res.total_amount,
    };
  }

  /**
   * Lấy mã voucher hiển thị cho khách qua admin client (bảng vouchers có RLS chỉ Admin/Manager SELECT).
   */
  private async resolveVoucherSummary(orderId: string, discountAmount: number) {
    if (discountAmount <= 0) return null;

    const { data: redemption } = await this.supabase
      .admin()
      .from("voucher_redemptions")
      .select("voucher_id, discount_amount")
      .eq("order_id", orderId)
      .in("status", ["HELD", "CONSUMED"])
      .maybeSingle();

    if (!redemption) return null;

    const { data: v } = await this.supabase
      .admin()
      .from("vouchers")
      .select("code")
      .eq("id", redemption.voucher_id)
      .maybeSingle();

    return {
      code: (v as { code?: string } | null)?.code ?? "",
      discount: redemption.discount_amount,
    };
  }

  private async verifyOrderActionEligibility(user: AuthUser, orderId: string, actionName: string) {
    const userDb = this.supabase.forUser(user.jwt);
    const { data: order } = await userDb
      .from("orders")
      .select("id, user_id, status, hold_expires_at")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      await this.ensureOrderAccessOrThrow(user, orderId);
      throw new AppException(ERROR_CODES.NOT_FOUND, "Đơn hàng không tồn tại");
    }

    if (order.user_id !== user.id) {
      throw new AppException(ERROR_CODES.FORBIDDEN, `Không có quyền thao tác trên đơn hàng này`);
    }

    if (order.status !== "holding" && order.status !== "pending_payment") {
      throw new AppException(ERROR_CODES.CONFLICT, `Đơn hàng không ở trạng thái có thể ${actionName}`);
    }

    if (order.hold_expires_at && new Date(order.hold_expires_at) < new Date()) {
      throw new AppException(ERROR_CODES.HOLD_EXPIRED, "Đơn giữ ghế đã hết hạn");
    }

    return order;
  }

  private async ensureOrderAccessOrThrow(user: AuthUser, orderId: string) {
    const { data: existing } = await this.supabase
      .admin()
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .maybeSingle();

    if (existing && existing.user_id !== user.id) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền thao tác trên đơn hàng này");
    }
  }
}
