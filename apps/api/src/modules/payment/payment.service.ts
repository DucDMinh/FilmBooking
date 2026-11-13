import { Inject, Injectable, Logger } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  PAYOS_SUCCESS_CODE,
  type BookingPaymentStatus,
  type CancelPaymentResultDto,
  type CreatePaymentBody,
  type CreatePaymentResultDto,
  type PaymentStatusDto,
  type PayosWebhookData,
} from "@filmbooking/shared/schemas/payment";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { ENV, type Env } from "../../config/env";
import { PayosClient } from "./payos.client";

/**
 * AC-08: tạo payment khi chưa có consent -> 409 CONSENT_REQUIRED
 */
export class ConsentRequiredException extends AppException {
  constructor(message = "Cần đồng ý điều khoản không huỷ/không hoàn trước khi thanh toán") {
    super(ERROR_CODES.CONSENT_REQUIRED, message);
    Object.defineProperty(this, "status", { value: 409 });
  }

  override getStatus(): number {
    return 409;
  }
}

interface OrderDbRow {
  id: string;
  cinema_id: string;
  user_id: string | null;
  status: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  booking_code: string | null;
  hold_expires_at: string | null;
  consent_at: string | null;
  cinema_code: string;
}

interface PaymentDbRow {
  id: string;
  cinema_id: string;
  order_id: string;
  order_code: number;
  amount: number;
  status: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(ENV) private readonly env: Env,
    @Inject(PayosClient) private readonly payosClient: PayosClient,
  ) {}

  /**
   * POST /bookings/:id/payment (R-73, R-82).
   * Cần consent (AC-08); đơn 0đ -> confirm_zero_amount; tạo link PayOS cho đơn có tiền.
   */
  async createPayment(
    bookingId: string,
    user: AuthUser,
    clientUrls?: CreatePaymentBody,
  ): Promise<CreatePaymentResultDto> {
    const { data: orderData, error } = await this.supabase
      .admin()
      .from("orders")
      .select(
        "id, cinema_id, user_id, status, subtotal_amount, discount_amount, total_amount, booking_code, hold_expires_at, consent_at, cinema_code",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !orderData) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn đặt vé");
    }

    const order = orderData as OrderDbRow;

    if (order.user_id !== user.id) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền thanh toán đơn hàng này");
    }

    // AC-08: tạo payment khi chưa có consent -> 409 CONSENT_REQUIRED
    if (!order.consent_at) {
      throw new ConsentRequiredException();
    }

    if (order.status !== "holding" && order.status !== "pending_payment") {
      if (order.status === "paid") {
        return {
          status: "PAID",
          checkoutUrl: null,
          expiresAt: null,
          bookingCode: order.booking_code,
        };
      }
      throw new AppException(
        ERROR_CODES.CONFLICT,
        `Trạng thái đơn không hợp lệ để thanh toán (${order.status})`,
      );
    }

    if (!order.hold_expires_at || new Date(order.hold_expires_at).getTime() <= Date.now()) {
      throw new AppException(ERROR_CODES.HOLD_EXPIRED, "Thời gian giữ ghế đã hết hạn");
    }

    // Đơn 0đ (voucher 100%): gọi confirm_zero_amount, không gọi PayOS (R-82)
    if (order.total_amount === 0) {
      const { data: zeroResult, error: zeroErr } = await this.supabase
        .admin()
        .rpc("confirm_zero_amount", { p_order_id: order.id });

      if (zeroErr) {
        throw new AppException(ERROR_CODES.CONFLICT, zeroErr.message);
      }

      const resObj = zeroResult as { booking_code?: string } | null;
      return {
        status: "PAID",
        checkoutUrl: null,
        expiresAt: null,
        bookingCode: resObj?.booking_code ?? order.booking_code,
      };
    }

    // SPEC #10: tạo đơn mới khi đơn cũ pending -> cancel link cũ
    const { data: oldPendingOrders } = await this.supabase
      .admin()
      .from("orders")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending_payment")
      .neq("id", order.id);

    for (const old of oldPendingOrders ?? []) {
      const { data: oldPayments } = await this.supabase
        .admin()
        .from("payments")
        .select("order_code")
        .eq("order_id", old.id)
        .eq("status", "PENDING");

      for (const op of (oldPayments as PaymentDbRow[]) ?? []) {
        await this.payosClient.cancelPaymentLink(op.order_code, "Tạo đơn mới");
      }

      await this.supabase.admin().rpc("mark_payment_cancelled", {
        p_order_id: old.id,
        p_reason: "Tạo đơn mới",
      });
    }

    // Nếu chính đơn này có payment PENDING trước đó (thanh toán lại khi link chưa hết hạn)
    const { data: currentPendingPayments } = await this.supabase
      .admin()
      .from("payments")
      .select("order_code")
      .eq("order_id", order.id)
      .eq("status", "PENDING");

    for (const cp of (currentPendingPayments as PaymentDbRow[]) ?? []) {
      await this.payosClient.cancelPaymentLink(cp.order_code, "Tạo link mới");
      await this.supabase
        .admin()
        .from("payments")
        .update({ status: "CANCELLED" })
        .eq("order_code", cp.order_code);
    }

    // Sinh orderCode duy nhất tăng dần (dưới MAX_SAFE_INTEGER)
    const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 90 + 10)}`);
    const description = `${order.cinema_code} ${order.booking_code ?? ""}`.trim().slice(0, 25);
    const baseOrigin = this.env.WEB_ORIGIN[0];
    const returnUrl =
      clientUrls?.returnUrl || `${baseOrigin}/dat-ve/${order.id}/thanh-toan/xac-nhan`;
    const cancelUrl = clientUrls?.cancelUrl || `${baseOrigin}/dat-ve/${order.id}/thanh-toan/huy`;
    const expiredAt = Math.floor(new Date(order.hold_expires_at).getTime() / 1000);

    const link = await this.payosClient.createPaymentLink({
      orderCode,
      amount: order.total_amount,
      description,
      returnUrl,
      cancelUrl,
      expiredAt,
    });

    const { error: insertPayErr } = await this.supabase
      .admin()
      .from("payments")
      .insert({
        order_id: order.id,
        cinema_id: order.cinema_id,
        order_code: orderCode,
        amount: order.total_amount,
        status: "PENDING",
        payment_link_id: link.paymentLinkId ?? null,
      });

    if (insertPayErr) {
      throw insertPayErr;
    }

    await this.supabase
      .admin()
      .from("orders")
      .update({ status: "pending_payment" })
      .eq("id", order.id);

    return {
      status: "AWAITING_PAYMENT",
      checkoutUrl: link.checkoutUrl,
      expiresAt: order.hold_expires_at,
      bookingCode: order.booking_code,
    };
  }

  /**
   * GET /bookings/:id/payment-status (R-74, R-79).
   * Màn 'Đang xác nhận', polling từ server, không dựa vào returnUrl.
   */
  async getPaymentStatus(bookingId: string, user: AuthUser): Promise<PaymentStatusDto> {
    const { data: orderData, error } = await this.supabase
      .admin()
      .from("orders")
      .select("id, user_id, status, booking_code, hold_expires_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !orderData) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn đặt vé");
    }

    const order = orderData as OrderDbRow;

    if (order.user_id !== user.id) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền xem trạng thái đơn này");
    }

    let status: BookingPaymentStatus;
    switch (order.status) {
      case "holding":
      case "pending_payment":
        status = "AWAITING_PAYMENT";
        break;
      case "paid":
      case "checked_in":
        status = "PAID";
        break;
      case "expired":
        status = "EXPIRED";
        break;
      case "cancelled":
        status = "CANCELLED";
        break;
      case "needs_manual_review":
        status = "NEEDS_MANUAL_REVIEW";
        break;
      default:
        status = "AWAITING_PAYMENT";
    }

    return {
      status,
      orderStatus: order.status,
      bookingCode: order.booking_code,
    };
  }

  /**
   * POST /bookings/:id/payment/cancel (R-77).
   */
  async cancelPayment(bookingId: string, user: AuthUser): Promise<CancelPaymentResultDto> {
    const { data: orderData, error } = await this.supabase
      .admin()
      .from("orders")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !orderData) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Không tìm thấy đơn đặt vé");
    }

    const order = orderData as OrderDbRow;

    if (order.user_id !== user.id) {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Không có quyền huỷ đơn này");
    }

    if (order.status === "paid" || order.status === "checked_in") {
      throw new AppException(ERROR_CODES.CONFLICT, "Không thể huỷ đơn hàng đã thanh toán");
    }

    if (order.status === "cancelled") {
      return { status: "CANCELLED" };
    }

    const { data: payments } = await this.supabase
      .admin()
      .from("payments")
      .select("order_code")
      .eq("order_id", order.id)
      .eq("status", "PENDING");

    for (const p of (payments as PaymentDbRow[]) ?? []) {
      await this.payosClient.cancelPaymentLink(p.order_code, "Khách huỷ thanh toán");
    }

    const { error: cancelErr } = await this.supabase.admin().rpc("mark_payment_cancelled", {
      p_order_id: order.id,
      p_reason: "CANCELLED",
    });

    if (cancelErr) {
      throw cancelErr;
    }

    return { status: "CANCELLED" };
  }

  /**
   * Xử lý webhook PayOS đã kiểm tra chữ ký (R-74, R-75, R-78, AC-10, AC-11).
   */
  async handleWebhook(data: PayosWebhookData): Promise<{ success: boolean; result?: unknown }> {
    const orderCode = data.orderCode;
    const amount = data.amount;
    const reference = data.reference || `PAYOS_${orderCode}_${Date.now()}`;
    const isSuccess = data.code === PAYOS_SUCCESS_CODE || data.code === "00";
    const eventStatus = isSuccess ? "PAID" : data.code || "FAILED";
    const occurredAt = data.transactionDateTime
      ? new Date(data.transactionDateTime).toISOString()
      : new Date().toISOString();

    // 1. Tìm payment theo order_code
    const { data: paymentData } = await this.supabase
      .admin()
      .from("payments")
      .select("id, cinema_id, order_id, amount, status")
      .eq("order_code", orderCode)
      .maybeSingle();

    const payment = paymentData as PaymentDbRow | null;

    // 2. Ghi payment event (idempotent qua transaction_ref)
    await this.supabase.admin().rpc("record_payment_event", {
      p_order_code: orderCode,
      p_transaction_ref: reference,
      p_amount: amount,
      p_event_status: eventStatus,
      p_signature_valid: true,
      p_occurred_at: occurredAt,
      p_cinema_id: payment?.cinema_id ?? null,
      p_payment_id: payment?.id ?? null,
    });

    // 3. Nếu thanh toán thành công và tìm thấy order_id -> gọi confirm_paid
    if (isSuccess && payment?.order_id) {
      const { data: confirmResult, error: confirmErr } = await this.supabase
        .admin()
        .rpc("confirm_paid", {
          p_order_id: payment.order_id,
          p_amount: amount,
          p_transaction_ref: reference,
          p_order_code: orderCode,
        });

      if (confirmErr) {
        this.logger.error(
          `Failed to confirm_paid for order ${payment.order_id}: ${confirmErr.message}`,
        );
        return { success: false, result: confirmErr };
      }

      this.logger.log(
        `confirm_paid success for order ${payment.order_id}: ${JSON.stringify(confirmResult)}`,
      );
      return { success: true, result: confirmResult };
    }

    return { success: true };
  }
}
