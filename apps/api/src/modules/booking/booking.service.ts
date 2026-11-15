import { HttpException, Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import type {
  AgeConfirmResponse, ApplyVoucherResponse, BookingSummaryResponse,
  ConsentResponse, HoldSeatsInput, HoldSeatsResponse,
} from "@filmbooking/shared/schemas/booking";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { reportAlert } from "../../common/monitoring/sentry";
import { SupabaseService } from "../../common/supabase/supabase.service";
import {
  buildBookingSummary,
  ensureOrderAccessOrThrow,
  handleHoldError,
  handleVoucherBusinessError,
  resolveVoucherSummary,
  verifyOrderActionEligibility,
} from "./booking.helper";

const SERVER_CONSENT_VERSION = "1.0.0";

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
      try {
        handleHoldError(error);
      } catch (thrown) {
        // Chỉ lỗi không mong đợi (5xx) tính vào "tỷ lệ lỗi giữ ghế"; SEAT_TAKEN/409... là bình thường.
        if (thrown instanceof HttpException && thrown.getStatus() >= 500) {
          reportAlert({ alert: "hold_error", message: "Giữ ghế lỗi không mong đợi", extra: { showtimeId: input.showtimeId } });
        }
        throw thrown;
      }
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
    await verifyOrderActionEligibility(this.supabase.forUser(user.jwt), this.supabase.admin(), user, orderId, "nhả ghế");

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
      await ensureOrderAccessOrThrow(this.supabase.admin(), user, orderId);
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

    const voucher = await resolveVoucherSummary(this.supabase.admin(), orderId, order.discount_amount);

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
    const order = await verifyOrderActionEligibility(this.supabase.forUser(user.jwt), this.supabase.admin(), user, orderId, "xác nhận độ tuổi");

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
    ip: string | null,
    userAgent?: string,
    version: string = SERVER_CONSENT_VERSION,
  ): Promise<ConsentResponse> {
    const order = await verifyOrderActionEligibility(this.supabase.forUser(user.jwt), this.supabase.admin(), user, orderId, "xác nhận điều khoản");

    if (version && version !== SERVER_CONSENT_VERSION) {
      throw new AppException(ERROR_CODES.VALIDATION_ERROR, "Phiên bản điều khoản không hợp lệ");
    }
    const enforcedVersion = SERVER_CONSENT_VERSION;

    // Ghi nhận consents trước để DB sinh accepted_at chính xác
    const { data: consentRecord, error: insertError } = await this.supabase
      .admin()
      .from("consents")
      .insert({
        user_id: user.id,
        consent_type: "NO_REFUND_BOOKING",
        version: enforcedVersion,
        metadata: { order_id: order.id, ip: ip || null, user_agent: userAgent ?? null },
      })
      .select("accepted_at")
      .single();

    if (insertError || !consentRecord) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, insertError?.message ?? "Không thể lưu bằng chứng đồng ý");
    }

    const consentAt = (consentRecord as { accepted_at: string }).accepted_at;

    // Cập nhật orders.consent_at theo accepted_at thực tế do DB ghi nhận
    const { error: updateError } = await this.supabase
      .admin()
      .from("orders")
      .update({ consent_at: consentAt })
      .eq("id", order.id);

    if (updateError) {
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, updateError.message);
    }

    return { ok: true, consentAt, version: enforcedVersion };
  }

  /**
   * Áp dụng voucher cho đơn hàng (R-90..R-95).
   * Rate limit: tối đa 10 lần nhập/phút/khách -> 429 nếu vượt (R-95).
   */
  async applyVoucher(user: AuthUser, orderId: string, code: string): Promise<ApplyVoucherResponse> {
    await verifyOrderActionEligibility(this.supabase.forUser(user.jwt), this.supabase.admin(), user, orderId, "áp dụng voucher");

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
    await verifyOrderActionEligibility(this.supabase.forUser(user.jwt), this.supabase.admin(), user, orderId, "gỡ voucher");

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
}
