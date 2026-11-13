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
  cinema_id?: string;
  order_id: string;
  order_code: number;
  amount?: number;
  status: string;
  payment_link_id?: string | null;
  link_cancelled_at?: string | null;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly inFlightCreatePayment = new Map<string, Promise<CreatePaymentResultDto>>();

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(ENV) private readonly env: Env,
    @Inject(PayosClient) private readonly payosClient: PayosClient,
  ) {}

  /**
   * POST /bookings/:id/payment (R-73, R-82).
   * Cần consent (AC-08); đơn 0đ -> confirm_zero_amount; tạo link PayOS cho đơn có tiền.
   * Chống race condition khi 2 request gọi đồng thời tạo link cho cùng 1 đơn.
   */
  async createPayment(
    bookingId: string,
    user: AuthUser,
    clientUrls?: CreatePaymentBody,
  ): Promise<CreatePaymentResultDto> {
    const existingFlight = this.inFlightCreatePayment.get(bookingId);
    if (existingFlight) {
      this.logger.log(`Reusing in-flight createPayment for order ${bookingId}`);
      return existingFlight;
    }

    const task = this.executeCreatePayment(bookingId, user, clientUrls);
    this.inFlightCreatePayment.set(bookingId, task);
    try {
      return await task;
    } finally {
      this.inFlightCreatePayment.delete(bookingId);
    }
  }

  private async executeCreatePayment(
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

    // SPEC #10 & B/M2: tạo đơn mới khi đơn cũ pending/cancelled/expired còn link -> cancel link cũ
    const { data: oldUserOrders } = await this.supabase
      .admin()
      .from("orders")
      .select("id, status")
      .eq("user_id", user.id)
      .neq("id", order.id)
      .in("status", ["pending_payment", "cancelled", "expired"]);

    const oldOrderIds = (oldUserOrders ?? []).map((o) => o.id);
    if (oldOrderIds.length > 0) {
      const { data: orphanedPayments } = await this.supabase
        .admin()
        .from("payments")
        .select("id, order_id, order_code, payment_link_id, link_cancelled_at")
        .in("order_id", oldOrderIds)
        .in("status", ["PENDING", "CANCELLED"])
        .not("payment_link_id", "is", null)
        .is("link_cancelled_at", null);

      for (const op of (orphanedPayments as PaymentDbRow[]) ?? []) {
        await this.payosClient.cancelPaymentLink(op.order_code, "Huỷ đơn cũ");
        await this.supabase
          .admin()
          .from("payments")
          .update({
            status: "CANCELLED",
            link_cancelled_at: new Date().toISOString(),
          })
          .eq("id", op.id);
      }

      for (const old of (oldUserOrders ?? []).filter((o) => o.status === "pending_payment")) {
        await this.supabase.admin().rpc("mark_payment_cancelled", {
          p_order_id: old.id,
          p_reason: "Tạo đơn mới",
        });
      }
    }

    // K5-1 & B/M4: Nếu chính đơn này có payment PENDING trước đó (thanh toán lại khi link chưa hết hạn hoặc tạo lại)
    const { data: currentPendingPayments } = await this.supabase
      .admin()
      .from("payments")
      .select("id, order_code")
      .eq("order_id", order.id)
      .eq("status", "PENDING");

    for (const cp of (currentPendingPayments as PaymentDbRow[]) ?? []) {
      const cancelled = await this.payosClient.cancelPaymentLink(cp.order_code, "Tạo link mới");
      if (!cancelled && this.env.NODE_ENV !== "test") {
        this.logger.warn(`Could not cancel previous PayOS payment link for orderCode=${cp.order_code}`);
      }
      await this.supabase
        .admin()
        .from("payments")
        .update({
          status: "CANCELLED",
          link_cancelled_at: new Date().toISOString(),
        })
        .eq("id", cp.id);
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
      .select("id, order_code")
      .eq("order_id", order.id)
      .eq("status", "PENDING");

    for (const p of (payments as PaymentDbRow[]) ?? []) {
      await this.payosClient.cancelPaymentLink(p.order_code, "Khách huỷ thanh toán");
      await this.supabase
        .admin()
        .from("payments")
        .update({
          link_cancelled_at: new Date().toISOString(),
        })
        .eq("id", p.id);
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
  async handleWebhook(
    data: PayosWebhookData,
  ): Promise<{ success: boolean; status?: string; result?: unknown }> {
    const orderCode = data.orderCode;
    const amount = data.amount;
    const reference = data.reference || `PAYOS_${orderCode}`;
    const isSuccess = data.code === PAYOS_SUCCESS_CODE || data.code === "00";
    const eventStatus = isSuccess ? "PAID" : data.code || "FAILED";
    const occurredAt = data.transactionDateTime
      ? new Date(data.transactionDateTime).toISOString()
      : new Date().toISOString();

    // 1. Tìm payment theo order_code - kiểm tra lỗi đọc DB (B/M1)
    const { data: paymentData, error: paymentErr } = await this.supabase
      .admin()
      .from("payments")
      .select("id, cinema_id, order_id, amount, status")
      .eq("order_code", orderCode)
      .maybeSingle();

    if (paymentErr) {
      this.logger.error(
        `Database error reading payment for orderCode=${orderCode}: ${paymentErr.message}`,
      );
      return { success: false, result: paymentErr };
    }

    const payment = paymentData as PaymentDbRow | null;

    if (payment?.status === "CANCELLED") {
      this.logger.warn(
        `Webhook received for previously CANCELLED payment: orderCode=${orderCode}, orderId=${payment.order_id}`,
      );
    }

    // 2. Ghi payment event (idempotent qua transaction_ref) - kiểm tra lỗi DB (B/M1)
    const { error: eventErr } = await this.supabase.admin().rpc("record_payment_event", {
      p_order_code: orderCode,
      p_transaction_ref: reference,
      p_amount: amount,
      p_event_status: eventStatus,
      p_signature_valid: true,
      p_occurred_at: occurredAt,
      p_cinema_id: payment?.cinema_id ?? null,
      p_payment_id: payment?.id ?? null,
    });

    if (eventErr) {
      this.logger.error(
        `Failed to record payment event for orderCode=${orderCode}: ${eventErr.message}`,
      );
      return { success: false, result: eventErr };
    }

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

      const res = confirmResult as {
        success?: boolean;
        status?: string;
        order_id?: string;
        booking_code?: string;
        [key: string]: unknown;
      } | null;

      const businessStatus = res?.status;
      if (businessStatus === "NEEDS_MANUAL_REVIEW" || businessStatus === "AMOUNT_MISMATCH") {
        this.logger.warn(
          `confirm_paid business outcome for order ${payment.order_id}: status=${businessStatus}`,
        );
      } else {
        this.logger.log(
          `confirm_paid success for order ${payment.order_id}: status=${businessStatus ?? "OK"}`,
        );
      }

      // Phân biệt rõ kết quả nghiệp vụ (ALREADY_PAID, NEEDS_MANUAL_REVIEW, AMOUNT_MISMATCH -> trả success: true kèm status)
      return { success: true, status: businessStatus, result: confirmResult };
    }

    if (!payment) {
      this.logger.warn(`No payment record found for orderCode=${orderCode}`);
    }

    return { success: true, status: isSuccess ? "NO_ORDER" : "PAYMENT_NOT_SUCCESS" };
  }
}
